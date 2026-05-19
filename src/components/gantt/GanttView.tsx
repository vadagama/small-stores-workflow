import { useCallback, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { offsetToDate, fmtShort, monthName, isoDate, getISOWeek } from '../../utils/dateUtils';
import { SidePanel } from './SidePanel';
import type { Stage, Subprocess, Operation } from '../../types';

const ROW_H = 40;

interface GanttRow {
  id: string;
  type: 'stage' | 'sub' | 'op';
  label: string;
  depth: number;
  startOffset: number;
  endOffset: number;
  color: string;
  item: Stage | Subprocess | Operation;
}

export function GanttView() {
  const { state, dispatch } = useApp();
  const timelineRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null); // row index for drop line
  const stagesRef = useRef(state.stages);
  stagesRef.current = state.stages;

  const handleDropIndicator = useCallback((idx: number | null) => setDropTarget(idx), []);

  const handleSubDrop = useCallback((subId: string, targetRowIdx: number, rows: GanttRow[]) => {
    setDropTarget(null);
    const targetRow = rows[targetRowIdx];
    if (!targetRow) return;
    const stages = stagesRef.current;
    let toStageId: string;
    let toIdx: number;
    if (targetRow.type === 'stage') {
      toStageId = targetRow.id;
      toIdx = 0;
    } else if (targetRow.type === 'sub') {
      const st = stages.find(s => s.subprocesses.some(sub => sub.id === targetRow.id));
      if (!st) return;
      toStageId = st.id;
      toIdx = st.subprocesses.findIndex(sub => sub.id === targetRow.id);
      if (toIdx < 0) return;
    } else {
      return;
    }
    dispatch({ type: 'MOVE_SUB_TO_STAGE', subId, toStageId, toIdx });
  }, [dispatch]);

  const rows = useMemo(() => buildRows(state), [state.stages, state.showStages, state.showSubs, state.showSteps]);

  const { minOffset, maxOffset, totalDays } = useMemo(() => {
    const offsets = rows.flatMap(r => [r.startOffset, r.endOffset]);
    const min = offsets.length ? Math.min(...offsets) : state.minOffset;
    const max = offsets.length ? Math.max(...offsets) : state.minOffset + 90;
    return { minOffset: min, maxOffset: max, totalDays: max - min + 10 };
  }, [rows, state.minOffset]);

  const monthCols = useMemo(() => {
    const cols: { label: string; left: number; width: number }[] = [];
    if (state.reverseTime) {
      const groupDays = state.dayWidth < 12 ? 30 : 7;
      for (let d = 0; d <= totalDays; d += groupDays) {
        const daysLeft = maxOffset - (minOffset + d);
        const label = state.dayWidth < 12
          ? `−${Math.max(1, Math.ceil(daysLeft / 30))} мес`
          : `−${Math.max(1, Math.ceil(daysLeft / 7))} нед`;
        const left = d * state.dayWidth;
        const width = Math.min(groupDays, totalDays - d + 1) * state.dayWidth;
        cols.push({ label, left, width });
      }
    } else {
      for (let d = 0; d <= totalDays; d++) {
        const date = offsetToDate(minOffset + d, state.projectStart, state.minOffset);
        if (date.getDate() === 1 || d === 0) {
          const label = monthName(date);
          if (cols.length && cols[cols.length - 1].label === label) continue;
          const left = d * state.dayWidth;
          if (cols.length) cols[cols.length - 1].width = left - cols[cols.length - 1].left;
          cols.push({ label, left, width: 0 });
        }
      }
      if (cols.length) cols[cols.length - 1].width = totalDays * state.dayWidth - cols[cols.length - 1].left + state.dayWidth;
    }
    return cols;
  }, [totalDays, minOffset, maxOffset, state.projectStart, state.minOffset, state.dayWidth, state.reverseTime]);

  // Sync scroll
  function onTreeScroll(e: React.UIEvent<HTMLDivElement>) {
    if (timelineRef.current) timelineRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
  }
  function onTimelineScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.target as HTMLDivElement;
    if (treeRef.current) treeRef.current.scrollTop = el.scrollTop;
    if (headerRef.current) headerRef.current.scrollLeft = el.scrollLeft;
  }

  const totalWidth = totalDays * state.dayWidth;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="gantt-table flex-1 min-h-0"
        style={{ '--left-w': `${state.leftWidth}px` } as React.CSSProperties}
      >
        {/* Tree head */}
        <div className="border-b border-r border-[var(--line)] bg-[var(--panel)] flex items-center px-4 text-xs font-semibold text-[var(--muted)]">
          Структура работ
        </div>

        {/* Timeline head */}
        <div ref={headerRef} className="border-b border-[var(--line)] bg-[var(--panel)] overflow-hidden">
          <div style={{ width: totalWidth }}>
            {/* Months */}
            <div className="relative h-7 border-b border-[var(--line)]">
              {monthCols.map(col => (
                <span
                  key={col.label + col.left}
                  className="absolute top-0 text-[13px] font-semibold text-[var(--text)] px-2 whitespace-nowrap overflow-hidden leading-7"
                  style={{ left: col.left, width: col.width }}
                >
                  {col.label}
                </span>
              ))}
            </div>
            {/* Days / Weeks */}
            <div className="relative h-[27px]">
              {(() => {
                let weekCounter = 0;
                const isWeekMode = state.dayWidth >= 8 && state.dayWidth < 22;
                return Array.from({ length: totalDays + 1 }, (_, d) => {
                  const offset = minOffset + d;
                  const daysLeft = maxOffset - offset;
                  let label: string;
                  if (state.reverseTime) {
                    if (state.dayWidth >= 22) {
                      label = daysLeft >= 0 ? `−${daysLeft || 1}` : '';
                    } else if (isWeekMode) {
                      const date = offsetToDate(offset, state.projectStart, state.minOffset);
                      const isMonday = date.getDay() === 1;
                      if (isMonday) {
                        const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
                        label = `−${weeksLeft} нед`;
                      } else {
                        label = '';
                      }
                    } else {
                      label = '';
                    }
                  } else {
                    const date = offsetToDate(offset, state.projectStart, state.minOffset);
                    const dayNum = date.getDay();
                    const isWeekend = dayNum === 0 || dayNum === 6;
                    const isMonday = dayNum === 1;
                    if (isWeekMode && isMonday) weekCounter++;
                    label = state.dayWidth >= 22
                      ? fmtShort(date).slice(0, 2)
                      : isWeekMode && isMonday
                      ? `Нед ${weekCounter}`
                      : '';
                    return (
                      <span
                        key={d}
                        className={`absolute top-0 ${
                          isWeekMode
                            ? 'text-[10px] font-semibold text-[var(--muted)] pl-1'
                            : `text-[9px] text-center ${isWeekend ? 'text-[rgba(220,80,80,.6)]' : 'text-[var(--muted)]'}`
                        }`}
                        style={{
                          left: d * state.dayWidth,
                          width: isWeekMode && isMonday ? 7 * state.dayWidth : state.dayWidth,
                          lineHeight: '27px',
                        }}
                      >
                        {label}
                      </span>
                    );
                  }
                  const date = offsetToDate(offset, state.projectStart, state.minOffset);
                  const isMonday = date.getDay() === 1;
                  return (
                    <span
                      key={d}
                      className="absolute top-0 text-[10px] font-semibold text-[var(--muted)] pl-1"
                      style={{
                        left: d * state.dayWidth,
                        width: isWeekMode && isMonday ? 7 * state.dayWidth : state.dayWidth,
                        lineHeight: '27px',
                      }}
                    >
                      {label}
                    </span>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Tree body */}
        <div ref={treeRef} className="gantt-tree overflow-y-auto overflow-x-hidden border-r border-[var(--line)]" style={{ position: 'relative' }} onScroll={onTreeScroll}>
          {rows.map(row => (
            <GanttTreeRow key={row.id} row={row} hovered={hoveredId === row.id} onHover={setHoveredId} />
          ))}
          {dropTarget !== null && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ top: dropTarget * ROW_H - 1, height: 2, background: 'rgba(100,160,255,.8)', boxShadow: '0 0 4px rgba(100,160,255,.6)' }}
            />
          )}
        </div>

        {/* Timeline body */}
        <div ref={timelineRef} className="gantt-scroll overflow-y-auto overflow-x-auto" onScroll={onTimelineScroll}>
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Grid lines */}
            {Array.from({ length: totalDays + 1 }, (_, d) => {
              const date = offsetToDate(minOffset + d, state.projectStart, state.minOffset);
              const isWeekend = [0, 6].includes(date.getDay());
              return (
                <div
                  key={d}
                  className={`absolute top-0 bottom-0 border-r ${isWeekend ? 'border-[rgba(220,80,80,.08)] bg-[rgba(220,80,80,.03)]' : 'border-[var(--line)]'}`}
                  style={{ left: d * state.dayWidth, width: state.dayWidth }}
                />
              );
            })}

            {rows.map((row, rowIndex) => (
              <GanttBarRow
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                rows={rows}
                minOffset={minOffset}
                dayWidth={state.dayWidth}
                hovered={hoveredId === row.id}
                onHover={setHoveredId}
                onDropIndicator={handleDropIndicator}
                onSubDrop={handleSubDrop}
                onSelect={id => dispatch({ type: 'SET_SELECTED', id })}
              />
            ))}
          </div>
        </div>
      </div>
      <SidePanel />
    </div>
  );
}

