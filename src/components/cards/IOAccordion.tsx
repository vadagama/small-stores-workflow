import * as Accordion from '@radix-ui/react-accordion';
import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import type { Subprocess } from '../../types';

interface IOAccordionProps {
  sub: Subprocess;
  kind: 'in' | 'out';
}

export function IOAccordion({ sub, kind }: IOAccordionProps) {
  const { state, dispatch } = useApp();
  const readOnly = state.appMode === 'view';
  const items = kind === 'in' ? sub.ioIn : sub.ioOut;
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');
  const editAreaRef = useRef<HTMLTextAreaElement>(null);
  const addAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editAreaRef.current) {
      const el = editAreaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editIdx, editVal]);

  useEffect(() => {
    if (adding && addAreaRef.current) {
      const el = addAreaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [adding, newVal]);

  const label = kind === 'in' ? 'Входы' : 'Выходы';
  const color = kind === 'in' ? 'rgba(90,200,140,.85)' : 'rgba(225,155,65,.9)';
  const addAction = kind === 'in' ? 'ADD_IO_IN' : 'ADD_IO_OUT';
  const updateAction = kind === 'in' ? 'UPDATE_IO_IN' : 'UPDATE_IO_OUT';
  const deleteAction = kind === 'in' ? 'DELETE_IO_IN' : 'DELETE_IO_OUT';

  function commitEdit(idx: number) {
    if (editVal.trim()) {
      dispatch({ type: updateAction, subId: sub.id, idx, value: editVal.trim() });
    } else {
      dispatch({ type: deleteAction, subId: sub.id, idx });
    }
    setEditIdx(null);
  }

  function commitAdd() {
    if (newVal.trim()) {
      dispatch({ type: addAction, subId: sub.id, value: newVal.trim() });
    }
    setAdding(false);
    setNewVal('');
  }

  if (items.length === 0 && !adding) {
    if (readOnly) return null;
    return (
      <div className="px-[10px] pb-1">
        <button
          onClick={() => setAdding(true)}
          className="text-[10px] font-semibold px-2 py-0.5 rounded transition-colors"
          style={{ color }}
        >
          + {label}
        </button>
      </div>
    );
  }

  return (
    <Accordion.Root
      key={`${state.showIoCards}-${sub.id}-${kind}`}
      type="single"
      collapsible
      defaultValue={state.showIoCards ? 'open' : ''}
    >
      <Accordion.Item value="open">
        <Accordion.Header>
          <Accordion.Trigger className="flex items-center gap-1.5 px-[10px] py-[4px] text-[11px] font-semibold w-full group" style={{ color }}>
            <span className="transition-transform group-data-[state=open]:rotate-90 text-[8px]">▶</span>
            {label} {items.length > 0 && <span className="opacity-60">({items.length})</span>}
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="accordion-content">
          <ul className="px-[10px] pb-2 flex flex-col gap-1">
            {items.map((item, idx) => (
              <li key={idx}>
                {!readOnly && editIdx === idx ? (
                  <textarea
                    ref={editAreaRef}
                    autoFocus
                    rows={1}
                    value={editVal}
                    onChange={e => { setEditVal(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                    onBlur={() => commitEdit(idx)}
                    onKeyDown={e => { if (e.key === 'Escape') setEditIdx(null); }}
                    className="w-full text-[.74rem] leading-snug px-2 py-1 rounded border border-[rgba(80,120,200,.5)] bg-[rgba(255,255,255,.9)] text-[#222] outline-none resize-none overflow-hidden"
                  />
                ) : (
                  <div
                    className="flex items-center gap-1"
                    onDoubleClick={() => { if (!readOnly) { setEditIdx(idx); setEditVal(item); } }}
                  >
                    <span className="flex-1 text-[.74rem] text-[rgba(255,255,255,.78)] bg-[rgba(255,255,255,.07)] border-l-[3px] border-[rgba(255,255,255,.18)] rounded px-2 py-1">
                      {item}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={() => dispatch({ type: deleteAction, subId: sub.id, idx })}
                        className="flex-shrink-0 text-[rgba(200,60,60,.35)] hover:text-[rgba(220,40,40,1)] text-xs px-1 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
            {!readOnly && (adding ? (
              <li>
                <textarea
                  ref={addAreaRef}
                  autoFocus
                  rows={1}
                  value={newVal}
                  onChange={e => { setNewVal(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                  onBlur={commitAdd}
                  onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewVal(''); } }}
                  placeholder={`Новый ${kind === 'in' ? 'вход' : 'выход'}…`}
                  className="w-full text-[.74rem] leading-snug px-2 py-1 rounded border border-[rgba(80,120,200,.5)] bg-[rgba(255,255,255,.88)] text-[#222] outline-none resize-none overflow-hidden"
                />
              </li>
            ) : (
              <li>
                <button
                  onClick={() => setAdding(true)}
                  className="w-full text-left text-[11px] px-2 py-1 border border-dashed border-[rgba(80,120,200,.35)] rounded text-[rgba(80,120,200,.65)] hover:bg-[rgba(80,120,200,.08)] transition-colors"
                >
                  + добавить
                </button>
              </li>
            ))}
          </ul>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
