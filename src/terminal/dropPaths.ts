/** True if the string contains any C0 control char or DEL. Such a path must
 *  never be typed into a PTY: a newline/CR is a line submission to the tty's
 *  line discipline (executed before the shell even parses quotes), and other
 *  control bytes can drive terminal escapes. We reject these paths outright
 *  rather than try to escape them. Checked by code point so no literal control
 *  characters appear in this source file. */
function hasControlChar(path: string): boolean {
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** POSIX single-quote escaping: wrap in single quotes and replace every
 *  embedded `'` with `'\''`. Unlike double quotes, single quotes suppress
 *  ALL shell expansion (`$(...)`, backticks, `$VAR`), so a maliciously named
 *  dropped file cannot inject commands into a shell tab. */
function shellQuote(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`;
}

/**
 * Turn dropped absolute paths into the text inserted at a terminal prompt.
 * Each path is single-quoted (POSIX-escaped) so spaces and shell metacharacters
 * are inert, joined by single spaces, with a trailing space separating the
 * insertion from the next token. Paths containing control characters are
 * dropped — they can't be safely typed into a tty. Returns '' when nothing
 * safe remains.
 */
export function formatDroppedPaths(paths: string[]): string {
  const safe = paths.filter((p) => p.length > 0 && !hasControlChar(p));
  if (safe.length === 0) return '';
  return `${safe.map(shellQuote).join(' ')} `;
}
