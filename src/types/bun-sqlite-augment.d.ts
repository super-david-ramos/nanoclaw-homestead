// Augment bun:sqlite Statement so .run/.get/.all accept a plain Record for
// named bindings. The host uses @name SQL params + strict:true on the
// Database, which lets us pass `{ id: 'x', name: 'y' }`-style objects at
// runtime — but bun:sqlite's published .d.ts only types positional bindings
// for the default Statement (the named-binding overload requires a typed
// generic on .prepare<R, P>(sql) we don't want to add at every call site).
//
// This augmentation is type-system-only — no runtime change.

import 'bun:sqlite';

declare module 'bun:sqlite' {
  interface Statement<ReturnType = unknown, ParamsType extends unknown[] = unknown[]> {
    run(record: object): { lastInsertRowid: number | bigint; changes: number };
    get(record: object): ReturnType | null;
    all(record: object): ReturnType[];
    iterate(record: object): IterableIterator<ReturnType>;
  }
}