function GanttTreeRow({ row, hovered, onHover }: { row: GanttRow; hovered: boolean; onHover: (id: string | null) => void }) {
  const { dispatch } = useApp();
  const paddingLeft = 12 + row.depth * 16;

  return (
    <div
      className="flex items-center border-b border-[var(--line)] cursor-pointer transition-colors"
      style={{ height: ROW_H, paddingLeft, background: hovered ? 'rgba(255,255,255,.05)' : undefined }}
      onClick={() => row.type === 'sub' && dispatch({ type: 'SET_SELECTED', id: row.id })}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span
        className={`truncate text-xs font-medium ${
          row.type === 'stage' ? 'font-display font-bold text-white text-sm' :
          row.type === 'sub'   ? 'text-[rgba(255,255,255,.9)] font-semibold' :
                                  'text-[var(--muted)]'
        }`}
      >
        {row.label}
      </span>
    </div>
  );
}

interface GanttBarRowProps {
  row: GanttRow;
  rowIndex: number;
  rows: GanttRow[];
  minOffset: number;
  dayWidth: number;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onDropIndicator: (idx: number | null) => void;
  onSubDrop: (subId: string, targetIdx: number, rows: GanttRow[]) => void;
  onSelect: (id: string) => void;
}

function GanttBarRow({ row, rowIndex, rows, minOffset, dayWidth, hovered, onHover, onDropIndicator, onSubDrop, onSelect }: GanttBarRowProps) {
  const { dispatch, state } = useApp();
  const readOnly = state.appMode === 'view';
  const [dragging, setDragging] = useState(false);
  const pendingEdge = useRef<'left' | 'right' | 'move'>('move');
  const didDrag = useRef(false);
  const dragRef = useRef<{
    startX: number; startY: number;
    startOffset: number; endOffset: number;
    edge: 'left' | 'right' | 'move';
    mode: 'pending' | 'h' | 'v';
    lastDelta: number;
  } | null>(null);

  const left  = (row.startOffset - minOffset) * dayWidth;
  const width = Math.max((row.endOffset - row.startOffset + 1) * dayWidth - 2, 6);

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    const edge = pendingEdge.current;
    pendingEdge.current = 'move';
    if (row.type === 'stage' && edge !== 'move') return;
    if ((row.type === 'sub' || row.type === 'op') && edge === 'move') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startOffset: row.startOffset, endOffset: row.endOffset,
      edge, mode: 'pending', lastDelta: 0,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || readOnly) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (dragRef.current.mode === 'pending') {
      if (row.type === 'sub' && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current.mode = 'v';
        didDrag.current = true;
      } else if (Math.abs(dx) > 4) {
        dragRef.current.mode = 'h';
        didDrag.current = true;
      } else {
        return;
      }
    }

    if (dragRef.current.mode === 'v') {
      const targetIdx = Math.max(0, Math.min(rows.length - 1, rowIndex + Math.round(dy / ROW_H)));
      const targetRow = rows[targetIdx];
      if (targetRow && (targetRow.type === 'sub' || targetRow.type === 'stage') && targetRow.id !== row.id) {
        onDropIndicator(targetIdx);
        dragRef.current.lastDelta = targetIdx;
      }
      return;
    }

    const delta = Math.round(dx / dayWidth);
    const prevDelta = dragRef.current.lastDelta;
    if (delta === prevDelta) return;
    dragRef.current.lastDelta = delta;

    const { edge, startOffset, endOffset } = dragRef.current;
    let ns = startOffset, ne = endOffset;
    if (edge === 'move') { ns = startOffset + delta; ne = endOffset + delta; }
    else if (edge === 'right') { ne = Math.max(startOffset, endOffset + delta); }
    else { ns = Math.min(startOffset + delta, endOffset); }

    if (row.type === 'op') {
      dispatch({ type: 'UPDATE_OP_OFFSETS', opId: row.id, startOffset: ns, endOffset: ne });
    } else if (row.type === 'sub') {
      if (edge === 'move') {
        dispatch({ type: 'MOVE_SUB_ABSOLUTE', subId: row.id, targetStart: ns });
      } else {
        dispatch({ type: 'RESIZE_SUB', subId: row.id, startOffset: ns, endOffset: ne });
      }
    } else if (row.type === 'stage') {
      const stepDelta = delta - prevDelta;
      if (stepDelta !== 0) {
        dispatch({ type: 'UPDATE_STAGE_OFFSETS', stageId: row.id, delta: stepDelta });
      }
    }
  }

  function onPointerUp() {
    if (dragRef.current?.mode === 'v') {
      onSubDrop(row.id, dragRef.current.lastDelta as number, rows);
    }
    onDropIndicator(null);
    dragRef.current = null;
    setDragging(false);
  }

  const colors: Record<string, string> = { stage: 'rgba(255,255,255,.12)', sub: row.color, op: row.color };

  return (
    <div
      className="gantt-bar-track"
      style={{ height: ROW_H, background: hovered ? 'rgba(255,255,255,.04)' : undefined }}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => {
        if (didDrag.current) { didDrag.current = false; return; }
        row.type === 'sub' && onSelect(row.id);
      }}
    >
      {row.startOffset !== row.endOffset || row.type !== 'stage' ? (
        <div
          className={`gantt-bar ${dragging ? 'opacity-50' : ''}`}
          style={{
            left, width,
            background: colors[row.type],
            opacity: dragging ? 0.5 : row.type === 'stage' ? 0.4 : 1,
            cursor: readOnly ? 'default' : 'grab',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {row.type !== 'stage' && (
            <>
              {!readOnly && <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={() => { pendingEdge.current = 'left'; }} />}
              {!readOnly && <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" onPointerDown={() => { pendingEdge.current = 'right'; }} />}
              <span className="absolute inset-0 flex items-center px-3 text-[10px] font-semibold text-white/70 pointer-events-none overflow-hidden whitespace-nowrap select-none">
                {fmtShort(offsetToDate(row.startOffset, state.projectStart, state.minOffset))}
                {' – '}
                {fmtShort(offsetToDate(row.endOffset, state.projectStart, state.minOffset))}
                <span className="font-bold ml-2 text-[14px]"> {row.endOffset - row.startOffset} дней</span>
              </span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function buildRows(state: ReturnType<typeof useApp>['state']): GanttRow[] {
  const rows: GanttRow[] = [];
  state.stages.forEach(stage => {
    if (state.showStages) {
      rows.push({ id: stage.id, type: 'stage', label: stage.title, depth: 0, startOffset: stage.startOffset, endOffset: stage.endOffset, color: stage.color, item: stage });
    }
    stage.subprocesses.forEach(sub => {
      if (state.showSubs) {
        rows.push({ id: sub.id, type: 'sub', label: sub.title, depth: 1, startOffset: sub.startOffset, endOffset: sub.endOffset, color: sub.color, item: sub });
      }
      if (state.showSteps) {
        sub.operations.forEach(op => {
          rows.push({ id: op.id, type: 'op', label: op.title, depth: 2, startOffset: op.startOffset, endOffset: op.endOffset, color: sub.color, item: op });
        });
      }
    });
  });
  return rows;
}
