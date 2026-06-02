import { describe, it, expect } from 'vitest';
import { themeToXterm } from './xtermTheme';
import type { Theme } from '../theme/themeStore';

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
  notifyDone: { r: 0x00, g: 0x70, b: 0xf3 },
  notifyAttention: { r: 0xff, g: 0x99, b: 0x0a },
  notifyError: { r: 0xda, g: 0x30, b: 0x36 },
  palette: Array.from({ length: 16 }, (_, i) => ({ r: i, g: 0, b: 0 })),
  cursorColor: { r: 10, g: 20, b: 30 },
  cursorStyle: 'bar',
  selectionBg: { r: 40, g: 40, b: 40, a: 51 },
  selectionFg: { r: 200, g: 200, b: 200 },
  fontFamily: 'Menlo',
  uiFontFamily: 'Geist',
  iconFontFamily: 'Monaspace Neon NF',
  fontSize: 14,
  lineHeight: 1.25,
  letterSpacing: 0,
};

describe('themeToXterm', () => {
  it('builds an xterm ITheme with all 16 ANSI colors', () => {
    const cfg = themeToXterm(sample);
    expect(cfg.theme.background).toBe('#000000');
    expect(cfg.theme.foreground).toBe('#ffffff');
    expect(cfg.theme.cursor).toBe('#0a141e');
    expect(cfg.theme.black).toBe('#000000');
    expect(cfg.theme.brightWhite).toBe('#0f0000');
    expect(cfg.fontFamily).toBe('Menlo, "Monaspace Neon NF", Menlo, monospace');
    expect(cfg.fontSize).toBe(14);
    expect(cfg.cursorStyle).toBe('bar');
  });

  it('propagates line/letter spacing verbatim', () => {
    const cfg = themeToXterm(sample);
    expect(cfg.lineHeight).toBe(1.25);
    expect(cfg.letterSpacing).toBe(0);

    const tight = themeToXterm({ ...sample, lineHeight: 1.4, letterSpacing: 0.5 });
    expect(tight.lineHeight).toBe(1.4);
    expect(tight.letterSpacing).toBe(0.5);
  });

  it('inserts the icon family between the primary face and the rest of the chain', () => {
    const cfg = themeToXterm({
      ...sample,
      fontFamily: "'Monaspace Neon', Menlo, monospace",
      iconFontFamily: 'MonaspiceKr Nerd Font',
    });
    // The icon family must appear BEFORE Menlo so PUA codepoints reach
    // it before WKWebView routes them to Menlo's `.notdef` glyph.
    expect(cfg.fontFamily).toBe(
      "'Monaspace Neon', \"MonaspiceKr Nerd Font\", Menlo, monospace",
    );
  });

  it('emits #rrggbbaa for selectionBackground (alpha allowed)', () => {
    const cfg = themeToXterm(sample);
    expect(cfg.theme.selectionBackground).toBe('#28282833');
  });

  it('strips alpha from palette / foreground / background fields', () => {
    // Even if a Theme were authored with `a: 200` on these fields,
    // themeToXterm must hand xterm a 6-digit hex — xterm rejects alpha
    // on those fields and would fall back to its built-in palette.
    const cfg = themeToXterm({
      ...sample,
      foreground: { r: 0xed, g: 0xed, b: 0xed, a: 200 },
      background: { r: 0x0a, g: 0x0a, b: 0x0a, a: 200 },
    });
    expect(cfg.theme.foreground).toBe('#ededed');
    expect(cfg.theme.background).toBe('#0a0a0a');
  });
});
