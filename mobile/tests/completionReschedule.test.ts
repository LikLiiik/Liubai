import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppData, Task } from '../src/types.ts';
import { createEmpty } from '../src/seed.ts';
import { applyCompletionReschedule, completionTimePassed, previewCompletionReschedule, type CompletionRescheduleRequest } from '../src/completionReschedule.ts';
import { localMoment } from '../src/inboxReminders.ts';
import { overlaps } from '../src/time.ts';
import { freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';

const day = '2026-10-21';
const at = localMoment(day, 900);
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, duration: 60, date: day, start: 540, category: 'work',
  priority: 'normal', notes: '', important: false, fixed: false, completed: false, deadline: null, postponed: 0, ...extra });
const source = () => task('source', { completed: true, completedAt: localMoment(day, 570).toISOString() });
const data = (tasks: Task[] = [source()]): AppData => ({ ...createEmpty({ dayStart: 540, dayEnd: 1080, buffer: 10 }), tasks });
const auto = (extra: Partial<CompletionRescheduleRequest> = {}): CompletionRescheduleRequest => ({ taskId: 'source', choice: 'keep', deadline: null, placement: { mode: 'auto' }, ...extra });
const manual = (start: number, date = day): CompletionRescheduleRequest => auto({ placement: { mode: 'manual', date, start } });

test('only an elapsed planned end triggers rescheduling, including overnight ends and point reminders', () => {
  const early = source();
  assert.equal(completionTimePassed(early, localMoment(day, 580)), false);
  assert.equal(completionTimePassed(early, localMoment(day, 600)), true);
  assert.equal(completionTimePassed({ ...early, completed: false }, at), false);
  assert.equal(completionTimePassed({ ...early, date: null, start: null }, at), false);
  const overnight = { ...early, start: 1410, duration: 120 };
  assert.equal(completionTimePassed(overnight, localMoment('2026-10-22', 89)), false);
  assert.equal(completionTimePassed(overnight, localMoment('2026-10-22', 90)), true);
  assert.equal(completionTimePassed({ ...early, kind: 'quick', duration: 0 }, localMoment(day, 540)), true);
});

test('automatic placement avoids every overlapping occupant and flexible buffers without moving other tasks', () => {
  const initial = data([source(), task('meeting', { start: 900, duration: 60, fixed: true }),
    task('parallel', { start: 930, duration: 60, fixed: true }), task('flex', { start: 1000, duration: 30 })]);
  const before = JSON.stringify(initial);
  const preview = previewCompletionReschedule(initial, auto(), at);
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.position, { date: '2026-10-22', start: 540 });
  const restored = preview.tasks.find(task => task.id === 'source')!;
  assert.ok(preview.tasks.filter(task => task.id !== restored.id).every(task => !overlaps(task, restored)));
  assert.deepEqual(preview.tasks.slice(1), initial.tasks.slice(1));
  assert.equal(JSON.stringify(initial), before);
});

test('a full day rolls to the next preference window while respecting a hard deadline', () => {
  const initial = data([source(), task('busy', { fixed: true, start: 900, duration: 180 })]);
  assert.deepEqual(previewCompletionReschedule(initial, auto(), at).position, { date: '2026-10-22', start: 540 });
  const result = previewCompletionReschedule(initial, auto({ deadline: day }), at);
  assert.equal(result.valid, false); assert.ok(result.error);
  assert.equal(initial.tasks[0].completed, true);
});

test('cross-night preferences find a real future clock time in the previous planning day', () => {
  const initial = data(); initial.settings = { dayStart: 1380, dayEnd: 1560, buffer: 0 };
  const moment = localMoment('2026-10-22', 30);
  const result = previewCompletionReschedule(initial, auto(), moment);
  assert.equal(result.valid, true);
  assert.deepEqual(result.position, { date: '2026-10-22', start: 31 });
});

test('explicitly rescheduling a fixed course keeps its identity and fixed attribute', () => {
  const initial = data([{ ...source(), fixed: true, courseImport: { school: 'hitsz', semester: '2026-2027/1', key: 'lesson', fingerprint: 'original' } }]);
  const preview = previewCompletionReschedule(initial, auto(), at);
  assert.equal(preview.valid, true); assert.equal(preview.tasks[0].fixed, true);
  assert.equal(preview.tasks[0].id, initial.tasks[0].id);
  assert.deepEqual(preview.tasks[0].courseImport, initial.tasks[0].courseImport);
});

test('point reminders get a future reminder time without occupying or avoiding other event durations', () => {
  const initial = data([{ ...source(), kind: 'quick', duration: 0 }, task('busy', { start: 900, duration: 180, fixed: true })]);
  const result = previewCompletionReschedule(initial, auto(), at);
  assert.equal(result.valid, true); assert.deepEqual(result.position, { date: day, start: 901 });
  assert.equal(result.tasks[0].duration, 0); assert.equal(result.conflicts.length, 0);
});

test('manual placement rejects past clocks, invalid dates and cross-midnight deadline overflow', () => {
  for (const request of [manual(900), manual(899), manual(600, '2026-10-20'), manual(1440), manual(960, '2026-02-30'),
    { ...manual(1410), deadline: day }]) assert.equal(previewCompletionReschedule(data(), request, at).valid, false);
  assert.equal(previewCompletionReschedule(data(), { ...manual(1410), deadline: '2026-10-22' }, at).valid, true);
});

