export type OPFSRequest =
  | { type: 'CREATE'; id: string; path: string; content: string }
  | { type: 'READ'; id: string; path: string }
  | { type: 'UPDATE'; id: string; path: string; content: string }
  | { type: 'DELETE'; id: string; path: string }
  | { type: 'RENAME'; id: string; oldPath: string; newPath: string }
  | { type: 'LIST'; id: string; path: string };

export type OPFSResponse =
  | { type: 'SUCCESS'; id: string; data?: any }
  | { type: 'ERROR'; id: string; error: string };

export interface FileMetadata {
  name: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
}
