import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SubBlock } from './SubBlock';
import type { Stage, Subprocess } from '../../types';

export function CardsView({ activeStageIds }: { activeStageIds: Set<string> }) {
  const { state, dispatch } = useApp();
  const readOnly = state.appMode === 'view';
  const visibleStages = state.stages.filter(s => activeStageIds.has(s.id));
  const [activeSub, setActiveSub] = useState<Subprocess | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    if (active.data.current?.type === 'sub') {
      for (const stage of state.stages) {
        const sub = stage.subprocesses.find(s => s.id === active.id);
        if (sub) { setActiveSub(sub); break; }
      }
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) { setDragOverStageId(null); return; }
    const overType = over.data.current?.type;
    if (overType === 'stage') {
      setDragOverStageId(over.id as string);
    } else if (overType === 'sub') {
      const stage = state.stages.find(st => st.subprocesses.some(s => s.id === over.id));
      setDragOverStageId(stage?.id ?? null);
    } else {
      setDragOverStageId(null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveSub(null);
    setDragOverStageId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType   = over.data.current?.type;

    if (activeType === 'sub') {
      // Cross-stage drop onto a stage zone
      if (overType === 'stage') {
        const toStageId = over.id as string;
        const fromStage = state.stages.find(st => st.subprocesses.some(s => s.id === active.id));
        if (fromStage && fromStage.id !== toStageId) {
          const toStage = state.stages.find(st => st.id === toStageId);
          dispatch({ type: 'MOVE_SUB_TO_STAGE', subId: String(active.id), toStageId, toIdx: toStage?.subprocesses.length ?? 0 });
        }
        return;
      }

      // Drop onto another sub — same stage reorder or cross-stage move
      if (overType === 'sub') {
        const fromStage = state.stages.find(st => st.subprocesses.some(s => s.id === active.id));
        const toStage   = state.stages.find(st => st.subprocesses.some(s => s.id === over.id));
        if (!fromStage || !toStage) return;

        if (fromStage.id === toStage.id) {
          const fromIdx = fromStage.subprocesses.findIndex(s => s.id === active.id);
          const toIdx   = fromStage.subprocesses.findIndex(s => s.id === over.id);
          if (fromIdx >= 0 && toIdx >= 0) {
            dispatch({ type: 'REORDER_SUBS', stageId: fromStage.id, fromIdx, toIdx });
          }
        } else {
          const toIdx = toStage.subprocesses.findIndex(s => s.id === over.id);
          dispatch({ type: 'MOVE_SUB_TO_STAGE', subId: String(active.id), toStageId: toStage.id, toIdx: toIdx >= 0 ? toIdx : toStage.subprocesses.length });
        }
      }
    }

    if (activeType === 'op' && overType === 'op') {
      const fromSubId = active.data.current?.subId as string;
      const toSubId   = over.data.current?.subId as string;
      if (fromSubId === toSubId) {
        for (const stage of state.stages) {
          const sub = stage.subprocesses.find(s => s.id === fromSubId);
          if (sub) {
            const fromIdx = sub.operations.findIndex(o => o.id === active.id);
            const toIdx   = sub.operations.findIndex(o => o.id === over.id);
            if (fromIdx >= 0 && toIdx >= 0) {
              dispatch({ type: 'REORDER_OPS', subId: fromSubId, fromIdx, toIdx });
            }
            break;
          }
        }
      } else {
        const toSub = state.stages.flatMap(s => s.subprocesses).find(s => s.id === toSubId);
        if (toSub) {
          const toIdx = toSub.operations.findIndex(o => o.id === over.id);
          dispatch({ type: 'MOVE_OP', opId: String(active.id), fromSubId, toSubId, toIdx: toIdx >= 0 ? toIdx : toSub.operations.length });
        }
      }
    }
  }

  if (readOnly) {
    return (
      <div className="overflow-y-auto h-full px-7 py-8 pb-20">
        {visibleStages.map(stage => (
          <StageDropZone
            key={stage.id}
            stage={stage}
            isOver={false}
            showHeader={state.showStages}
            readOnly
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="overflow-y-auto h-full px-7 py-8 pb-20">
        {visibleStages.map(stage => (
          <StageDropZone
            key={stage.id}
            stage={stage}
            isOver={dragOverStageId === stage.id && activeSub !== null}
            showHeader={state.showStages}
            readOnly={false}
          />
        ))}
      </div>

      <DragOverlay>
        {activeSub && (
          <div className="rounded-[10px] border border-[rgba(255,255,255,.3)] opacity-90 shadow-2xl p-3 text-sm font-bold text-white"
            style={{ background: activeSub.color }}>
            {activeSub.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function StageDropZone({ stage, isOver, showHeader, readOnly }: { stage: Stage; isOver: boolean; showHeader: boolean; readOnly: boolean }) {
  const { setNodeRef } = useDroppable({ id: stage.id, data: { type: 'stage' } });

  const content = (
    <>
      {stage.subprocesses.map(sub => (
        <SubBlock key={sub.id} stage={stage} sub={sub} />
      ))}
      {!readOnly && <AddSubButton stageId={stage.id} meta={stage.stageMeta} />}
    </>
  );

  return (
    <div
      className={`rounded-[14px] mb-8 overflow-hidden border shadow-[0_4px_24px_rgba(0,0,0,.4)] transition-all ${
        isOver ? 'border-[rgba(255,255,255,.4)] ring-2 ring-[rgba(255,255,255,.2)]' : 'border-[rgba(255,255,255,.08)]'
      }`}
    >
      {showHeader && (
        <div
          className="px-[22px] py-[14px] flex items-baseline gap-3"
          style={{ background: stage.stageMeta.hdr }}
        >
          <span className="font-display text-[1.18rem] font-extrabold text-white">{stage.title}</span>
          <span className="text-[.74rem] font-semibold text-[rgba(255,255,255,.5)] uppercase tracking-[.05em]">
            {stage.subprocesses.length} подпроц.
          </span>
        </div>
      )}

      {readOnly ? (
        <div
          className="p-[14px_16px_16px] grid gap-3 min-h-[80px]"
          style={{ background: stage.stageMeta.bg, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          {content}
        </div>
      ) : (
        <div
          ref={setNodeRef}
          className="p-[14px_16px_16px] grid gap-3 min-h-[80px]"
          style={{ background: stage.stageMeta.bg, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          <SortableContext items={stage.subprocesses.map(s => s.id)} strategy={rectSortingStrategy}>
            {content}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function AddSubButton({ stageId, meta }: { stageId: string; meta: { bg: string; hdr: string } }) {
  const { dispatch } = useApp();
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');

  function commit() {
    if (val.trim()) dispatch({ type: 'ADD_SUB', stageId, title: val.trim() });
    setAdding(false);
    setVal('');
  }

  if (adding) {
    return (
      <div className="rounded-[10px] p-3 border border-[rgba(255,255,255,.2)]" style={{ background: meta.bg }}>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setAdding(false); setVal(''); } }}
          placeholder="Название подпроцесса…"
          className="w-full text-sm px-2 py-1.5 border border-[rgba(80,120,200,.5)] rounded bg-[rgba(255,255,255,.88)] text-[#222] outline-none"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setAdding(true)}
      className="rounded-[10px] border-2 border-dashed border-[rgba(255,255,255,.22)] bg-[rgba(255,255,255,.04)] min-h-[80px] flex flex-col items-center justify-center gap-1.5 cursor-pointer text-[rgba(255,255,255,.4)] text-sm font-display font-semibold hover:bg-[rgba(255,255,255,.09)] hover:border-[rgba(255,255,255,.5)] hover:text-[rgba(255,255,255,.85)] transition-all"
    >
      <span className="text-3xl font-light leading-none">+</span>
      подпроцесс
    </button>
  );
}
