import { describe, expect, it } from 'vitest';
import { resolveSwipe, exitTarget } from './gesture';
describe('intentional swipe gestures', () => {
 it('uses card width rather than a fixed desktop distance', () => { expect(resolveSwipe({x:85,y:8,vx:0,vy:0},320)).toBe('SELECT'); expect(resolveSwipe({x:-85,y:8,vx:0,vy:0},320)).toBe('REJECT'); });
 it('accepts a deliberate fast flick but not a tap or jitter', () => { expect(resolveSwipe({x:40,y:2,vx:850,vy:0},360)).toBe('SELECT'); expect(resolveSwipe({x:8,y:2,vx:1000,vy:0},360)).toBeNull(); });
 it('requires a clear direction and never treats upward motion as snooze', () => { expect(resolveSwipe({x:90,y:90,vx:0,vy:0},320)).toBeNull(); expect(resolveSwipe({x:5,y:-140,vx:0,vy:-900},320)).toBeNull(); expect(resolveSwipe({x:4,y:110,vx:0,vy:0},320)).toBe('SNOOZE'); });
 it('does not interpret a reversal as an opposite flick', () => { expect(resolveSwipe({x:35,y:0,vx:-900,vy:0},360)).toBeNull(); });
 it('throws accepted cards beyond the viewport', () => { expect(exitTarget('SELECT',390,844).x).toBeGreaterThan(390); expect(exitTarget('REJECT',390,844).x).toBeLessThan(-390); expect(exitTarget('SNOOZE',390,844).y).toBeGreaterThan(844); });
});
