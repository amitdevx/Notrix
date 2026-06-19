import { OPFSRequest, OPFSResponse, FileMetadata } from './types';

interface OPFSEvent {
  type: string;
  path: string;
}

export class OPFSClient {
  private worker: Worker;
  private pending: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private nextId = 1;
  private listeners: Set<(event: OPFSEvent) => void> = new Set();
  private channel: BroadcastChannel;

  constructor(worker: Worker) {
    this.worker = worker;
    this.channel = new BroadcastChannel('notrix-opfs-sync');
    
    this.worker.onmessage = (e: MessageEvent<OPFSResponse>) => {
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

    this.channel.onmessage = (e: MessageEvent) => {
      // Receive cross-tab events
      this.emit(e.data);
    };
  }

  private sendRequest<T>(req: any): Promise<T> {
    const id = (this.nextId++).toString();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  private broadcast(event: OPFSEvent) {
    this.emit(event);
    this.channel.postMessage(event);
  }

  async createFile(path: string, content: string): Promise<boolean> {
    const res = await this.sendRequest<boolean>({ type: 'CREATE', path, content });
    this.broadcast({ type: 'create', path });
    return res;
  }

  async readFile(path: string): Promise<string> {
    return this.sendRequest({ type: 'READ', path });
  }

  async updateFile(path: string, content: string): Promise<boolean> {
    const res = await this.sendRequest<boolean>({ type: 'UPDATE', path, content });
    this.broadcast({ type: 'update', path });
    return res;
  }

  async deleteFile(path: string): Promise<boolean> {
    const res = await this.sendRequest<boolean>({ type: 'DELETE', path });
    this.broadcast({ type: 'delete', path });
    return res;
  }

  async renameFile(oldPath: string, newPath: string): Promise<boolean> {
    const res = await this.sendRequest<boolean>({ type: 'RENAME', oldPath, newPath });
    this.broadcast({ type: 'rename', path: newPath });
    return res;
  }

  async listDirectory(path: string): Promise<FileMetadata[]> {
    return this.sendRequest({ type: 'LIST', path });
  }

  subscribe(callback: (event: { type: string, path: string }) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: { type: string, path: string }) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
