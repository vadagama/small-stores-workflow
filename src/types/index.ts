export type ViewMode = 'cards' | 'gantt' | 'changes' | 'timeline';
export type AppMode = 'view' | 'admin';

export interface StageConfig {
  bg: string;
  hdr: string;
  opsBg: string;
  opsBC: string;
  ganttColor: string;
}

export interface Operation {
  id: string;
  type: 'step';
  title: string;
  startOffset: number;
  endOffset: number;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
  risks: string;
  critical: string;
  milestone: string;
  limits: string;
  dependencies: string;
  checklist: string;
}

export interface Subprocess {
  id: string;
  type: 'sub';
  title: string;
  responsible: string;
  ioIn: string[];
  ioOut: string[];
  operations: Operation[];
  startOffset: number;
  endOffset: number;
  expanded: boolean;
  color: string;
}

export interface Stage {
  id: string;
  type: 'stage';
  title: string;
  color: string;
  stageMeta: StageConfig;
  subprocesses: Subprocess[];
  startOffset: number;
  endOffset: number;
  collapsed: boolean;
}

export interface ChangelogEntry {
  timestamp: string;   // ISO 8601
  changes: string[];
}

export type TimelineScale = 'days' | 'weeks' | 'months';

export interface AppState {
  stages: Stage[];
  changelog: ChangelogEntry[];
  view: ViewMode;
  dayWidth: number;
  leftWidth: number;
  showStages: boolean;
  showSubs: boolean;
  showSteps: boolean;
  allExpanded: boolean;
  selectedId: string | null;
  minOffset: number;
  projectStart: string;
  loading: boolean;
  error: string | null;
  timelineScale: TimelineScale;
  showIoCards: boolean;
  showStepsCards: boolean;
  reverseTime: boolean;
  appMode: AppMode;
  blobMessage: string | null;
}
