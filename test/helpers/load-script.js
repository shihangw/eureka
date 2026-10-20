import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * Creates a console that records messages without printing them, so tests can
 * assert on log output without polluting their own output.
 * @returns {{ entries: unknown[][], log: Function, warn: Function, error: Function }}
 */
export function createSilentConsole() {
  const entries = [];
  return {
    entries,
    log: (...args) => entries.push(['log', ...args]),
    warn: (...args) => entries.push(['warn', ...args]),
    error: (...args) => entries.push(['error', ...args]),
  };
}

/**
 * Evaluates a browser-style script inside a fresh sandbox.
 * Top-level `function` declarations become properties of the returned context,
 * so tests can exercise them directly.
 * @param {string} filePath Path relative to this file.
 * @param {Record<string, unknown>} sandbox Globals the script needs.
 * @returns {vm.Context} The context the script ran in.
 */
export function loadScript(filePath, sandbox = {}) {
  const source = readFileSync(new URL(filePath, import.meta.url), 'utf8');
  const context = vm.createContext({ console: createSilentConsole(), ...sandbox });
  vm.runInContext(source, context, { filename: filePath });
  return context;
}
