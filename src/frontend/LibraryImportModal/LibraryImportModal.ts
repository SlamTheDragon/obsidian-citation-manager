import { App, Modal, Setting, Notice, setIcon } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, DEFAULT_COLLECTION_ID } from '../../backend/types';
import { StorageManager } from '../../backend/storageManager';
import { MetadataResolvers } from '../../backend/metadataResolvers';
import { CitationEngine } from '../../backend/citationEngine';

export class LibraryImportModal extends Modal {
  private project: ProjectRecord | null;
  private storageManager: StorageManager;
  private onImportComplete: (count: number) => Promise<void>;
  private rawContent: string = '';
  private filename: string = '';
  private parsedReferences: Partial<ReferenceMetadata>[] = [];

  constructor(
    app: App,
    project: ProjectRecord | null,
    storageManager: StorageManager,
    onImportComplete: (count: number) => Promise<void>,
    initialContent: string = '',
    initialFilename: string = ''
  ) {
    super(app);
    this.project = project;
    this.storageManager = storageManager;
    this.onImportComplete = onImportComplete;
    this.rawContent = initialContent;
    this.filename = initialFilename;

    if (this.rawContent) {
      this.parsedReferences = MetadataResolvers.parseLibrary(this.rawContent, this.filename);
    }
  }

