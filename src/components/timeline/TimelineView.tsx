import { useRef, useState, useMemo, useCallback } from 'react';
import type { TimelineScale } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  offsetToDate, fmtShort, monthName, getISOWeek, isoDate, dateToOffset,
} from '../../utils/dateUtils';
import type { Subprocess, Stage } from '../../types';
import { SidePanel } from '../gantt/SidePanel';

// ── Constants ──────────────────────────────────────────────────────────────────
const TIME_W    = 96;   // left time-label column width
const CARD_W    = 180;  // subprocess card width
const TRACK_GAP = 8;    // gap between tracks
const MIN_CARD_H = 40;  // minimum card height

type Scale = TimelineScale;
const PX_PER_DAY: Record<Scale, number> = { months: 3, weeks: 8, days: 20 };

// ── Flat list of subprocesses with stage metadata ──────────────────────────────
interface SubItem {
  sub: Subprocess;
  stage: Stage;
  track: number;
}

function buildSubItems(stages: Stage[], pxPerDay: number, globalMin: number): SubItem[] {
  const all: { sub: Subprocess; stage: Stage }[] = [];
  for (const stage of stages)
    for (const sub of stage.subprocesses)
      all.push({ sub, stage });
  all.sort((a, b) => a.sub.startOffset - b.sub.startOffset);

  // Track assignment in pixel space to avoid visual overlap caused by MIN_CARD_H
  const trackBottomPx: number[] = [];
  return all.map(({ sub, stage }) => {
    const topPx    = (sub.startOffset - globalMin) * pxPerDay;
    const heightPx = Math.max(MIN_CARD_H, (sub.endOffset - sub.startOffset) * pxPerDay);
    const bottomPx = topPx + heightPx;
    let t = trackBottomPx.findIndex(b => b <= topPx);
    if (t === -1) t = trackBottomPx.length;
    trackBottomPx[t] = bottomPx + 4; // 4px gap between cards
    return { sub, stage, track: t };
  });
}

// ── Time markers ───────────────────────────────────────────────────────────────
interface Marker { offset: number; label: string; sublabel?: string; }

function buildMarkers(
  minOff: number, maxOff: number, scale: Scale, projectStart: string, globalMin: number,
): Marker[] {
  const markers: Marker[] = [];
  if (scale === 'months') {
    const startD = offsetToDate(minOff, projectStart, globalMin);
    let yr = startD.getFullYear(), mo = startD.getMonth();
    while (true) {
      const d = new Date(yr, mo, 1);
      const off = dateToOffset(isoDate(d), projectStart, globalMin);
      if (off > maxOff + 31) break;
      markers.push({ offset: Math.max(minOff, off), label: monthName(d) });
      mo++; if (mo > 11) { mo = 0; yr++; }
    }
  } else if (scale === 'weeks') {
    const startD = offsetToDate(minOff, projectStart, globalMin);
    const dow = (startD.getDay() + 6) % 7;
    let off = minOff - dow;
    let weekNum = 0;
    while (off <= maxOff) {
      weekNum++;
      if (off >= minOff) {
        const d = offsetToDate(off, projectStart, globalMin);
        markers.push({ offset: off, label: `Нед ${weekNum}`, sublabel: fmtShort(d) });
      }
      off += 7;
    }
  } else {
    for (let off = minOff; off <= maxOff; off++) {
      if ((off - minOff) % 7 === 0) {
        const d = offsetToDate(off, projectStart, globalMin);
        markers.push({ offset: off, label: fmtShort(d) });
      }
    }
  }
  return markers;
}

// ── Drag state ─────────────────────────────────────────────────────────────────
type DragType = 'move' | 'resize-top' | 'resize-bottom';

interface DragState {
  subId: string;
  type: DragType;
  startY: number;
  origStart: number;
  origEnd: number;
}

interface LiveOffset {
  subId: string;
  startOffset: number;
  endOffset: number;
}

const HANDLE_H = 8; // px — resize handle zone at top/bottom of card

