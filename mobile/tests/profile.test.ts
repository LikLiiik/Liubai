import assert from 'node:assert/strict';
import test from 'node:test';
import { homeGreeting, normalizeNickname, withNickname } from '../src/profile.ts';
import { validSettings } from '../src/time.ts';
import { createEmpty } from '../src/seed.ts';
import { GUIDE_STEPS, freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';

test('greetings follow local calendar time across every boundary including midnight', () => {
  const periods = [[0, '凌晨好'], [299, '凌晨好'], [300, '早上好'], [659, '早上好'], [660, '中午好'], [839, '中午好'],
    [840, '下午好'], [1079, '下午好'], [1080, '晚上好'], [1439, '晚上好']] as const;
  for (const [minute, expected] of periods) {
    assert.equal(homeGreeting(undefined, minute), expected);
    assert.equal(homeGreeting('小白', minute), `小白，${expected}`);
  }
});

test('nickname validation allows Chinese and emoji, trims input and rejects oversized or invisible names', () => {
  assert.equal(normalizeNickname('  小白  '), '小白');
  assert.equal(normalizeNickname('Alice   Li'), 'Alice Li');
  assert.equal(normalizeNickname('🌻'.repeat(20)), '🌻'.repeat(20));
  assert.equal(normalizeNickname('👩‍💻'), '👩‍💻');
  assert.equal(normalizeNickname('白'.repeat(21)), null);
  assert.equal(normalizeNickname('小\u0000白'), null);
  assert.equal(normalizeNickname('\u200b'), null);
  assert.equal(normalizeNickname('   '), '');
});

test('nickname changes persist with existing preferences and can be cleared without changing schedules', () => {
  const data = createEmpty({ dayStart: 1200, dayEnd: 1800, buffer: 15, notificationsEnabled: true });
  assert.equal(validSettings(data.settings), true, 'older data without nickname stays valid');
  const settings = withNickname(data.settings, ' 小白 ')!;
  const restored = JSON.parse(JSON.stringify({ ...data, settings }));
  assert.equal(restored.settings.nickname, '小白');
  assert.equal(validSettings(restored.settings), true);
  assert.equal(homeGreeting(restored.settings.nickname, 30), '小白，凌晨好', 'cross-night planning does not shift the greeting');
  assert.deepEqual(withNickname(settings, '')!, { ...data.settings, nickname: undefined });
  assert.equal(data.settings.nickname, undefined);
  assert.equal(withNickname(settings, '白'.repeat(21)), null);
  for (const nickname of [null, 12, '白'.repeat(21), '  小白']) assert.equal(validSettings({ ...settings, nickname } as typeof settings), false);
});

test('returning v9 users see nickname teaching while keeping their previous completion history', () => {
  const previous = { ...freshGuideProgress(), revision: 9, completedRevision: 9, deferredRevision: 9 };
  assert.equal(guideStartStep(previous), 'preferences');
  assert.equal(visitGuideStep(previous, 'preferences').completedRevision, 9);
  assert.ok(GUIDE_STEPS.find(step => step.id === 'preferences')!.tips.join('').includes('昵称'));
});
