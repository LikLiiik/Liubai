import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseGreeting, createGreetingRotation, greetingChoices, greetingPeriod, personalizeGreeting } from '../src/greetings.ts';
import { freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';

test('every local-time boundary selects the correct greeting pool, including midnight', () => {
  for (const [minute, period] of [[0, 0], [299, 0], [300, 1], [659, 1], [660, 2], [839, 2], [840, 3], [1079, 3], [1080, 4], [1439, 4]]) {
    assert.equal(greetingPeriod(minute), period);
    assert.ok(chooseGreeting(greetingPeriod(minute), null).id.startsWith(`${period}:`));
  }
  assert.equal(personalizeGreeting('小白', '早呀'), '小白，早呀');
  assert.equal(personalizeGreeting(undefined, '早呀'), '早呀');
});

test('all variants are reachable and neither headline nor message repeats on consecutive visits in one period', () => {
  for (let period = 0; period < 5; period++) {
    const choices = greetingChoices(period);
    assert.equal(choices.length, 5);
    assert.equal(new Set(choices.map(choice => choice.title)).size, 5);
    assert.equal(new Set(choices.map(choice => choice.message)).size, 5);
    for (const previous of choices) {
      const found = new Set<string>();
      for (const random of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const next = chooseGreeting(period, previous.id, () => random);
        assert.notEqual(next.title, previous.title);
        assert.notEqual(next.message, previous.message);
        found.add(next.id);
      }
      assert.equal(found.size, 4);
    }
    assert.ok(chooseGreeting(period, 'corrupt-or-removed-id', () => 0));
  }
});

test('rapid visits are serialized and app restart continues without repeating the last saved greeting', async () => {
  let saved: string | null = '1:0';
  const writes: string[] = [];
  const storage = { get: async () => saved, set: async (id: string) => { writes.push(id); saved = id; } };
  const next = createGreetingRotation(storage, () => 0);
  const visits = await Promise.all([next(1), next(1), next(1)]);
  assert.deepEqual(visits.map(visit => visit.id), ['1:1', '1:0', '1:1']);
  assert.deepEqual(writes, visits.map(visit => visit.id));
  const reopened = createGreetingRotation(storage, () => 0);
  assert.notEqual((await reopened(1)).id, visits.at(-1)!.id);
  assert.ok((await reopened(0)).id.startsWith('0:'), 'cross-night greetings use the current period');
});

test('storage failures do not block greetings or stop subsequent rotation', async () => {
  let attempts = 0;
  const next = createGreetingRotation({ get: async () => { throw new Error('unavailable'); },
    set: async () => { attempts++; throw new Error('full'); } }, () => 0);
  assert.notEqual((await next(2)).id, (await next(2)).id);
  assert.equal(attempts, 2);
});

test('v12 guide completion is preserved while returning users start at the new greeting demonstration', () => {
  const previous = { ...freshGuideProgress(), revision: 12, completedRevision: 12, deferredRevision: 12 };
  assert.equal(guideStartStep(previous), 'preferences');
  assert.equal(visitGuideStep(previous, 'preferences').completedRevision, 12);
});
