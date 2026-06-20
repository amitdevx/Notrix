import * as Y from 'yjs';

// Generate a random encryption key (in a real app, this would be derived from user auth or shared secret)
export async function generateKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return Buffer.from(exported).toString('base64');
}

export async function importKey(keyStr: string): Promise<CryptoKey> {
  const keyBuffer = Buffer.from(keyStr, 'base64');
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptUpdate(update: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    update as unknown as BufferSource
  );
  
  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);
  return payload;
}

export async function decryptUpdate(payload: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data as unknown as BufferSource
  );
  return new Uint8Array(decrypted);
}

export class SyncClient {
  public doc: Y.Doc;
  public ytext: Y.Text;
  private ws: WebSocket | null = null;
  private key: CryptoKey;
  private roomId: string;

  constructor(roomId: string, key: CryptoKey, initialText: string = '') {
    this.roomId = roomId;
    this.key = key;
    this.doc = new Y.Doc();
    this.ytext = this.doc.getText('content');
    
    if (initialText) {
      this.doc.transact(() => {
        this.ytext.insert(0, initialText);
      });
    }
  }

  public connect(url: string = 'ws://localhost:4000') {
    this.ws = new WebSocket(`${url}?room=${this.roomId}`);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = async () => {
      // Send our initial state
      const state = Y.encodeStateAsUpdate(this.doc);
      const encrypted = await encryptUpdate(state, this.key);
      this.ws?.send(encrypted);
    };

    this.ws.onmessage = async (event) => {
      try {
        const encrypted = new Uint8Array(event.data as ArrayBuffer);
        const update = await decryptUpdate(encrypted, this.key);
        Y.applyUpdate(this.doc, update, this); // 'this' as origin to prevent echo
      } catch (e) {
        console.error('Sync error: Failed to decrypt or apply update', e);
      }
    };

    this.doc.on('update', async (update, origin) => {
      if (origin !== this && this.ws?.readyState === WebSocket.OPEN) {
        const encrypted = await encryptUpdate(update, this.key);
        this.ws.send(encrypted);
      }
    });
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
