import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
  MIN_WIDTH,
  MAX_WIDTH,
  DEFAULT_WIDTH,
} from './sidebarWidth';

describe('clampSidebarWidth', () => {
  it('clamps below the minimum up to MIN_WIDTH', () => {
    expect(clampSidebarWidth(50)).toBe(MIN_WIDTH);
  });
  it('clamps above the maximum down to MAX_WIDTH', () => {
    expect(clampSidebarWidth(9999)).toBe(MAX_WIDTH);
  });
  it('passes an in-range value through', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });
  it('falls back to default on NaN/Infinity', () => {
    expect(clampSidebarWidth(NaN)).toBe(DEFAULT_WIDTH);
    expect(clampSidebarWidth(Infinity)).toBe(DEFAULT_WIDTH);
  });
});

describe('loadSidebarWidth / saveSidebarWidth', () => {
  beforeEach(() => localStorage.clear());

  it('returns the default when nothing is stored', () => {
    expect(loadSidebarWidth()).toBe(DEFAULT_WIDTH);
  });
  it('round-trips a clamped value', () => {
    saveSidebarWidth(300);
    expect(loadSidebarWidth()).toBe(300);
  });
  it('clamps a persisted out-of-range value on read', () => {
    localStorage.setItem('claui:sidebarWidth', '9999');
    expect(loadSidebarWidth()).toBe(MAX_WIDTH);
  });
  it('falls back to default on non-numeric storage', () => {
    localStorage.setItem('claui:sidebarWidth', 'wide');
    expect(loadSidebarWidth()).toBe(DEFAULT_WIDTH);
  });
});
