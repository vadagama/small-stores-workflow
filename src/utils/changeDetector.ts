import type { Stage, Subprocess, Operation } from '../types';

interface SubEntry  { sub: Subprocess; stageTitle: string; stageId: string; }
interface OpEntry   { op: Operation;   subTitle: string;   subId: string; stageTitle: string; }

function buildSubMap(stages: Stage[]): Map<string, SubEntry> {
  const m = new Map<string, SubEntry>();
  stages.forEach(st =>
    st.subprocesses.forEach(sub =>
      m.set(sub.id, { sub, stageTitle: st.title, stageId: st.id })
    )
  );
  return m;
}

function buildOpMap(stages: Stage[]): Map<string, OpEntry> {
  const m = new Map<string, OpEntry>();
  stages.forEach(st =>
    st.subprocesses.forEach(sub =>
      sub.operations.forEach(op =>
        m.set(op.id, { op, subTitle: sub.title, subId: sub.id, stageTitle: st.title })
      )
    )
  );
  return m;
}

/** Returns true if the relative order of shared IDs changed */
function orderChanged(oldIds: string[], newIds: string[], sharedIds: Set<string>): boolean {
  const oldSeq = oldIds.filter(id => sharedIds.has(id));
  const newSeq = newIds.filter(id => sharedIds.has(id));
  return oldSeq.join(',') !== newSeq.join(',');
}

export function computeChanges(oldStages: Stage[], newStages: Stage[]): string[] {
  const changes: string[] = [];

  // ── Stages ────────────────────────────────────────────────────────────────
  const oldStageMap = new Map(oldStages.map(s => [s.id, s]));
  const newStageMap = new Map(newStages.map(s => [s.id, s]));

  for (const st of newStages)
    if (!oldStageMap.has(st.id)) changes.push(`Добавлен этап «${st.title}»`);
  for (const st of oldStages)
    if (!newStageMap.has(st.id)) changes.push(`Удалён этап «${st.title}»`);

  for (const st of newStages) {
    const old = oldStageMap.get(st.id);
    if (old && old.title !== st.title)
      changes.push(`Переименован этап «${old.title}» → «${st.title}»`);
  }

  // Stage order
  {
    const sharedStageIds = new Set(
      oldStages.map(s => s.id).filter(id => newStageMap.has(id))
    );
    if (orderChanged(oldStages.map(s => s.id), newStages.map(s => s.id), sharedStageIds))
      changes.push('Изменён порядок этапов');
  }

  // ── Subprocesses ──────────────────────────────────────────────────────────
  const oldSubMap = buildSubMap(oldStages);
  const newSubMap = buildSubMap(newStages);

  for (const [id, { sub, stageTitle }] of newSubMap)
    if (!oldSubMap.has(id))
      changes.push(`Добавлен подпроцесс «${sub.title}» (этап «${stageTitle}»)`);
  for (const [id, { sub, stageTitle }] of oldSubMap)
    if (!newSubMap.has(id))
      changes.push(`Удалён подпроцесс «${sub.title}» (из этапа «${stageTitle}»)`);

  for (const [id, { sub: ns, stageTitle: nst, stageId: nstId }] of newSubMap) {
    const old = oldSubMap.get(id);
    if (!old) continue;
    const { sub: os, stageTitle: ost, stageId: ostId } = old;

    if (ostId !== nstId)
      changes.push(`Подпроцесс «${ns.title}» перемещён: «${ost}» → «${nst}»`);
    if (os.title !== ns.title)
      changes.push(`Переименован подпроцесс «${os.title}» → «${ns.title}»`);
    if (os.responsible !== ns.responsible)
      changes.push(`Ответственный «${ns.title}»: ${os.responsible || '—'} → ${ns.responsible || '—'}`);
    if (os.startOffset !== ns.startOffset || os.endOffset !== ns.endOffset)
      changes.push(`Изменены даты «${ns.title}»`);
    if (os.ioIn.join('|') !== ns.ioIn.join('|'))
      changes.push(`Изменены входы «${ns.title}»`);
    if (os.ioOut.join('|') !== ns.ioOut.join('|'))
      changes.push(`Изменены выходы «${ns.title}»`);
  }

  // Subprocess order within each stage
  for (const [stId, newSt] of newStageMap) {
    const oldSt = oldStageMap.get(stId);
    if (!oldSt) continue;
    const sharedIds = new Set(
      oldSt.subprocesses.map(s => s.id).filter(id => newSubMap.has(id) && oldSubMap.get(id)?.stageId === stId)
    );
    if (
      sharedIds.size > 1 &&
      orderChanged(
        oldSt.subprocesses.map(s => s.id),
        newSt.subprocesses.map(s => s.id),
        sharedIds,
      )
    )
      changes.push(`Изменён порядок подпроцессов в этапе «${newSt.title}»`);
  }

  // ── Operations ────────────────────────────────────────────────────────────
  const oldOpMap = buildOpMap(oldStages);
  const newOpMap = buildOpMap(newStages);

  // Added / removed operations
  for (const [id, { op, subTitle, stageTitle }] of newOpMap)
    if (!oldOpMap.has(id))
      changes.push(`Добавлен шаг «${op.title}» (${subTitle}, ${stageTitle})`);
  for (const [id, { op, subTitle, stageTitle }] of oldOpMap)
    if (!newOpMap.has(id))
      changes.push(`Удалён шаг «${op.title}» (${subTitle}, ${stageTitle})`);

  // Moved operations (same id, different parent subprocess)
  for (const [id, { op, subTitle: nSub }] of newOpMap) {
    const old = oldOpMap.get(id);
    if (!old) continue;
    if (old.subId !== newOpMap.get(id)!.subId)
      changes.push(`Шаг «${op.title}» перемещён: «${old.subTitle}» → «${nSub}»`);
  }

  // Operation order within each subprocess
  for (const [subId, { sub: ns }] of newSubMap) {
    const os = oldSubMap.get(subId)?.sub;
    if (!os) continue;
    const sharedOpIds = new Set(
      os.operations.map(o => o.id).filter(id => newOpMap.has(id) && newOpMap.get(id)!.subId === subId)
    );
    if (
      sharedOpIds.size > 1 &&
      orderChanged(
        os.operations.map(o => o.id),
        ns.operations.map(o => o.id),
        sharedOpIds,
      )
    )
      changes.push(`Изменён порядок шагов в «${ns.title}»`);
  }

  return changes;
}

export function initialExportSummary(stages: Stage[]): string[] {
  const subCount = stages.reduce((n, s) => n + s.subprocesses.length, 0);
  const opCount = stages.reduce(
    (n, s) => s.subprocesses.reduce((m, sub) => m + sub.operations.length, n), 0
  );
  return [`Первичная выгрузка: ${stages.length} этапов, ${subCount} подпроцессов, ${opCount} операций`];
}
