import type { StageConfig } from '../types';

export const STAGES_CONFIG: Record<string, StageConfig> = {
  'До договора':  { bg: '#1a3a5c', hdr: '#2563a8', opsBg: '#dce8f5', opsBC: '#6da0d4', ganttColor: '#2f7ecb' },
  'До стройки':   { bg: '#1a4a3a', hdr: '#1d7a55', opsBg: '#d5ede3', opsBC: '#5cb885', ganttColor: '#2fa677' },
  'Стройка':      { bg: '#4a2a10', hdr: '#c05c10', opsBg: '#fae6d4', opsBC: '#e8956a', ganttColor: '#d47a2c' },
  'Закуп':        { bg: '#3a1a4a', hdr: '#7a35a8', opsBg: '#e8d8f5', opsBC: '#ab74d4', ganttColor: '#8b5fc7' },
  'Коммерция':    { bg: '#1a3a4a', hdr: '#176a8c', opsBg: '#d4e8f0', opsBC: '#5aa8c8', ganttColor: '#30a7bc' },
  'До открытия':  { bg: '#4a3a10', hdr: '#a88010', opsBg: '#f5edd4', opsBC: '#d4aa58', ganttColor: '#caa33a' },
  'Открытие':     { bg: '#4a1a1a', hdr: '#b52020', opsBg: '#f5d8d8', opsBC: '#d47a7a', ganttColor: '#cf4f4f' },
  'Постоткрытие': { bg: '#1a3a3a', hdr: '#1a7a7a', opsBg: '#d4f0f0', opsBC: '#5ac8c8', ganttColor: '#2f9a9a' },
};

const GANTT_COLORS = Object.values(STAGES_CONFIG).map(s => s.ganttColor);

export function getStageConfig(name: string): StageConfig {
  return STAGES_CONFIG[name] ?? { bg: '#1a2a3a', hdr: '#2a4a6a', opsBg: '#dce8f5', opsBC: '#6da0d4', ganttColor: GANTT_COLORS[0] };
}

export function getGanttColor(index: number): string {
  return GANTT_COLORS[index % GANTT_COLORS.length];
}
