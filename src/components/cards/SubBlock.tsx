import { useState, useRef, useEffect } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../../context/AppContext';
import type { Stage, Subprocess } from '../../types';
import { offsetToDate, dateToOffset, isoDate } from '../../utils/dateUtils';
import { OperationItem } from './OperationItem';
import { IOAccordion } from './IOAccordion';

interface SubBlockProps {
  stage: Stage;
  sub: Subprocess;
}

export function SubBlock({ stage, sub }: SubBlockProps) {
  const { state, dispatch } = useApp();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(sub.title);
  const [editingResp, setEditingResp] = useState(false);
  const [respVal, setRespVal] = useState(sub.responsible);
  const [adding, setAdding] = useState(false);
  const [newOpVal, setNewOpVal] = useState('');
  const titleAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingTitle && titleAreaRef.current) {
      const el = titleAreaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editingTitle, titleVal]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sub.id, data: { type: 'sub', stageId: stage.id } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const meta = stage.stageMeta;

  function commitTitle() {
    if (titleVal.trim() && titleVal !== sub.title) {
      dispatch({ type: 'UPDATE_SUB_TITLE', subId: sub.id, title: titleVal.trim() });
    } else {
      setTitleVal(sub.title);
    }
    setEditingTitle(false);
  }

  function commitResp() {
    dispatch({ type: 'UPDATE_SUB_RESPONSIBLE', subId: sub.id, value: respVal.trim() });
    setEditingResp(false);
  }

  function commitAddOp() {
    if (newOpVal.trim()) dispatch({ type: 'ADD_OP', subId: sub.id, title: newOpVal.trim() });
    setAdding(false);
    setNewOpVal('');
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: meta.bg, borderColor: 'rgba(255,255,255,.10)' }}
      className="rounded-[10px] overflow-hidden border"
    >
      {/* Sub header */}
      <div
        style={{ background: meta.hdr }}
        className={`px-3 py-[9px] flex gap-2 cursor-grab ${editingTitle ? 'items-start' : 'items-baseline'}`}
        {...attributes}
        {...listeners}
      >
        {editingTitle ? (
          <>
            <textarea
              ref={titleAreaRef}
              autoFocus
              rows={1}
              value={titleVal}
              onChange={e => { setTitleVal(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Escape') { setTitleVal(sub.title); setEditingTitle(false); } }}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-[.82rem] font-bold leading-snug px-[6px] py-[2px] border border-[rgba(255,255,255,.7)] rounded bg-[rgba(255,255,255,.18)] text-white min-w-[140px] outline-none resize-none overflow-hidden"
            />
            <button
              onMouseDown={e => { e.preventDefault(); dispatch({ type: 'DELETE_SUB', subId: sub.id }); }}
              className="flex-shrink-0 text-[rgba(255,100,100,.7)] hover:text-[rgba(255,60,60,1)] text-lg leading-none px-1"
            >
              ×
            </button>
          </>
        ) : (
          <>
            <span
              className="flex-1 font-display text-[.82rem] font-bold text-white leading-snug cursor-default hover:underline hover:decoration-dotted hover:decoration-[rgba(255,255,255,.5)]"
              onDoubleClick={e => { e.stopPropagation(); setEditingTitle(true); setTitleVal(sub.title); }}
            >
              {sub.title}
            </span>
            <span className="text-[.68rem] font-semibold text-[rgba(255,255,255,.5)] whitespace-nowrap">
              {sub.operations.length} оп.
            </span>
          </>
        )}
      </div>

      {/* Responsible */}
      <div className="px-[14px] py-[5px] flex items-baseline gap-2 border-t border-[rgba(0,0,0,.15)]">
        <span className="flex-shrink-0 text-[9px] font-extrabold tracking-[.7px] uppercase text-[rgba(255,255,255,.4)]">
          Отв.
        </span>
        {editingResp ? (
          <input
            autoFocus
            value={respVal}
            onChange={e => setRespVal(e.target.value)}
            onBlur={commitResp}
            onKeyDown={e => { if (e.key === 'Enter') commitResp(); if (e.key === 'Escape') { setRespVal(sub.responsible); setEditingResp(false); } }}
            className="flex-1 text-xs px-1.5 py-0.5 border border-[rgba(80,120,200,.4)] rounded bg-[rgba(255,255,255,.85)] text-[#222] outline-none"
          />
        ) : (
          <span
            onClick={() => { setEditingResp(true); setRespVal(sub.responsible); }}
            className={`text-[.8rem] font-semibold cursor-pointer px-[5px] py-px rounded hover:bg-[rgba(255,255,255,.08)] ${sub.responsible ? 'text-[rgba(255,255,255,.88)]' : 'text-[rgba(255,255,255,.28)] italic font-normal'}`}
          >
            {sub.responsible || 'Не указан'}
          </span>
        )}
      </div>

      {/* Dates */}
      <div className="px-[14px] py-[5px] flex items-center gap-3 border-t border-[rgba(0,0,0,.15)]">
        <span className="flex-shrink-0 text-[9px] font-extrabold tracking-[.7px] uppercase text-[rgba(255,255,255,.4)]">Даты</span>
        <div className="flex items-center gap-1.5 flex-1">
          <input
            type="date"
            value={isoDate(offsetToDate(sub.startOffset, state.projectStart, state.minOffset))}
            onChange={e => {
              if (!e.target.value) return;
              const ns = dateToOffset(e.target.value, state.projectStart, state.minOffset);
              dispatch({ type: 'RESIZE_SUB', subId: sub.id, startOffset: ns, endOffset: Math.max(ns, sub.endOffset) });
            }}
            className="w-auto bg-transparent border-0 outline-none text-[.75rem] text-[rgba(255,255,255,.75)] cursor-pointer"
          />
          <span className="text-[rgba(255,255,255,.25)] text-[10px]">—</span>
          <input
            type="date"
            value={isoDate(offsetToDate(sub.endOffset, state.projectStart, state.minOffset))}
            onChange={e => {
              if (!e.target.value) return;
              const ne = dateToOffset(e.target.value, state.projectStart, state.minOffset);
              dispatch({ type: 'RESIZE_SUB', subId: sub.id, startOffset: Math.min(sub.startOffset, ne), endOffset: ne });
            }}
            className="w-auto bg-transparent border-0 outline-none text-[.75rem] text-[rgba(255,255,255,.75)] cursor-pointer"
          />
        </div>
      </div>

      {/* IO Inputs */}
      <IOAccordion sub={sub} kind="in" />

      {/* Operations accordion */}
      <Accordion.Root
        key={`${state.showStepsCards}-${sub.id}`}
        type="single"
        collapsible
        defaultValue={state.showStepsCards ? 'open' : ''}
      >
        <Accordion.Item value="open">
          <Accordion.Header>
            <Accordion.Trigger
              className="flex items-center gap-1.5 px-[10px] py-[4px] text-[11px] font-semibold w-full group"
              style={{ color: 'rgba(155,185,245,.75)' }}
            >
              <span className="transition-transform group-data-[state=open]:rotate-90 text-[8px]">▶</span>
              Шаги {sub.operations.length > 0 && <span className="opacity-60">({sub.operations.length})</span>}
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="accordion-content">
            <div className="px-[10px] pt-[6px] pb-[10px] flex flex-col gap-[5px]" style={{ background: 'rgba(0,0,0,.18)' }}>
              <SortableContext items={sub.operations.map(o => o.id)} strategy={verticalListSortingStrategy}>
                {sub.operations.map((op, i) => (
                  <OperationItem
                    key={op.id}
                    op={op}
                    sub={sub}
                    index={i + 1}
                    opsBg="rgba(255,255,255,.08)"
                    opsBC="rgba(255,255,255,.18)"
                    opsColor="rgba(255,255,255,.82)"
                  />
                ))}
              </SortableContext>

              {adding ? (
                <input
                  autoFocus
                  value={newOpVal}
                  onChange={e => setNewOpVal(e.target.value)}
                  onBlur={commitAddOp}
                  onKeyDown={e => { if (e.key === 'Enter') commitAddOp(); if (e.key === 'Escape') { setAdding(false); setNewOpVal(''); } }}
                  placeholder="Название операции…"
                  className="mt-1 w-[calc(100%-2px)] px-[6px] py-[5px] text-xs border border-[rgba(80,120,200,.5)] rounded-md bg-[rgba(255,255,255,.88)] text-[#222] outline-none"
                />
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="mt-1 w-[calc(100%-2px)] px-2 py-[3px] text-left text-[11px] border border-dashed border-[rgba(155,185,245,.35)] rounded-md text-[rgba(155,185,245,.65)] hover:bg-[rgba(155,185,245,.08)] hover:border-[rgba(155,185,245,.6)] transition-colors"
                >
                  + операция
                </button>
              )}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>

      {/* IO Outputs */}
      <IOAccordion sub={sub} kind="out" />
    </div>
  );
}
