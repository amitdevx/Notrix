export interface PluginContext {
  vault: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
  };
  workspace: {
    getActiveFile: () => string | null;
    openFile: (path: string) => void;
    showToast: (message: string) => void;
  };
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  code: string;
  enabled: boolean;
}

export class PluginSandbox {
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  // Very basic sandbox execution. In production, this would use a Web Worker or iframe sandbox.
  // For now, we use a Function constructor with restricted scope.
  public async executePlugin(plugin: InstalledPlugin) {
    try {
      // Expose 'notrix' API object to the plugin
      const runner = new Function('notrix', `
        try {
          ${plugin.code}
        } catch (e) {
          console.error('Plugin Error [${plugin.name}]:', e);
        }
      `);
      
      runner(this.context);
    } catch (e) {
      console.error(`Failed to execute plugin ${plugin.name}:`, e);
    }
  }
}
