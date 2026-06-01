import { describe, it, expect } from 'vitest';
import { hex, themeToCssVars, type Theme } from './themeStore';

const sample: Theme = {
  background: { r: 0, g: 0, b: 0 },
  bgElevated: { r: 16, g: 16, b: 16 },
  foreground: { r: 255, g: 255, b: 255 },
  fgDim: { r: 128, g: 128, b: 128 },
  divider: { r: 255, g: 255, b: 255, a: 20 },
  hover: { r: 255, g: 255, b: 255, a: 12 },
  active: { r: 255, g: 255, b: 255, a: 26 },
  accent: { r: 0, g: 112, b: 243 },
  accentForeground: { r: 255, g: 255, b: 255 },
  palette: Array.from({ length: 16 }, (_, i) => ({ r: i, g: i, b: i })),
  cursorColor: { r: 10, g: 20, b: 30 },
  cursorStyle: 'block',
  selectionBg: { r: 40, g: 40, b: 40, a: 51 },
  selectionFg: { r: 200, g: 200, b: 200 },
  fontFamily: "'Monaspace Neon', Menlo, monospace",
  uiFontFamily: 'Geist, sans-serif',
  iconFontFamily: 'Monaspace Neon NF',
  fontSize: 13,
  lineHeight: 1.25,
  letterSpacing: 0,
};

describe('hex', () => {
  it('formats an opaque colour as #rrggbb', () => {
    expect(hex({ r: 0, g: 255, b: 16 })).toBe('#00ff10');
  });
  it('appends alpha as #rrggbbaa when present and below 255', () => {
    expect(hex({ r: 255, g: 255, b: 255, a: 20 })).toBe('#ffffff14');
  });
  it('omits the alpha byte when a === 255 (opaque-equivalent)', () => {
    // xterm.js rejects #rrggbbff for palette/background/cursor fields,
    // so we collapse a fully-opaque alpha to the 6-digit form.
    expect(hex({ r: 0, g: 0, b: 0, a: 255 })).toBe('#000000');
  });
});

describe('themeToCssVars', () => {
  it('maps core values to CSS variables', () => {
    const vars = themeToCssVars(sample);
    expect(vars['--claui-bg']).toBe('#000000');
    expect(vars['--claui-bg-elevated']).toBe('#101010');
    expect(vars['--claui-fg']).toBe('#ffffff');
    expect(vars['--claui-fg-dim']).toBe('#808080');
    expect(vars['--claui-divider']).toBe('#ffffff14');
    expect(vars['--claui-hover']).toBe('#ffffff0c');
    expect(vars['--claui-active']).toBe('#ffffff1a');
    expect(vars['--claui-accent']).toBe('#0070f3');
    expect(vars['--claui-accent-fg']).toBe('#ffffff');
    expect(vars['--claui-font-mono']).toBe("'Monaspace Neon', Menlo, monospace");
    expect(vars['--claui-font-ui']).toBe('Geist, sans-serif');
    expect(vars['--claui-font-size']).toBe('13px');
  });
});
