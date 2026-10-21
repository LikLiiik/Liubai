import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedWeekMetrics, createWeekPinchController, updateWeekPinch, weekCardDensity, zoomWeekAt, type WeekPinch, type ZoomPoint } from '../src/weekZoom.ts';
import { positionFromPoint, weekDates } from '../src/week.ts';
import { freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';

const viewport = { width: 390, height: 700, minDayWidth: (390 - 44) / 7 };
const base: WeekPinch = { metrics: { dayWidth: 100, hourHeight: 80 }, offset: { x: 180, y: 500 }, viewport,
  points: [{ x: 140, y: 240 }, { x: 240, y: 340 }] };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} ≠ ${expected}`);

test('horizontal, vertical and diagonal two-finger spreads scale the intended axes independently', () => {
  const horizontal = updateWeekPinch(base, [{ x: 90, y: 240 }, { x: 290, y: 340 }]);
  near(horizontal.dayWidth, 200); near(horizontal.hourHeight, 80);
  const vertical = updateWeekPinch(base, [{ x: 140, y: 190 }, { x: 240, y: 390 }]);
  near(vertical.dayWidth, 100); near(vertical.hourHeight, 160);
  const diagonal = updateWeekPinch(base, [{ x: 90, y: 190 }, { x: 290, y: 390 }]);
  near(diagonal.dayWidth, 200); near(diagonal.hourHeight, 160);
  const reverse = updateWeekPinch(base, [{ x: 290, y: 390 }, { x: 90, y: 190 }]);
  assert.deepEqual(reverse, diagonal, 'touch ordering does not change the zoom');
});

test('the date and time beneath the pinch center stay anchored, including a two-finger pan', () => {
  const center = { x: 190, y: 290 }, nextCenter = { x: 210, y: 330 };
  const next = zoomWeekAt(base.metrics, { dayWidth: 160, hourHeight: 120 }, base.offset, center, viewport, nextCenter);
  near((base.offset.x + center.x - 44) / 100, (next.x + nextCenter.x - 44) / next.dayWidth);
  near((base.offset.y + center.y - 53) / (80 / 60), (next.y + nextCenter.y - 53) / (next.hourHeight / 60));
  const restored = zoomWeekAt(next, base.metrics, next, nextCenter, viewport, center);
  near(restored.x, base.offset.x); near(restored.y, base.offset.y);
});

test('parallel fingers, tiny spans and minor jitter never produce infinite values or unintended axis changes', () => {
  const horizontal: WeekPinch = { ...base, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] };
  const next = updateWeekPinch(horizontal, [{ x: 50, y: 100 }, { x: 250, y: 102 }]);
  near(next.hourHeight, 80); near(next.dayWidth, 200);
  const tiny = updateWeekPinch({ ...base, points: [{ x: 100, y: 100 }, { x: 100, y: 100 }] }, [{ x: 80, y: 80 }, { x: 120, y: 120 }]);
  for (const value of Object.values(tiny)) assert.ok(Number.isFinite(value));
});

test('zoom limits retain a full-week minimum and clamp scroll positions on phone, landscape and desktop viewports', () => {
  for (const width of [320, 844, 1400]) {
    const view = { ...viewport, width, minDayWidth: Math.max(28, (width - 44) / 7) };
    const min = boundedWeekMetrics({ dayWidth: 0, hourHeight: 0 }, view);
    near(min.dayWidth, view.minDayWidth); assert.equal(min.hourHeight, 24);
    const max = zoomWeekAt(base.metrics, { dayWidth: 5000, hourHeight: 5000 }, { x: 90000, y: 90000 }, { x: 300, y: 500 }, view);
    assert.equal(max.dayWidth, Math.max(360, view.minDayWidth)); assert.equal(max.hourHeight, 200);
    assert.ok(max.x >= 0 && max.x <= Math.max(0, max.dayWidth * 7 + 44 - width));
    assert.ok(max.y >= 0 && max.y <= 24 * max.hourHeight + 40 - (view.height - 53));
  }
});

test('drag coordinates still select the same weekday and snapped time at every zoom level', () => {
  const dates = weekDates('2026-10-21');
  for (const dayWidth of [44, 104, 220, 360]) for (const hourHeight of [24, 56, 100, 200]) {
    const position = positionFromPoint({ x: dayWidth * 2.5, y: 615 * hourHeight / 60,
      dayWidth, pixelsPerMinute: hourHeight / 60, dates, startMinute: 0, endMinute: 1440, grabOffset: 0 });
    assert.deepEqual(position, { date: dates[2], start: 615 });
  }
});

test('card content and stars follow actual width and height, including narrow overlap lanes and quick reminders', () => {
  assert.equal(weekCardDensity(25, 160).star, 'hidden');
  assert.equal(weekCardDensity(48, 80).star, 'indicator');
  assert.equal(weekCardDensity(84, 44).star, 'button');
  assert.equal(weekCardDensity(200, 16).star, 'hidden', 'wide but very short cards cannot fit a button');
  assert.equal(weekCardDensity(52, 80).time, true);
  const enlarged = weekCardDensity(170, 180);
  assert.ok(enlarged.detailed && enlarged.metadata && enlarged.notes);
  assert.equal(weekCardDensity((104 - 4) / 2 - 1, 100).star, 'indicator');
  assert.equal(weekCardDensity((280 - 4) / 2 - 1, 100).star, 'button', 'zoomed overlap lanes regain a usable star');
  const quick = weekCardDensity(150, 36, true);
  assert.equal(quick.star, 'hidden'); assert.equal(quick.notes, false); assert.equal(quick.time, false);
});

function controllerHarness() {
  let now = 0, id = 0;
  const calls: string[] = [], frames = new Map<number, () => void>();
  const controller = createWeekPinchController({ begin: () => { calls.push('begin'); }, move: points => { calls.push(`move:${points[0].x}`); },
    end: () => { calls.push('end'); }, block: value => { calls.push(`block:${value}`); },
    frame: run => { frames.set(++id, run); return id; }, cancelFrame: id => { frames.delete(id); }, now: () => now });
  return { controller, calls, frames, tick: (value: number) => { now = value; }, flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(run => run()); } };
}
const pair: [ZoomPoint, ZoomPoint] = [{ x: 10, y: 10 }, { x: 100, y: 100 }];

test('a pinch blocks drag and trailing clicks until both fingers lift, and coalesces moves without losing the final position', () => {
  const { controller, calls, tick, flush } = controllerHarness();
  controller.start([pair[0]]); assert.equal(controller.isBlocked(), false); assert.equal(calls.length, 0);
  controller.start(pair); assert.equal(controller.isBlocked(), true);
  controller.move([{ x: 20, y: 10 }, pair[1]]); controller.move([{ x: 30, y: 10 }, pair[1]]);
  flush(); assert.equal(calls.filter(call => call.startsWith('move')).length, 1);
  assert.ok(calls.includes('move:30'));
  controller.move([{ x: 40, y: 10 }, pair[1]]); controller.finish(1);
  assert.ok(calls.includes('move:40')); assert.equal(calls.at(-1), 'end');
  controller.move(pair); assert.equal(controller.isBlocked(), true);
  controller.finish(0); assert.equal(calls.at(-1), 'block:false'); assert.equal(controller.isBlocked(), true);
  tick(181); assert.equal(controller.isBlocked(), false);
});

test('a third finger cancels the pinch without jumping to a different pair, and unmount cancels queued work', () => {
  const { controller, calls, flush, frames } = controllerHarness();
  controller.start(pair); controller.start([...pair, { x: 200, y: 200 }]);
  assert.equal(calls.at(-1), 'end');
  controller.move(pair); flush(); assert.equal(calls.filter(call => call.startsWith('move')).length, 0);
  controller.finish(0); controller.start(pair); controller.move(pair);
  assert.equal(frames.size, 1); controller.dispose(); flush();
  assert.equal(calls.filter(call => call.startsWith('move')).length, 0);
});

test('gesture callbacks update with current render state without rebuilding the active controller', () => {
  const { controller, calls, flush } = controllerHarness();
  controller.start(pair); controller.move(pair);
  controller.setCallbacks({ begin: () => {}, move: () => { calls.push('latest'); }, end: () => { calls.push('latest-end'); } });
  flush(); controller.finish(0);
  assert.ok(calls.includes('latest')); assert.equal(calls.at(-2), 'latest-end');
});

test('users who finished guide v14 retain completion and see the updated input and zoom lessons', () => {
  const previous = { ...freshGuideProgress(), revision: 14, completedRevision: 14, deferredRevision: 14 };
  assert.equal(guideStartStep(previous), 'tasks');
  assert.equal(visitGuideStep(previous, 'week').completedRevision, 14);
});