// ── Main component ─────────────────────────────────────────────────────────────
export function TimelineView() {
  const { state, dispatch } = useApp();
  const scale = state.timelineScale;
  const [live, setLive] = useState<LiveOffset | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);

  const pxPerDay = PX_PER_DAY[scale];

  const { globalMin, globalMax } = useMemo(() => {
    const offs = state.stages.flatMap(st =>
      st.subprocesses.flatMap(sub => [sub.startOffset, sub.endOffset])
    );
    const mn = offs.length ? Math.min(...offs) : state.minOffset;
    const mx = offs.length ? Math.max(...offs) : state.minOffset + 90;
    return { globalMin: mn, globalMax: mx };
  }, [state.stages, state.minOffset]);

  const totalDays = globalMax - globalMin + 10;
  const totalH    = totalDays * pxPerDay;

  const subItems = useMemo(
    () => buildSubItems(state.stages, pxPerDay, globalMin),
    [state.stages, pxPerDay, globalMin],
  );
  const numTracks = useMemo(
    () => subItems.reduce((m, it) => Math.max(m, it.track + 1), 1),
    [subItems],
  );
  const totalContentW = TRACK_GAP + numTracks * (CARD_W + TRACK_GAP);

  const markers = useMemo(() => {
    const base = buildMarkers(globalMin, globalMax, scale, state.projectStart, globalMin);
    if (!state.reverseTime) return base;
    return base.map(m => {
      const daysLeft = globalMax - m.offset;
      if (scale === 'days') {
        return { ...m, label: `−${Math.max(1, daysLeft)} дн`, sublabel: undefined };
      } else if (scale === 'weeks') {
        const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
        return { ...m, label: `−${weeksLeft} нед`, sublabel: undefined };
      } else {
        const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
        return { ...m, label: `−${monthsLeft} мес`, sublabel: undefined };
      }
    });
  }, [globalMin, globalMax, scale, state.projectStart, state.reverseTime]);

  const syncScroll = useCallback(() => {
    if (mainRef.current && timeRef.current)
      timeRef.current.scrollTop = mainRef.current.scrollTop;
  }, []);

  const handleClick = useCallback((item: SubItem) => {
    dispatch({ type: 'SET_SELECTED', id: state.selectedId === item.sub.id ? null : item.sub.id });
  }, [dispatch, state.selectedId]);

  const readOnly = state.appMode === 'view';

  const startDrag = useCallback((
    e: React.PointerEvent,
    sub: Subprocess,
    type: DragType,
  ) => {
    if (readOnly) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      subId: sub.id,
      type,
      startY: e.clientY,
      origStart: sub.startOffset,
      origEnd: sub.endOffset,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const pxPerDayNow = PX_PER_DAY[scale];
    const deltaOffset = Math.round((e.clientY - d.startY) / pxPerDayNow);
    let ns = d.origStart;
    let ne = d.origEnd;
    if (d.type === 'move') {
      ns = d.origStart + deltaOffset;
      ne = d.origEnd + deltaOffset;
    } else if (d.type === 'resize-top') {
      ns = Math.min(d.origStart + deltaOffset, d.origEnd - 1);
    } else {
      ne = Math.max(d.origEnd + deltaOffset, d.origStart + 1);
    }
    setLive({ subId: d.subId, startOffset: ns, endOffset: ne });
  }, [scale]);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setLive(prev => {
      if (prev && prev.subId === d.subId) {
        if (d.type === 'move') {
          dispatch({ type: 'MOVE_SUB_ABSOLUTE', subId: d.subId, targetStart: prev.startOffset });
        } else {
          dispatch({ type: 'RESIZE_SUB', subId: d.subId, startOffset: prev.startOffset, endOffset: prev.endOffset });
        }
      }
      return null;
    });
  }, [dispatch]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left time-label column */}
        <div
          ref={timeRef}
          className="flex-shrink-0 overflow-hidden border-r border-[var(--line)] bg-[#0d1117]"
          style={{ width: TIME_W }}
        >
          <div className="relative" style={{ height: totalH }}>
            {markers.map((m, i) => {
              const top = (m.offset - globalMin) * pxPerDay;
              return (
                <div key={i} className="absolute left-0 right-0 flex flex-col items-end pr-3" style={{ top }}>
                  <div className="w-full h-px bg-[var(--line)] opacity-40" />
                  <span className="text-[10px] font-semibold text-[var(--muted)] mt-0.5 text-right leading-tight">
                    {m.label}
                  </span>
                  {m.sublabel && (
                    <span className="text-[9px] text-[var(--muted)] opacity-60 leading-tight">{m.sublabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main scrollable area */}
        <div ref={mainRef} className="flex-1 overflow-auto" onScroll={syncScroll}>
          <div
            className="relative"
            style={{ width: totalContentW, height: totalH, minWidth: '100%' }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {/* Horizontal grid lines */}
            {markers.map((m, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-[var(--line)] opacity-20 pointer-events-none"
                style={{ top: (m.offset - globalMin) * pxPerDay }}
              />
            ))}

            {/* Vertical track separators */}
            {Array.from({ length: numTracks }).map((_, t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-[var(--line)] opacity-10 pointer-events-none"
                style={{ left: TRACK_GAP + t * (CARD_W + TRACK_GAP) }}
              />
            ))}

            {/* Subprocess cards */}
            {subItems.map(item => {
              const { sub, stage, track } = item;
              const isDragging = live?.subId === sub.id;
              const effStart = isDragging ? live!.startOffset : sub.startOffset;
              const effEnd   = isDragging ? live!.endOffset   : sub.endOffset;
              const topPx    = (effStart - globalMin) * pxPerDay;
              const rawH     = (effEnd - effStart) * pxPerDay;
              const heightPx = Math.max(MIN_CARD_H, rawH);
              const leftPx   = TRACK_GAP + track * (CARD_W + TRACK_GAP);
              const isSelected = state.selectedId === sub.id;
              const startDate = offsetToDate(effStart, state.projectStart, globalMin);
              const endDate   = offsetToDate(effEnd,   state.projectStart, globalMin);
              const color = stage.color ?? '#2f7ecb';

              return (
                <div
                  key={sub.id}
                  className="absolute rounded-lg overflow-hidden select-none"
                  style={{
                    top: topPx,
                    left: leftPx,
                    width: CARD_W,
                    height: heightPx,
                    backgroundColor: color,
                    outline: isSelected ? '2px solid white' : 'none',
                    outlineOffset: 2,
                    boxShadow: isDragging
                      ? `0 4px 20px ${color}88`
                      : isSelected ? `0 0 0 4px ${color}55` : undefined,
                    zIndex: isDragging ? 10 : undefined,
                    transition: isDragging ? 'none' : undefined,
                  }}
                >
                  {/* Top resize handle */}
                  {!readOnly && (
                    <div
                      className="absolute top-0 left-0 right-0 cursor-ns-resize z-10"
                      style={{ height: HANDLE_H }}
                      onPointerDown={e => startDrag(e, sub, 'resize-top')}
                    >
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded bg-white/40" />
                    </div>
                  )}

                  {/* Card body — drag to move */}
                  <div
                    className={`absolute inset-0 px-2.5 flex flex-col justify-between ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                    style={{ top: readOnly ? 0 : HANDLE_H, bottom: readOnly ? 0 : HANDLE_H, paddingTop: 4, paddingBottom: 4 }}
                    onPointerDown={e => startDrag(e, sub, 'move')}
                    onClick={() => !dragRef.current && handleClick(item)}
                  >
                    <div className="text-[11px] font-semibold text-white leading-snug line-clamp-3 drop-shadow-sm pointer-events-none">
                      {sub.title}
                    </div>
                    {heightPx >= 54 && (
                      <div className="pointer-events-none">
                        <div className="text-[9px] font-mono text-white/70">{fmtShort(startDate)} – {fmtShort(endDate)}</div>
                        <div className="text-[17px] font-bold text-white/90">{effEnd - effStart} дней</div>
                      </div>
                    )}
                  </div>

                  {/* Bottom resize handle */}
                  {!readOnly && (
                    <div
                      className="absolute bottom-0 left-0 right-0 cursor-ns-resize z-10"
                      style={{ height: HANDLE_H }}
                      onPointerDown={e => startDrag(e, sub, 'resize-bottom')}
                    >
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded bg-white/40" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <SidePanel />
      </div>
    </div>
  );
}
