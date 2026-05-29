import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../../context/AppContext';
import type { Operation, Subprocess } from '../../types';

interface OperationItemProps {
  op: Operation;
  sub: Subprocess;
  opsBg: string;
  opsBC: string;
  opsColor?: string;
  index?: number;
}

export function OperationItem({ op, sub, opsBg, opsBC, opsColor = '#1a2030', index }: OperationItemProps) {
  const { state, dispatch } = useApp();
  const readOnly = state.appMode === 'view';
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(op.title);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editing, val]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: op.id, data: { type: 'op', subId: sub.id } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function commit() {
    if (val.trim() && val !== op.title) {
      dispatch({ type: 'UPDATE_OP_TITLE', opId: op.id, title: val.trim() });
    } else {
      setVal(op.title);
    }
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: opsBg, borderColor: opsBC, color: opsColor }}
      className="rounded-md px-[10px] py-[6px] text-[.77rem] leading-snug font-medium border-l-[3px] select-none"
    >
      {!readOnly && editing ? (
        <div className="flex items-start gap-1">
          {index !== undefined && (
            <span className="flex-shrink-0 text-[.65rem] font-bold opacity-40 mt-[3px] w-4 text-right">{index}.</span>
          )}
          <textarea
            ref={textareaRef}
            autoFocus
            rows={1}
            value={val}
            onChange={e => { setVal(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') { setVal(op.title); setEditing(false); } }}
            className="flex-1 text-[.77rem] leading-snug font-medium px-[5px] py-[3px] border border-[rgba(80,120,200,.55)] rounded bg-[rgba(255,255,255,.9)] text-[#222] outline-none resize-none overflow-hidden"
          />
          <button
            onMouseDown={e => { e.preventDefault(); dispatch({ type: 'DELETE_OP', opId: op.id }); }}
            className="flex-shrink-0 text-[rgba(150,40,40,.45)] hover:text-[rgba(210,40,40,.9)] text-base px-1 rounded"
          >
            ×
          </button>
        </div>
      ) : (
        <span
          className={`flex items-start gap-1.5 ${readOnly ? 'cursor-default' : 'cursor-grab'}`}
          onDoubleClick={() => { if (!readOnly) setEditing(true); }}
          {...(readOnly ? {} : { ...attributes, ...listeners })}
        >
          {index !== undefined && (
            <span className="flex-shrink-0 text-[.65rem] font-bold opacity-35 mt-[1px] w-4 text-right">{index}.</span>
          )}
          <span>{op.title}</span>
        </span>
      )}
    </div>
  );
}
