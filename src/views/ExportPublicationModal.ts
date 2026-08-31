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
  private outputFolder: string = 'publication';

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
    this.outputFolder = project?.publicationFolder || 'publication';
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
      .setName("Export Output Folder")
      .setDesc("Destination vault folder where published copies and bibliographies will be saved (overwrites on export).")
      .addText(text => {
        text.setPlaceholder("publication");
        text.setValue(this.outputFolder);
        text.onChange(val => {
          this.outputFolder = normalizePath(val.trim() || 'publication');
          if (this.project) {
            this.project.publicationFolder = this.outputFolder;
          }
          this.renderActions(actionsContainer);
        });
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

    const pubFolder = this.outputFolder || 'publication';

    if (this.bibScope === 'global' && this.project) {
      // GLOBAL SCOPE ACTIONS
      const globalCard = container.createDiv({ cls: "citation-modal-section-card" });
      globalCard.createEl("div", { cls: "section-card-title", text: `Global Corpus Batch Export: ${this.project.name}` });
      globalCard.createEl("div", {
        cls: "section-card-desc",
        text: `Compiles all linked documents in '${this.project.name}', writes them to '${pubFolder}/', and creates 'References - ${this.project.name}.md'. Strips citation-manager frontmatter tags so published copies are clean. Source files remain unmodified.`
      });

      new Setting(globalCard)
        .setName("Batch Export Project Corpus")
        .setDesc(`Output all compiled project files to /${pubFolder}/`)
        .addButton(btn => btn
          .setButtonText(`Export Corpus`)
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            try {
              const res = await this.projectIndexer.compileProjectCorpus(
                this.project!,
                this.allReferences,
                this.selectedStyle,
                this.outputFolder,
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
        .setName("Export Copy to Destination Folder")
        .setDesc(`Writes compiled document to /${pubFolder}/${this.targetFile.name}. Strips citation frontmatter. Source note remains unmodified.`)
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
              let compiled = await this.generateLocalCompiledText(this.targetFile!);
              compiled = ProjectIndexer.cleanExportFrontmatter(compiled);

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
              `This will replace raw citekey markers in "${this.targetFile!.basename}" with formatted text. Are you sure?`,
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
    }
  }

  private async generateLocalCompiledText(file: TFile): Promise<string> {
    let content = await this.app.vault.read(file);
    const usedCitekeys: string[] = [];

    const bracketGroupRegex = /\[([^\]]*@[a-zA-Z0-9_:\.-]+[^\]]*)\]/g;
    const singleCitekeyRegex = /@([a-zA-Z0-9_:\.-]+)/g;

    // 1. Identify citekeys in document
    let groupMatch: RegExpExecArray | null;
    while ((groupMatch = bracketGroupRegex.exec(content)) !== null) {
      const groupContent = groupMatch[1];
      let subMatch: RegExpExecArray | null;
      singleCitekeyRegex.lastIndex = 0;
      while ((subMatch = singleCitekeyRegex.exec(groupContent)) !== null) {
        const key = subMatch[1];
        if (!usedCitekeys.includes(key)) {
          usedCitekeys.push(key);
        }
      }
    }

    for (const [key, ref] of this.allReferences.entries()) {
      const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
      const parenthetical = CitationEngine.formatInBody(ref, 'parenthetical');

      if (footnoteCallRegex.test(content) || (parenthetical && content.includes(parenthetical))) {
        if (!usedCitekeys.includes(key)) {
          usedCitekeys.push(key);
        }
      }
    }

    // Sort citekeys alphabetically if Author-Date
    if (this.selectedStyle === 'apa7' || this.selectedStyle === 'harvard' || this.selectedStyle === 'chicago') {
      usedCitekeys.sort((a, b) => {
        const refA = this.allReferences.get(a);
        const refB = this.allReferences.get(b);
        const nameA = refA?.authors?.[0] || a;
        const nameB = refB?.authors?.[0] || b;
        return nameA.localeCompare(nameB);
      });
    }

    const localIndexMap = new Map<string, number>();
    usedCitekeys.forEach((key, idx) => {
      localIndexMap.set(key, idx + 1);
    });

    // 2. Format multi-citation and single-citation bracket groups
    content = content.replace(bracketGroupRegex, (fullMatch, groupInner) => {
      const keysInGroup: string[] = [];
      let kMatch: RegExpExecArray | null;
      singleCitekeyRegex.lastIndex = 0;
      while ((kMatch = singleCitekeyRegex.exec(groupInner)) !== null) {
        keysInGroup.push(kMatch[1]);
      }

      if (keysInGroup.length === 0) return fullMatch;

      if (this.selectedStyle === 'ieee') {
        const numbers = keysInGroup.map(k => localIndexMap.get(k)).filter(n => n !== undefined);
        return numbers.length > 0 ? `[${numbers.join(', ')}]` : fullMatch;
      } else if (this.selectedStyle === 'vancouver') {
        const numbers = keysInGroup.map(k => localIndexMap.get(k)).filter(n => n !== undefined);
        return numbers.length > 0 ? `(${numbers.join(', ')})` : fullMatch;
      } else {
        const formattedParts = keysInGroup.map(k => {
          const ref = this.allReferences.get(k);
          if (!ref) return null;
          const inBody = CitationEngine.formatInBody(ref, 'parenthetical');
          return inBody.replace(/^\(|\)$/g, '');
        }).filter(Boolean);
        return formattedParts.length > 0 ? `(${formattedParts.join('; ')})` : fullMatch;
      }
    });

    // 3. Format individual footnotes and clean definitions
    for (const key of usedCitekeys) {
      const ref = this.allReferences.get(key);
      if (!ref) continue;

      const localIdx = localIndexMap.get(key) || 1;
      let inBodyFormatted = "";
      if (this.selectedStyle === 'ieee') {
        inBodyFormatted = `[${localIdx}]`;
      } else if (this.selectedStyle === 'vancouver') {
        inBodyFormatted = `(${localIdx})`;
      } else {
        inBodyFormatted = CitationEngine.formatInBody(ref, 'parenthetical');
      }

      const footnoteCallRegex = new RegExp(`\\[\\^${key}\\](?!:)`, 'g');
      content = content.replace(footnoteCallRegex, inBodyFormatted);

      if (this.cleanFootnotes) {
        const fnCleanRegex = new RegExp(`^\\s*\\[\\^${key}\\]:.*$\\n?`, 'gm');
        content = content.replace(fnCleanRegex, "");
      }
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

  onClose() {
    this.contentEl.empty();
  }
}
