import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { AppState, Stage, Subprocess, Operation, ViewMode, AppMode, ChangelogEntry, TimelineScale } from '../types';
import { loadYamlFromUrl, loadYamlFromText } from '../utils/yamlParser';
import { downloadYaml } from '../utils/yamlExporter';
import { computeChanges, initialExportSummary } from '../utils/changeDetector';
import { getGanttColor, getStageConfig } from '../utils/stagesConfig';
import { fetchBlobData, uploadBlobData } from '../utils/blobStorage';

// ── Actions ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; stages: Stage[]; changelog?: ChangelogEntry[] }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'APPEND_CHANGELOG_ENTRY'; entry: ChangelogEntry }
  | { type: 'SET_VIEW'; view: ViewMode }
  | { type: 'SET_PROJECT_START'; value: string }
  | { type: 'SET_DAY_WIDTH'; value: number }
  | { type: 'SET_LEFT_WIDTH'; value: number }
  | { type: 'SET_SHOW_STAGES'; value: boolean }
  | { type: 'SET_SHOW_SUBS'; value: boolean }
  | { type: 'SET_SHOW_STEPS'; value: boolean }
  | { type: 'SET_ALL_EXPANDED'; value: boolean }
  | { type: 'SET_SELECTED'; id: string | null }
  | { type: 'UPDATE_STAGE_TITLE'; stageId: string; title: string }
  | { type: 'DELETE_STAGE'; stageId: string }
  | { type: 'ADD_STAGE'; title: string }
  | { type: 'REORDER_SUBS'; stageId: string; fromIdx: number; toIdx: number }
  | { type: 'REORDER_OPS'; subId: string; fromIdx: number; toIdx: number }
  | { type: 'MOVE_OP'; opId: string; fromSubId: string; toSubId: string; toIdx: number }
  | { type: 'UPDATE_SUB_TITLE'; subId: string; title: string }
  | { type: 'UPDATE_SUB_RESPONSIBLE'; subId: string; value: string }
  | { type: 'DELETE_SUB'; subId: string }
  | { type: 'ADD_SUB'; stageId: string; title: string }
  | { type: 'UPDATE_OP_TITLE'; opId: string; title: string }
  | { type: 'DELETE_OP'; opId: string }
  | { type: 'ADD_OP'; subId: string; title: string }
  | { type: 'ADD_IO_IN'; subId: string; value: string }
  | { type: 'UPDATE_IO_IN'; subId: string; idx: number; value: string }
  | { type: 'DELETE_IO_IN'; subId: string; idx: number }
  | { type: 'REORDER_IO_IN'; subId: string; fromIdx: number; toIdx: number }
  | { type: 'ADD_IO_OUT'; subId: string; value: string }
  | { type: 'UPDATE_IO_OUT'; subId: string; idx: number; value: string }
  | { type: 'DELETE_IO_OUT'; subId: string; idx: number }
  | { type: 'REORDER_IO_OUT'; subId: string; fromIdx: number; toIdx: number }
  | { type: 'UPDATE_OP_OFFSETS'; opId: string; startOffset: number; endOffset: number }
  | { type: 'UPDATE_SUB_OFFSETS'; subId: string; delta: number }
  | { type: 'MOVE_SUB_ABSOLUTE'; subId: string; targetStart: number }
  | { type: 'RESIZE_SUB'; subId: string; startOffset: number; endOffset: number }
  | { type: 'UPDATE_STAGE_OFFSETS'; stageId: string; delta: number }
  | { type: 'MOVE_SUB_TO_STAGE'; subId: string; toStageId: string; toIdx: number }
  | { type: 'SET_TIMELINE_SCALE'; value: TimelineScale }
  | { type: 'SET_SHOW_IO_CARDS'; value: boolean }
  | { type: 'SET_SHOW_STEPS_CARDS'; value: boolean }
  | { type: 'SET_REVERSE_TIME'; value: boolean }
  | { type: 'SET_APP_MODE'; mode: AppMode }
  | { type: 'SET_BLOB_MESSAGE'; message: string | null };

// ── Initial state ────────────────────────────────────────────────────────────

const SS_MODE_KEY = 'appMode';

