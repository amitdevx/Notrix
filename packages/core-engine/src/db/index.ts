export class DBClient {
  private worker: Worker;
  private pending: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private nextId = 1;
  private initPromise: Promise<void>;
  
  static instance: DBClient | null = null;
  
  static getInstance(): DBClient {
    if (!DBClient.instance) {
      // In SSR or non-browser environments, use a dummy worker or throw
      if (typeof window === 'undefined') {
        throw new Error('DBClient can only be instantiated in the browser');
      }
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      DBClient.instance = new DBClient(worker);
    }
    return DBClient.instance;
  }

  constructor(worker: Worker) {
    this.worker = worker;
    
    this.worker.onmessage = (e: MessageEvent) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      
      if (res.type === 'SUCCESS') {
        p.resolve(res.data);
      } else {
        p.reject(new Error(res.error));
      }
    };
    
    this.initPromise = this.sendRequest<void>({ type: 'INIT' });
  }

  private sendRequest<T>(req: any): Promise<T> {
    const id = (this.nextId++).toString();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  async exec(sql: string, bindings?: any[]): Promise<any[]> {
    await this.initPromise;
    return this.sendRequest({ type: 'EXEC', data: { sql, bindings } });
  }

  async indexFile(path: string, metadata: any, content: string): Promise<void> {
    await this.initPromise;
    return this.sendRequest({ type: 'INDEX_FILE', data: { path, metadata, content } });
  }

  async deleteFile(path: string): Promise<void> {
    await this.initPromise;
    return this.sendRequest({ type: 'DELETE_FILE', data: { path } });
  }

  async search(query: string): Promise<any[]> {
    await this.initPromise;
    return this.sendRequest({ type: 'SEARCH', data: { query } });
  }

  async getTags(): Promise<string[]> {
    const results = await this.exec(`SELECT DISTINCT tag FROM tags ORDER BY tag ASC`);
    return results.map(r => r.tag);
  }

  async getFilesByTag(tag: string): Promise<any[]> {
    return this.exec(`
      SELECT f.* FROM files f
      JOIN tags t ON f.path = t.file_path
      WHERE t.tag = ?
    `, [tag]);
  }
}
