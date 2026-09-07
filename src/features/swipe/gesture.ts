export type SwipeAction = 'SELECT' | 'REJECT' | 'SNOOZE';

export interface SwipeGestureInfo {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DISTANCE_RATIO = 0.25;
const MIN_FLICK_DISTANCE = 20;
const FLICK_VELOCITY = 500;
const DOMINANCE = 1.5;

export function resolveSwipe(info: SwipeGestureInfo, cardWidth: number): SwipeAction | null {
  const absX = Math.abs(info.x);
  const absY = Math.abs(info.y);
  const distanceThreshold = cardWidth * DISTANCE_RATIO;
  const horizontalDominant = absX > absY * DOMINANCE;
  const verticalDominant = info.y > 0 && info.y > absX * DOMINANCE;

  if (horizontalDominant && absX >= distanceThreshold) {
    return info.x > 0 ? 'SELECT' : 'REJECT';
  }

  if (
    horizontalDominant &&
    absX >= MIN_FLICK_DISTANCE &&
    Math.abs(info.vx) >= FLICK_VELOCITY &&
    Math.sign(info.vx) === Math.sign(info.x)
  ) {
    return info.x > 0 ? 'SELECT' : 'REJECT';
  }

  if (verticalDominant && info.y >= distanceThreshold) {
    return 'SNOOZE';
  }

  return null;
}

export function exitTarget(
  action: SwipeAction,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  switch (action) {
    case 'SELECT':
      return { x: viewportWidth + 200, y: 0 };
    case 'REJECT':
      return { x: -(viewportWidth + 200), y: 0 };
    case 'SNOOZE':
      return { x: 0, y: viewportHeight + 200 };
  }
}
