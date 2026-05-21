// comm-stream.ts
import type { CommLogRow } from "./db.ts";

type Listener = (row: CommLogRow) => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function publish(row: CommLogRow): void {
  for (const fn of listeners) {
    try {
      fn(row);
    } catch (e) {
      console.error("[comm-stream] listener threw:", e);
    }
  }
}
