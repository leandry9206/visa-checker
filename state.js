import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STATE_PATH = new URL('./state.json', import.meta.url);

export function readState() {
  if (!existsSync(STATE_PATH)) return {};
  const raw = readFileSync(STATE_PATH, 'utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function writeState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}
