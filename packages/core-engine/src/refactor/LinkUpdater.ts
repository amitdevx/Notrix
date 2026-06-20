import { OPFSClient } from '../opfs';
import { Indexer } from '../indexer';

export class LinkUpdater {
  constructor(private opfs: OPFSClient, private indexer: Indexer) {}

  async renameFile(oldName: string, newName: string): Promise<boolean> {
    const oldBase = oldName.replace(/\.md$/, '');
    const newBase = newName.replace(/\.md$/, '');
    
    const backlinks = this.indexer.getBacklinks(oldBase);
    const affectedFiles = Array.from(new Set(backlinks));

    // Transaction Rollback Buffer
    const rollbackBuffer: Record<string, string> = {};

    try {
      // 1. Read old content and create new file
      const oldContent = await this.opfs.readFile(`/${oldName}`);
      await this.opfs.createFile(`/${newName}`, oldContent);

      // 2. Update all backlinks
      for (const filePath of affectedFiles) {
        if (filePath === `/${oldName}`) continue;
        
        const content = await this.opfs.readFile(filePath);
        rollbackBuffer[filePath] = content;

        // Replace exact wikilinks
        const linkRegex = new RegExp(`\\[\\[${oldBase}\\]\\]`, 'g');
        const newContent = content.replace(linkRegex, `[[${newBase}]]`);
        
        await this.opfs.updateFile(filePath, newContent);
      }

      // 3. Delete old file
      await this.opfs.deleteFile(`/${oldName}`);

      // 4. Update Indexer
      await this.indexer.removeFile(`/${oldName}`);
      await this.indexer.indexFile(`/${newName}`);
      for (const filePath of affectedFiles) {
        if (filePath !== `/${oldName}`) {
          await this.indexer.indexFile(filePath);
        }
      }

      return true;
    } catch (error) {
      console.error('Rename transaction failed. Rolling back...', error);
      
      // Rollback
      for (const [filePath, content] of Object.entries(rollbackBuffer)) {
        try {
          await this.opfs.updateFile(filePath, content);
        } catch (e) {
          console.error(`Rollback failed for ${filePath}`, e);
        }
      }

      // Try to clean up partial new file if old file wasn't deleted
      try {
        await this.opfs.deleteFile(`/${newName}`);
      } catch (e) {}
      
      throw error;
    }
  }
}
