import { load } from 'js-yaml';
import type { Stage, Subprocess, Operation, ChangelogEntry } from '../types';
import { getStageConfig, getGanttColor } from './stagesConfig';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => str(x)).filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseOperation(raw: any, fallbackOffset: number): Operation {
  const s = num(raw.startOffset, fallbackOffset);
  const e = num(raw.endOffset, s);
  return {
    id: str(raw.id) || uid('op'),
    type: 'step',
    title: str(raw.title) || 'Без названия',
    startOffset: Math.min(s, e),
    endOffset: Math.max(s, e),
    responsible: str(raw.responsible),
    accountable: str(raw.accountable),
    consulted: str(raw.consulted),
    informed: str(raw.informed),
    risks: str(raw.risks),
    critical: str(raw.critical),
    milestone: str(raw.milestone),
    limits: str(raw.limits),
    dependencies: str(raw.dependencies),
    checklist: str(raw.checklist),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSubprocess(raw: any, stageColor: string, fallbackOffset: number): Subprocess {
  const ops: Operation[] = Array.isArray(raw.operations)
    ? raw.operations.map((o: unknown) => parseOperation(o, fallbackOffset))
    : [];

  const startOffset = ops.length
    ? Math.min(...ops.map(o => o.startOffset))
    : num(raw.startOffset, fallbackOffset);
  const endOffset = ops.length
    ? Math.max(...ops.map(o => o.endOffset))
    : num(raw.endOffset, startOffset);

  return {
    id: str(raw.id) || uid('sub'),
    type: 'sub',
    title: str(raw.title) || 'Без названия',
    responsible: str(raw.responsible),
    ioIn: strArr(raw.ioIn),
    ioOut: strArr(raw.ioOut),
    operations: ops,
    startOffset,
    endOffset,
    expanded: false,
    color: stageColor,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStage(raw: any, idx: number, fallbackOffset: number): Stage {
  const meta = getStageConfig(str(raw.title));
  const color = getGanttColor(idx);
  const subs: Subprocess[] = Array.isArray(raw.subprocesses)
    ? raw.subprocesses.map((s: unknown) => parseSubprocess(s, color, fallbackOffset))
    : [];

  const activeSubs = subs.filter(s => s.operations.length > 0);
  const startOffset = activeSubs.length
    ? Math.min(...activeSubs.map(s => s.startOffset))
    : fallbackOffset;
  const endOffset = activeSubs.length
    ? Math.max(...activeSubs.map(s => s.endOffset))
    : startOffset;

  return {
    id: str(raw.id) || uid('st'),
    type: 'stage',
    title: str(raw.title) || 'Без названия',
    color,
    stageMeta: meta,
    subprocesses: subs,
    startOffset,
    endOffset,
    collapsed: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseChangelogEntry(raw: any): ChangelogEntry {
  return {
    timestamp: str(raw.timestamp) || new Date().toISOString(),
    changes: strArr(raw.changes),
  };
}

export interface YamlDoc {
  projectStart: string;
  stages: Stage[];
  changelog: ChangelogEntry[];
}

export function parseYaml(text: string): YamlDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = load(text) as any;
  if (!doc || typeof doc !== 'object') {
    throw new Error('Неверный формат YAML: ожидается объект');
  }

  const projectStart: string = str(doc.project?.start) || '2026-06-01';
  const fallbackOffset = -120;

  const stages: Stage[] = Array.isArray(doc.stages)
    ? doc.stages.map((s: unknown, i: number) => parseStage(s, i, fallbackOffset))
    : [];

  const changelog: ChangelogEntry[] = Array.isArray(doc.changelog)
    ? doc.changelog.map((e: unknown) => parseChangelogEntry(e))
    : [];

  return { projectStart, stages, changelog };
}

export async function loadYamlFromUrl(url: string): Promise<YamlDoc> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ошибка загрузки YAML: ${res.statusText}`);
  const text = await res.text();
  return parseYaml(text);
}

export function loadYamlFromText(text: string): YamlDoc {
  return parseYaml(text);
}
