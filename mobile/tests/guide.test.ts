import assert from 'node:assert/strict';
import test from 'node:test';
import { completeGuide, createGuideWriter, deferGuide, freshGuideProgress, GUIDE_REVISION, GUIDE_STEPS, guideStartStep, parseGuideProgress, shouldShowGuide, visitGuideStep } from '../src/guide.ts';
import { setupGuideReminders, type GuidePermissionDriver } from '../src/guidePermissions.ts';
import type { NotificationAccess } from '../src/types.ts';
import { createDemo, createEmpty } from '../src/seed.ts';

test('the current tutorial has stable distinct steps and covers every interactive lesson', () => {
  assert.equal(new Set(GUIDE_STEPS.map(step => step.id)).size, GUIDE_STEPS.length);
  for (const id of ['welcome', 'week', 'rescue', 'permissions', 'ready']) assert.ok(GUIDE_STEPS.some(step => step.id === id));
  assert.ok(GUIDE_STEPS.every(step => step.introduced > 0 && step.introduced <= GUIDE_REVISION));
});

test('v10 users start at the direct-star week lesson without losing tutorial history', () => {
  const previous = { ...freshGuideProgress(), revision: 10, completedRevision: 10, deferredRevision: 10 };
  assert.equal(guideStartStep(previous), 'week');
  assert.equal(visitGuideStep(previous, 'week').completedRevision, 10);
  assert.ok(GUIDE_STEPS.find(step => step.id === 'week')!.tips.join('').includes('星标'));
});

test('a fresh installation opens the tutorial and an interrupted session resumes at its saved step', () => {
  const fresh = parseGuideProgress(null);
  assert.equal(shouldShowGuide(fresh), true);
  assert.equal(guideStartStep(fresh), 'welcome');
  const progress = visitGuideStep(fresh, 'week');
  const restored = parseGuideProgress(JSON.stringify(progress));
  assert.equal(shouldShowGuide(restored), true);
  assert.equal(guideStartStep(restored), 'week');
  assert.equal(fresh.stepId, 'welcome', 'advancing does not mutate an older snapshot');
});

test('later dismisses automatic prompts without claiming completion and can resume from My', () => {
  const deferred = deferGuide(visitGuideStep(freshGuideProgress(), 'rescue'));
  const restored = parseGuideProgress(JSON.stringify(deferred));
  assert.equal(shouldShowGuide(restored), false);
  assert.equal(restored.completedRevision, 0);
  assert.equal(guideStartStep(restored), 'rescue');
});

test('completion survives restart; replay starts from the beginning and does not erase completion', () => {
  const finished = completeGuide(visitGuideStep(freshGuideProgress(), 'ready'));
  const restored = parseGuideProgress(JSON.stringify(finished));
  assert.equal(shouldShowGuide(restored), false);
  assert.equal(guideStartStep(restored), 'welcome');
  const replay = deferGuide(visitGuideStep(restored, 'week'));
  assert.equal(replay.completedRevision, GUIDE_REVISION);
  assert.equal(shouldShowGuide(replay), false);
});

test('a new guide revision starts with newly introduced content instead of replaying old introductory steps', () => {
  const finished = completeGuide(freshGuideProgress());
  const revision = GUIDE_REVISION + 1;
  assert.equal(shouldShowGuide(finished, revision), true);
  assert.equal(guideStartStep(finished, revision, [{ id: 'welcome', introduced: 1 }, { id: 'permissions', introduced: revision }, { id: 'ready', introduced: 1 }]), 'permissions');
  assert.equal(shouldShowGuide({ ...finished, deferredRevision: revision }, revision), false);
  assert.equal(shouldShowGuide(finished), false, 'ordinary app version changes do not change the tutorial revision');
});

test('users who completed the published v2 guide see the corrected hands-on lessons without losing completion history', () => {
  const previous = { ...freshGuideProgress(), revision: 2, completedRevision: 2, deferredRevision: 2 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'tasks');
  assert.equal(visitGuideStep(previous, 'week').completedRevision, 2);
});

