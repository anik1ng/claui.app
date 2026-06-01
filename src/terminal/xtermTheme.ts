import type { ITheme } from '@xterm/xterm';
import { hex, type CursorStyle, type Theme } from '../theme/themeStore';

export interface XtermConfig {
  theme: ITheme;
  fontFamily: string;
  fontSize: number;
  cursorStyle: CursorStyle;
  lineHeight: number;
  letterSpacing: number;
}

/**
 * Build the xterm.js `fontFamily` string.
 *
 * `Theme.fontFamily` is the CSS value that also ends up in
 * `--claui-font-mono`, so it carries its own fallback chain
 * (e.g. `'Monaspace Neon', Menlo, monospace`). We insert the icon
 * family RIGHT AFTER the primary face — not at the end — because
 * WKWebView's per-glyph fallback can hand PUA codepoints to Menlo's
 * `.notdef` glyph before reaching a font further down the chain. Order
 * matters: primary → icon → safety net.
 *
 * Output shape for the default theme:
 *   `'Monaspace Neon', "Monaspace Neon NF", Menlo, monospace`
 */
function fontFamilyChain(configured: string, iconFamily: string): string {
  const bare = configured.trim();
  const icon = `"${iconFamily}"`;
  if (!bare) return `${icon}, Menlo, monospace`;
  const firstComma = bare.indexOf(',');
  if (firstComma === -1) {
    return `${bare}, ${icon}, Menlo, monospace`;
  }
  const primary = bare.slice(0, firstComma);
  const rest = bare.slice(firstComma + 1).trim();
  return `${primary}, ${icon}, ${rest}`;
}

/**
 * Strip optional alpha from a Color before serialising. xterm.js's
 * ITheme accepts `#rrggbbaa` only for `selectionBackground`; every other
 * colour field (background, foreground, cursor, all 16 ANSI entries)
 * must be opaque. We force opacity here at the boundary so a Theme
 * carrying a stray `a:` value can't silently break the terminal palette.
 */
const opaque = (c: { r: number; g: number; b: number }): string =>
  hex({ r: c.r, g: c.g, b: c.b });

/** Pure: map a claui Theme to xterm.js Terminal options. */
export function themeToXterm(theme: Theme): XtermConfig {
  const p = theme.palette;
  return {
    theme: {
      background: opaque(theme.background),
      foreground: opaque(theme.foreground),
      cursor: opaque(theme.cursorColor),
      selectionBackground: hex(theme.selectionBg),
      selectionForeground: opaque(theme.selectionFg),
      black: opaque(p[0]),
      red: opaque(p[1]),
      green: opaque(p[2]),
      yellow: opaque(p[3]),
      blue: opaque(p[4]),
      magenta: opaque(p[5]),
      cyan: opaque(p[6]),
      white: opaque(p[7]),
      brightBlack: opaque(p[8]),
      brightRed: opaque(p[9]),
      brightGreen: opaque(p[10]),
      brightYellow: opaque(p[11]),
      brightBlue: opaque(p[12]),
      brightMagenta: opaque(p[13]),
      brightCyan: opaque(p[14]),
      brightWhite: opaque(p[15]),
    },
    fontFamily: fontFamilyChain(theme.fontFamily, theme.iconFontFamily),
    fontSize: theme.fontSize,
    cursorStyle: theme.cursorStyle,
    lineHeight: theme.lineHeight,
    letterSpacing: theme.letterSpacing,
  };
}
