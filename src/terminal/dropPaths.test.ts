import { describe, expect, it } from 'vitest';
import { formatDroppedPaths } from './dropPaths';

describe('formatDroppedPaths', () => {
  it('returns an empty string for no paths', () => {
    expect(formatDroppedPaths([])).toBe('');
  });

  it('single-quotes a path and appends a trailing space', () => {
    expect(formatDroppedPaths(['/Users/x/file.png'])).toBe("'/Users/x/file.png' ");
  });

  it('single-quotes a path containing a space (no special shell handling needed)', () => {
    expect(formatDroppedPaths(['/Users/x/my file.png'])).toBe("'/Users/x/my file.png' ");
  });

  it('joins multiple paths with single spaces', () => {
    expect(formatDroppedPaths(['/a/b.txt', '/c/d.txt'])).toBe("'/a/b.txt' '/c/d.txt' ");
  });

  it('neutralizes shell command substitution via single quotes', () => {
    // Double-quoting would let $(...) expand in a shell tab; single quotes don't.
    expect(formatDroppedPaths(['/tmp/$(whoami).txt'])).toBe("'/tmp/$(whoami).txt' ");
  });

  it('escapes an embedded single quote with the POSIX dance', () => {
    expect(formatDroppedPaths(["/a/b'c.txt"])).toBe("'/a/b'\\''c.txt' ");
  });

  it('rejects a path containing a newline (tty line injection)', () => {
    expect(formatDroppedPaths(['/tmp/evil\nrm -rf ~'])).toBe('');
  });

  it('rejects a path containing a control char (e.g. BEL)', () => {
    expect(formatDroppedPaths(['/tmp/a\x07b'])).toBe('');
  });

  it('keeps the safe paths and drops only the unsafe ones', () => {
    expect(formatDroppedPaths(['/a/b.txt', '/tmp/x\ny'])).toBe("'/a/b.txt' ");
  });
});