test('users who completed v3 see revised task and repeated-rescue teaching without losing prior progress', () => {
  const previous = { ...freshGuideProgress(), revision: 3, completedRevision: 3, deferredRevision: 3 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'tasks');
  assert.equal(GUIDE_STEPS.find(step => step.id === 'rescue')!.introduced, 4);
  assert.equal(visitGuideStep(previous, 'rescue').completedRevision, 3);
});

test('users who completed v4 receive split time and duration teaching with their history preserved', () => {
  const previous = { ...freshGuideProgress(), revision: 4, completedRevision: 4, deferredRevision: 4 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'tasks');
  assert.equal(GUIDE_STEPS.find(step => step.id === 'preferences')!.introduced, 10);
  assert.equal(visitGuideStep(previous, 'preferences').completedRevision, 4);
});

test('users who completed v5 start at category teaching and retain their previous completion history', () => {
  const previous = { ...freshGuideProgress(), revision: 5, completedRevision: 5, deferredRevision: 5 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'tasks');
  assert.equal(GUIDE_STEPS.find(step => step.id === 'explore')!.introduced, 6);
  assert.ok(GUIDE_STEPS.find(step => step.id === 'tasks')!.tips.join('').includes('添加分类'));
  assert.equal(visitGuideStep(previous, 'explore').completedRevision, 5);
});

test('v6 users start at the new quick-reminder lesson while their prior completion stays intact', () => {
  const previous = { ...freshGuideProgress(), revision: 6, completedRevision: 6, deferredRevision: 6 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'quick');
  assert.equal(GUIDE_STEPS.find(step => step.id === 'quick')!.introduced, 7);
  assert.equal(visitGuideStep(previous, 'quick').completedRevision, 6);
});

test('v7 users start with completion choices while retaining their earlier guide completion', () => {
  const previous = { ...freshGuideProgress(), revision: 7, completedRevision: 7, deferredRevision: 7 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'completion');
  assert.equal(GUIDE_STEPS.find(step => step.id === 'completion')!.introduced, 9);
  assert.equal(visitGuideStep(previous, 'completion').completedRevision, 7);
});

test('v8 users receive the revised completion-undo choices without losing their guide history', () => {
  const previous = { ...freshGuideProgress(), revision: 8, completedRevision: 8, deferredRevision: 8 };
  assert.equal(shouldShowGuide(previous), true);
  assert.equal(guideStartStep(previous), 'completion');
  assert.equal(visitGuideStep(previous, 'completion').completedRevision, 8);
  assert.ok(GUIDE_STEPS.find(step => step.id === 'completion')!.tips.join('').includes('撤销完成'));
});

test('missing or damaged progress recovers without crashing and removed step IDs retain completion history', () => {
  for (const raw of ['not json', 'null', '[]', '{}', JSON.stringify({ ...freshGuideProgress(), completedRevision: -1 })]) {
    assert.deepEqual(parseGuideProgress(raw), freshGuideProgress());
  }
  const completed = completeGuide(freshGuideProgress());
  const unknown = parseGuideProgress(JSON.stringify({ ...completed, stepId: 'removed-step' }));
  assert.equal(unknown.stepId, 'welcome');
  assert.equal(unknown.completedRevision, completed.completedRevision);
  assert.equal(shouldShowGuide(unknown), false);
});

test('progress writes are serialized so rapid navigation cannot overwrite completion with an older step', async () => {
  let unblock: () => void = () => {};
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const writes: string[] = [];
  const write = createGuideWriter(async raw => { if (!writes.length) await gate; writes.push(raw); });
  const first = write(visitGuideStep(freshGuideProgress(), 'tasks'));
  const second = write(visitGuideStep(freshGuideProgress(), 'week'));
  const last = write(completeGuide(freshGuideProgress()));
  assert.equal(writes.length, 0);
  unblock(); await Promise.all([first, second, last]);
  assert.deepEqual(writes.map(raw => parseGuideProgress(raw).stepId), ['tasks', 'week', 'ready']);
  assert.equal(parseGuideProgress(writes.at(-1)!).completedRevision, GUIDE_REVISION);
});

