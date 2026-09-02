import { App, Modal, Setting, Notice, TFile, TFolder, FuzzySuggestModal, normalizePath } from 'obsidian';
import { ProjectRecord, ReferenceMetadata, CitationStyle, CitationManagerSettings } from '../../backend/types';
import { CitationEngine } from '../../backend/citationEngine';
import { ProjectIndexer } from '../../backend/projectIndexer';
import { ConfirmModal } from '../ConfirmModal';

export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
  private onSelectFolder: (folder: TFolder) => void;

  constructor(app: App, onSelectFolder: (folder: TFolder) => void) {
    super(app);
    this.onSelectFolder = onSelectFolder;
    this.setPlaceholder("Select destination folder in vault...");
  }

  getItems(): TFolder[] {
    const folders: TFolder[] = [];
    const collectFolders = (folder: TFolder) => {
      folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          collectFolders(child);
        }
      }
    };
    const root = this.app.vault.getRoot();
    collectFolders(root);
    return folders;
  }

  getItemText(item: TFolder): string {
    return item.path === "/" ? "/ (Vault Root)" : item.path;
  }

  onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent) {
    this.onSelectFolder(item);
  }
}

export class ExportPublicationModal extends Modal {
  private project: ProjectRecord | null;
  private allReferences: Map<string, ReferenceMetadata>;
  private projectIndexer: ProjectIndexer;
  private settings: CitationManagerSettings;
  private targetFile: TFile | null;
  private onSaveSettings?: () => Promise<void>;

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
    targetFile: TFile | null = null,
    onSaveSettings?: () => Promise<void>
  ) {
    super(app);
    this.project = project;
    this.allReferences = allReferences;
    this.projectIndexer = projectIndexer;
    this.settings = settings;
    this.targetFile = targetFile || app.workspace.getActiveFile();
    this.onSaveSettings = onSaveSettings;

    const saved = project?.exportSettings || settings.lastExportSettings;
    if (saved) {
      if (saved.style) this.selectedStyle = saved.style;
      if (saved.scope) this.bibScope = saved.scope;
      if (saved.cleanFootnotes !== undefined) this.cleanFootnotes = saved.cleanFootnotes;
      if (saved.appendBib !== undefined) this.appendBib = saved.appendBib;
      if (saved.outputFolder) this.outputFolder = saved.outputFolder;
    } else {
      this.selectedStyle = project?.citationStyle || settings.defaultCitationStyle || 'apa7';
      this.outputFolder = project?.publicationFolder || 'publication';
    }
  }

  private async persistProjectState() {
    const exportState = {
      style: this.selectedStyle,
      scope: this.bibScope,
      cleanFootnotes: this.cleanFootnotes,
      appendBib: this.appendBib,
      outputFolder: this.outputFolder,
    };
    if (this.project) {
      this.project.exportSettings = exportState;
      this.project.publicationFolder = this.outputFolder;
    }
    this.settings.lastExportSettings = exportState;
    if (this.onSaveSettings) {
      await this.onSaveSettings();
    }
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
        drop.onChange(async val => { 
          this.selectedStyle = val as CitationStyle; 
          await this.persistProjectState();
        });
      });

    new Setting(optCard)
      .setName("Export Output Folder")
      .setDesc("Destination vault folder where published copies and bibliographies will be saved (overwrites on export).")
      .addText(text => {
        text.setPlaceholder("publication");
        text.setValue(this.outputFolder);
        text.onChange(async val => {
          this.outputFolder = normalizePath(val.trim() || 'publication');
          await this.persistProjectState();
          this.renderActions(actionsContainer);
        });
      })
      .addButton(btn => {
        btn.setButtonText("Browse...");
        btn.setTooltip("Select destination folder from vault");
        btn.onClick(() => {
          new FolderPickerModal(this.app, async (folder) => {
            const folderPath = folder.path === "/" ? "publication" : folder.path;
            this.outputFolder = normalizePath(folderPath);
            await this.persistProjectState();
            this.onOpen();
          }).open();
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
        drop.onChange(async val => {
          this.bibScope = val as 'local' | 'global';
          await this.persistProjectState();
          this.renderActions(actionsContainer);
        });
      });

    new Setting(optCard)
      .setName("Clean Footnote Definitions")
      .setDesc("Remove raw [^citekey]: ... definitions from note bottom.")
      .addToggle(toggle => {
        toggle.setValue(this.cleanFootnotes);
        toggle.onChange(async val => { 
          this.cleanFootnotes = val; 
          await this.persistProjectState();
        });
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
          toggle.onChange(async val => { 
            this.appendBib = val; 
            await this.persistProjectState();
          });
        });

      // 1. Export Clean Copy (Safe)
      new Setting(localCard)
        .setName("Export Copy to Destination Folder")
        .setDesc(`Writes compiled document to /${pubFolder}/${this.targetFile.name}. Strips citation frontmatter. Source note remains unmodified.`)
        .addButton(btn => btn
          .setButtonText(`Export`)
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

    // Sort citekeys with comprehensive multi-tier CSL logic (Author -> Co-authors -> Year -> Title)
    if (this.selectedStyle === 'apa7' || this.selectedStyle === 'harvard' || this.selectedStyle === 'chicago') {
      const refObjs = usedCitekeys.map(k => this.allReferences.get(k)).filter(Boolean) as ReferenceMetadata[];
      const sorted = CitationEngine.sortReferences(refObjs, this.selectedStyle);
      usedCitekeys.splice(0, usedCitekeys.length, ...sorted.map(r => r.citekey));
    }

    const localIndexMap = new Map<string, number>();
    usedCitekeys.forEach((key, idx) => {
      localIndexMap.set(key, idx + 1);
    });

    const isFootnoteMode = !!this.project?.enableFootnoteMode;

    let compiled = ProjectIndexer.compileDocumentText(
      content,
      this.allReferences,
      this.selectedStyle,
      isFootnoteMode,
      localIndexMap,
      this.cleanFootnotes
    );

    // 3. Append Bibliography if requested
    if (this.appendBib && usedCitekeys.length > 0) {
      const targetRefs = usedCitekeys.map(k => this.allReferences.get(k)!).filter(Boolean);
      const bibText = CitationEngine.generateBibliography(targetRefs, this.selectedStyle, "References");
      const bibHeadingRegex = /##\s*References[\s\S]*$/i;
      compiled = compiled.replace(bibHeadingRegex, "").trimEnd();
      compiled += `\n\n${bibText}\n`;
    }

    return compiled;
  }

  onClose() {
    this.contentEl.empty();
  }
}
