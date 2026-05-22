import { describe, it, expect } from 'vitest';
import { themeToXterm } from './xtermTheme';
import type { Theme } from '../theme/themeStore';

const sample: Theme = {
  background: { r: 0, g: 0, b: 0 },
  foreground: { r: 255, g: 255, b: 255 },
  palette: Array.from({ length: 16 }, (_, i) => ({ r: i, g: 0, b: 0 })),
  cursorColor: { r: 10, g: 20, b: 30 },
  cursorStyle: 'bar',
  selectionBg: { r: 40, g: 40, b: 40 },
  selectionFg: { r: 200, g: 200, b: 200 },
  fontFamily: 'Menlo',
  fontSize: 14,
};

describe('themeToXterm', () => {
  it('builds an xterm ITheme with all 16 ANSI colors', () => {
    const cfg = themeToXterm(sample);
    expect(cfg.theme.background).toBe('#000000');
    expect(cfg.theme.foreground).toBe('#ffffff');
    expect(cfg.theme.cursor).toBe('#0a141e');
    expect(cfg.theme.black).toBe('#000000');
    expect(cfg.theme.brightWhite).toBe('#0f0000');
    expect(cfg.fontFamily).toBe('"Menlo", Menlo, monospace');
    expect(cfg.fontSize).toBe(14);
    expect(cfg.cursorStyle).toBe('bar');
  });

  it('quotes the family and appends a monospace fallback chain', () => {
    const cfg = themeToXterm({ ...sample, fontFamily: 'MonaspiceKr Nerd Font' });
    expect(cfg.fontFamily).toBe('"MonaspiceKr Nerd Font", Menlo, monospace');
  });
});
