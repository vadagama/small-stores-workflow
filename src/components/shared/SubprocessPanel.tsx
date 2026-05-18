import { useState, useRef, useEffect } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useApp } from '../../context/AppContext';
import { offsetToDate, dateToOffset, isoDate } from '../../utils/dateUtils';
import { IOAccordion } from '../cards/IOAccordion';
import { OperationItem } from '../cards/OperationItem';

interface SubprocessPanelProps {
  subId: string;
  onClose: () => void;
}

export function SubprocessPanel({ subId, onClose }: SubprocessPanelProps) {
  const { state, dispatch } = useApp();

  const stage = state.stages.find(s => s.subprocesses.some(sub => sub.id === subId));
  const sub = stage?.subprocesses.find(s => s.id === subId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [editingResp, setEditingResp] = useState(false);
  const [respVal, setRespVal] = useState('');
  const [adding, setAdding] = useState(false);
  const [newOpVal, setNewOpVal] = useState('');
  const titleAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (sub) {
      setTitleVal(sub.title);
      setRespVal(sub.responsible);
    }
  }, [subId, sub?.title, sub?.responsible]);

  useEffect(() => {
    if (editingTitle && titleAreaRef.current) {
      const el = titleAreaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editingTitle, titleVal]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  if (!sub || !stage) return null;

  const stageColor = stage.color ?? '#2f7ecb';

  function commitTitle() {
    if (titleVal.trim() && titleVal !== sub!.title) {
      dispatch({ type: 'UPDATE_SUB_TITLE', subId, title: titleVal.trim() });
    } else {
      setTitleVal(sub!.title);
    }
    setEditingTitle(false);
  }

  function commitResp() {
    dispatch({ type: 'UPDATE_SUB_RESPONSIBLE', subId, value: respVal.trim() });
    setEditingResp(false);
  }

  function commitAddOp() {
    if (newOpVal.trim()) dispatch({ type: 'ADD_OP', subId, title: newOpVal.trim() });
    setAdding(false);
    setNewOpVal('');
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = sub!.operations.findIndex(o => o.id === active.id);
    const toIdx   = sub!.operations.findIndex(o => o.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1)
      dispatch({ type: 'REORDER_OPS', subId, fromIdx, toIdx });
  }

  const startDate = offsetToDate(sub.startOffset, state.projectStart, state.minOffset);
  const endDate   = offsetToDate(sub.endOffset,   state.projectStart, state.minOffset);

  const stageBg  = stage.stageMeta.bg;
  const stageHdr = stage.stageMeta.hdr;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: stageBg }}>
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 border-b border-[rgba(0,0,0,.15)] flex-shrink-0"
        style={{ background: stageHdr, borderLeftWidth: 3, borderLeftColor: stageColor, borderLeftStyle: 'solid' }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: stageColor }}>
            {stage.title}
          </span>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-white text-xl leading-none flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,.08)] transition-colors"
          >
            ×
          </button>
        </div>

        {editingTitle ? (
          <div className="flex items-start gap-2">
            <textarea
              ref={titleAreaRef}
              autoFocus
              rows={1}
              value={titleVal}
              onChange={e => { setTitleVal(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Escape') { setTitleVal(sub.title); setEditingTitle(false); } }}
              className="flex-1 text-sm font-bold leading-snug px-2 py-1 border border-[rgba(255,255,255,.4)] rounded bg-[rgba(255,255,255,.1)] text-white outline-none resize-none overflow-hidden"
            />
            <button
              onMouseDown={e => { e.preventDefault(); dispatch({ type: 'DELETE_SUB', subId }); onClose(); }}
              className="flex-shrink-0 text-[rgba(255,100,100,.6)] hover:text-[rgba(255,60,60,1)] text-lg leading-none px-1 mt-0.5"
            >
              ×
            </button>
          </div>
        ) : (
          <h3
            className="text-sm font-bold text-[var(--text)] leading-snug cursor-default hover:underline hover:decoration-dotted hover:decoration-[rgba(255,255,255,.4)]"
            onDoubleClick={() => { setEditingTitle(true); setTitleVal(sub.title); }}
            title="Двойной клик для редактирования"
          >
            {sub.title}
          </h3>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto gantt-scroll">

        {/* Responsible */}
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
          <span className="text-[9px] font-extrabold uppercase tracking-[.7px] text-[var(--muted)] flex-shrink-0 w-16">Отв.</span>
          {editingResp ? (
            <input
              autoFocus
              value={respVal}
              onChange={e => setRespVal(e.target.value)}
              onBlur={commitResp}
              onKeyDown={e => { if (e.key === 'Enter') commitResp(); if (e.key === 'Escape') { setRespVal(sub.responsible); setEditingResp(false); } }}
              className="flex-1 text-xs px-2 py-1 border border-[rgba(80,120,200,.4)] rounded bg-[rgba(255,255,255,.85)] text-[#222] outline-none"
            />
          ) : (
            <span
              onClick={() => { setEditingResp(true); setRespVal(sub.responsible); }}
              className={`text-xs cursor-pointer px-2 py-0.5 rounded hover:bg-[rgba(255,255,255,.07)] ${sub.responsible ? 'text-[var(--text)] font-medium' : 'text-[var(--muted)] italic'}`}
            >
              {sub.responsible || 'Не указан'}
            </span>
          )}
        </div>

        {/* Dates */}
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
          <span className="text-[9px] font-extrabold uppercase tracking-[.7px] text-[var(--muted)] flex-shrink-0 w-16">Даты</span>
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="date"
              value={isoDate(startDate)}
              onChange={e => {
                if (!e.target.value) return;
                const ns = dateToOffset(e.target.value, state.projectStart, state.minOffset);
                dispatch({ type: 'RESIZE_SUB', subId, startOffset: ns, endOffset: Math.max(ns, sub.endOffset) });
              }}
              className="bg-transparent border-0 outline-none text-xs text-[var(--text)] cursor-pointer"
            />
            <span className="text-[var(--muted)] text-[10px]">—</span>
            <input
              type="date"
              value={isoDate(endDate)}
              onChange={e => {
                if (!e.target.value) return;
                const ne = dateToOffset(e.target.value, state.projectStart, state.minOffset);
                dispatch({ type: 'RESIZE_SUB', subId, startOffset: Math.min(sub.startOffset, ne), endOffset: ne });
              }}
              className="bg-transparent border-0 outline-none text-xs text-[var(--text)] cursor-pointer"
            />
          </div>
        </div>

        {/* IO Inputs */}
        <div className="border-b border-[var(--line)]">
          <IOAccordion sub={sub} kind="in" />
        </div>

        {/* Operations */}
        <div className="border-b border-[var(--line)]">
          <Accordion.Root type="single" collapsible defaultValue="open">
            <Accordion.Item value="open">
              <Accordion.Header>
                <Accordion.Trigger
                  className="flex items-center gap-1.5 px-4 py-[7px] text-[11px] font-semibold w-full group"
                  style={{ color: 'rgba(155,185,245,.8)' }}
                >
                  <span className="transition-transform group-data-[state=open]:rotate-90 text-[8px]">▶</span>
                  Шаги {sub.operations.length > 0 && <span className="opacity-60">({sub.operations.length})</span>}
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="accordion-content">
                <div className="px-3 pb-3 pt-1 flex flex-col gap-[5px]" style={{ background: 'rgba(0,0,0,.15)' }}>
                  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext items={sub.operations.map(o => o.id)} strategy={verticalListSortingStrategy}>
                      {sub.operations.map((op, i) => (
                        <OperationItem
                          key={op.id}
                          op={op}
                          sub={sub}
                          index={i + 1}
                          opsBg="rgba(155,185,245,.07)"
                          opsBC="rgba(155,185,245,.2)"
                          opsColor="rgba(255,255,255,.82)"
                        />
                      ))}
                    </SortableContext>
                  </DndContext>

                  {adding ? (
                    <input
                      autoFocus
                      value={newOpVal}
                      onChange={e => setNewOpVal(e.target.value)}
                      onBlur={commitAddOp}
                      onKeyDown={e => { if (e.key === 'Enter') commitAddOp(); if (e.key === 'Escape') { setAdding(false); setNewOpVal(''); } }}
                      placeholder="Название шага…"
                      className="px-[6px] py-[5px] text-xs border border-[rgba(80,120,200,.5)] rounded-md bg-[rgba(255,255,255,.88)] text-[#222] outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setAdding(true)}
                      className="px-2 py-[4px] text-left text-[11px] border border-dashed border-[rgba(155,185,245,.3)] rounded-md text-[rgba(155,185,245,.6)] hover:bg-[rgba(155,185,245,.07)] transition-colors"
                    >
                      + шаг
                    </button>
                  )}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </div>

        {/* IO Outputs */}
        <IOAccordion sub={sub} kind="out" />

      </div>
    </div>
  );
}
