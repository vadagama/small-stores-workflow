import { useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { offsetToDate } from '../../utils/dateUtils';
import type { TimelineScale } from '../../types';

interface TopBarProps {
  onToast: (msg: string) => void;
}

const SCALE_OPTS: { label: string; ganttVal: number; tlVal: TimelineScale }[] = [
  { label: 'Дни',    ganttVal: 32, tlVal: 'days' },
  { label: 'Недели', ganttVal: 16, tlVal: 'weeks' },
  { label: 'Месяцы', ganttVal: 8,  tlVal: 'months' },
];

function chip(extra = '') {
  return `inline-flex items-center gap-1.5 border border-[var(--line)] bg-[#121920] rounded-lg px-[9px] py-[5px] text-[var(--muted)] text-xs ${extra}`;
}

export function TopBar({ onToast }: TopBarProps) {
  const { state, dispatch, loadFromText, exportYaml } = useApp();
  const importRef = useRef<HTMLInputElement>(null);

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        loadFromText(ev.target!.result as string);
        onToast(`YAML загружен: ${file.name}`);
      } catch (err) {
        alert(`Ошибка разбора YAML: ${err}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }

  const endDate = useMemo(() => {
    const allOffsets = state.stages.flatMap(st =>
      st.subprocesses.flatMap(sub => [
        sub.startOffset, sub.endOffset,
        ...sub.operations.flatMap(op => [op.startOffset, op.endOffset]),
      ])
    );
    if (!allOffsets.length) return '—';
    const maxEnd = Math.max(...allOffsets);
    const minOff = Math.min(...allOffsets);
    return offsetToDate(maxEnd, state.projectStart, minOff)
      .toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, [state.stages, state.projectStart]);

  const changeCount = state.changelog.length;
  const showToolbar = state.view !== 'changes';

  return (
    <header className="border-b border-[var(--line)] bg-[rgba(13,17,23,.97)] backdrop-blur-md px-[18px] pt-3 pb-[10px] flex-shrink-0 grid gap-2">

      {/* ── Row 1: title + nav + import/export ─────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            Открытие магазина
          </h1>
          <p className="text-[var(--muted)] text-xs mt-0.5 mb-1">
            Описание процесса запуска магазина
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="inline-flex p-[3px] border border-[var(--line)] rounded-lg bg-[#0f1419]">
            {(['cards', 'gantt', 'timeline'] as const).map(v => (
              <button
                key={v}
                onClick={() => dispatch({ type: 'SET_VIEW', view: v })}
                className={`px-4 py-[7px] rounded-[6px] text-[13px] font-semibold transition-colors ${
                  state.view === v ? 'bg-[#26313b] text-white' : 'text-[var(--muted)] hover:text-white'
                }`}
              >
                {v === 'cards' ? 'Карточки' : v === 'gantt' ? 'Gantt' : 'Timeline'}
              </button>
            ))}
          </div>

          <input ref={importRef} type="file" accept=".yaml,.yml" className="hidden" onChange={handleImport} />
          <button
            onClick={() => importRef.current?.click()}
            className="px-3 py-[6px] text-xs font-bold rounded-lg border border-[var(--line)] bg-[#1a4a3a] hover:bg-[#215940] text-white transition-colors"
          >
            ↑ Импорт
          </button>
          <button
            onClick={() => { exportYaml(); onToast('YAML выгружен'); }}
            className="px-3 py-[6px] text-xs font-bold rounded-lg border border-[var(--line)] bg-[#1e3a6a] hover:bg-[#2a4f8a] text-white transition-colors"
          >
            ↓ Экспорт
          </button>
        </div>
      </div>

      {/* ── Row 2: unified toolbar ──────────────────────────────────────── */}
      {showToolbar && (
        <div className="flex items-center gap-2 flex-wrap">

          {/* Shared: project start */}
          <label className={chip('whitespace-nowrap cursor-pointer')}>
            Старт&nbsp;
            <input
              type="date"
              value={state.projectStart}
              onChange={e => dispatch({ type: 'SET_PROJECT_START', value: e.target.value })}
              className="bg-transparent border-0 outline-none text-[var(--text)] text-xs"
            />
          </label>

          {/* Shared: project end (read-only) */}
          <span className={chip('whitespace-nowrap')}>
            Завершение&nbsp;<span className="text-[var(--text)]">{endDate}</span>
          </span>

          {/* ── Scale switcher: Gantt + Timeline ────────────────────────── */}
          {state.view !== 'cards' && (
            <div className="inline-flex p-[2px] border border-[var(--line)] rounded-lg bg-[#0f1419]">
              {SCALE_OPTS.map(({ label, ganttVal, tlVal }) => (
                <button
                  key={label}
                  onClick={() => {
                    if (state.view === 'gantt') dispatch({ type: 'SET_DAY_WIDTH', value: ganttVal });
                    else dispatch({ type: 'SET_TIMELINE_SCALE', value: tlVal });
                  }}
                  className={`px-3 py-[4px] rounded-[5px] text-[11px] font-semibold transition-colors ${
                    (state.view === 'gantt' ? state.dayWidth === ganttVal : state.timelineScale === tlVal)
                      ? 'bg-[#26313b] text-white'
                      : 'text-[var(--muted)] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* ── Gantt checkboxes ─────────────────────────────────────────── */}
          {state.view === 'gantt' && ([
            { key: 'showStages', label: 'Этапы',       action: 'SET_SHOW_STAGES' },
            { key: 'showSubs',   label: 'Подпроцессы', action: 'SET_SHOW_SUBS' },
            { key: 'showSteps',  label: 'Шаги',        action: 'SET_SHOW_STEPS' },
          ] as const).map(({ key, label, action }) => (
            <label key={key} className={chip('cursor-pointer')}>
              <input
                type="checkbox"
                checked={state[key]}
                onChange={e => dispatch({ type: action, value: e.target.checked })}
                className="accent-[#2f7ecb]"
              />
              {label}
            </label>
          ))}

          {/* ── Cards checkboxes ─────────────────────────────────────────── */}
          {state.view === 'cards' && ([
            { key: 'showIoCards',    label: 'Входы/Выходы', action: 'SET_SHOW_IO_CARDS' },
            { key: 'showStepsCards', label: 'Шаги',         action: 'SET_SHOW_STEPS_CARDS' },
          ] as const).map(({ key, label, action }) => (
            <label key={key} className={chip('cursor-pointer')}>
              <input
                type="checkbox"
                checked={state[key]}
                onChange={e => dispatch({ type: action, value: e.target.checked })}
                className="accent-[#2f7ecb]"
              />
              {label}
            </label>
          ))}

        </div>
      )}

      {/* ── Row 3: stage legend ─────────────────────────────────────────── */}
      {showToolbar && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[var(--muted)] whitespace-nowrap">Этапы:</span>
          {state.stages.map(st => (
            <div key={st.id} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: st.color ?? '#2f7ecb' }}
              />
              <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">{st.title}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
