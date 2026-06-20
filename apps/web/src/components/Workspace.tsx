'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Hash, LogOut, RefreshCw, UploadCloud, Search, ChevronRight, Settings, Command, Network } from 'lucide-react';
import { OPFSClient, FileMetadata, Indexer, DBClient } from '@notrix/core-engine';
import { Editor } from '@notrix/editor';
import { BaseView } from './BaseView';
import { useAuth } from './Auth';
import dynamic from 'next/dynamic';
import { SyncClient, generateKey, exportKey, importKey, PluginSandbox } from '@notrix/core-engine';
import { Marketplace } from './Marketplace';
import { useWorkspaceStore } from '../store/workspaceStore';

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
  const { tabs, activeTab, contentCache, setTabs, setActiveTab, setContent, openTab, closeTab } = useWorkspaceStore();
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
  const [showPalette, setShowPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [publishStatus, setPublishStatus] = useState<string>('');
  const [zenMode, setZenMode] = useState(false);

  // Workspace Persistence
  useEffect(() => {
    const saved = localStorage.getItem('notrix-workspace');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.tabs) setTabs(parsed.tabs);
        if (parsed.activeTab) setActiveTab(parsed.activeTab);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (tabs.length > 0) {
      localStorage.setItem('notrix-workspace', JSON.stringify({ tabs, activeTab }));
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowPalette(true);
      }
      if (e.key === 'Escape') {
        setZenMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    if (!(name in contentCache)) {
      const data = await globalOpfs.readFile(`/${name}`);
      openTab(name, data);
    } else {
      openTab(name);
    }
  };

  const handleCloseTab = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    closeTab(name);
  };

  const handleEditorChange = useCallback((newContent: string) => {
    if (!activeTab || !globalOpfs) return;
    
    // Update local state immediately
    setContent(activeTab, newContent);
    
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
    <div className="flex h-screen bg-workspace-bg text-neutral-100 font-sans relative overflow-hidden selection:bg-brand-primary/30">
      {toastMessage && (
        <div className="absolute bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg z-50">
          {toastMessage}
        </div>
      )}
      
      <AnimatePresence>
      {showPalette && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh] px-4" 
          onClick={() => setShowPalette(false)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-workspace-elevated border border-workspace-border rounded-xl w-full max-w-xl shadow-floating overflow-hidden" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center border-b border-workspace-border px-4 py-3">
              <Search size={16} className="text-neutral-500 mr-3" />
              <input 
                autoFocus
                className="w-full bg-transparent text-neutral-200 outline-none text-[15px] placeholder-neutral-500" 
                placeholder="Type a command..." 
                value={paletteQuery}
                onChange={e => setPaletteQuery(e.target.value)}
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 bg-workspace-panel border border-workspace-border rounded px-2 py-0.5 text-[10px] font-mono text-neutral-400">ESC</kbd>
            </div>
            <div className="p-2 max-h-[60vh] overflow-auto no-scrollbar">
              <div className="px-3 py-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Suggested</div>
              <motion.div whileHover={{ backgroundColor: 'var(--workspace-active)' }} className="px-3 py-2.5 text-sm text-neutral-300 cursor-pointer rounded-lg flex items-center transition-colors" onClick={() => { setShowGraph(true); setShowPalette(false); }}>
                <Network size={14} className="mr-3 text-neutral-500" />
                Show Global Graph
              </motion.div>
              <motion.div whileHover={{ backgroundColor: 'var(--workspace-active)' }} className="px-3 py-2.5 text-sm text-neutral-300 cursor-pointer rounded-lg flex items-center transition-colors" onClick={() => { setIsCreatingFile(true); setShowPalette(false); }}>
                <Plus size={14} className="mr-3 text-neutral-500" />
                Create New Note
              </motion.div>
              <motion.div whileHover={{ backgroundColor: 'var(--workspace-active)' }} className="px-3 py-2.5 text-sm text-neutral-300 cursor-pointer rounded-lg flex items-center transition-colors" onClick={() => { setShowMarketplace(true); setShowPalette(false); }}>
                <Settings size={14} className="mr-3 text-neutral-500" />
                Open Marketplace
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Floating Exit Zen Mode Button */}
      <AnimatePresence>
      {zenMode && (
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 0.3, y: 0 }}
          whileHover={{ opacity: 1 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={() => setZenMode(false)}
          className="fixed top-6 right-6 z-50 bg-workspace-panel border border-workspace-border text-neutral-300 hover:text-white px-4 py-2 rounded-full text-xs font-medium shadow-floating transition-opacity flex items-center space-x-2"
        >
          <span>Exit Zen Mode</span>
          <kbd className="font-mono bg-workspace-bg px-1.5 py-0.5 rounded text-[10px] text-neutral-500 border border-workspace-border">ESC</kbd>
        </motion.button>
      )}
      </AnimatePresence>

      {/* Premium Animated Sidebar */}
      <AnimatePresence>
      {!zenMode && (
      <motion.div 
        initial={{ x: -250, opacity: 0, width: 0 }}
        animate={{ x: 0, opacity: 1, width: 256 }}
        exit={{ x: -250, opacity: 0, width: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="border-r border-workspace-border flex-col bg-workspace-panel shadow-floating shrink-0 hidden md:flex z-10 overflow-hidden"
      >
        <div className="w-64 flex flex-col h-full">
          <div className="p-4 border-b border-workspace-border flex justify-between items-center bg-workspace-elevated/50 backdrop-blur-md">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-brand-primary/20 flex items-center justify-center border border-brand-primary/30">
              <Command size={14} className="text-brand-primary" />
            </div>
            <span className="font-semibold text-sm text-neutral-200 tracking-wide">Notrix</span>
          </div>
        </div>
        
        <div className="p-3 border-b border-workspace-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search files... (Ctrl+P)"
              className="w-full bg-workspace-elevated border border-workspace-border rounded-md pl-9 pr-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/50 transition-all shadow-inner"
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
        </div>
        
        <div className="px-4 pb-2 border-b border-workspace-border">
          <button 
            onClick={() => setShowGraph(!showGraph)}
            className={`w-full flex items-center justify-center p-2 rounded-md text-xs font-medium transition-all ${showGraph ? 'bg-brand-primary text-white shadow-md shadow-brand-glow' : 'bg-workspace-elevated border border-workspace-border text-neutral-300 hover:bg-workspace-active hover:text-white'}`}
          >
            <Network size={14} className="mr-2" />
            {showGraph ? 'Hide Global Graph' : 'Show Global Graph'}
          </button>
        </div>

        <div className="flex-1 overflow-auto no-scrollbar">
          <div className="p-2 space-y-1">
            <div className="px-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 mt-2 flex justify-between items-center group">
              <span>Vault</span>
              <button onClick={() => setIsCreatingFile(true)} className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"><Plus size={12} /></button>
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
            <AnimatePresence>
            {files.map(f => (
              <motion.div
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={f.name}
                draggable
                onDragStart={(e: any) => {
                  e.dataTransfer.setData('text/plain', f.name);
                }}
                className={`p-1.5 text-[13px] cursor-pointer rounded-md flex items-center transition-all group ${activeTab === f.name ? 'bg-workspace-active text-white shadow-sm' : 'text-neutral-400 hover:bg-workspace-active/50 hover:text-neutral-200'}`}
                onClick={() => openFile(f.name)}
              >
                <FileText size={14} className={`mr-2 transition-colors ${activeTab === f.name ? 'text-brand-primary' : 'text-neutral-500 group-hover:text-neutral-400'}`} />
                <span className="truncate font-medium">{f.name}</span>
              </motion.div>
            ))}
            </AnimatePresence>
            {files.length === 0 && (
              <div className="px-4 py-2 text-xs text-neutral-600 text-center">
                No files found
              </div>
            )}
          </div>
          
          <div className="mt-4 p-2 space-y-1 border-t border-workspace-border">
            <div className="px-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 mt-2">Tags</div>
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
                className="w-full text-left px-2 py-1.5 text-[13px] text-neutral-400 hover:bg-workspace-active hover:text-neutral-200 rounded-md flex items-center transition-colors font-medium"
              >
                <Hash size={12} className="mr-2 opacity-50" />
                {tag}
              </button>
            )) : (
              <div className="px-4 py-2 text-neutral-600 italic text-xs">No tags yet.</div>
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
      </motion.div>
      )}
      </AnimatePresence>
      <div className="flex-1 flex flex-col bg-workspace-bg min-w-0">
        <AnimatePresence>
        {!zenMode && tabs.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex border-b border-workspace-border bg-workspace-panel overflow-x-auto no-scrollbar"
          >
            <AnimatePresence>
            {tabs.map(tab => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, width: 0, padding: 0 }}
                key={tab}
                className={`flex items-center px-4 py-2.5 border-r border-workspace-border cursor-pointer min-w-max text-sm transition-all origin-left ${activeTab === tab ? 'bg-workspace-bg text-brand-primary shadow-[inset_0_2px_0_0_var(--color-brand-primary)]' : 'bg-workspace-panel text-neutral-400 hover:bg-workspace-active hover:text-neutral-200'}`}
                onClick={() => setActiveTab(tab)}
              >
                <span className="font-medium tracking-wide">{tab}</span>
                <button 
                  onClick={(e) => handleCloseTab(e, tab)}
                  className="ml-3 text-neutral-500 hover:text-red-400 rounded-full p-0.5 hover:bg-workspace-elevated transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        )}
        </AnimatePresence>
        
        {/* Editor Toolbar */}
        <AnimatePresence>
        {!zenMode && activeTab && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0, height: 0 }}
            className="flex justify-between items-center px-6 py-2 border-b border-workspace-border bg-workspace-bg"
          >
            <div className="text-xs text-neutral-500 flex items-center space-x-2">
              <span className="font-mono bg-workspace-active px-2 py-0.5 rounded text-neutral-400">{activeTab}</span>
            </div>
            <div className="bg-workspace-panel border border-workspace-border rounded-lg p-1 flex shadow-sm">
              <button 
                onClick={() => setZenMode(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors text-neutral-400 hover:text-neutral-200 hover:bg-workspace-active mr-1 border border-transparent flex items-center`}
              >
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                Zen
              </button>
              <div className="w-px h-4 bg-workspace-border mx-1 self-center"></div>
              <button 
                onClick={() => setMode('live')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${mode === 'live' ? 'bg-workspace-elevated text-brand-primary shadow-sm border border-workspace-border' : 'text-neutral-400 hover:text-neutral-200 hover:bg-workspace-active border border-transparent'}`}
              >
                Preview
              </button>
              <button 
                onClick={() => setMode('source')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${mode === 'source' ? 'bg-workspace-elevated text-brand-primary shadow-sm border border-workspace-border' : 'text-neutral-400 hover:text-neutral-200 hover:bg-workspace-active border border-transparent'}`}
              >
                Source
              </button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {showGraph ? (
          <main className="flex-1 bg-workspace-bg relative">
            <GraphView data={graphData} onNodeClick={(nodeId) => {
              const name = nodeId.replace(/^\//, '');
              setShowGraph(false);
              openFile(name);
            }} />
          </main>
        ) : activeTab && (activeTab in contentCache) ? (
          <main className="flex-1 bg-workspace-bg relative">
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
