declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    name: string;
    constructor(name: string);
    close(): Promise<void>;
  }
}
