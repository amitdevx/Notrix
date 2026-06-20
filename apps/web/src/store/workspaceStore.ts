import { create } from 'zustand';

interface WorkspaceState {
  tabs: string[];
  activeTab: string | null;
  contentCache: Record<string, string>;
  setTabs: (tabs: string[]) => void;
  setActiveTab: (tab: string | null) => void;
  setContent: (tab: string, content: string) => void;
  openTab: (tab: string, initialContent?: string) => void;
  closeTab: (tab: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  tabs: [],
  activeTab: null,
  contentCache: {},
  setTabs: (tabs) => set({ tabs }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setContent: (tab, content) => set((state) => ({ 
    contentCache: { ...state.contentCache, [tab]: content } 
  })),
  openTab: (tab, initialContent) => set((state) => {
    const newTabs = state.tabs.includes(tab) ? state.tabs : [...state.tabs, tab];
    return {
      tabs: newTabs,
      activeTab: tab,
      contentCache: initialContent !== undefined 
        ? { ...state.contentCache, [tab]: initialContent } 
        : state.contentCache
    };
  }),
  closeTab: (tab) => set((state) => {
    const newTabs = state.tabs.filter(t => t !== tab);
    let newActive = state.activeTab;
    if (state.activeTab === tab) {
      newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
    }
    const newCache = { ...state.contentCache };
    delete newCache[tab];
    return { tabs: newTabs, activeTab: newActive, contentCache: newCache };
  })
}));
