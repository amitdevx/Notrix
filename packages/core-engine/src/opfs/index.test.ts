import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OPFSClient } from './index';

describe('OPFSClient', () => {
  let mockWorker: Worker;
  let client: OPFSClient;

  beforeEach(() => {
    mockWorker = {
      postMessage: vi.fn(),
      onmessage: null,
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onerror: null,
      onmessageerror: null,
    } as unknown as Worker;
    client = new OPFSClient(mockWorker);
  });

  it('should send a CREATE request and resolve when worker responds', async () => {
    const promise = client.createFile('/test.md', 'hello');
    
    // Simulate worker receiving message and replying
    const postedMsg = (mockWorker.postMessage as any).mock.calls[0][0];
    expect(postedMsg.type).toBe('CREATE');
    expect(postedMsg.path).toBe('/test.md');
    expect(postedMsg.content).toBe('hello');
    expect(postedMsg.id).toBeDefined();

    // Trigger response
    if (mockWorker.onmessage) {
      mockWorker.onmessage({ data: { type: 'SUCCESS', id: postedMsg.id, data: true } } as MessageEvent);
    }

    const result = await promise;
    expect(result).toBe(true);
  });

  it('should emit events on file creation', async () => {
    const listener = vi.fn();
    client.subscribe(listener);

    const promise = client.createFile('/new.md', 'content');
    const postedMsg = (mockWorker.postMessage as any).mock.calls[0][0];
    
    if (mockWorker.onmessage) {
      mockWorker.onmessage({ data: { type: 'SUCCESS', id: postedMsg.id, data: true } } as MessageEvent);
    }
    
    await promise;
    expect(listener).toHaveBeenCalledWith({ type: 'create', path: '/new.md' });
  });

  it('should reject if worker sends an error', async () => {
    const promise = client.readFile('/unknown.md');
    const postedMsg = (mockWorker.postMessage as any).mock.calls[0][0];
    
    if (mockWorker.onmessage) {
      mockWorker.onmessage({ data: { type: 'ERROR', id: postedMsg.id, error: 'Not found' } } as MessageEvent);
    }
    
    await expect(promise).rejects.toThrow('Not found');
  });
});
