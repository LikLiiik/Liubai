import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppData, Task } from '../src/types.ts';
import { createEmpty } from '../src/seed.ts';
import { createAdvancePlan } from '../src/completion.ts';
import { completionAdvanceFor, previewCompletionUndo, validCompletionAdvance } from '../src/completionUndo.ts';
import { applyPlanToData } from '../src/planApply.ts';
import { localMoment } from '../src/inboxReminders.ts';
import { overlaps } from '../src/time.ts';

const day = '2026-10-21';
const settings = { dayStart: 540, dayEnd: 1080, buffer: 10 };
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, notes: '', duration: 30, category: 'work', priority: 'normal',
  important: false, fixed: false, completed: false, date: day, start: 700, deadline: null, postponed: 0, ...extra });
function advanced(): AppData {
  const data = { ...createEmpty(settings), tasks: [task('source', { start: 600, duration: 60, completed: true, completedAt: localMoment(day, 620).toISOString() }),
    task('next'), task('later', { start: 760 }), task('fixed', { start: 900, fixed: true }), task('quick', { start: 640, duration: 0, kind: 'quick' })] };
  return applyPlanToData(data, createAdvancePlan(data.tasks, settings, 'source', day, 620), { id: 'advance', date: day, createdAt: localMoment(day, 621).toISOString(), title: '完成后提前安排：source' }).data;
}

test('the completion-to-advance link persists after reload and beyond adjustment-history pruning', () => {
  const data = JSON.parse(JSON.stringify(advanced())) as AppData;
  data.history = [];
  const link = completionAdvanceFor(data, 'source')!;
  assert.equal(validCompletionAdvance(link), true);
  assert.deepEqual(link.moves.map(move => move.taskId), ['next', 'later']);
  assert.equal(link.moves[0].from.start, 700);
  assert.equal(link.moves[0].to.start, 630);
});

test('cancel-advance preview changes nothing until accepted and restores only that completion and its moved times', () => {
  const data = advanced(), before = JSON.stringify(data);
  const preview = previewCompletionUndo(data, 'source', 'cancel-advance');
  assert.equal(JSON.stringify(data), before);
  assert.equal(preview.valid, true);
  assert.equal(preview.tasks[0].completed, false);
  assert.equal(preview.tasks[0].completedAt, undefined);
  assert.equal(preview.tasks[0].completionAdvance, undefined);
  assert.equal(preview.tasks[1].start, 700);
  assert.equal(preview.tasks[2].start, 760);
  assert.equal(preview.conflicts.length, 0);
  assert.equal(preview.skipped.length, 0);
  assert.deepEqual(preview.tasks.slice(3), data.tasks.slice(3));
});

test('keeping advance restores completion only and explicitly detects the resulting overlap', () => {
  const data = advanced();
  const preview = previewCompletionUndo(data, 'source', 'keep');
  assert.equal(preview.tasks[0].completed, false);
  assert.equal(preview.tasks[1].start, 630);
  assert.equal(preview.tasks[2].start, 670);
  assert.deepEqual(preview.conflicts.map(task => task.id), ['next']);
  assert.ok(preview.consentKey);
  assert.equal(preview.changes.length, 0);
});

test('manual schedule edits, completion, deletion and fixed status are preserved while unrelated text edits survive a time rollback', () => {
  for (const edit of ['time', 'duration', 'deadline', 'completed', 'fixed', 'deleted']) {
    const data = advanced();
    if (edit === 'time') data.tasks[1] = { ...data.tasks[1], start: 710 };
    if (edit === 'duration') data.tasks[1] = { ...data.tasks[1], duration: 20 };
    if (edit === 'deadline') data.tasks[1] = { ...data.tasks[1], deadline: day };
    if (edit === 'completed') data.tasks[1] = { ...data.tasks[1], completed: true, completedAt: localMoment(day, 650).toISOString() };
    if (edit === 'fixed') data.tasks[1] = { ...data.tasks[1], fixed: true };
    if (edit === 'deleted') data.tasks.splice(1, 1);
    const original = data.tasks.find(task => task.id === 'next');
    const preview = previewCompletionUndo(data, 'source', 'cancel-advance');
    assert.deepEqual(preview.tasks.find(task => task.id === 'next'), original, edit);
    assert.ok(preview.skipped.some(task => task.taskId === 'next'), edit);
  }
  const data = advanced();
  data.tasks[1] = { ...data.tasks[1], notes: '新备注', title: '新名称', category: 'life' };
  const preview = previewCompletionUndo(data, 'source', 'cancel-advance');
  assert.equal(preview.tasks[1].start, 700);
  assert.equal(preview.tasks[1].notes, '新备注');
  assert.equal(preview.tasks[1].title, '新名称');
  assert.equal(preview.tasks[1].category, 'life');
});

