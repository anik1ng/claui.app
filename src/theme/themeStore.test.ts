import { describe, it, expect } from 'vitest';
import { hex, themeToCssVars, type Theme } from './themeStore';

const sample: Theme = {
  background: { r: 0, g: 0, b: 0 },
  foreground: { r: 255, g: 255, b: 255 },
  palette: Array.from({ length: 16 }, (_, i) => ({ r: i, g: i, b: i })),
  cursorColor: { r: 10, g: 20, b: 30 },
  cursorStyle: 'block',
  selectionBg: { r: 40, g: 40, b: 40 },
  selectionFg: { r: 200, g: 200, b: 200 },
  fontFamily: 'Menlo',
  fontSize: 13,
};

describe('hex', () => {
  it('formats a color as #rrggbb', () => {
    expect(hex({ r: 0, g: 255, b: 16 })).toBe('#00ff10');
  });
});

describe('themeToCssVars', () => {
  it('maps core values to CSS variables', () => {
    const vars = themeToCssVars(sample);
    expect(vars['--claui-bg']).toBe('#000000');
    expect(vars['--claui-fg']).toBe('#ffffff');
    expect(vars['--claui-font-family']).toBe('Menlo');
    expect(vars['--claui-font-size']).toBe('13px');
  });
});
