export type VerticalBounds = { top: number; height: number };

// A footer or bottom navigation may sit between the form and the keyboard.
export function keyboardScrollDelta(field: VerticalBounds, viewport: VerticalBounds, keyboardTop: number, gap = 16): number {
  if (![field.top, field.height, viewport.top, viewport.height, keyboardTop].every(Number.isFinite)
    || field.height <= 0 || viewport.height <= 0) return 0;
  const top = viewport.top + gap;
  const bottom = Math.min(viewport.top + viewport.height, keyboardTop) - gap;
  if (bottom <= top) return 0;
  if (field.height > bottom - top) return field.top > top ? field.top - top : 0;
  if (field.top + field.height > bottom) return field.top + field.height - bottom;
  if (field.top < top) return field.top - top;
  return 0;
}
