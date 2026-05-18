import { dump } from 'js-yaml';
import type { Stage, ChangelogEntry } from '../types';

interface YamlOperation {
  id: string;
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

interface YamlSubprocess {
  id: string;
  title: string;
  responsible: string;
  startOffset: number;
  endOffset: number;
  ioIn: string[];
  ioOut: string[];
  operations: YamlOperation[];
}

interface YamlStage {
  id: string;
  title: string;
  subprocesses: YamlSubprocess[];
}

interface YamlDoc {
  project: { start: string };
  changelog: ChangelogEntry[];
  stages: YamlStage[];
}

export function exportToYaml(stages: Stage[], projectStart: string, changelog: ChangelogEntry[]): string {
  const doc: YamlDoc = {
    project: { start: projectStart },
    changelog,
    stages: stages.map(stage => ({
      id: stage.id,
      title: stage.title,
      subprocesses: stage.subprocesses.map(sub => ({
        id: sub.id,
        title: sub.title,
        responsible: sub.responsible,
        startOffset: sub.startOffset,
        endOffset: sub.endOffset,
        ioIn: sub.ioIn,
        ioOut: sub.ioOut,
        operations: sub.operations.map(op => ({
          id: op.id,
          title: op.title,
          startOffset: op.startOffset,
          endOffset: op.endOffset,
          responsible: op.responsible,
          accountable: op.accountable,
          consulted: op.consulted,
          informed: op.informed,
          risks: op.risks,
          critical: op.critical,
          milestone: op.milestone,
          limits: op.limits,
          dependencies: op.dependencies,
          checklist: op.checklist,
        })),
      })),
    })),
  };

  const header = '# Схема процессов запуска\n';
  const yaml = dump(doc, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  return header + yaml;
}

export function downloadYaml(stages: Stage[], projectStart: string, changelog: ChangelogEntry[]): void {
  const yaml = exportToYaml(stages, projectStart, changelog);
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  a.href = url;
  a.download = `schema_launch_${date}_${time}.yaml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
