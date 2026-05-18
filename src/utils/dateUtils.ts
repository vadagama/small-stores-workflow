const DAY = 86400000;

export function offsetToDate(offset: number, projectStart: string, minOffset: number): Date {
  const base = new Date(`${projectStart}T00:00:00`);
  base.setHours(0, 0, 0, 0);
  return new Date(base.getTime() + (offset - minOffset) * DAY);
}

export function dateToOffset(dateStr: string, projectStart: string, minOffset: number): number {
  const base = new Date(`${projectStart}T00:00:00`);
  base.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  return minOffset + Math.round((d.getTime() - base.getTime()) / DAY);
}

export function fmtShort(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function monthName(d: Date): string {
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function getISOWeek(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
