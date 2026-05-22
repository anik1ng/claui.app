import type { ITheme } from '@xterm/xterm';
import { hex, type CursorStyle, type Theme } from '../theme/themeStore';

export interface XtermConfig {
  theme: ITheme;
  fontFamily: string;
  fontSize: number;
  cursorStyle: CursorStyle;
}

/**
 * Build the xterm.js `fontFamily` string. The webview resolves fonts
 * differently from a native terminal — the family from the Ghostty config
 * may not exist here. Strip any quotes the config carried, quote the family
 * cleanly, and append a monospace fallback chain so the terminal never
 * renders a proportional font when the configured family is unavailable.
 */
function fontFamilyChain(configured: string): string {
  const bare = configured.replace(/^["']+|["']+$/g, '').trim();
  return bare ? `"${bare}", Menlo, monospace` : 'Menlo, monospace';
}

/** Pure: map a claui Theme to xterm.js Terminal options. */
export function themeToXterm(theme: Theme): XtermConfig {
  const p = theme.palette;
  return {
    theme: {
      background: hex(theme.background),
      foreground: hex(theme.foreground),
      cursor: hex(theme.cursorColor),
      selectionBackground: hex(theme.selectionBg),
      selectionForeground: hex(theme.selectionFg),
      black: hex(p[0]),
      red: hex(p[1]),
      green: hex(p[2]),
      yellow: hex(p[3]),
      blue: hex(p[4]),
      magenta: hex(p[5]),
      cyan: hex(p[6]),
      white: hex(p[7]),
      brightBlack: hex(p[8]),
      brightRed: hex(p[9]),
      brightGreen: hex(p[10]),
      brightYellow: hex(p[11]),
      brightBlue: hex(p[12]),
      brightMagenta: hex(p[13]),
      brightCyan: hex(p[14]),
      brightWhite: hex(p[15]),
    },
    fontFamily: fontFamilyChain(theme.fontFamily),
    fontSize: theme.fontSize,
    cursorStyle: theme.cursorStyle,
  };
}
