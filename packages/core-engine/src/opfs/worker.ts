import { OPFSRequest, OPFSResponse, FileMetadata } from './types';

async function getDirectoryHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
  let dirHandle = await navigator.storage.getDirectory();
  if (path === '' || path === '/') return dirHandle;
  
  const parts = path.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    dirHandle = await dirHandle.getDirectoryHandle(parts[i], { create });
  }
  return dirHandle;
}

async function handleRequest(req: OPFSRequest): Promise<any> {
  switch (req.type) {
    case 'CREATE':
    case 'UPDATE': {
      const parts = req.path.split('/').filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) throw new Error('Invalid path');
      const dirPath = parts.join('/');
      
      const dirHandle = await getDirectoryHandle(dirPath, true);
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(req.content);
      await writable.close();
      return true;
    }
    case 'READ': {
      const parts = req.path.split('/').filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) throw new Error('Invalid path');
      const dirPath = parts.join('/');
      
      const dirHandle = await getDirectoryHandle(dirPath, false);
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    }
    case 'DELETE': {
      const parts = req.path.split('/').filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) throw new Error('Invalid path');
      const dirPath = parts.join('/');
      
      const dirHandle = await getDirectoryHandle(dirPath, false);
      await dirHandle.removeEntry(fileName);
      return true;
    }
    case 'RENAME': {
      const oldParts = req.oldPath.split('/').filter(Boolean);
      const oldFileName = oldParts.pop();
      if (!oldFileName) throw new Error('Invalid old path');
      
      const newParts = req.newPath.split('/').filter(Boolean);
      const newFileName = newParts.pop();
      if (!newFileName) throw new Error('Invalid new path');
      
      const oldDirHandle = await getDirectoryHandle(oldParts.join('/'), false);
      const fileHandle = await oldDirHandle.getFileHandle(oldFileName, { create: false });
      
      const newDirHandle = await getDirectoryHandle(newParts.join('/'), true);
      // Wait, native OPFS doesn't support fileHandle.move() widely yet, but some browsers do.
      // A fallback is reading and rewriting, but let's try the modern way first.
      try {
        // @ts-ignore
        await fileHandle.move(newDirHandle, newFileName);
      } catch(e) {
        // Fallback
        const file = await fileHandle.getFile();
        const content = await file.arrayBuffer();
        const newFileHandle = await newDirHandle.getFileHandle(newFileName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        await oldDirHandle.removeEntry(oldFileName);
      }
      return true;
    }
    case 'LIST': {
      const dirHandle = await getDirectoryHandle(req.path, false);
      const entries: FileMetadata[] = [];
      // @ts-ignore
      for await (const [name, handle] of dirHandle.entries()) {
        entries.push({ name, kind: handle.kind });
      }
      return entries;
    }
    default:
      throw new Error(`Unknown request type: ${(req as any).type}`);
  }
}

self.onmessage = async (e: MessageEvent<OPFSRequest>) => {
  const req = e.data;
  try {
    const data = await handleRequest(req);
    self.postMessage({ type: 'SUCCESS', id: req.id, data } as OPFSResponse);
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', id: req.id, error: err.message } as OPFSResponse);
  }
};