test('an elapsed deadline stays binding unless the user explicitly changes or clears it', () => {
  const initial = data([{ ...source(), deadline: '2026-10-20' }]);
  assert.equal(previewCompletionReschedule(initial, auto({ deadline: '2026-10-20' }), at).valid, false);
  assert.equal(previewCompletionReschedule(initial, auto({ deadline: null }), at).valid, true);
  assert.equal(previewCompletionReschedule(initial, auto({ deadline: '2026-10-22' }), at).valid, true);
});

test('manual overlap and non-preferred placement require consent tied to that exact preview', () => {
  const initial = data([source(), task('busy', { start: 1200, duration: 60, fixed: true })]);
  const request = manual(1200), preview = previewCompletionReschedule(initial, request, at);
  assert.equal(preview.valid, true); assert.equal(preview.needsConsent, true); assert.equal(preview.outside, true);
  assert.deepEqual(preview.conflicts.map(task => task.id), ['busy']);
  assert.equal(applyCompletionReschedule(initial, request, preview.key, at, 'apply').data, initial);
  const applied = applyCompletionReschedule(initial, request, preview.key, at, 'apply', preview.consentKey);
  assert.equal(applied.error, undefined); assert.equal(applied.data.tasks[0].completed, false);
  assert.deepEqual(applied.data.tasks[1], initial.tasks[1]);
  assert.equal(applyCompletionReschedule(initial, manual(1215), preview.key, at, 'changed', preview.consentKey).data, initial);
});

function advanced() {
  const initial = data([source(), task('follower', { start: 960, duration: 30 })]);
  initial.tasks[0].completionAdvance = { completedAt: initial.tasks[0].completedAt!, moves: [{ taskId: 'follower',
    from: { date: day, start: 1020 }, to: { date: day, start: 960 }, duration: 30, deadline: null }] };
  return initial;
}
test('keep and cancel-advance choices place the source against the corresponding final follower positions', () => {
  const initial = advanced();
  const kept = previewCompletionReschedule(initial, auto(), at);
  const cancelled = previewCompletionReschedule(initial, auto({ choice: 'cancel-advance' }), at);
  assert.equal(kept.tasks[1].start, 960); assert.equal(cancelled.tasks[1].start, 1020);
  assert.equal(cancelled.tasks[0].completionAdvance, undefined);
  assert.ok(!overlaps(cancelled.tasks[0], cancelled.tasks[1]));
  initial.tasks[1] = { ...initial.tasks[1], start: 1050 };
  const protectedResult = previewCompletionReschedule(initial, auto({ choice: 'cancel-advance' }), at);
  assert.equal(protectedResult.tasks[1].start, 1050); assert.equal(protectedResult.skipped.length, 1);
});

test('acceptance is atomic and records enough history to restore both completion and the old placement', () => {
  const initial = advanced(), before = JSON.stringify(initial), request = auto({ choice: 'cancel-advance' });
  const preview = previewCompletionReschedule(initial, request, at);
  assert.equal(JSON.stringify(initial), before);
  const result = applyCompletionReschedule(initial, request, preview.key, at, 'rearrange');
  assert.equal(result.error, undefined); assert.equal(result.data.tasks[0].completed, false);
  assert.deepEqual(result.data.history[0].snapshot, initial.tasks);
  assert.deepEqual(result.data.history[0].appliedTasks, result.data.tasks);
  assert.equal(applyCompletionReschedule(result.data, request, preview.key, at, 'duplicate').data, result.data);
});

test('stale source state, settings, new occupants and advancing time cannot apply an old preview', () => {
  const initial = data(), request = auto(), preview = previewCompletionReschedule(initial, request, at);
  for (const changed of [{ ...initial, settings: { ...initial.settings, dayStart: 600 } },
    { ...initial, tasks: [...initial.tasks, task('new', { start: 920, fixed: true })] },
    { ...initial, tasks: [] }, { ...initial, tasks: [{ ...initial.tasks[0], completed: false }] }]) {
    assert.equal(applyCompletionReschedule(changed, request, preview.key, at, 'stale').data, changed);
  }
  assert.equal(applyCompletionReschedule(initial, request, preview.key, localMoment(day, 910), 'later').data, initial);
});

test('no space in the search horizon leaves completion untouched instead of creating an overlapping plan', () => {
  const initial = data();
  for (let offset = 0; offset < 30; offset++) {
    const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    initial.tasks.push(task(`busy-${offset}`, { date: key, start: 540, duration: 540, fixed: true }));
  }
  const preview = previewCompletionReschedule(initial, auto(), at);
  assert.equal(preview.valid, false); assert.equal(initial.tasks[0].completed, true);
});

test('v18 guide completion is retained while the expired completion rescheduling lesson is introduced', () => {
  const previous = { ...freshGuideProgress(), revision: 18, completedRevision: 18, deferredRevision: 18 };
  assert.equal(guideStartStep(previous), 'completion');
  assert.equal(visitGuideStep(previous, 'completion').completedRevision, 18);
});
