import { App, Modal, Setting, Notice, TFile, MarkdownView } from 'obsidian';
import { ProjectRecord, ReferenceMetadata, CitationStyle, InBodyFormat } from '../types';
import { CitationEngine } from '../citationEngine';
import { ProjectIndexer } from '../projectIndexer';

export class ExportPublicationModal extends Modal {
  private project: ProjectRecord | null;
  private allReferences: Map<string, ReferenceMetadata>;
  private projectIndexer: ProjectIndexer;
  private targetFile: TFile | null;

  private selectedStyle: CitationStyle = 'apa7';
  private appendBib: boolean = true;
  private cleanFootnotes: boolean = true;

  constructor(
    app: App,
    project: ProjectRecord | null,
    allReferences: Map<string, ReferenceMetadata>,
    projectIndexer: ProjectIndexer,
    targetFile: TFile | null = null
  ) {
    super(app);
    this.project = project;
    this.allReferences = allReferences;
    this.projectIndexer = projectIndexer;
    this.targetFile = targetFile || app.workspace.getActiveFile();
    this.selectedStyle = project?.citationStyle || 'apa7';
  }

  onOpen() {
    this.titleEl.setText("Export & Publication Studio");

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // 1. Info Card
    const infoCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    infoCard.createEl("div", { cls: "section-card-title", text: "Publication & Export Preparation" });
    infoCard.createEl("div", { 
      cls: "section-card-desc", 
      text: "Transform markdown citation markers into publication-ready formatted text, clean up local footnotes, and embed standard bibliography for PDF/Print export." 
    });

    if (this.targetFile) {
      infoCard.createEl("div", { cls: "status-log-line", text: `Target Note: ${this.targetFile.path}` });
    }

    // 2. Options Card
    const optCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    
    new Setting(optCard)
      .setName("Citation Standard")
      .setDesc("Format to use for in-text citations and embedded bibliography")
      .addDropdown(drop => {
        drop.addOption("apa7", "APA 7 (Author, Year)");
        drop.addOption("ieee", "IEEE [1], [2]");
        drop.addOption("harvard", "Harvard (Author Year)");
        drop.addOption("chicago", "Chicago (Author Year)");
        drop.addOption("vancouver", "Vancouver (1)");
        drop.setValue(this.selectedStyle);
        drop.onChange(val => { this.selectedStyle = val as CitationStyle; });
      });

    new Setting(optCard)
      .setName("Append Master Bibliography")
      .setDesc("Embed a formatted References section at the end of the document")
      .addToggle(toggle => {
        toggle.setValue(this.appendBib);
        toggle.onChange(val => { this.appendBib = val; });
      });

    new Setting(optCard)
      .setName("Clean Local Footnote Blocks")
      .setDesc("Remove raw [^citekey]: ... definitions from the bottom")
      .addToggle(toggle => {
        toggle.setValue(this.cleanFootnotes);
        toggle.onChange(val => { this.cleanFootnotes = val; });
      });

    // 3. Action Buttons
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    
    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    // Clean Current Note
    if (this.targetFile) {
      const exportNoteBtn = buttonRow.createEl("button", { 
        cls: "mod-cta", 
        text: `Prepare "${this.targetFile.basename}" for Export` 
      });
      exportNoteBtn.addEventListener("click", async () => {
        exportNoteBtn.disabled = true;
        try {
          await this.processFile(this.targetFile!);
          new Notice(`Successfully prepared "${this.targetFile!.basename}" for publication!`);
          this.close();
        } catch (e: any) {
          new Notice(`Export error: ${e.message}`);
          exportNoteBtn.disabled = false;
        }
      });
    }

    // Process All Project Notes (if project active)
    if (this.project) {
      const exportAllBtn = buttonRow.createEl("button", { 
        text: `Prepare All '${this.project.name}' Notes` 
      });
      exportAllBtn.addEventListener("click", async () => {
        exportAllBtn.disabled = true;
        try {
          const files = this.projectIndexer.getProjectFiles(this.project);
          let count = 0;
          for (const f of files) {
            await this.processFile(f);
            count++;
          }
          new Notice(`Successfully prepared ${count} document(s) for publication!`);
          this.close();
        } catch (e: any) {
          new Notice(`Export error: ${e.message}`);
          exportAllBtn.disabled = false;
        }
      });
    }
  }

  private async processFile(file: TFile) {
    let content = await this.app.vault.read(file);
    const usedCitekeys: string[] = [];

    // 1. Identify all cited keys in document
    for (const [key, ref] of this.allReferences.entries()) {
      const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
      const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
      const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');

      if (citekeyRegex.test(content) || footnoteCallRegex.test(content) || (parenthetical && content.includes(parenthetical))) {
        if (!usedCitekeys.includes(key)) {
          usedCitekeys.push(key);
        }
      }
    }

    // 2. Format in-body markers based on selected style
    let numericIndex = 1;
    for (const key of usedCitekeys) {
      const ref = this.allReferences.get(key);
      if (!ref) continue;

      let inBodyFormatted = "";
      if (this.selectedStyle === 'ieee') {
        inBodyFormatted = `[${numericIndex}]`;
      } else if (this.selectedStyle === 'vancouver') {
        inBodyFormatted = `(${numericIndex})`;
      } else {
        inBodyFormatted = CitationEngine.formatInBody(ref, 'parenthetical');
      }

      // Replace internal citekey & footnote markers
      const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
      const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
      content = content.replace(citekeyRegex, inBodyFormatted);
      content = content.replace(footnoteCallRegex, inBodyFormatted);

      // Clean bottom footnote definition if requested
      if (this.cleanFootnotes) {
        const fnCleanRegex = new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\n?`, 'gm');
        content = content.replace(fnCleanRegex, "");
      }

      numericIndex++;
    }

    // 3. Clean trailing empty lines
    content = content.replace(/\n{3,}$/, "\n\n");

    // 4. Append Bibliography if enabled
    if (this.appendBib && usedCitekeys.length > 0) {
      const citedRefs = usedCitekeys.map(k => this.allReferences.get(k)!).filter(Boolean);
      const bibText = CitationEngine.generateBibliography(citedRefs, this.selectedStyle, "References");
      
      // Remove any existing bibliography heading
      const bibHeadingRegex = /##\s*References[\s\S]*$/i;
      content = content.replace(bibHeadingRegex, "").trimEnd();

      content += `\n\n${bibText}\n`;
    }

    await this.app.vault.modify(file, content);
  }

  onClose() {
    this.contentEl.empty();
  }
}
