import React, { useState } from 'react';

export interface Theme {
  id: string;
  name: string;
  variables: Record<string, string>;
}

export const THEME_REGISTRY: Theme[] = [
  {
    id: 'default-dark',
    name: 'Notrix Dark (Default)',
    variables: {
      '--bg-primary': '#111111',
      '--bg-secondary': '#1e1e1e',
      '--text-primary': '#e5e5e5',
      '--text-secondary': '#9ca3af',
      '--accent': '#3b82f6'
    }
  },
  {
    id: 'obsidian-nord',
    name: 'Nord Theme',
    variables: {
      '--bg-primary': '#2e3440',
      '--bg-secondary': '#3b4252',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--accent': '#88c0d0'
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    variables: {
      '--bg-primary': '#fdf6e3',
      '--bg-secondary': '#eee8d5',
      '--text-primary': '#657b83',
      '--text-secondary': '#93a1a1',
      '--accent': '#b58900'
    }
  }
];

export const PLUGIN_REGISTRY = [
  {
    id: 'word-counter',
    name: 'Word Counter',
    version: '1.0.0',
    description: 'Displays a toast with the word count of the current file.',
    code: `
      notrix.workspace.showToast('Word Counter Loaded');
      // In a real plugin, we would hook into an event loop or add a UI element
      setTimeout(async () => {
        const file = notrix.workspace.getActiveFile();
        if (file) {
          const content = await notrix.vault.read(file);
          const words = content.split(/\\s+/).filter(w => w.length > 0).length;
          notrix.workspace.showToast(\`Word count for \${file}: \${words}\`);
        }
      }, 2000);
    `
  },
  {
    id: 'daily-note',
    name: 'Daily Note Generator',
    version: '1.0.0',
    description: 'Creates a daily note automatically on load.',
    code: `
      notrix.workspace.showToast('Daily Note Generator Loaded');
      const today = new Date().toISOString().split('T')[0];
      const path = \`Daily/\${today}.md\`;
      
      notrix.vault.read(path).catch(() => {
        // File doesn't exist, create it
        notrix.vault.write(path, '# Daily Note\\n\\nWhat are you working on today?');
        notrix.workspace.openFile(path);
      });
    `
  }
];

export const Marketplace: React.FC<{ 
  onClose: () => void;
  installedPlugins: string[];
  onInstallPlugin: (id: string, code: string) => void;
  activeTheme: string;
  onSelectTheme: (id: string, variables: Record<string, string>) => void;
}> = ({ onClose, installedPlugins, onInstallPlugin, activeTheme, onSelectTheme }) => {
  const [tab, setTab] = useState<'plugins' | 'themes'>('plugins');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] border border-neutral-800 rounded-lg w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex border-b border-neutral-800">
          <button 
            className={`px-6 py-4 font-medium transition-colors ${tab === 'plugins' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-400/10' : 'text-neutral-400 hover:text-neutral-200'}`}
            onClick={() => setTab('plugins')}
          >
            Community Plugins
          </button>
          <button 
            className={`px-6 py-4 font-medium transition-colors ${tab === 'themes' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/10' : 'text-neutral-400 hover:text-neutral-200'}`}
            onClick={() => setTab('themes')}
          >
            Themes
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 text-neutral-500 hover:text-white transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-[#111111]">
          {tab === 'plugins' && (
            <div className="space-y-4">
              {PLUGIN_REGISTRY.map(p => (
                <div key={p.id} className="p-4 bg-[#1e1e1e] border border-neutral-800 rounded flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">{p.name} <span className="text-xs text-neutral-500 ml-2">v{p.version}</span></h3>
                    <p className="text-sm text-neutral-400 mt-1">{p.description}</p>
                  </div>
                  <button 
                    onClick={() => onInstallPlugin(p.id, p.code)}
                    disabled={installedPlugins.includes(p.id)}
                    className={`px-4 py-2 rounded text-sm font-medium transition-colors ${installedPlugins.includes(p.id) ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                  >
                    {installedPlugins.includes(p.id) ? 'Installed' : 'Install'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'themes' && (
            <div className="grid grid-cols-2 gap-4">
              {THEME_REGISTRY.map(t => (
                <div 
                  key={t.id} 
                  onClick={() => onSelectTheme(t.id, t.variables)}
                  className={`p-4 rounded border cursor-pointer transition-all ${activeTheme === t.id ? 'border-purple-500 bg-purple-500/10' : 'border-neutral-800 bg-[#1e1e1e] hover:border-neutral-600'}`}
                >
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.variables['--bg-primary'] }} />
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.variables['--text-primary'] }} />
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.variables['--accent'] }} />
                  </div>
                  <h3 className="text-white font-medium">{t.name}</h3>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