const initialState: AppState = {
  stages: [],
  changelog: [],
  view: 'cards',
  dayWidth: 16,
  leftWidth: 420,
  showStages: true,
  showSubs: true,
  showSteps: false,
  allExpanded: false,
  selectedId: null,
  minOffset: -120,
  projectStart: '2026-06-01',
  loading: true,
  error: null,
  timelineScale: 'weeks',
  showIoCards: true,
  showStepsCards: false,
  reverseTime: false,
  appMode: (sessionStorage.getItem(SS_MODE_KEY) as AppMode) ?? 'view',
  blobMessage: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 9)}`; }

function recomputeMinOffset(stages: Stage[]): number {
  const offsets: number[] = [];
  stages.forEach(st => st.subprocesses.forEach(sub => {
    offsets.push(sub.startOffset, sub.endOffset);
    sub.operations.forEach(op => { offsets.push(op.startOffset, op.endOffset); });
  }));
  return offsets.length ? Math.min(...offsets) : -120;
}

function recomputeSummaries(stages: Stage[]): void {
  stages.forEach(stage => {
    stage.subprocesses.forEach(sub => {
      if (sub.operations.length) {
        sub.startOffset = Math.min(...sub.operations.map(o => o.startOffset));
        sub.endOffset   = Math.max(...sub.operations.map(o => o.endOffset));
      }
    });
    const active = stage.subprocesses.filter(s => s.operations.length);
    if (active.length) {
      stage.startOffset = Math.min(...active.map(s => s.startOffset));
      stage.endOffset   = Math.max(...active.map(s => s.endOffset));
    }
  });
}

function findSub(stages: Stage[], subId: string): { stage: Stage; sub: Subprocess } | null {
  for (const st of stages) {
    const sub = st.subprocesses.find(s => s.id === subId);
    if (sub) return { stage: st, sub };
  }
  return null;
}

function findOp(stages: Stage[], opId: string): { stage: Stage; sub: Subprocess; op: Operation } | null {
  for (const st of stages) {
    for (const sub of st.subprocesses) {
      const op = sub.operations.find(o => o.id === opId);
      if (op) return { stage: st, sub, op };
    }
  }
  return null;
}

function cloneStages(stages: Stage[]): Stage[] {
  return stages.map(st => ({
    ...st,
    subprocesses: st.subprocesses.map(sub => ({
      ...sub,
      operations: [...sub.operations],
      ioIn: [...sub.ioIn],
      ioOut: [...sub.ioOut],
    })),
  }));
}

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS': {
      const minOffset = recomputeMinOffset(action.stages);
      return {
        ...state,
        stages: action.stages,
        changelog: action.changelog ?? state.changelog,
        minOffset,
        loading: false,
        error: null,
      };
    }
    case 'APPEND_CHANGELOG_ENTRY':
      return { ...state, changelog: [...state.changelog, action.entry] };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SET_PROJECT_START':
      return { ...state, projectStart: action.value };
    case 'SET_DAY_WIDTH':
      return { ...state, dayWidth: action.value };
    case 'SET_LEFT_WIDTH':
      return { ...state, leftWidth: action.value };
    case 'SET_SHOW_STAGES':
      return { ...state, showStages: action.value };
    case 'SET_SHOW_SUBS':
      return { ...state, showSubs: action.value };
    case 'SET_SHOW_STEPS':
      return { ...state, showSteps: action.value };
    case 'SET_ALL_EXPANDED': {
      const stages = cloneStages(state.stages);
      stages.forEach(st => st.subprocesses.forEach(sub => { sub.expanded = action.value; }));
      return { ...state, stages, allExpanded: action.value, showSteps: true };
    }
    case 'SET_SELECTED':
      return { ...state, selectedId: action.id };

    case 'UPDATE_STAGE_TITLE': {
      const stages = cloneStages(state.stages);
      const st = stages.find(s => s.id === action.stageId);
      if (st) st.title = action.title;
      return { ...state, stages };
    }
    case 'DELETE_STAGE': {
      return { ...state, stages: state.stages.filter(s => s.id !== action.stageId) };
    }
    case 'ADD_STAGE': {
      const stages = [...state.stages];
      const idx = stages.length;
      stages.push({
        id: uid('st'), type: 'stage', title: action.title,
        color: getGanttColor(idx), stageMeta: getStageConfig(action.title),
        subprocesses: [], startOffset: state.minOffset, endOffset: state.minOffset, collapsed: false,
      });
      return { ...state, stages };
    }

    case 'REORDER_SUBS': {
      const stages = cloneStages(state.stages);
      const stage = stages.find(s => s.id === action.stageId);
      if (!stage) return state;
      const subs = [...stage.subprocesses];
      const [moved] = subs.splice(action.fromIdx, 1);
      subs.splice(action.toIdx, 0, moved);
      stage.subprocesses = subs;
      return { ...state, stages };
    }
    case 'REORDER_OPS': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (!found) return state;
      const ops = [...found.sub.operations];
      const [moved] = ops.splice(action.fromIdx, 1);
      ops.splice(action.toIdx, 0, moved);
      found.sub.operations = ops;
      recomputeSummaries(stages);
      return { ...state, stages };
    }
    case 'MOVE_OP': {
      const stages = cloneStages(state.stages);
      const fromSub = findSub(stages, action.fromSubId)?.sub;
      const toSub = findSub(stages, action.toSubId)?.sub;
      if (!fromSub || !toSub) return state;
      const opIdx = fromSub.operations.findIndex(o => o.id === action.opId);
      if (opIdx < 0) return state;
      const [op] = fromSub.operations.splice(opIdx, 1);
      toSub.operations.splice(action.toIdx, 0, op);
      recomputeSummaries(stages);
      return { ...state, stages };
    }

    case 'UPDATE_SUB_TITLE': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (found) found.sub.title = action.title;
      return { ...state, stages };
    }
    case 'UPDATE_SUB_RESPONSIBLE': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (found) found.sub.responsible = action.value;
      return { ...state, stages };
    }
    case 'DELETE_SUB': {
      const stages = cloneStages(state.stages);
      stages.forEach(st => {
        st.subprocesses = st.subprocesses.filter(s => s.id !== action.subId);
      });
      recomputeSummaries(stages);
      return { ...state, stages };
    }
    case 'ADD_SUB': {
      const stages = cloneStages(state.stages);
      const stage = stages.find(s => s.id === action.stageId);
      if (!stage) return state;
      stage.subprocesses.push({
        id: uid('sub'), type: 'sub', title: action.title,
        responsible: '', ioIn: [], ioOut: [], operations: [],
        startOffset: state.minOffset, endOffset: state.minOffset,
        expanded: false, color: stage.color,
      });
      return { ...state, stages };
    }

    case 'UPDATE_OP_TITLE': {
      const stages = cloneStages(state.stages);
      const found = findOp(stages, action.opId);
      if (found) found.op.title = action.title;
      return { ...state, stages };
    }
    case 'DELETE_OP': {
      const stages = cloneStages(state.stages);
      stages.forEach(st => st.subprocesses.forEach(sub => {
        sub.operations = sub.operations.filter(o => o.id !== action.opId);
      }));
      recomputeSummaries(stages);
      return { ...state, stages };
    }
    case 'ADD_OP': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (!found) return state;
      found.sub.operations.push({
        id: uid('op'), type: 'step', title: action.title,
        startOffset: state.minOffset, endOffset: state.minOffset,
        responsible: '', accountable: '',
        consulted: '', informed: '', risks: '', critical: '',
        milestone: '', limits: '', dependencies: '', checklist: '',
      });
      return { ...state, stages };
    }

    case 'ADD_IO_IN': {
      const stages = cloneStages(state.stages);
      findSub(stages, action.subId)?.sub.ioIn.push(action.value);
      return { ...state, stages };
    }
    case 'UPDATE_IO_IN': {
      const stages = cloneStages(state.stages);
      const sub = findSub(stages, action.subId)?.sub;
      if (sub) sub.ioIn[action.idx] = action.value;
      return { ...state, stages };
    }
    case 'DELETE_IO_IN': {
      const stages = cloneStages(state.stages);
      const sub = findSub(stages, action.subId)?.sub;
      if (sub) sub.ioIn.splice(action.idx, 1);
      return { ...state, stages };
    }
    case 'REORDER_IO_IN': {
      const stages = cloneStages(state.stages);
      const sub = findSub(stages, action.subId)?.sub;
      if (sub) {
        const [item] = sub.ioIn.splice(action.fromIdx, 1);
        sub.ioIn.splice(action.toIdx, 0, item);
      }
      return { ...state, stages };
    }

    case 'ADD_IO_OUT': {
      const stages = cloneStages(state.stages);
      findSub(stages, action.subId)?.sub.ioOut.push(action.value);
      return { ...state, stages };
    }
    case 'UPDATE_IO_OUT': {
      const stages = cloneStages(state.stages);
      const sub = findSub(stages, action.subId)?.sub;
      if (sub) sub.ioOut[action.idx] = action.value;
      return { ...state, stages };
    }
    case 'DELETE_IO_OUT': {
      const stages = cloneStages(state.stages);
      const sub = findSub(stages, action.subId)?.sub;
      if (sub) sub.ioOut.splice(action.idx, 1);
      return { ...state, stages };
    }
    case 'REORDER_IO_OUT': {
      const stages = cloneStages(state.stages);
      const sub = findSub(stages, action.subId)?.sub;
      if (sub) {
        const [item] = sub.ioOut.splice(action.fromIdx, 1);
        sub.ioOut.splice(action.toIdx, 0, item);
      }
      return { ...state, stages };
    }

    case 'UPDATE_OP_OFFSETS': {
      const stages = cloneStages(state.stages);
      const found = findOp(stages, action.opId);
      if (found) {
        found.op.startOffset = action.startOffset;
        found.op.endOffset = action.endOffset;
      }
      recomputeSummaries(stages);
      const minOffset = recomputeMinOffset(stages);
      return { ...state, stages, minOffset };
    }

    case 'UPDATE_SUB_OFFSETS': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (found) {
        found.sub.operations.forEach(op => {
          op.startOffset += action.delta;
          op.endOffset += action.delta;
        });
      }
      recomputeSummaries(stages);
      const minOffset2 = recomputeMinOffset(stages);
      return { ...state, stages, minOffset: minOffset2 };
    }

    case 'MOVE_SUB_ABSOLUTE': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (found) {
        const moveDelta = action.targetStart - found.sub.startOffset;
        if (moveDelta !== 0) {
          found.sub.operations.forEach(op => {
            op.startOffset += moveDelta;
            op.endOffset += moveDelta;
          });
        }
      }
      recomputeSummaries(stages);
      const minOffset2 = recomputeMinOffset(stages);
      return { ...state, stages, minOffset: minOffset2 };
    }

    case 'RESIZE_SUB': {
      const stages = cloneStages(state.stages);
      const found = findSub(stages, action.subId);
      if (found) {
        const ns = action.startOffset;
        const ne = action.endOffset;
        found.sub.startOffset = ns;
        found.sub.endOffset = ne;
        // Push ops that fall outside new sub bounds (preserving duration where possible)
        found.sub.operations.forEach(op => {
          const dur = op.endOffset - op.startOffset;
          if (op.startOffset < ns) {
            op.startOffset = ns;
            op.endOffset = Math.min(ns + dur, ne);
          }
          if (op.endOffset > ne) {
            op.endOffset = ne;
            op.startOffset = Math.max(ne - dur, ns);
          }
        });
        // Recompute only stage bounds from sub bounds (not sub from ops)
        stages.forEach(stage => {
          const active = stage.subprocesses.filter(s => s.startOffset !== s.endOffset || s.operations.length > 0);
          if (active.length) {
            stage.startOffset = Math.min(...active.map(s => s.startOffset));
            stage.endOffset   = Math.max(...active.map(s => s.endOffset));
          }
        });
      }
      const minOff = recomputeMinOffset(stages);
      return { ...state, stages, minOffset: minOff };
    }

    case 'UPDATE_STAGE_OFFSETS': {
      const stages = cloneStages(state.stages);
      const stage = stages.find(s => s.id === action.stageId);
      if (stage) {
        stage.subprocesses.forEach(sub => {
          sub.operations.forEach(op => {
            op.startOffset += action.delta;
            op.endOffset += action.delta;
          });
        });
      }
      recomputeSummaries(stages);
      const minOffset3 = recomputeMinOffset(stages);
      return { ...state, stages, minOffset: minOffset3 };
    }

    case 'MOVE_SUB_TO_STAGE': {
      const stages = cloneStages(state.stages);
      let sub: import('../types').Subprocess | undefined;
      for (const st of stages) {
        const idx = st.subprocesses.findIndex(s => s.id === action.subId);
        if (idx >= 0) { [sub] = st.subprocesses.splice(idx, 1); break; }
      }
      if (!sub) return state;
      const target = stages.find(s => s.id === action.toStageId);
      if (!target) return state;
      target.subprocesses.splice(action.toIdx, 0, sub);
      recomputeSummaries(stages);
      return { ...state, stages };
    }

    case 'SET_TIMELINE_SCALE':   return { ...state, timelineScale: action.value };
    case 'SET_SHOW_IO_CARDS':    return { ...state, showIoCards: action.value };
    case 'SET_SHOW_STEPS_CARDS': return { ...state, showStepsCards: action.value };
    case 'SET_REVERSE_TIME':     return { ...state, reverseTime: action.value };
    case 'SET_APP_MODE':
      sessionStorage.setItem(SS_MODE_KEY, action.mode);
      return { ...state, appMode: action.mode };
    case 'SET_BLOB_MESSAGE':
      return { ...state, blobMessage: action.message };

    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  loadFromText: (text: string) => void;
  exportYaml: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const LS_KEY = 'newstore-gantt-stages-v1';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const loadedRef = useRef(false);
  // Snapshot of stages at last import/export — used for diff computation
  const snapshotRef = useRef<Stage[] | null>(null);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    dispatch({ type: 'LOAD_START' });

    // Parse localStorage cache
    const saved = localStorage.getItem(LS_KEY);
    let localUploadedAt = '';
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const stages: Stage[] = Array.isArray(parsed) ? parsed : (parsed.stages ?? []);
        const changelog = Array.isArray(parsed) ? [] : (parsed.changelog ?? []);
        const projectStart: string | undefined = Array.isArray(parsed) ? undefined : parsed.projectStart;
        localUploadedAt = parsed._uploadedAt ?? '';
        snapshotRef.current = stages;
        if (projectStart) dispatch({ type: 'SET_PROJECT_START', value: projectStart });
        dispatch({ type: 'LOAD_SUCCESS', stages, changelog });
      } catch { /* fall through */ }
    }

    // Fetch from Blob in background (stale-while-revalidate)
    fetchBlobData()
      .then(blobData => {
        if (!blobData) {
          // No data in Blob yet — use localStorage or fallback to YAML
          if (!saved) {
            loadYamlFromUrl('/data/schema.yaml')
              .then(({ projectStart, stages, changelog }) => {
                snapshotRef.current = stages;
                dispatch({ type: 'SET_PROJECT_START', value: projectStart });
                dispatch({ type: 'LOAD_SUCCESS', stages, changelog });
              })
              .catch(err => dispatch({ type: 'LOAD_ERROR', error: String(err) }));
          }
          return;
        }

        // If Blob has newer data — update state and cache
        const blobTime = blobData._uploadedAt ? new Date(blobData._uploadedAt).getTime() : 0;
        const localTime = localUploadedAt ? new Date(localUploadedAt).getTime() : 0;
        if (blobTime > localTime) {
          snapshotRef.current = blobData.stages;
          if (blobData.projectStart) dispatch({ type: 'SET_PROJECT_START', value: blobData.projectStart });
          dispatch({ type: 'LOAD_SUCCESS', stages: blobData.stages, changelog: blobData.changelog });
          localStorage.setItem(LS_KEY, JSON.stringify(blobData));
          if (localUploadedAt) {
            dispatch({ type: 'SET_BLOB_MESSAGE', message: 'Данные обновлены из облака' });
          }
        }
      })
      .catch(() => {
        if (saved) {
          dispatch({ type: 'SET_BLOB_MESSAGE', message: 'Облако недоступно — используются кэшированные данные' });
        } else if (!saved) {
          loadYamlFromUrl('/data/schema.yaml')
            .then(({ projectStart, stages, changelog }) => {
              snapshotRef.current = stages;
              dispatch({ type: 'SET_PROJECT_START', value: projectStart });
              dispatch({ type: 'LOAD_SUCCESS', stages, changelog });
            })
            .catch(err => dispatch({ type: 'LOAD_ERROR', error: String(err) }));
        }
      });
  }, []);

  useEffect(() => {
    if (!state.loading && state.stages.length > 0) {
      localStorage.setItem(LS_KEY, JSON.stringify({
        stages: state.stages,
        changelog: state.changelog,
        projectStart: state.projectStart,
      }));
    }
  }, [state.stages, state.changelog, state.loading, state.projectStart]);

  function loadFromText(text: string) {
    dispatch({ type: 'LOAD_START' });
    try {
      const { projectStart, stages, changelog } = loadYamlFromText(text);
      snapshotRef.current = stages;
      localStorage.removeItem(LS_KEY);
      dispatch({ type: 'SET_PROJECT_START', value: projectStart });
      dispatch({ type: 'LOAD_SUCCESS', stages, changelog });

      // Upload to Blob so all viewers get the updated data
      uploadBlobData({ stages, changelog, projectStart })
        .then(() => dispatch({ type: 'SET_BLOB_MESSAGE', message: 'Данные сохранены в облако' }))
        .catch(() => dispatch({ type: 'SET_BLOB_MESSAGE', message: 'Ошибка сохранения в облако — данные только локально' }));
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', error: String(err) });
    }
  }

  function exportYaml() {
    const snapshot = snapshotRef.current;
    const changes = snapshot
      ? computeChanges(snapshot, state.stages)
      : initialExportSummary(state.stages);
    const entry: ChangelogEntry = {
      timestamp: new Date().toISOString(),
      changes: changes.length > 0 ? changes : ['Без изменений'],
    };
    const newChangelog = [...state.changelog, entry];
    downloadYaml(state.stages, state.projectStart, newChangelog);
    snapshotRef.current = state.stages;
    dispatch({ type: 'APPEND_CHANGELOG_ENTRY', entry });
  }

  return (
    <AppContext.Provider value={{ state, dispatch, loadFromText, exportYaml }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