  onOpen() {
    this.titleEl.setText(`Import Citations Library: ${this.project ? this.project.name : 'All Citations'}`);

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('citation-modal-content-unified');

    // 1. Instructions & Dropzone Card
    const dropCard = contentEl.createDiv({ cls: 'citation-modal-section-card' });
    dropCard.createEl('div', { cls: 'section-card-title', text: 'Select or Drop Library File (.bib, .ris, .xml)' });
    dropCard.createEl('div', {
      cls: 'section-card-desc',
      text: 'Supports BibTeX (.bib), RIS (.ris), and EndNote XML (.xml) exported from Zotero, Mendeley, EndNote, or Google Scholar.'
    });

    const dropZone = dropCard.createDiv({ cls: 'citation-drop-zone-spacious-full' });
    dropZone.style.minHeight = '90px';
    dropZone.style.margin = '10px 0';
    setIcon(dropZone.createDiv({ cls: 'drop-icon' }), 'upload');
    dropZone.createDiv({ cls: 'drop-text-primary', text: 'Drag & drop .bib, .ris, or .xml file here' });
    dropZone.createDiv({ cls: 'drop-text-secondary', text: 'or click to browse library files' });

    const fileInput = dropZone.createEl('input', {
      type: 'file',
      attr: { accept: '.bib,.bibtex,.ris,.xml,.enw,.txt' }
    });
    fileInput.style.display = 'none';

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        this.filename = file.name;
        this.rawContent = await file.text();
        this.reparseAndRender();
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.addClass('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.removeClass('drag-over'));
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass('drag-over');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        this.filename = file.name;
        this.rawContent = await file.text();
        this.reparseAndRender();
      }
    });

    // 2. Raw Text Paste Area Card
    const pasteCard = contentEl.createDiv({ cls: 'citation-modal-section-card' });
    pasteCard.createEl('div', { cls: 'section-card-title', text: 'Or Paste Raw Library Snippet' });

    const textArea = pasteCard.createEl('textarea', {
      cls: 'setting-full-width-input',
      attr: {
        rows: '6',
        placeholder: 'Paste BibTeX (@article{...}), RIS (TY  - JOUR...), or EndNote XML (<record>...) here...'
      }
    });
    textArea.value = this.rawContent;
    textArea.style.fontFamily = 'var(--font-monospace)';
    textArea.style.fontSize = '12px';
    textArea.style.width = '100%';
    textArea.addEventListener('input', () => {
      this.rawContent = textArea.value;
      this.filename = '';
      this.parsedReferences = MetadataResolvers.parseLibrary(this.rawContent);
      this.updateStatusAndPreview(previewDiv, importBtn);
    });

    // 3. Preview & Status Container
    const previewDiv = contentEl.createDiv({ cls: 'citation-modal-section-card' });
    previewDiv.createEl('div', { cls: 'section-card-title', text: 'Parsed References Preview' });
    const previewList = previewDiv.createDiv({ cls: 'citation-import-preview-list' });
    previewList.style.maxHeight = '140px';
    previewList.style.overflowY = 'auto';

    // 4. Action Buttons
    const buttonRow = contentEl.createDiv({ cls: 'modal-button-container citation-modal-buttons' });
    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const importBtn = buttonRow.createEl('button', {
      cls: 'mod-cta',
      text: `Import ${this.parsedReferences.length} Citations`
    });
    importBtn.disabled = this.parsedReferences.length === 0;

    importBtn.addEventListener('click', async () => {
      if (this.parsedReferences.length === 0) return;
      importBtn.disabled = true;
      importBtn.setText('Importing...');

      try {
        let importedCount = 0;
        for (const partial of this.parsedReferences) {
          const authors = Array.isArray(partial.authors) ? partial.authors : [];
          const year = partial.year || new Date().getFullYear();
          const title = partial.title || 'Untitled';
          const citekey = partial.citekey || CitationEngine.generateCitekey(authors, year, title);

          const fullRef: ReferenceMetadata = {
            citekey,
            title,
            authors,
            year,
            publication: partial.publication || '',
            volume: partial.volume || '',
            issue: partial.issue || '',
            pages: partial.pages || '',
            publisher: partial.publisher || '',
            doi: partial.doi || '',
            url: partial.url || '',
            isbn: partial.isbn || '',
            abstract: partial.abstract || '',
            type: partial.type || 'journal',
            projects: this.project ? [this.project.id] : [],
            collectionId: DEFAULT_COLLECTION_ID,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
          };

          await this.storageManager.saveReference(fullRef);
          importedCount++;
        }

        new Notice(`Imported ${importedCount} citation(s) successfully!`);
        await this.onImportComplete(importedCount);
        this.close();
      } catch (err: any) {
        new Notice(`Import error: ${err.message}`);
        importBtn.disabled = false;
        importBtn.setText(`Import ${this.parsedReferences.length} Citations`);
      }
    });

    this.updateStatusAndPreview(previewDiv, importBtn);
  }

  private reparseAndRender() {
    this.parsedReferences = MetadataResolvers.parseLibrary(this.rawContent, this.filename);
    this.onOpen();
  }

  private updateStatusAndPreview(previewDiv: HTMLElement, importBtn: HTMLButtonElement) {
    const previewList = previewDiv.querySelector('.citation-import-preview-list') as HTMLElement;
    if (!previewList) return;
    previewList.empty();

    if (this.parsedReferences.length === 0) {
      previewList.createDiv({
        cls: 'section-card-desc',
        text: 'No valid references detected yet. Drop a file or paste content above.'
      });
      importBtn.disabled = true;
      importBtn.setText('Import 0 Citations');
    } else {
      importBtn.disabled = false;
      importBtn.setText(`Import ${this.parsedReferences.length} Citations`);

      for (const ref of this.parsedReferences.slice(0, 50)) {
        const item = previewList.createDiv({ cls: 'citation-diagnostic-row' });
        item.style.padding = '4px 8px';
        item.style.fontSize = '12px';
        item.style.borderBottom = '1px solid var(--background-modifier-border)';

        const authorStr = ref.authors && ref.authors.length > 0 ? ref.authors[0] : 'Unknown';
        const yearStr = ref.year ? ` (${ref.year})` : '';
        item.createEl('strong', { text: `[${ref.citekey || 'Auto'}] ` });
        item.createSpan({ text: `${authorStr}${yearStr} — ${ref.title || 'Untitled'}` });
      }

      if (this.parsedReferences.length > 50) {
        previewList.createDiv({
          cls: 'section-card-desc',
          text: `... and ${this.parsedReferences.length - 50} more records.`
        });
      }
    }
  }
}
