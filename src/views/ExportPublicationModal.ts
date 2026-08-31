import { App, Modal, Setting, Notice, TFile, normalizePath } from 'obsidian';
import { ProjectRecord, ReferenceMetadata, CitationStyle, CitationManagerSettings } from '../types';
import { CitationEngine } from '../citationEngine';
import { ProjectIndexer } from '../projectIndexer';
import { ConfirmModal } from './ConfirmModal';

export class ExportPublicationModal extends Modal {
  private project: ProjectRecord | null;
  private allReferences: Map<string, ReferenceMetadata>;
  private projectIndexer: ProjectIndexer;
  private settings: CitationManagerSettings;
  private targetFile: TFile | null;

  private selectedStyle: CitationStyle = 'apa7';
  private bibScope: 'local' | 'global' = 'local';
  private appendBib: boolean = true;
  private cleanFootnotes: boolean = true;

  constructor(
    app: App,
    project: ProjectRecord | null,
    allReferences: Map<string, ReferenceMetadata>,
    projectIndexer: ProjectIndexer,
    settings: CitationManagerSettings,
    targetFile: TFile | null = null
  ) {
    super(app);
    this.project = project;
    this.allReferences = allReferences;
    this.projectIndexer = projectIndexer;
    this.settings = settings;
    this.targetFile = targetFile || app.workspace.getActiveFile();
    this.selectedStyle = project?.citationStyle || settings.defaultCitationStyle || 'apa7';
  }

  onOpen() {
    this.titleEl.setText("Publication Export");

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    // 1. Settings Card
    const optCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    optCard.createEl("div", { cls: "section-card-title", text: "Export Settings" });

    new Setting(optCard)
      .setName("Citation Standard")
      .setDesc("Style used for in-text citations and bibliography formatting.")
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
      .setName("Compilation Scope")
      .setDesc("Compile active document alone or batch compile the entire project corpus.")
      .addDropdown(drop => {
        drop.addOption("local", "Local (Active Document Only)");
        if (this.project) {
          drop.addOption("global", `Global (${this.project.name} Project Corpus)`);
        }
        drop.setValue(this.bibScope);
        drop.onChange(val => {
          this.bibScope = val as 'local' | 'global';
          this.renderActions(actionsContainer);
        });
      });

    new Setting(optCard)
      .setName("Clean Footnote Definitions")
      .setDesc("Remove raw [^citekey]: ... definitions from note bottom.")
      .addToggle(toggle => {
        toggle.setValue(this.cleanFootnotes);
        toggle.onChange(val => { this.cleanFootnotes = val; });
      });

    // 2. Dynamic Actions Container
    const actionsContainer = contentEl.createDiv();
    this.renderActions(actionsContainer);

    // Modal Close Row
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const closeBtn = buttonRow.createEl("button", { text: "Close" });
    closeBtn.addEventListener("click", () => this.close());
  }

