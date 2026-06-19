import { extractLinks, extractMetadata } from '../markdown';
import { GraphNode, Graph } from './index';

self.onmessage = (e: MessageEvent) => {
  const { id, type, path, content } = e.data;
  
  if (type === 'PARSE') {
    try {
      const links = extractLinks(content);
      const metadata = extractMetadata(content);
      self.postMessage({ id, type: 'SUCCESS', data: { path, links, metadata } });
    } catch (err: any) {
      self.postMessage({ id, type: 'ERROR', error: err.message });
    }
  }
};