test('a failed progress write remains retryable and does not poison the writer queue', async () => {
  let fail = true, saved = '';
  const write = createGuideWriter(async raw => { if (fail) throw new Error('storage'); saved = raw; });
  await assert.rejects(write(freshGuideProgress()), /storage/);
  fail = false;
  await write(completeGuide(freshGuideProgress()));
  assert.equal(shouldShowGuide(parseGuideProgress(saved)), false);
});

function permissionDriver(initial: NotificationAccess, after = initial) {
  const calls: string[] = [];
  let current = initial;
  const driver: GuidePermissionDriver = {
    inspect: async () => { calls.push('inspect'); return current; },
    request: async () => { calls.push('request'); current = after; return after.status === 'granted'; },
    settings: async () => { calls.push('settings'); },
  };
  return { driver, calls };
}
const choices = { tasks: true, inbox: true };

test('choosing no reminders requires no phone permission; existing permission is reused without another prompt', async () => {
  const system = permissionDriver({ status: 'granted', canAskAgain: true });
  assert.equal((await setupGuideReminders({ tasks: false, inbox: false }, system.driver)).action, 'disabled');
  assert.deepEqual(system.calls, []);
  assert.equal((await setupGuideReminders(choices, system.driver)).action, 'enabled');
  assert.deepEqual(system.calls, ['inspect']);
});

test('permission is requested only through the explicit setup action and verified again before enabling reminders', async () => {
  const system = permissionDriver({ status: 'undetermined', canAskAgain: true }, { status: 'granted', canAskAgain: true });
  assert.deepEqual(system.calls, []);
  const result = await setupGuideReminders(choices, system.driver);
  assert.equal(result.action, 'enabled');
  assert.deepEqual(system.calls, ['inspect', 'request', 'inspect']);
});

test('denying notification permission does not report enabled reminders or keep asking in a loop', async () => {
  const system = permissionDriver({ status: 'undetermined', canAskAgain: true }, { status: 'denied', canAskAgain: false });
  assert.equal((await setupGuideReminders(choices, system.driver)).action, 'denied');
  assert.equal(system.calls.filter(call => call === 'request').length, 1);
  assert.equal((await setupGuideReminders(choices, system.driver)).action, 'settings');
  assert.equal(system.calls.filter(call => call === 'request').length, 1);
  assert.equal(system.calls.at(-1), 'settings');
});

test('web tutorial never asks for phone permission or opens device settings', async () => {
  const system = permissionDriver({ status: 'unsupported', canAskAgain: false });
  assert.equal((await setupGuideReminders(choices, system.driver)).action, 'unsupported');
  assert.deepEqual(system.calls, ['inspect']);
});

test('permission bridge and settings failures propagate for retry instead of falsely enabling reminders', async () => {
  const system = permissionDriver({ status: 'denied', canAskAgain: false });
  system.driver.settings = async () => { throw new Error('settings unavailable'); };
  await assert.rejects(setupGuideReminders(choices, system.driver), /settings unavailable/);
  system.driver.inspect = async () => { throw new Error('bridge'); };
  await assert.rejects(setupGuideReminders(choices, system.driver), /bridge/);
});

test('a stale successful permission response is rechecked before reminders are marked enabled', async () => {
  const system = permissionDriver({ status: 'undetermined', canAskAgain: true });
  system.driver.request = async () => true;
  assert.equal((await setupGuideReminders(choices, system.driver)).action, 'denied');
});

test('starting a personal day keeps tutorial reminder choices and preferences while removing only example tasks and history', () => {
  const example = createDemo();
  example.settings = { dayStart: 600, dayEnd: 1560, buffer: 15, notificationsEnabled: true, inboxRemindersEnabled: true, inboxReminderMinMinutes: 90 };
  const personal = createEmpty(example.settings);
  assert.equal(personal.demo, false);
  assert.deepEqual(personal.tasks, []);
  assert.deepEqual(personal.history, []);
  assert.deepEqual(personal.settings, example.settings);
  assert.notEqual(personal.settings, example.settings);
  assert.ok(example.tasks.length > 0);
});
