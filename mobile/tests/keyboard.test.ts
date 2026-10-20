import assert from 'node:assert/strict';
import test from 'node:test';
import { keyboardScrollDelta } from '../src/keyboard.ts';

test('focused fields clear the keyboard without moving fields that are already visible', () => {
  const viewport = { top: 120, height: 650 };
  assert.equal(keyboardScrollDelta({ top: 600, height: 46 }, viewport, 520), 142);
  assert.equal(keyboardScrollDelta({ top: 200, height: 46 }, viewport, 520), 0);
});

test('dialog footers and resized page bounds constrain visibility even above the keyboard', () => {
  assert.equal(keyboardScrollDelta({ top: 430, height: 46 }, { top: 120, height: 330 }, 520), 42);
  assert.equal(keyboardScrollDelta({ top: 430, height: 46 }, { top: 120, height: 200 }, 400), 172);
});

test('switching to a field above the current viewport scrolls back only as far as necessary', () => {
  assert.equal(keyboardScrollDelta({ top: 90, height: 46 }, { top: 120, height: 330 }, 520), -46);
  assert.equal(keyboardScrollDelta({ top: 136, height: 46 }, { top: 120, height: 330 }, 520), 0);
  assert.equal(keyboardScrollDelta({ top: 160, height: 400 }, { top: 120, height: 330 }, 520), 24);
});

test('unmounted or collapsed layout measurements do not produce invalid scrolling', () => {
  const field = { top: 600, height: 46 };
  assert.equal(keyboardScrollDelta(field, { top: 120, height: 0 }, 520), 0);
  assert.equal(keyboardScrollDelta(field, { top: 120, height: 330 }, 100), 0);
  assert.equal(keyboardScrollDelta({ top: NaN, height: 46 }, { top: 120, height: 330 }, 520), 0);
});
