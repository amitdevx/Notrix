import { extractLinks } from '../markdown';
import { OPFSClient } from '../opfs';

export interface GraphNode {
  path: string;
  links: string[]; // outgoing links
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  backlinks: Map<string, Set<string>>;
}

export class Indexer {
  private graph: Graph = {
    nodes: new Map(),
    backlinks: new Map(),
  };

  private worker: Worker;
  private pending: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private nextId = 1;

  constructor(private opfs: OPFSClient, workerOrUrl: string | Worker = '/indexer.worker.js') {
    if (typeof workerOrUrl === 'string') {
      this.worker = new Worker(workerOrUrl);
    } else {
      this.worker = workerOrUrl;
    }
    
    this.worker.onmessage = (e: MessageEvent) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.type === 'SUCCESS') p.resolve(res.data);
      else p.reject(new Error(res.error));
    };
  }

  private parseInWorker(path: string, content: string): Promise<{ path: string; links: string[]; metadata: any }> {
    const id = (this.nextId++).toString();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type: 'PARSE', path, content });
    });
  }

  async buildIndex() {
    this.graph.nodes.clear();
    this.graph.backlinks.clear();
    
    const traverse = async (dirPath: string) => {
      const files = await this.opfs.listDirectory(dirPath);
      for (const file of files) {
        const fullPath = `${dirPath === '/' ? '' : dirPath}/${file.name}`;
        if (file.kind === 'file' && file.name.endsWith('.md')) {
          await this.indexFile(fullPath);
        } else if (file.kind === 'directory') {
          await traverse(fullPath);
        }
      }
    };
    
    await traverse('/');
  }

  async indexFile(path: string) {
    try {
      const content = await this.opfs.readFile(path);
      const data = await this.parseInWorker(path, content);
      
      const outgoing = data.links;
      this.graph.nodes.set(path, { path, links: outgoing });
      this.rebuildBacklinks();

      // Store in sqlite and flexsearch
      try {
        const { DBClient } = await import('../db');
        const db = DBClient.getInstance();
        await db.indexFile(path, data.metadata, content);
      } catch (e) {
        console.warn('DBClient not available for indexing', e);
      }

    } catch (err) {
      console.error(`Failed to index file ${path}`, err);
    }
  }

  async removeFile(path: string) {
    this.graph.nodes.delete(path);
    this.rebuildBacklinks();
    
    try {
      const { DBClient } = await import('../db');
      const db = DBClient.getInstance();
      await db.deleteFile(path);
    } catch (e) {
      console.warn('DBClient not available for deletion', e);
    }
  }

  private rebuildBacklinks() {
    this.graph.backlinks.clear();
    for (const [sourcePath, node] of this.graph.nodes.entries()) {
      for (const targetLink of node.links) {
        // Find which node path matches the targetLink (case-insensitive filename match is standard)
        // For simplicity, just use the raw link string as the target key for now
        if (!this.graph.backlinks.has(targetLink)) {
          this.graph.backlinks.set(targetLink, new Set());
        }
        this.graph.backlinks.get(targetLink)!.add(sourcePath);
      }
    }
  }

  getBacklinks(linkTarget: string): string[] {
    // Exact match or filename match
    const paths = this.graph.backlinks.get(linkTarget);
    return paths ? Array.from(paths) : [];
  }

  getOutgoingLinks(path: string): string[] {
    return this.graph.nodes.get(path)?.links || [];
  }

  getGraphData(): { nodes: { id: string; label: string; size: number }[]; edges: { source: string; target: string }[] } {
    const nodes = Array.from(this.graph.nodes.keys()).map(path => ({
      id: path,
      label: path.split('/').pop() || path,
      size: 5 + (this.graph.backlinks.get(path.replace(/^\//, '').replace(/\.md$/, ''))?.size || 0)
    }));

    const edges: { source: string; target: string }[] = [];
    for (const [sourcePath, node] of this.graph.nodes.entries()) {
      for (const targetLink of node.links) {
        const potentialTarget = '/' + targetLink + '.md';
        if (this.graph.nodes.has(potentialTarget)) {
          edges.push({ source: sourcePath, target: potentialTarget });
        } else if (this.graph.nodes.has('/' + targetLink)) {
          edges.push({ source: sourcePath, target: '/' + targetLink });
        } else {
          // Unresolved links can still be added as nodes if desired, but we'll skip for now to keep graph clean
        }
      }
    }
    return { nodes, edges };
  }
}
