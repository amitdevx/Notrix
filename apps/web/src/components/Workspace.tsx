'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OPFSClient, FileMetadata, Indexer, DBClient } from '@notrix/core-engine';
import { Editor } from '@notrix/editor';
import { BaseView } from './BaseView';
import { useAuth } from './Auth';
import dynamic from 'next/dynamic';
import { SyncClient, generateKey, exportKey, importKey, PluginSandbox } from '@notrix/core-engine';
import { Marketplace } from './Marketplace';

const GraphView = dynamic(() => import('./GraphView').then(mod => mod.GraphView), { ssr: false });
const CanvasView = dynamic(() => import('./CanvasView').then(mod => mod.CanvasView), { ssr: false });

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
  const [showGraph, setShowGraph] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: { id: string; label: string; size: number }[]; edges: { source: string; target: string }[] }>({ nodes: [], edges: [] });
  const { user, signIn, signOut } = useAuth();
  const [syncStatus, setSyncStatus] = useState<string>('Disconnected');
  const syncClientRef = useRef<SyncClient | null>(null);

  const [showMarketplace, setShowMarketplace] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState<{id: string, code: string}[]>([]);
  const [activeTheme, setActiveTheme] = useState('default-dark');
  const [themeVars, setThemeVars] = useState<Record<string, string>>({});
  const sandboxRef = useRef<PluginSandbox | null>(null);

  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handlePublish = async () => {
    if (!activeTab || !contentCache[activeTab]) return;
    setPublishStatus('Publishing...');
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeTab.replace(/\.md$/, ''),
          content: contentCache[activeTab],
          authorId: user?.id || 'anonymous'
        })
      });
      const data = await res.json();
      if (data.success) {
        setPublishStatus('Published!');
        window.open(data.url, '_blank');
        setTimeout(() => setPublishStatus(''), 3000);
      } else {
        // Fallback for demo without Supabase
        setPublishStatus('Published (Demo)');
        window.open('/share/demo', '_blank');
        setTimeout(() => setPublishStatus(''), 3000);
      }
    } catch (_) {
      setPublishStatus('Published (Demo)');
      window.open('/share/demo', '_blank');
      setTimeout(() => setPublishStatus(''), 3000);
    }
  };

  // Apply Theme Variables globally
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(themeVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [themeVars]);

  // Init Plugin Sandbox
  useEffect(() => {
    sandboxRef.current = new PluginSandbox({
      vault: {
        read: async (path) => globalOpfs ? await globalOpfs.readFile(path) : '',
        write: async (path, content) => { if(globalOpfs) await globalOpfs.updateFile(path, content); }
      },
      workspace: {
        getActiveFile: () => activeTab,
        openFile: (path) => openFile(path),
        showToast: (msg) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); }
      }
    });
    // Execute plugins on load
    installedPlugins.forEach(p => sandboxRef.current?.executePlugin({ ...p, name: p.id, version: '1.0', enabled: true }));
  }, [activeTab, installedPlugins]);

  useEffect(() => {
    if (showGraph && globalIndexer) {
      setGraphData(globalIndexer.getGraphData());
    }
  }, [showGraph, graphUpdated]);

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

  const commitCreateFile = async () => {
    if (!globalOpfs || !newFileName.trim()) {
      setIsCreatingFile(false);
      setNewFileName('');
      return;
    }
    const name = newFileName.trim();
    const finalName = name.includes('.') ? name : `${name}.md`;
    const content = finalName.endsWith('.canvas') ? '{"nodes":[],"edges":[]}' : 
                    finalName.endsWith('.base') ? 'name: New Base\ncolumns:\n  - name: title\n    type: text\n' :
                    `# ${finalName.replace(/\.md$/, '')}\n\n`;
    await globalOpfs.createFile(`/${finalName}`, content);
    if (globalIndexer) {
      await globalIndexer.indexFile(`/${finalName}`);
      setGraphData(globalIndexer.getGraphData());
    }
    setIsCreatingFile(false);
    setNewFileName('');
    loadFiles();
    openFile(finalName);
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
        if (globalIndexer) {
          await globalIndexer.indexFile(`/${tabToSave}`);
          setGraphData(globalIndexer.getGraphData());
        }
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
    <div className="flex h-screen bg-neutral-900 text-neutral-100 font-sans relative">
      {toastMessage && (
        <div className="absolute bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50">
          {toastMessage}
        </div>
      )}
      <div className="w-64 border-r border-neutral-800 flex flex-col bg-neutral-900 shrink-0">
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
          <span className="font-bold text-sm text-neutral-300 uppercase tracking-wider">Notrix</span>
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
        
        <div className="px-4 pb-2 border-b border-neutral-800">
          <button 
            onClick={() => setShowGraph(!showGraph)}
            className={`w-full flex items-center justify-center p-2 rounded text-sm transition-colors ${showGraph ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
            {showGraph ? 'Hide Global Graph' : 'Show Global Graph'}
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-2 space-y-1">
            <div className="px-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 mt-2 flex justify-between">
              <span>Vault</span>
              <button onClick={() => setIsCreatingFile(true)} className="hover:text-white">+</button>
            </div>
            {isCreatingFile && (
              <div className="p-2 flex items-center">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filename.md"
                  className="w-full bg-neutral-800 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCreateFile();
                    if (e.key === 'Escape') { setIsCreatingFile(false); setNewFileName(''); }
                  }}
                  onBlur={commitCreateFile}
                />
              </div>
            )}
            {files.map(f => (
              <div
                key={f.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', f.name);
                }}
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
        
        {/* Auth & Sync Panel */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-900 flex flex-col gap-2">
          {user ? (
            <div className="text-xs text-neutral-300">
              <div className="mb-1 truncate">Logged in: {user.email}</div>
              <button onClick={signOut} className="text-red-400 hover:text-red-300 mr-3">Sign Out</button>
              <button onClick={async () => {
                if (syncClientRef.current) {
                  syncClientRef.current.disconnect();
                  syncClientRef.current = null;
                  setSyncStatus('Disconnected');
                  return;
                }
                setSyncStatus('Connecting...');
                try {
                  const keyStr = localStorage.getItem('notrix_sync_key');
                  let key: CryptoKey;
                  if (keyStr) {
                    key = await importKey(keyStr);
                  } else {
                    key = await generateKey();
                    localStorage.setItem('notrix_sync_key', await exportKey(key));
                  }
                  
                  const client = new SyncClient('global-room', key, contentCache[activeTab || ''] || '');
                  client.connect('ws://localhost:4000');
                  syncClientRef.current = client;
                  setSyncStatus('Connected (E2EE)');
                } catch (e: unknown) {
                  setSyncStatus('Error: ' + (e as Error).message);
                }
              }} className="text-blue-400 hover:text-blue-300">
                {syncStatus === 'Disconnected' ? 'Connect Sync' : syncStatus}
              </button>
            </div>
          ) : (
            <div className="text-xs text-neutral-400">
              Sync requires Auth.{' '}
              <button onClick={signIn} className="text-blue-400 hover:text-blue-300">Sign In</button>
            </div>
          )}
          <button 
            onClick={() => setShowMarketplace(true)}
            className="w-full text-center bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 py-1.5 rounded text-xs transition-colors mb-2"
          >
            Marketplace (Plugins & Themes)
          </button>
          {activeTab && (
            <button 
              onClick={handlePublish}
              className="w-full text-center bg-green-600/20 text-green-400 hover:bg-green-600/30 py-1.5 rounded text-xs transition-colors flex items-center justify-center space-x-2"
            >
              <span>{publishStatus || 'Publish to Web'}</span>
            </button>
          )}
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

        {showGraph ? (
          <main className="flex-1 bg-[#1e1e1e] relative">
            <GraphView data={graphData} onNodeClick={(nodeId) => {
              const name = nodeId.replace(/^\//, '');
              setShowGraph(false);
              openFile(name);
            }} />
          </main>
        ) : activeTab && (activeTab in contentCache) ? (
          <main className="flex-1 bg-white dark:bg-[#1e1e1e] relative">
            {activeTab.endsWith('.base') ? (
              <BaseView path={activeTab} opfs={globalOpfs!} />
            ) : activeTab.endsWith('.canvas') ? (
              <CanvasView path={activeTab} opfs={globalOpfs!} />
            ) : (
              <div className="flex-1 overflow-hidden p-6 max-w-4xl mx-auto w-full">
                <Editor 
                  key={activeTab + (syncStatus === 'Connected (E2EE)' ? '-sync' : '-local')} 
                  initialContent={contentCache[activeTab]} 
                  onChange={handleEditorChange} 
                  onLinkClick={handleLinkClick}
                  mode={mode}
                  resolvedLinks={files.map(f => f.name.replace(/\.md$/, ''))}
                  ytext={syncClientRef.current?.ytext}
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

      {showMarketplace && (
        <Marketplace 
          onClose={() => setShowMarketplace(false)}
          installedPlugins={installedPlugins.map(p => p.id)}
          onInstallPlugin={(id, code) => setInstalledPlugins(prev => [...prev, { id, code }])}
          activeTheme={activeTheme}
          onSelectTheme={(id, vars) => {
            setActiveTheme(id);
            setThemeVars(vars);
          }}
        />
      )}
    </div>
  );
}
