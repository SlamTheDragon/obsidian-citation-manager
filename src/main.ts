import { Plugin, WorkspaceLeaf, Notice, MarkdownView, Menu, Editor, TFile } from 'obsidian';
import { CitationManagerSettings, DEFAULT_SETTINGS, ALL_PROJECTS_ID } from './types';
import { StorageManager } from './storageManager';
import { ProjectIndexer } from './projectIndexer';
import { CitationManagerView, VIEW_TYPE_CITATION_MANAGER } from './views/CitationManagerView';
import { InsertCitationModal } from './views/InsertCitationModal';
import { BibliographyModal } from './views/BibliographyModal';
import { ExportPublicationModal } from './views/ExportPublicationModal';
import { ReferenceEditorModal } from './views/ReferenceEditorModal';
import { CitationManagerSettingTab } from './settingsTab';
import { CitationEditorSuggest } from './editorSuggest';
import { MetadataResolvers } from './metadataResolvers';
import { Logger } from './logger';

export default class CitationManagerPlugin extends Plugin {
  settings: CitationManagerSettings;
  storageManager: StorageManager;
  projectIndexer: ProjectIndexer;

  async onload() {
    await this.loadSettings();

    Logger.setEnabled(this.settings.debugMode);
    Logger.debug("Citation Manager Plugin loading...", this.settings);

    this.storageManager = new StorageManager(this.app, this.settings);
    this.projectIndexer = new ProjectIndexer(this.app);

    // Register Custom Sidebar View
    this.registerView(
      VIEW_TYPE_CITATION_MANAGER,
      (leaf) => new CitationManagerView(
        leaf,
        this.storageManager,
        this.projectIndexer,
        this.settings,
        () => this.saveSettings()
      )
    );

    // Register In-Editor Autocomplete Suggest Provider
    this.registerEditorSuggest(new CitationEditorSuggest(this.app, this));

    // Add Ribbon Icon
    this.addRibbonIcon('quote-glyph', 'Citation Manager', () => {
      this.activateView();
    });

    // Register Editor Context Menu
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
        menu.addItem(item => {
          item.setTitle("Insert Citation...")
            .setIcon("quote-glyph")
            .setSection("insert")
            .onClick(async () => {
              const refsMap = await this.storageManager.loadAllReferences();
              const refs = Array.from(refsMap.values());
              if (refs.length === 0) {
                new Notice("No citations found in library. Add citations in the panel first.");
                return;
              }
              new InsertCitationModal(
                this.app,
                refs,
                this.getActiveProject(),
                this.settings.defaultCitationStyle,
                this.settings.defaultInBodyFormat
              ).open();
            });
        });

        menu.addItem(item => {
          item.setTitle("Export for Publication...")
            .setIcon("printer")
            .setSection("insert")
            .onClick(async () => {
              const refsMap = await this.storageManager.loadAllReferences();
              new ExportPublicationModal(
                this.app,
                this.getActiveProject(),
                refsMap,
                this.projectIndexer,
                this.settings,
                view.file
              ).open();
            });
        });

        const activeFile = view.file;
        const project = this.getActiveProject();
        if (activeFile && project && project.id !== ALL_PROJECTS_ID) {
          const isRegistered = this.projectIndexer.isFileInProject(activeFile, project);
          if (!isRegistered) {
            menu.addItem(item => {
              item.setTitle(`Link Note to '${project.name}'`)
                .setIcon("folder-plus")
                .onClick(async () => {
                  await this.projectIndexer.addProjectToFrontmatter(activeFile, project.name);
                  if (!project.registeredFiles.includes(activeFile.path)) {
                    project.registeredFiles.push(activeFile.path);
                  }
                  await this.saveSettings();
                  new Notice(`Linked "${activeFile.basename}" to ${project.name}`);
                  this.refreshOpenViews();
                });
            });
          }
        }
      })
    );

    // Register File Watchers
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file.path.startsWith(this.settings.referencesFolder)) {
          this.refreshOpenViews();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path.startsWith(this.settings.referencesFolder)) {
          this.refreshOpenViews();
        }
      })
    );

    // Live Automated Footnote Sync on Document Edits
    let liveSyncDebounce: any = null;
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (!(file instanceof TFile) || !file.path.endsWith('.md')) return;
        if (file.path.startsWith(this.settings.referencesFolder)) return;

        const project = this.getActiveProject();
        const shouldSync = Boolean(project?.enableFootnoteMode);

        if (shouldSync && project) {
          if (liveSyncDebounce) clearTimeout(liveSyncDebounce);
          liveSyncDebounce = setTimeout(async () => {
            const isFileInProj = this.projectIndexer.isFileInProject(file, project);
            if (isFileInProj) {
              const refsMap = await this.storageManager.loadAllReferences();
              await this.projectIndexer.syncFootnotesInRegisteredFiles(
                project,
                refsMap,
                project.citationStyle || this.settings.defaultCitationStyle,
                this.settings.referencesFolder
              );
            }
          }, 800);
        }
      })
    );

    // Command Palette Commands (Clean, concise naming)
    this.addCommand({
      id: 'open-citation-manager-view',
      name: 'Open Panel',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'insert-citation-at-cursor',
      name: 'Insert Citation',
      editorCallback: async (editor, view) => {
        const refsMap = await this.storageManager.loadAllReferences();
        const refs = Array.from(refsMap.values());

        if (refs.length === 0) {
          new Notice("No citations in library. Add one via DOI or PDF first.");
          return;
        }

        new InsertCitationModal(
          this.app,
          refs,
          this.getActiveProject(),
          this.settings.defaultCitationStyle,
          this.settings.defaultInBodyFormat
        ).open();
      },
    });

    this.addCommand({
      id: 'quick-add-reference-prompt',
      name: 'Quick Add Citation (DOI / arXiv / URL / Manual)',
      callback: async () => {
        const project = this.getActiveProject();
        new ReferenceEditorModal(
          this.app,
          { projects: project ? [project.id] : [] },
          async (newRef) => {
            if (project && !newRef.projects.includes(project.id)) newRef.projects.push(project.id);
            await this.storageManager.saveReference(newRef);
            new Notice(`Added citation [${newRef.citekey}]!`);
            this.refreshOpenViews();
          },
          true
        ).open();
      },
    });

    this.addCommand({
      id: 'register-active-file-to-project',
      name: 'Link File to Bucket',
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          new Notice("No active document open.");
          return;
        }
        const project = this.getActiveProject();
        if (!project || project.id === ALL_PROJECTS_ID) {
          new Notice("Please select a specific bucket first.");
          return;
        }
        await this.projectIndexer.addProjectToFrontmatter(activeFile, project.name);
        if (!project.registeredFiles.includes(activeFile.path)) {
          project.registeredFiles.push(activeFile.path);
        }
        await this.saveSettings();
        new Notice(`Linked "${activeFile.basename}" to ${project.name}`);
        this.refreshOpenViews();
      },
    });

    this.addCommand({
      id: 'generate-project-bibliography',
      name: 'Generate Bibliography',
      callback: async () => {
        const refsMap = await this.storageManager.loadAllReferences();
        const project = this.getActiveProject();
        const refs = Array.from(refsMap.values());
        const stats = project ? await this.projectIndexer.indexProject(project, refsMap, this.settings.referencesFolder) : null;

        new BibliographyModal(
          this.app,
          project,
          refs,
          stats,
          this.settings.defaultCitationStyle
        ).open();
      },
    });

    this.addCommand({
      id: 'sync-footnotes-in-project',
      name: 'Resync Notes in Bucket',
      callback: async () => {
        const project = this.getActiveProject();
        if (!project || project.id === ALL_PROJECTS_ID) {
          new Notice("Please select a specific bucket to sync its linked notes.");
          return;
        }
        const refsMap = await this.storageManager.loadAllReferences();
        const res = await this.projectIndexer.syncFootnotesInRegisteredFiles(
          project,
          refsMap,
          project.citationStyle || this.settings.defaultCitationStyle,
          this.settings.referencesFolder
        );
        new Notice(`Synced ${res.updatedFootnotesCount} definitions across ${res.updatedFilesCount} documents.`);
      },
    });

    this.addCommand({
      id: 'export-for-publication',
      name: 'Export for Publication', // user updated line
      callback: async () => {
        const refsMap = await this.storageManager.loadAllReferences();
        new ExportPublicationModal(
          this.app,
          this.getActiveProject(),
          refsMap,
          this.projectIndexer,
          this.settings
        ).open();
      },
    });

    // Add Settings Tab
    this.addSettingTab(new CitationManagerSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CITATION_MANAGER);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_CITATION_MANAGER, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  refreshOpenViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CITATION_MANAGER);
    for (const leaf of leaves) {
      if (leaf.view instanceof CitationManagerView) {
        leaf.view.refreshData();
      }
    }
  }

  getActiveProject() {
    if (!this.settings.activeProjectId || this.settings.activeProjectId === ALL_PROJECTS_ID) {
      return null;
    }
    return this.settings.projects.find(p => p.id === this.settings.activeProjectId) || null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    Logger.setEnabled(this.settings.debugMode);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