test('new occupants prevent unsafe time rollback and restoring completion still requires overlap consent', () => {
  const data = advanced();
  data.tasks.push(task('new-meeting', { start: 700, fixed: true }));
  const preview = previewCompletionUndo(data, 'source', 'cancel-advance');
  assert.equal(preview.tasks[1].start, 630);
  assert.equal(preview.tasks[2].start, 760);
  assert.ok(preview.skipped.some(task => task.taskId === 'next' && task.reason.includes('冲突')));
  assert.ok(preview.conflicts.some(task => task.id === 'next'));
  for (const change of preview.changes) {
    const moved = preview.tasks.find(task => task.id === change.taskId)!;
    assert.equal(preview.tasks.some(other => other.id !== moved.id && overlaps(moved, other)), false);
  }
});

test('preview and overlap authorization expire when the source, conflicting event or moved event changes', () => {
  const data = advanced();
  const initial = previewCompletionUndo(data, 'source', 'keep');
  data.tasks[1] = { ...data.tasks[1], start: 640 };
  const changed = previewCompletionUndo(data, 'source', 'keep');
  assert.notEqual(changed.key, initial.key);
  assert.notEqual(changed.consentKey, initial.consentKey);
  assert.equal(previewCompletionUndo({ ...data, tasks: changed.tasks }, 'source', 'keep').valid, false, 'duplicate undo cannot run twice');
});

test('legacy adjustment snapshots are linked only to their actual latest completed source, not other already-completed work', () => {
  const data = advanced();
  data.tasks[0] = { ...data.tasks[0], completionAdvance: undefined };
  assert.equal(completionAdvanceFor(data, 'source')!.moves.length, 2);
  const older = task('older', { start: 540, title: 'source', completed: true, completedAt: localMoment(day, 560).toISOString() });
  data.tasks.push(older);
  data.history[0].snapshot.push(older);
  assert.equal(completionAdvanceFor(data, 'older'), null);
  assert.equal(previewCompletionUndo(data, 'source', 'cancel-advance').tasks[1].start, 700);
});

test('undoing the advance alone removes the link while completion remains; a later completion cannot reuse an old link', () => {
  const data = advanced();
  const undo = { ...data, tasks: data.history[0].snapshot, history: [] };
  assert.equal(undo.tasks[0].completed, true);
  assert.equal(completionAdvanceFor(undo, 'source'), null);
  const repeated = advanced();
  repeated.tasks[0] = { ...repeated.tasks[0], completedAt: localMoment(day, 660).toISOString() };
  assert.equal(completionAdvanceFor(repeated, 'source'), null);
});

test('stored completion links validate positions, unique IDs and timestamp without changing legacy data requirements', () => {
  assert.equal(validCompletionAdvance(undefined), true);
  const link = advanced().tasks[0].completionAdvance!;
  for (const value of [null, {}, { ...link, completedAt: 'bad' }, { ...link, moves: [] }, { ...link, moves: [link.moves[0], link.moves[0]] },
    { ...link, moves: [{ ...link.moves[0], from: { date: day, start: 1440 } }] }, { ...link, moves: [{ ...link.moves[0], duration: 0 }] }]) {
    assert.equal(validCompletionAdvance(value), false);
  }
});

test('legacy fractional durations do not create unreadable positions or persisted completion links', () => {
  const source = advanced().history[0].snapshot;
  const tasks = source.map(task => task.id === 'next' ? { ...task, duration: 30.5 } : task.id === 'fixed' ? { ...task, start: 620, duration: 0.5 } : task);
  const plan = createAdvancePlan(tasks, settings, 'source', day, 620);
  assert.equal(plan.tasks.find(task => task.id === 'next')!.start, 700);
  assert.ok(plan.tasks.every(task => task.start === null || Number.isInteger(task.start)));
  if (plan.tasks[0].completionAdvance) assert.equal(validCompletionAdvance(plan.tasks[0].completionAdvance), true);
});
