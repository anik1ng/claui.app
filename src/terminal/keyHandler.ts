/**
 * Pure predicate: does this KeyboardEvent represent a plain Shift+Enter we
 * should intercept and translate to a bare LF in the PTY? Excludes:
 *  - non-keydown events — xterm.js also calls custom handlers on keyup
 *    (CoreBrowserTerminal.ts:1122) and keypress (line 1149); only keydown
 *    is the spec-defined point to cancel the default `\r` emit
 *  - other-modifier combos — Ctrl+Shift+Enter, Cmd+Shift+Enter, etc. keep
 *    xterm.js's default handling (Alt-prefixed Enter sends ESC+CR, the
 *    rest fall through to plain CR)
 *  - keydowns inside an active IME composition — commit/cancel of CJK or
 *    accented input is the IME's job; stealing the Enter there desyncs the
 *    composition buffer from what the TUI sees
 */
export function isShiftEnterTrigger(e: KeyboardEvent): boolean {
  return e.type === 'keydown'
    && e.key === 'Enter'
    && e.shiftKey
    && !e.isComposing
    && !e.ctrlKey
    && !e.metaKey
    && !e.altKey;
}
