import * as SQLite from 'wa-sqlite';
import SQLiteAsyncModule from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';
import FlexSearch from 'flexsearch';

// Global singletons inside worker
let sqlite3: any = null;
let db: number | null = null;
let searchIndex = new FlexSearch.Document({
  document: {
    id: "id",
    index: ["content", "title", "tags"],
    store: ["path", "title"]
  },
  tokenize: "full"
});

async function initDB() {
  const module = await SQLiteAsyncModule();
  sqlite3 = SQLite.Factory(module);
  
  const vfs = new IDBBatchAtomicVFS('notrix-metadata');
  sqlite3.vfs_register(vfs, true);
  
  db = await sqlite3.open_v2(
    'notrix',
    SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
    vfs.name
  );
  
  // Create tables for metadata
  await exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT,
      updated_at TEXT,
      folder TEXT
    );
  `);
  
  await exec(`
    CREATE TABLE IF NOT EXISTS properties (
      file_path TEXT,
      key TEXT,
      value TEXT,
      type TEXT,
      PRIMARY KEY(file_path, key),
      FOREIGN KEY(file_path) REFERENCES files(path) ON DELETE CASCADE
    );
  `);
  
  await exec(`
    CREATE TABLE IF NOT EXISTS tags (
      file_path TEXT,
      tag TEXT,
      PRIMARY KEY(file_path, tag),
      FOREIGN KEY(file_path) REFERENCES files(path) ON DELETE CASCADE
    );
  `);
}

async function exec(sql: string, bindings?: any[]) {
  if (!db || !sqlite3) return [];
  const results: any[] = [];
  
  for await (const stmt of sqlite3.statements(db, sql)) {
    if (bindings) {
      sqlite3.bind_collection(stmt, bindings);
    }
    
    const columns = sqlite3.column_names(stmt);
    while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
      const row = sqlite3.row(stmt);
      const obj: any = {};
      columns.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      results.push(obj);
    }
  }
  return results;
}

// Ensure the db is initialized before doing anything
let initPromise: Promise<void> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, id, data } = e.data;
  
  try {
    if (type === 'INIT') {
      if (!initPromise) initPromise = initDB();
      await initPromise;
      self.postMessage({ type: 'SUCCESS', id });
      return;
    }
    
    await initPromise;
    
    if (type === 'EXEC') {
      const { sql, bindings } = data;
      const res = await exec(sql, bindings);
      self.postMessage({ type: 'SUCCESS', id, data: res });
    } 
    else if (type === 'INDEX_FILE') {
      const { path, metadata, content } = data;
      const title = metadata?.title || path.split('/').pop()?.replace('.md', '') || path;
      const folder = path.split('/').slice(0, -1).join('/') || '/';
      
      await exec('BEGIN TRANSACTION');
      
      // Update files table
      await exec(`
        INSERT INTO files (path, title, created_at, updated_at, folder) 
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET 
          title=excluded.title,
          updated_at=excluded.updated_at,
          folder=excluded.folder
      `, [
        path, 
        title, 
        metadata?.date || new Date().toISOString(), 
        new Date().toISOString(),
        folder
      ]);
      
      // Update properties
      await exec(`DELETE FROM properties WHERE file_path = ?`, [path]);
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          if (k === 'tags' || k === 'tag') continue;
          const val = typeof v === 'string' ? v : JSON.stringify(v);
          await exec(`INSERT INTO properties (file_path, key, value, type) VALUES (?, ?, ?, ?)`, [path, k, val, typeof v]);
        }
      }
      
      // Update tags
      await exec(`DELETE FROM tags WHERE file_path = ?`, [path]);
      const rawTags = metadata?.tags || metadata?.tag || [];
      const tags = Array.isArray(rawTags) ? rawTags : [rawTags];
      for (const tag of tags) {
        if (typeof tag === 'string') {
          // Store both nested and flat if needed, but for now store as is.
          await exec(`INSERT INTO tags (file_path, tag) VALUES (?, ?)`, [path, tag]);
        }
      }
      
      await exec('COMMIT');
      
      // Update Flexsearch index
      searchIndex.add({
        id: path,
        title,
        tags: tags.join(' '),
        content
      });
      
      self.postMessage({ type: 'SUCCESS', id });
    }
    else if (type === 'DELETE_FILE') {
      const { path } = data;
      await exec(`DELETE FROM files WHERE path = ?`, [path]);
      searchIndex.remove(path);
      self.postMessage({ type: 'SUCCESS', id });
    }
    else if (type === 'SEARCH') {
      const { query } = data;
      const results = searchIndex.search(query, 50, { enrich: true });
      self.postMessage({ type: 'SUCCESS', id, data: results });
    }
    
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', id, error: err.message });
  }
};
