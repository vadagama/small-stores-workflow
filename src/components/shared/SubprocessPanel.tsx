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
  const readOnly = state.appMode === 'view';

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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--panel)]">

      {/* Header */}
      <div className="px-5 pt-[18px] pb-[14px] border-b border-[var(--line)] flex-shrink-0 relative">
        {/* Stage badge */}
        <div
          className="inline-flex items-center gap-1.5 px-[10px] py-[3px] rounded-full text-[11px] font-semibold mb-2"
          style={{ background: stageColor + '20', color: stageColor }}
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stageColor }} />
          {stage.title}
        </div>

        {/* Title */}
        {!readOnly && editingTitle ? (
          <div className="flex items-start gap-2 mt-1">
            <textarea
              ref={titleAreaRef}
              autoFocus
              rows={1}
              value={titleVal}
              onChange={e => { setTitleVal(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Escape') { setTitleVal(sub.title); setEditingTitle(false); } }}
              className="flex-1 text-[17px] font-semibold leading-snug px-2 py-1 border border-[rgba(255,255,255,.2)] rounded bg-[var(--panel2)] text-[var(--text)] outline-none resize-none overflow-hidden"
            />
            <button
              onMouseDown={e => { e.preventDefault(); dispatch({ type: 'DELETE_SUB', subId }); onClose(); }}
              className="flex-shrink-0 text-[rgba(255,100,100,.6)] hover:text-[rgba(255,60,60,1)] text-lg leading-none px-1 mt-1"
            >
              ×
            </button>
          </div>
        ) : (
          <h3
            className="text-[17px] font-semibold text-[var(--text)] leading-snug cursor-default"
            onDoubleClick={() => { if (!readOnly) { setEditingTitle(true); setTitleVal(sub.title); } }}
            title={readOnly ? undefined : 'Двойной клик для редактирования'}
          >
            {sub.title}
          </h3>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-[14px] right-[14px] text-[var(--muted)] hover:text-[var(--text)] text-base leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,.06)] transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto gantt-scroll">

        {/* Responsible */}
        <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
          <span className="text-[9px] font-extrabold uppercase tracking-[.7px] text-[var(--muted)] flex-shrink-0 w-16">Отв.</span>
          {!readOnly && editingResp ? (
            <input
              autoFocus
              value={respVal}
              onChange={e => setRespVal(e.target.value)}
              onBlur={commitResp}
              onKeyDown={e => { if (e.key === 'Enter') commitResp(); if (e.key === 'Escape') { setRespVal(sub.responsible); setEditingResp(false); } }}
              className="flex-1 text-xs px-2 py-1 border border-[rgba(255,255,255,.15)] rounded bg-[var(--panel2)] text-[var(--text)] outline-none"
            />
          ) : (
            <span
              onClick={() => { if (!readOnly) { setEditingResp(true); setRespVal(sub.responsible); } }}
              className={`text-xs px-2 py-0.5 rounded ${readOnly ? '' : 'cursor-pointer hover:bg-[rgba(255,255,255,.05)]'} ${sub.responsible ? 'text-[var(--text)] font-medium' : 'text-[var(--muted)] italic'}`}
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
              readOnly={readOnly}
              onChange={e => {
                if (readOnly || !e.target.value) return;
                const ns = dateToOffset(e.target.value, state.projectStart, state.minOffset);
                dispatch({ type: 'RESIZE_SUB', subId, startOffset: ns, endOffset: Math.max(ns, sub.endOffset) });
              }}
              className={`bg-transparent border-0 outline-none text-xs text-[var(--text)] ${readOnly ? 'cursor-default pointer-events-none' : 'cursor-pointer'}`}
            />
            <span className="text-[var(--muted)] text-[10px]">—</span>
            <input
              type="date"
              value={isoDate(endDate)}
              readOnly={readOnly}
              onChange={e => {
                if (readOnly || !e.target.value) return;
                const ne = dateToOffset(e.target.value, state.projectStart, state.minOffset);
                dispatch({ type: 'RESIZE_SUB', subId, startOffset: Math.min(sub.startOffset, ne), endOffset: ne });
              }}
              className={`bg-transparent border-0 outline-none text-xs text-[var(--text)] ${readOnly ? 'cursor-default pointer-events-none' : 'cursor-pointer'}`}
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
                  className="flex items-center gap-1.5 px-[10px] py-[4px] text-[11px] font-semibold w-full group text-[var(--muted)]"
                >
                  <span className="transition-transform group-data-[state=open]:rotate-90 text-[8px]">▶</span>
                  Шаги {sub.operations.length > 0 && <span className="opacity-60">({sub.operations.length})</span>}
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="accordion-content">
                <div className="px-3 pb-3 pt-1 flex flex-col gap-[5px]">
                  {readOnly ? (
                    sub.operations.map((op, i) => (
                      <OperationItem
                        key={op.id}
                        op={op}
                        sub={sub}
                        index={i + 1}
                        opsBg="rgba(230,236,242,.04)"
                        opsBC="rgba(230,236,242,.10)"
                        opsColor="var(--text)"
                      />
                    ))
                  ) : (
                  <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext items={sub.operations.map(o => o.id)} strategy={verticalListSortingStrategy}>
                      {sub.operations.map((op, i) => (
                        <OperationItem
                          key={op.id}
                          op={op}
                          sub={sub}
                          index={i + 1}
                          opsBg="rgba(230,236,242,.04)"
                          opsBC="rgba(230,236,242,.10)"
                          opsColor="var(--text)"
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  )}

                  {!readOnly && (adding ? (
                    <input
                      autoFocus
                      value={newOpVal}
                      onChange={e => setNewOpVal(e.target.value)}
                      onBlur={commitAddOp}
                      onKeyDown={e => { if (e.key === 'Enter') commitAddOp(); if (e.key === 'Escape') { setAdding(false); setNewOpVal(''); } }}
                      placeholder="Название шага…"
                      className="px-[6px] py-[5px] text-xs border border-[rgba(255,255,255,.15)] rounded-md bg-[var(--panel2)] text-[var(--text)] outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setAdding(true)}
                      className="px-2 py-[4px] text-left text-[11px] border border-dashed border-[var(--line)] rounded-md text-[var(--muted)] hover:bg-[rgba(255,255,255,.04)] transition-colors"
                    >
                      + шаг
                    </button>
                  ))}
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
