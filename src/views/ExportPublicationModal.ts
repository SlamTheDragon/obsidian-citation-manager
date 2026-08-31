import { App, Modal, Setting, Notice, TFile, normalizePath } from 'obsidian';
import { ProjectRecord, ReferenceMetadata, CitationStyle } from '../types';
import { CitationEngine } from '../citationEngine';
import { ProjectIndexer } from '../projectIndexer';

export class ExportPublicationModal extends Modal {
  private project: ProjectRecord | null;
  private allReferences: Map<string, ReferenceMetadata>;
  private projectIndexer: ProjectIndexer;
  private targetFile: TFile | null;

  private selectedStyle: CitationStyle = 'apa7';
  private appendBib: boolean = true;
  private bibScope: 'local' | 'global' = 'local';
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
    this.titleEl.setText("Publication & PDF Export Studio");

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // 1. Info Card
    const infoCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    infoCard.createEl("div", { cls: "section-card-title", text: "Non-Destructive Publication & Export" });
    infoCard.createEl("div", { 
      cls: "section-card-desc", 
      text: "Prepare your documents for PDF export, journal submission, or printing without losing your source citekeys." 
    });

    if (this.targetFile) {
      infoCard.createEl("div", { cls: "status-log-line", text: `Active Note: ${this.targetFile.path}` });
    }

    // 2. Options Card
    const optCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    
    new Setting(optCard)
      .setName("Citation Standard")
      .setDesc("In-text format and bibliography standard")
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
      .setName("Bibliography Scope")
      .setDesc("Sync bibliography locally for this note or globally for the entire project")
      .addDropdown(drop => {
        drop.addOption("local", "Local (Only citations in this note)");
        drop.addOption("global", "Global (All references in project)");
        drop.setValue(this.bibScope);
        drop.onChange(val => { this.bibScope = val as 'local' | 'global'; });
      });

    new Setting(optCard)
      .setName("Append References Section")
      .setDesc("Embed formatted bibliography section at the bottom")
      .addToggle(toggle => {
        toggle.setValue(this.appendBib);
        toggle.onChange(val => { this.appendBib = val; });
      });

    new Setting(optCard)
      .setName("Clean Local Footnote Blocks")
      .setDesc("Strip raw [^citekey]: ... definitions from note bottom")
      .addToggle(toggle => {
        toggle.setValue(this.cleanFootnotes);
        toggle.onChange(val => { this.cleanFootnotes = val; });
      });

    // 3. Action Buttons Card
    const actionsCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    actionsCard.createEl("div", { cls: "section-card-title", text: "Export Operations" });

    // Option 1: Export to Separate Published Copy (Safe & Non-Destructive)
    if (this.targetFile) {
      new Setting(actionsCard)
        .setName("Export Clean Copy (.md)")
        .setDesc("Creates a new standalone published markdown file, keeping this note untouched")
        .addButton(btn => btn
          .setButtonText("Create Published Copy")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              const baseName = this.targetFile!.basename;
              const dir = this.targetFile!.parent ? this.targetFile!.parent.path : "";
              const outPath = normalizePath(dir ? `${dir}/${baseName} (Published).md` : `${baseName} (Published).md`);

              const compiledText = await this.generateCompiledText(this.targetFile!);
              await this.app.vault.adapter.write(outPath, compiledText);
              new Notice(`Created standalone export: ${outPath}`);
              this.close();
            } catch (err: any) {
              new Notice(`Export error: ${err.message}`);
              btn.setDisabled(false);
            }
          }));

      // Option 2: Format In-Place
      new Setting(actionsCard)
        .setName("Format Active Note In-Place")
        .setDesc("Replaces citekeys in this document with formatted text")
        .addButton(btn => btn
          .setButtonText("Format In-Place")
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              const compiled = await this.generateCompiledText(this.targetFile!);
              await this.app.vault.modify(this.targetFile!, compiled);
              new Notice(`Formatted "${this.targetFile!.basename}" for publication!`);
              this.close();
            } catch (err: any) {
              new Notice(`Error: ${err.message}`);
              btn.setDisabled(false);
            }
          }));

      // Option 3: Revert In-Place to Citekeys
      new Setting(actionsCard)
        .setName("Revert Note to Citekeys")
        .setDesc("Restores [@citekey] markers from formatted text")
        .addButton(btn => btn
          .setButtonText("Revert to Citekeys")
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              await this.revertFileToCitekeys(this.targetFile!);
              new Notice(`Reverted "${this.targetFile!.basename}" back to citekeys!`);
              this.close();
            } catch (err: any) {
              new Notice(`Revert error: ${err.message}`);
              btn.setDisabled(false);
            }
          }));
    }

    // Modal Close
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const closeBtn = buttonRow.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  private async generateCompiledText(file: TFile): Promise<string> {
    let content = await this.app.vault.read(file);
    const usedCitekeys: string[] = [];

    // 1. Identify citekeys in document
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

      const citekeyRegex = new RegExp(`\\[@${key}\\]`, 'g');
      const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
      content = content.replace(citekeyRegex, inBodyFormatted);
      content = content.replace(footnoteCallRegex, inBodyFormatted);

      if (this.cleanFootnotes) {
        const fnCleanRegex = new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\n?`, 'gm');
        content = content.replace(fnCleanRegex, "");
      }

      numericIndex++;
    }

    content = content.replace(/\n{3,}$/, "\n\n");

    // 3. Append Bibliography
    if (this.appendBib) {
      let targetRefs: ReferenceMetadata[] = [];
      if (this.bibScope === 'local') {
        targetRefs = usedCitekeys.map(k => this.allReferences.get(k)!).filter(Boolean);
      } else {
        targetRefs = Array.from(this.allReferences.values());
      }

      if (targetRefs.length > 0) {
        const bibText = CitationEngine.generateBibliography(targetRefs, this.selectedStyle, "References");
        const bibHeadingRegex = /##\s*References[\s\S]*$/i;
        content = content.replace(bibHeadingRegex, "").trimEnd();
        content += `\n\n${bibText}\n`;
      }
    }

    return content;
  }

  private async revertFileToCitekeys(file: TFile) {
    let content = await this.app.vault.read(file);
    let modified = false;

    // Remove any appended references section
    const bibHeadingRegex = /\n*##\s*References[\s\S]*$/i;
    if (bibHeadingRegex.test(content)) {
      content = content.replace(bibHeadingRegex, "").trimEnd() + "\n";
      modified = true;
    }

    // Revert parentheticals back to [@citekey]
    for (const [key, ref] of this.allReferences.entries()) {
      const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');
      const narrative = CitationEngine.formatInBody(ref, 'narrative');
      const targetCitekey = `[@${key}]`;

      if (parenthetical && content.includes(parenthetical)) {
        content = content.split(parenthetical).join(targetCitekey);
        modified = true;
      }
      if (narrative && content.includes(narrative)) {
        content = content.split(narrative).join(targetCitekey);
        modified = true;
      }
    }

    if (modified) {
      await this.app.vault.modify(file, content);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