  private renderActions(container: HTMLElement) {
    container.empty();

    const pubFolder = this.settings.publicationFolder || 'publication';

    if (this.bibScope === 'global' && this.project) {
      // GLOBAL SCOPE ACTIONS
      const globalCard = container.createDiv({ cls: "citation-modal-section-card" });
      globalCard.createEl("div", { cls: "section-card-title", text: `Global Corpus Batch Export: ${this.project.name}` });
      globalCard.createEl("div", {
        cls: "section-card-desc",
        text: `Compiles all linked documents in '${this.project.name}' with synchronized sequential numbering, writes them to '${pubFolder}/', and creates 'References - ${this.project.name}.md'. Source files remain unmodified.`
      });

      new Setting(globalCard)
        .setName("Batch Export Project Corpus")
        .setDesc(`Output all compiled project files to /${pubFolder}/`)
        .addButton(btn => btn
          .setButtonText(`Export Corpus to ${pubFolder}/`)
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              const res = await this.projectIndexer.compileProjectCorpus(
                this.project!,
                this.allReferences,
                this.selectedStyle,
                this.settings.publicationFolder,
                this.settings.referencesFolder
              );
              new Notice(`Exported ${res.compiledFilesCount} document(s) and master bibliography to ${pubFolder}/`);
              this.close();
            } catch (err: any) {
              new Notice(`Corpus export error: ${err.message}`);
              btn.setDisabled(false);
            }
          }));
    } else {
      // LOCAL SCOPE ACTIONS
      const localCard = container.createDiv({ cls: "citation-modal-section-card" });
      localCard.createEl("div", { cls: "section-card-title", text: "Local Document Export" });

      if (!this.targetFile) {
        localCard.createEl("div", { cls: "section-card-desc", text: "No active markdown document open." });
        return;
      }

      localCard.createEl("div", {
        cls: "section-card-desc",
        text: `Active note: ${this.targetFile.path}`
      });

      new Setting(localCard)
        .setName("Append References Section")
        .setDesc("Embed formatted bibliography section at the bottom of the exported copy.")
        .addToggle(toggle => {
          toggle.setValue(this.appendBib);
          toggle.onChange(val => { this.appendBib = val; });
        });

      // 1. Export Clean Copy (Safe)
      new Setting(localCard)
        .setName("Export Copy to Publication Folder")
        .setDesc(`Writes compiled document to /${pubFolder}/${this.targetFile.name}. Source note remains unmodified.`)
        .addButton(btn => btn
          .setButtonText(`Export to ${pubFolder}/`)
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              const pubDir = normalizePath(pubFolder);
              if (!(await this.app.vault.adapter.exists(pubDir))) {
                await this.app.vault.createFolder(pubDir);
              }
              const outPath = normalizePath(`${pubDir}/${this.targetFile!.name}`);
              const compiled = await this.generateLocalCompiledText(this.targetFile!);
              await this.app.vault.adapter.write(outPath, compiled);
              new Notice(`Exported copy to ${outPath}`);
              this.close();
            } catch (err: any) {
              new Notice(`Export error: ${err.message}`);
              btn.setDisabled(false);
            }
          }));

      // 2. Bake In-Place (Local Only, Red Warning Button)
      new Setting(localCard)
        .setName("Bake In-Place (Local Note Only)")
        .setDesc("Replaces citekeys directly inside this document. Caution: Modifies source note.")
        .addButton(btn => {
          btn.setButtonText("Bake In-Place");
          btn.buttonEl.addClass("mod-warning");
          btn.buttonEl.style.backgroundColor = "var(--text-error)";
          btn.buttonEl.style.color = "var(--text-on-accent)";
          btn.onClick(() => {
            new ConfirmModal(
              this.app,
              "Confirm In-Place Baking",
              `This will replace raw citekey markers in "${this.targetFile!.basename}" with formatted text. Are you sure? (You can use 'Revert to Citekeys' later if needed).`,
              "Bake In-Place",
              true,
              async () => {
                try {
                  const compiled = await this.generateLocalCompiledText(this.targetFile!);
                  await this.app.vault.modify(this.targetFile!, compiled);
                  new Notice(`Baked citations in "${this.targetFile!.basename}".`);
                  this.close();
                } catch (err: any) {
                  new Notice(`Bake error: ${err.message}`);
                }
              }
            ).open();
          });
        });

      // 3. Revert In-Place to Citekeys
      new Setting(localCard)
        .setName("Revert Note to Citekeys")
        .setDesc("Scans formatted citations in this document and restores [@citekey] markers.")
        .addButton(btn => btn
          .setButtonText("Revert to Citekeys")
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              await this.revertFileToCitekeys(this.targetFile!);
              new Notice(`Reverted "${this.targetFile!.basename}" to citekeys.`);
              this.close();
            } catch (err: any) {
              new Notice(`Revert error: ${err.message}`);
              btn.setDisabled(false);
            }
          }));
    }
  }

  private async generateLocalCompiledText(file: TFile): Promise<string> {
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
      } else if (this.selectedStyle === 'harvard') {
        inBodyFormatted = CitationEngine.formatInBody(ref, 'parenthetical');
      } else if (this.selectedStyle === 'chicago') {
        inBodyFormatted = CitationEngine.formatInBody(ref, 'parenthetical');
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
    if (this.appendBib && usedCitekeys.length > 0) {
      const targetRefs = usedCitekeys.map(k => this.allReferences.get(k)!).filter(Boolean);
      const bibText = CitationEngine.generateBibliography(targetRefs, this.selectedStyle, "References");
      const bibHeadingRegex = /##\s*References[\s\S]*$/i;
      content = content.replace(bibHeadingRegex, "").trimEnd();
      content += `\n\n${bibText}\n`;
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

    // Revert formatted text back to [@citekey]
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
