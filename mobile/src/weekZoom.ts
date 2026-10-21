export const WEEK_GUTTER = 44;
export const WEEK_HEADER = 53;
export const MIN_HOUR_HEIGHT = 24;
export const MAX_HOUR_HEIGHT = 200;
export const MAX_DAY_WIDTH = 360;
export type ZoomPoint = { x: number; y: number };
export type WeekMetrics = { dayWidth: number; hourHeight: number };
export type WeekViewport = { width: number; height: number; minDayWidth: number; gutter?: number; header?: number };
export type WeekOffset = { x: number; y: number };
export type WeekPinch = { points: [ZoomPoint, ZoomPoint]; metrics: WeekMetrics; offset: WeekOffset; viewport: WeekViewport };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function boundedWeekMetrics(metrics: WeekMetrics, viewport: WeekViewport): WeekMetrics {
  return { dayWidth: clamp(metrics.dayWidth, viewport.minDayWidth, Math.max(viewport.minDayWidth, MAX_DAY_WIDTH)),
    hourHeight: clamp(metrics.hourHeight, MIN_HOUR_HEIGHT, MAX_HOUR_HEIGHT) };
}
export function zoomWeekAt(metrics: WeekMetrics, desired: WeekMetrics, offset: WeekOffset, center: ZoomPoint,
  viewport: WeekViewport, nextCenter = center): WeekMetrics & WeekOffset {
  const next = boundedWeekMetrics(desired, viewport);
  const gutter = viewport.gutter ?? WEEK_GUTTER, header = viewport.header ?? WEEK_HEADER;
  const column = clamp((offset.x + center.x - gutter) / metrics.dayWidth, 0, 7);
  const minute = clamp((offset.y + center.y - header) / (metrics.hourHeight / 60), 0, 1440);
  return { ...next,
    x: clamp(gutter + column * next.dayWidth - nextCenter.x, 0, Math.max(0, gutter + 7 * next.dayWidth - viewport.width)),
    y: clamp(header + minute * next.hourHeight / 60 - nextCenter.y, 0, Math.max(0, 24 * next.hourHeight + 40 - (viewport.height - header))) };
}
export const pinchCenter = (points: [ZoomPoint, ZoomPoint]): ZoomPoint => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
export function updateWeekPinch(session: WeekPinch, points: [ZoomPoint, ZoomPoint]): WeekMetrics & WeekOffset {
  const axisScale = (axis: 'x' | 'y') => {
    const before = Math.abs(session.points[1][axis] - session.points[0][axis]);
    const after = Math.abs(points[1][axis] - points[0][axis]);
    // A near-horizontal or vertical pinch must not divide by an almost-zero span.
    return Math.abs(after - before) < 3 ? 1 : Math.max(0.05, 1 + (after - before) / Math.max(80, before));
  };
  return zoomWeekAt(session.metrics, { dayWidth: session.metrics.dayWidth * axisScale('x'),
    hourHeight: session.metrics.hourHeight * axisScale('y') }, session.offset, pinchCenter(session.points), session.viewport, pinchCenter(points));
}

export function weekCardDensity(width: number, height: number, quick = false) {
  const tiny = width < 36 || height < 20;
  const detailed = !quick && width >= 132 && height >= 92;
  const time = width >= 52 && height >= (quick ? 40 : 36);
  const metadata = detailed;
  const notes = detailed && height >= 140;
  const star = quick ? 'hidden' : width >= 84 && height >= 44 ? 'button' : width >= 40 && height >= 20 ? 'indicator' : 'hidden';
  const lineHeight = tiny ? 10 : width < 84 ? 12 : 16;
  const padding = height < 32 ? 0 : 4;
  const reserved = 2 * padding + 2 + (time ? 16 : 0) + (metadata ? 16 : 0) + (notes ? 30 : 0);
  return { tiny, detailed, time, metadata, notes, star, lineHeight, padding,
    fontSize: tiny ? 8 : width < 84 ? 9 : 11,
    titleLines: quick ? 1 : clamp(Math.floor((height - reserved) / lineHeight), 1, detailed ? 6 : 4) } as const;
}

type PinchDriver = { begin: (points: [ZoomPoint, ZoomPoint]) => void; move: (points: [ZoomPoint, ZoomPoint]) => void;
  end: () => void; block: (value: boolean) => void; frame: (run: () => void) => number;
  cancelFrame: (id: number) => void; now: () => number };
export function createWeekPinchController(driver: PinchDriver) {
  let blocked = false, active = false, releasedAt = -Infinity;
  let frame: number | null = null, pending: [ZoomPoint, ZoomPoint] | null = null;
  const controller = {
    setCallbacks(callbacks: Pick<PinchDriver, 'begin' | 'move' | 'end'>) { driver = { ...driver, ...callbacks }; },
    start(points: ZoomPoint[]) {
      if (points.length < 2) return;
      if (blocked) { if (points.length !== 2) controller.finish(points.length, true); return; }
      blocked = true; driver.block(true);
      if (points.length === 2) { active = true; driver.begin(points as [ZoomPoint, ZoomPoint]); }
    },
    move(points: ZoomPoint[]) {
      if (!active) return;
      if (points.length !== 2) { controller.finish(points.length, true); return; }
      pending = points as [ZoomPoint, ZoomPoint];
      if (frame === null) frame = driver.frame(() => {
        frame = null;
        if (active && pending) driver.move(pending);
        pending = null;
      });
    },
    finish(remaining: number, force = false) {
      if (remaining >= 2 && active && !force) return;
      if (frame !== null) { driver.cancelFrame(frame); frame = null; }
      if (active && pending) driver.move(pending);
      pending = null;
      if (active) { active = false; driver.end(); }
      if (remaining === 0 && blocked) { blocked = false; releasedAt = driver.now(); driver.block(false); }
    },
    suppressClick() { releasedAt = driver.now(); },
    engaged: () => blocked,
    isBlocked: () => blocked || driver.now() - releasedAt < 180,
    dispose() { if (frame !== null) driver.cancelFrame(frame); frame = null; pending = null; active = false; blocked = false; },
  };
  return controller;
}
