'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OPFSClient, FileMetadata, Indexer, DBClient } from '@notrix/core-engine';
import { Editor } from '@notrix/editor';
import { BaseView } from './BaseView';

let globalOpfs: OPFSClient | null = null;
let globalIndexer: Indexer | null = null;
let opfsError: string | null = null;

if (typeof window !== 'undefined') {
  if ('storage' in navigator && 'getDirectory' in navigator.storage) {
    try {
      globalOpfs = new OPFSClient(
        new Worker(new URL('@notrix/core-engine/src/opfs/worker.ts', import.meta.url))
      );
      globalIndexer = new Indexer(
        globalOpfs,
        new Worker(new URL('@notrix/core-engine/src/indexer/worker.ts', import.meta.url))
      );
      globalIndexer.buildIndex();
    } catch {
      opfsError = 'Failed to initialize OPFS Worker.';
    }
  } else {
    opfsError = 'Your browser does not support the Origin Private File System (OPFS).';
  }
}

export function Workspace() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(opfsError);
  const [mode, setMode] = useState<'live' | 'source'>('live');
  const [graphUpdated, setGraphUpdated] = useState(0);

  const saveTimersRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    if (globalOpfs) {
      loadFiles();
      const unsubscribe = globalOpfs.subscribe((event) => {
        if (event.type === 'create' || event.type === 'update' || event.type === 'rename') {
          globalIndexer?.indexFile(event.path).then(() => setGraphUpdated(Date.now()));
        } else if (event.type === 'delete') {
          globalIndexer?.removeFile(event.path).then(() => setGraphUpdated(Date.now()));
        }

        if (event.type === 'create' || event.type === 'delete' || event.type === 'rename') {
          loadFiles();
        }
      });
      return () => {
        unsubscribe();
      };
    }
  }, []);

  const loadFiles = async () => {
    if (!globalOpfs) return;
    try {
      const list = await globalOpfs.listDirectory('/');
      setFiles(list.filter(f => f.kind === 'file'));
      
      try {
        const tags = await DBClient.getInstance().getTags();
        setTags(tags);
      } catch (e) {
        console.warn('DBClient not available for tags', e);
      }
    } catch (err: unknown) {
      console.error('Failed to list files', err);
      setError(err instanceof Error ? err.message : 'Failed to list files');
    }
  };

  const createFile = async () => {
    if (!globalOpfs) return;
    const name = prompt('File name:', 'Untitled.md');
    if (!name) return;
    await globalOpfs.createFile(`/${name}`, `# ${name.replace(/\.md$/, '')}\n\n`);
    openFile(name);
  };

  const openFile = async (name: string) => {
    if (!globalOpfs) return;
    if (!tabs.includes(name)) {
      setTabs([...tabs, name]);
    }
    setActiveTab(name);
    
    if (!(name in contentCache)) {
      const data = await globalOpfs.readFile(`/${name}`);
      setContentCache(prev => ({ ...prev, [name]: data }));
    }
  };

  const closeTab = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t !== name);
    setTabs(newTabs);
    if (activeTab === name) {
      setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1] : null);
    }
  };

  const handleEditorChange = useCallback((newContent: string) => {
    if (!activeTab || !globalOpfs) return;
    
    // Update local state immediately
    setContentCache(prev => ({ ...prev, [activeTab]: newContent }));
    
    // Debounce the actual OPFS write per tab
    if (saveTimersRef.current[activeTab]) {
      clearTimeout(saveTimersRef.current[activeTab]);
    }
    
    const tabToSave = activeTab;
    saveTimersRef.current[tabToSave] = setTimeout(async () => {
      if (globalOpfs) {
        await globalOpfs.updateFile(`/${tabToSave}`, newContent);
      }
      delete saveTimersRef.current[tabToSave];
    }, 500); // 500ms debounce
  }, [activeTab]);

  if (error) {
    return (
      <div className="flex h-screen bg-neutral-900 text-neutral-100 items-center justify-center font-sans">
        <div className="bg-neutral-800 p-8 rounded-lg max-w-md border border-red-900/50">
          <h2 className="text-xl text-red-400 mb-4 font-bold">Initialization Error</h2>
          <p className="text-neutral-300">{error}</p>
        </div>
      </div>
    );
  }

  const activeBaseName = activeTab ? activeTab.replace(/\.md$/, '') : '';
  const backlinks = globalIndexer && activeTab ? globalIndexer.getBacklinks(activeBaseName) : [];
  const outgoingLinks = globalIndexer && activeTab ? globalIndexer.getOutgoingLinks(`/${activeTab}`) : [];

  const handleLinkClick = (target: string) => {
    const normalizedTarget = target.replace(/^\//, '');
    const targetFile = normalizedTarget.endsWith('.md') ? normalizedTarget : `${normalizedTarget}.md`;
    if (files.find(f => f.name === targetFile)) {
      openFile(targetFile);
    } else {
      globalOpfs?.createFile(`/${targetFile}`, `# ${normalizedTarget.replace(/\.md$/, '')}\n\n`).then(() => {
        openFile(targetFile);
      });
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-100 font-sans">
      <div className="w-64 border-r border-neutral-800 flex flex-col bg-neutral-900 shrink-0">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
          <span className="font-bold text-sm text-neutral-300 uppercase tracking-wider">Notrix</span>
          <button onClick={createFile} className="text-neutral-400 hover:text-white" title="New File">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
        
        <div className="p-3 border-b border-neutral-800">
          <input 
            type="text" 
            placeholder="Search files..."
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            onChange={async (e) => {
              const q = e.target.value;
              if (!q) {
                loadFiles();
                return;
              }
              try {
                const db = await import('@notrix/core-engine').then(m => m.DBClient.getInstance());
                const results = await db.search(q);
                setFiles(results.map(r => ({ kind: 'file', name: (r.id as string).split('/').pop() || '' })));
              } catch (err) {
                console.error('Search failed', err);
              }
            }}
          />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-1">
            <div className="px-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 mt-2">Vault</div>
            {files.map(f => (
              <div
                key={f.name}
                className={`p-2 text-sm cursor-pointer rounded flex items-center transition-colors ${activeTab === f.name ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}`}
                onClick={() => openFile(f.name)}
              >
                <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span className="truncate">{f.name}</span>
              </div>
            ))}
            {files.length === 0 && (
              <div className="px-4 py-2 text-xs text-neutral-600 text-center">
                No files found
              </div>
            )}
          </div>
          
          <div className="mt-4 p-2 space-y-1 border-t border-neutral-800">
            <div className="px-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 mt-2">Tags</div>
            {tags.length > 0 ? tags.map(tag => (
              <button 
                key={tag}
                onClick={async () => {
                  try {
                    const db = await import('@notrix/core-engine').then(m => m.DBClient.getInstance());
                    const results = await db.getFilesByTag(tag);
                    setFiles(results.map(f => ({ kind: 'file', name: (f.path as string).split('/').pop() || '' })));
                  } catch (e) {
                    console.error('Failed to filter by tag', e);
                  }
                }}
                className="w-full text-left px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 rounded flex items-center transition-colors"
              >
                <span className="mr-2 opacity-50">#</span>
                {tag}
              </button>
            )) : (
              <div className="px-4 py-2 text-neutral-500 italic text-sm">No tags yet.</div>
            )}
          </div>
        </div>

        {/* Context Panels */}
        <div className="flex-1 overflow-auto border-t border-neutral-800 bg-neutral-900 flex flex-col" data-update={graphUpdated}>
          <div className="p-3 border-b border-neutral-800 bg-neutral-800/50">
            <span className="font-bold text-xs text-neutral-400 uppercase tracking-wider">Backlinks</span>
          </div>
          <div className="p-2 flex-1 overflow-auto">
            {backlinks.length > 0 ? backlinks.map(b => (
              <div key={b} className="p-2 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer rounded mb-1" onClick={() => handleLinkClick(b)}>
                <span className="text-blue-400">[[</span>{b.replace(/^\//, '').replace(/\.md$/, '')}<span className="text-blue-400">]]</span>
              </div>
            )) : <div className="p-2 text-xs text-neutral-600">No backlinks</div>}
          </div>
          
          <div className="p-3 border-b border-t border-neutral-800 bg-neutral-800/50">
            <span className="font-bold text-xs text-neutral-400 uppercase tracking-wider">Outgoing Links</span>
          </div>
          <div className="p-2 flex-1 overflow-auto">
            {outgoingLinks.length > 0 ? outgoingLinks.map(l => (
              <div key={l} className="p-2 text-xs text-neutral-300 hover:bg-neutral-800 cursor-pointer rounded mb-1" onClick={() => handleLinkClick(l)}>
                <span className="text-purple-400">[[</span>{l}<span className="text-purple-400">]]</span>
              </div>
            )) : <div className="p-2 text-xs text-neutral-600">No outgoing links</div>}
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
        {tabs.length > 0 && (
          <div className="flex border-b border-neutral-800 bg-neutral-900 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <div 
                key={tab}
                className={`flex items-center px-4 py-2 border-r border-neutral-800 cursor-pointer min-w-max text-sm transition-colors ${activeTab === tab ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'}`}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tab}</span>
                <button 
                  onClick={(e) => closeTab(e, tab)}
                  className="ml-2 text-neutral-500 hover:text-white rounded-full p-0.5 hover:bg-neutral-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Editor Toolbar */}
        {activeTab && (
          <div className="flex justify-end p-2 border-b border-neutral-800 bg-[#1e1e1e]">
            <div className="bg-neutral-800 rounded p-1 flex">
              <button 
                onClick={() => setMode('live')}
                className={`px-3 py-1 text-xs rounded transition-colors ${mode === 'live' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Live Preview
              </button>
              <button 
                onClick={() => setMode('source')}
                className={`px-3 py-1 text-xs rounded transition-colors ${mode === 'source' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Source
              </button>
            </div>
          </div>
        )}

        {activeTab && (activeTab in contentCache) ? (
          <main className="flex-1 bg-white dark:bg-[#1e1e1e] relative">
            {activeTab.endsWith('.base') ? (
              <BaseView path={activeTab} opfs={globalOpfs!} />
            ) : (
              <div className="flex-1 overflow-hidden p-6 max-w-4xl mx-auto w-full">
                <Editor 
                  key={activeTab} 
                  initialContent={contentCache[activeTab]} 
                  onChange={handleEditorChange} 
                  onLinkClick={handleLinkClick}
                  mode={mode}
                  resolvedLinks={files.map(f => f.name.replace(/\.md$/, ''))}
                />
              </div>
            )}
          </main>
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            {tabs.length === 0 ? "Select or create a file to start editing" : "Loading..."}
          </div>
        )}
      </div>
    </div>
  );
}
