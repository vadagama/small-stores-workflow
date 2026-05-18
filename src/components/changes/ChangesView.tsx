import { useApp } from '../../context/AppContext';
import type { ChangelogEntry } from '../../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function groupByDate(entries: ChangelogEntry[]): { date: string; items: ChangelogEntry[] }[] {
  const map = new Map<string, ChangelogEntry[]>();
  for (const e of entries) {
    const key = new Date(e.timestamp).toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  // Newest date first; within each date newest entry first
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, items]) => ({
      date: formatDate(items[0].timestamp),
      items: [...items].reverse(),
    }));
}

export function ChangesView() {
  const { state } = useApp();
  const groups = groupByDate(state.changelog);

  if (groups.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--muted)] text-sm">
        История изменений пуста. Экспортируйте данные, чтобы начать отслеживание.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto">
        {groups.map((group, gi) => (
          <div key={gi} className="flex gap-8 mb-10">
            {/* Date column */}
            <div className="w-40 flex-shrink-0 pt-1">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--muted)]">
                {group.date}
              </span>
            </div>

            {/* Timeline + entries */}
            <div className="flex-1 flex flex-col gap-0">
              {group.items.map((entry, ei) => (
                <div key={ei} className="flex gap-4">
                  {/* Node + vertical line */}
                  <div className="flex flex-col items-center">
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-[var(--line)] bg-[#0d1117] flex-shrink-0 mt-0.5" />
                    {(ei < group.items.length - 1 || gi < groups.length - 1) && (
                      <div className="w-px flex-1 min-h-[24px] bg-[var(--line)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <div className="text-xs text-[var(--muted)] mb-2 font-mono">
                      {formatTime(entry.timestamp)}
                    </div>
                    <ul className="space-y-1.5">
                      {entry.changes.map((change, ci) => (
                        <li key={ci} className="flex items-start gap-2 text-sm text-[var(--text)]">
                          <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[#2f7ecb] flex-shrink-0" />
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
