import { App, ItemView, WorkspaceLeaf, Notice, MarkdownView, TFile, setIcon, normalizePath } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, ProjectHealthStats, CitationManagerSettings, CitationStyle, InBodyFormat, ALL_PROJECTS_ID } from '../types';
import { StorageManager } from '../storageManager';
import { ProjectIndexer } from '../projectIndexer';
import { MetadataResolvers } from '../metadataResolvers';
import { CitationEngine } from '../citationEngine';
import { ReferenceEditorModal } from './ReferenceEditorModal';
import { UsageLocationsModal } from './UsageLocationsModal';
import { PDFImportModal } from './PDFImportModal';
import { FixInconsistenciesModal } from './FixInconsistenciesModal';
import { PromptModal } from './PromptModal';
import { ConfirmModal } from './ConfirmModal';
import { ExportPublicationModal } from './ExportPublicationModal';
import { CitationNotesModal } from './CitationNotesModal';
import { Logger } from '../logger';

export const VIEW_TYPE_CITATION_MANAGER = "citation-manager-view";

type ActiveSubpanel = 'citations' | 'add' | 'bib' | 'stats';

export class CitationManagerView extends ItemView {
  private storageManager: StorageManager;
  private projectIndexer: ProjectIndexer;
  private settings: CitationManagerSettings;
  private onSaveSettings: () => Promise<void>;

  private referencesMap: Map<string, ReferenceMetadata> = new Map();
  private stats: ProjectHealthStats | null = null;
  private dismissedLints: Set<string> = new Set();
  private statsActiveTab: 'docs' | 'diagnostics' = 'docs';
  private searchQuery: string = "";
  private selectedTypeFilter: string = "all";
  private currentSubpanel: ActiveSubpanel = 'citations';

  // Bibliography state
  private bibSelectedStyle: CitationStyle = 'apa7';
  private bibOnlyCited: boolean = false;
  private bibExportPath: string = "";

  private lastActiveMarkdownView: MarkdownView | null = null;
  private lastActiveFilePath: string | null = null;
  private statusMessage: string = "Ready";
  private refreshDebounceTimer: any = null;

  constructor(
    leaf: WorkspaceLeaf,
    storageManager: StorageManager,
    projectIndexer: ProjectIndexer,
    settings: CitationManagerSettings,
    onSaveSettings: () => Promise<void>
  ) {
    super(leaf);
    this.storageManager = storageManager;
    this.projectIndexer = projectIndexer;
    this.settings = settings;
    this.onSaveSettings = onSaveSettings;
    this.bibSelectedStyle = settings.defaultCitationStyle;
  }

  getViewType(): string {
    return VIEW_TYPE_CITATION_MANAGER;
  }

  getDisplayText(): string {
    return "Citations";
  }

  getIcon(): string {
    return "quote-glyph";
  }

  async onOpen() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (mdView) {
          this.lastActiveMarkdownView = mdView;
        }
        const activeFile = mdView?.file || this.app.workspace.getActiveFile();
        if (activeFile?.path !== this.lastActiveFilePath) {
          this.lastActiveFilePath = activeFile?.path || null;
          this.updateActiveDocBanner();
        }
      })
    );

    this.registerEvent(
      this.app.metadataCache.on('changed', () => {
        this.refreshDataDebounced(60);
      })
    );

    this.lastActiveMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.lastActiveFilePath = this.lastActiveMarkdownView?.file?.path || null;
    await this.refreshData();
  }

  refreshDataDebounced(delayMs: number = 40) {
    if (this.refreshDebounceTimer) clearTimeout(this.refreshDebounceTimer);
    this.refreshDebounceTimer = setTimeout(() => {
      this.refreshData();
    }, delayMs);
  }

  async refreshData() {
    const t0 = performance.now();
    this.referencesMap = await this.storageManager.loadAllReferences();
    this.dismissedLints = await this.storageManager.loadDismissedLints();
    this.discoverFrontmatterProjects();

    const activeProject = this.getActiveProjectRecord();

    if (activeProject && activeProject.id !== ALL_PROJECTS_ID) {
      this.stats = await this.projectIndexer.indexProject(
        activeProject,
        this.referencesMap,
        this.settings.referencesFolder,
        this.settings.projects,
        this.dismissedLints,
        this.settings.enableFootnoteMode
      );
    } else {
      const virtualAllProject: ProjectRecord = {
        id: ALL_PROJECTS_ID,
        name: "All Citations",
        registeredFiles: this.settings.projects.flatMap(p => p.registeredFiles || []),
        referenceIds: Array.from(this.referencesMap.keys()),
        created: "",
        modified: "",
      };
      this.stats = await this.projectIndexer.indexProject(
        virtualAllProject,
        this.referencesMap,
        this.settings.referencesFolder,
        this.settings.projects,
        this.dismissedLints,
        this.settings.enableFootnoteMode
      );
    }

    const elapsed = Math.round(performance.now() - t0);
    this.statusMessage = `Ready • ${this.referencesMap.size} loaded (${elapsed}ms)`;
    this.renderUI();
  }

  private discoverFrontmatterProjects() {
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path.startsWith(normalizePath(this.settings.referencesFolder))) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm) {
        const list = fm['citation-manager'] || fm['citation_manager'] || fm['citation-project'] || fm['citation_project'];
        const names = Array.isArray(list) ? list : (typeof list === 'string' ? [list] : []);
        for (const rawName of names) {
          if (typeof rawName === 'string' && rawName.trim()) {
            const name = rawName.trim();
            const exists = this.settings.projects.some(p => p.name.toLowerCase() === name.toLowerCase() || p.id.toLowerCase() === name.toLowerCase());
            if (!exists) {
              this.settings.projects.push({
                id: name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
                name: name,
                registeredFiles: [file.path],
                referenceIds: [],
                citationStyle: this.settings.defaultCitationStyle,
                inBodyFormat: this.settings.defaultInBodyFormat,
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
              });
              Logger.debug(`Discovered project from frontmatter: ${name}`);
            }
          }
        }
      }
    }
  }

  getActiveProjectRecord(): ProjectRecord | null {
    if (!this.settings.activeProjectId || this.settings.activeProjectId === ALL_PROJECTS_ID) {
      return null;
    }
    return this.settings.projects.find(p => p.id === this.settings.activeProjectId) || null;
  }

  private renderUI(restoreSearchCursor?: number) {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("citation-manager-container");

    const project = this.getActiveProjectRecord();

    // 1. TOP BAR (Project Dropdown + Project Action Buttons)
    this.renderTopBar(container, project);

    // 2. MERGED SEARCH & ACTION ROW (Search Bar + [Add Source] + [Bibliography])
    this.renderMergedSearchAndActionRow(container, restoreSearchCursor);

    // 3. MAIN DYNAMIC SUBPANEL CONTENT (Consumes maximum vertical space)
    const contentArea = container.createDiv({ cls: "citation-subpanel-dynamic-area" });
    switch (this.currentSubpanel) {
      case 'add':
        this.renderAddSourceSubpanel(contentArea, project);
        break;
      case 'bib':
        this.renderBibliographySubpanel(contentArea, project);
        break;
      case 'stats':
        this.renderStatsSubpanel(contentArea, project);
        break;
      case 'citations':
      default:
        this.renderCitationsListSubpanel(contentArea, project);
        break;
    }

    // 4. DISTINCT & VISIBLE STATUS BAR
    this.renderVisibleStatusBar(container, project);
  }

  // --- 1. TOP BAR ---
  private renderTopBar(container: HTMLElement, project: ProjectRecord | null) {
    const topBar = container.createDiv({ cls: "citation-top-bar" });

    // Project Dropdown
    const select = topBar.createEl("select", { cls: "dropdown citation-project-dropdown" });
    const allOpt = select.createEl("option", { 
      value: ALL_PROJECTS_ID, 
      text: `All Citations (${this.referencesMap.size})` 
    });
    if (!project || this.settings.activeProjectId === ALL_PROJECTS_ID) {
      allOpt.selected = true;
    }

    for (const p of this.settings.projects) {
      const opt = select.createEl("option", { value: p.id, text: p.name });
      if (project && p.id === project.id) opt.selected = true;
    }

    select.addEventListener("change", async () => {
      this.settings.activeProjectId = select.value;
      await this.onSaveSettings();
      await this.refreshData();
    });

    // Merged Project Action Pill
    const projActions = topBar.createDiv({ cls: "citation-merged-action-pill" });

    // New Bucket Button
    const newProjBtn = projActions.createEl("button", { cls: "merged-btn-left", title: "Create Citation Bucket" });
    setIcon(newProjBtn, "folder-plus");
    newProjBtn.addEventListener("click", () => {
      new PromptModal(
        this.app,
        "Create Citation Bucket",
        "e.g. Spatial HCI",
        "",
        async (name) => {
          const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          const newProj: ProjectRecord = {
            id,
            name,
            registeredFiles: [],
            referenceIds: [],
            citationStyle: this.settings.defaultCitationStyle,
            inBodyFormat: this.settings.defaultInBodyFormat,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
          };
          this.settings.projects.push(newProj);
          this.settings.activeProjectId = id;
          await this.onSaveSettings();
          await this.refreshData();
          new Notice(`Created bucket: ${name}`);
        }
      ).open();
    });

    // Delete Bucket Button
    if (project) {
      const deleteProjBtn = projActions.createEl("button", { cls: "merged-btn-right btn-danger", title: `Delete '${project.name}'` });
      setIcon(deleteProjBtn, "trash-2");
      deleteProjBtn.addEventListener("click", () => {
        new ConfirmModal(
          this.app,
          `Delete Bucket: ${project.name}`,
          `Delete bucket '${project.name}'? This removes its tag from document frontmatters. (References in .references will remain safe).`,
          "Delete Bucket",
          true,
          async () => {
            await this.projectIndexer.deleteProjectGlobally(project.name, this.settings.referencesFolder);
            this.settings.projects = this.settings.projects.filter(p => p.id !== project.id);
            this.settings.activeProjectId = ALL_PROJECTS_ID;
            await this.onSaveSettings();
            new Notice(`Deleted bucket '${project.name}'`);
            await this.refreshData();
          }
        ).open();
      });
    }
  }

  // --- 2. MERGED SEARCH & ACTION ROW ---
  private renderMergedSearchAndActionRow(container: HTMLElement, restoreSearchCursor?: number) {
    const row = container.createDiv({ cls: "citation-merged-search-island" });

    // Search Input
    const searchBox = row.createEl("input", {
      type: "text",
      placeholder: "Search or enter DOI/arXiv to fetch...",
      cls: "citation-merged-search-input",
      value: this.searchQuery
    });

    // Clicking / focusing search automatically returns to Citations view
    searchBox.addEventListener("focus", () => {
      if (this.currentSubpanel !== 'citations') {
        this.currentSubpanel = 'citations';
        const cursor = searchBox.selectionStart ?? searchBox.value.length;
        this.renderUI(cursor);
      }
    });

    searchBox.addEventListener("input", () => {
      const cursor = searchBox.selectionStart ?? searchBox.value.length;
      this.searchQuery = searchBox.value.toLowerCase();
      if (this.currentSubpanel !== 'citations') {
        this.currentSubpanel = 'citations';
        this.renderUI(cursor);
      } else {
        const cardsList = container.querySelector(".citation-reference-list-container") as HTMLElement;
        if (cardsList) {
          this.renderCardsOnly(cardsList, this.getActiveProjectRecord());
        }
      }
    });

    // Enter shortcut on search box: detect DOI, arXiv, ISBN, URL and open fetch modal
    searchBox.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const val = searchBox.value.trim();
        const isIdentifier = val.startsWith("10.") ||
                             val.includes("doi.org") ||
                             val.toLowerCase().startsWith("arxiv:") ||
                             val.startsWith("http://") ||
                             val.startsWith("https://") ||
                             /^97[89][-0-9]+$/.test(val) ||
                             /^\d{4}\.\d{4,5}(v\d+)?$/.test(val);
        if (isIdentifier) {
          e.preventDefault();
          const notice = new Notice(`Fetching metadata for "${val}"...`, 0);
          try {
            const project = this.getActiveProjectRecord();
            const resolved = await MetadataResolvers.detectAndResolve(val);
            notice.hide();
            new ReferenceEditorModal(
              this.app,
              {
                ...resolved,
                projects: project && project.id !== ALL_PROJECTS_ID ? [project.id] : (resolved.projects || [])
              },
              async (newRef) => {
                if (project && project.id !== ALL_PROJECTS_ID && !newRef.projects.includes(project.id)) {
                  newRef.projects.push(project.id);
                }
                await this.storageManager.saveReference(newRef);
                this.searchQuery = "";
                this.currentSubpanel = 'citations';
                new Notice(`Added citation [${newRef.citekey}]`);
                await this.refreshData();
              },
              true
            ).open();
          } catch (err: any) {
            notice.hide();
            new Notice(`Fetch error: ${err.message}`);
          }
        }
      }
    });

    // Action Button 1: Add Citations Toggle (+)
    const addBtn = row.createEl("button", { 
      cls: `citation-merged-btn ${this.currentSubpanel === 'add' ? 'active' : ''}`, 
      title: "Add Citation (DOI, PDF, Web, Manual)" 
    });
    setIcon(addBtn, "plus");
    addBtn.addEventListener("click", () => {
      this.currentSubpanel = this.currentSubpanel === 'add' ? 'citations' : 'add';
      this.renderUI();
    });

    // Action Button 2: Bibliography Toggle (Quotation mark icon 'quote-glyph')
    const bibBtn = row.createEl("button", { 
      cls: `citation-merged-btn merged-btn-right-end ${this.currentSubpanel === 'bib' ? 'active' : ''}`, 
      title: "Generate Bibliography" 
    });
    setIcon(bibBtn, "quote-glyph");
    bibBtn.addEventListener("click", () => {
      this.currentSubpanel = this.currentSubpanel === 'bib' ? 'citations' : 'bib';
      this.renderUI();
    });

    if (restoreSearchCursor !== undefined) {
      setTimeout(() => {
        searchBox.focus();
        searchBox.setSelectionRange(restoreSearchCursor, restoreSearchCursor);
      }, 0);
    }
  }

  // --- SUBPANEL 1: CITATIONS LIST VIEW ---
  private renderCitationsListSubpanel(container: HTMLElement, project: ProjectRecord | null) {
    const wrapper = container.createDiv({ cls: "citation-subpanel-fullheight" });

    // Filter Chips (Enlarged)
    const chipsContainer = wrapper.createDiv({ cls: "citation-type-chips" });
    const types = [
      { id: "all", label: "All" },
      { id: "journal", label: "Journal" },
      { id: "conference", label: "Conf" },
      { id: "book", label: "Book" },
      { id: "webpage", label: "Web" },
      { id: "blog", label: "Blog" },
      { id: "video", label: "Video" },
      { id: "preprint", label: "Preprint" },
      { id: "report", label: "Report" },
    ];

    for (const t of types) {
      const chip = chipsContainer.createSpan({
        cls: `type-chip ${this.selectedTypeFilter === t.id ? 'active' : ''}`,
        text: t.label
      });
      chip.addEventListener("click", () => {
        this.selectedTypeFilter = t.id;
        chipsContainer.querySelectorAll(".type-chip").forEach(c => c.removeClass("active"));
        chip.addClass("active");
        this.renderCardsOnly(cardsContainer, project);
      });
    }

    // Scrollable Cards List
    const cardsContainer = wrapper.createDiv({ cls: "citation-reference-list-container" });
    this.renderCardsOnly(cardsContainer, project);
  }

  private renderCardsOnly(container: HTMLElement, project: ProjectRecord | null) {
    container.empty();
    const filtered = this.getFilteredReferences(project);

    if (filtered.length === 0) {
      const emptyBox = container.createDiv({ cls: "citation-empty-clean" });
      setIcon(emptyBox.createDiv({ cls: "empty-icon" }), "book-open");
      emptyBox.createEl("h3", { text: "No citations found" });
      emptyBox.createEl("p", { text: "Click [+] above to add a citation via DOI, PDF, or manually." });
      return;
    }

    for (const ref of filtered) {
      this.renderReferenceCard(container, ref, project);
    }
  }

  private renderReferenceCard(container: HTMLElement, ref: ReferenceMetadata, project: ProjectRecord | null) {
    const card = container.createDiv({ cls: "citation-card" });

    // Header
    const cardHeader = card.createDiv({ cls: "citation-card-header" });
    cardHeader.createSpan({ cls: `citation-type-badge type-${ref.type}`, text: ref.type.toUpperCase() });
    cardHeader.createSpan({ cls: "citation-key-pill", text: ref.citekey });

    // Usage & Notes badges
    const occurrences = this.stats?.referenceUsageMap[ref.citekey] || [];
    if (occurrences.length > 0) {
      const usageBadge = cardHeader.createSpan({ 
        cls: "citation-usage-pill used", 
        text: `Cited (${occurrences.length}x)`,
        title: "Click to see document occurrences" 
      });
      usageBadge.addEventListener("click", () => {
        new UsageLocationsModal(this.app, ref.citekey, occurrences).open();
      });
    } else {
      cardHeader.createSpan({ cls: "citation-usage-pill unused", text: "Unused" });
    }

    if (ref.userNotes && ref.userNotes.trim()) {
      const notesPill = cardHeader.createSpan({ 
        cls: "citation-notes-pill", 
        text: "Notes",
        title: "Click to view/edit literature notes" 
      });
      notesPill.addEventListener("click", () => {
        new CitationNotesModal(this.app, ref, this.storageManager, async () => {
          await this.refreshData();
        }).open();
      });
    }

    // Title & Authors
    card.createDiv({ cls: "citation-card-title", text: ref.title });
    const authorYear = card.createDiv({ cls: "citation-card-author-year" });
    authorYear.createSpan({ text: (ref.authors || []).slice(0, 3).join(", ") + ((ref.authors?.length || 0) > 3 ? " et al." : "") });
    authorYear.createSpan({ cls: "citation-year-dot", text: ` • ${ref.year}` });

    if (ref.publication) {
      card.createDiv({ cls: "citation-card-publication", text: ref.publication });
    }

    // Expandable In-Card Notes Accordion (Shows 'Notes' when collapsed, 25-35 chars when opened, no headers)
    const rawNotes = (ref.userNotes || "").trim();
    const cleanNotes = rawNotes
      .replace(/^#+\s+[^\r\n]*/gm, '') // Strip all markdown headers
      .replace(/\s+/g, ' ')             // Collapse extra newlines/spaces
      .trim();

    if (cleanNotes.length > 0) {
      const accordion = card.createDiv({ cls: "citation-card-notes-accordion" });
      const accHeader = accordion.createDiv({ cls: "citation-card-notes-header" });
      const accChevron = accHeader.createSpan({ cls: "notes-accordion-icon" });
      setIcon(accChevron, "chevron-right");
      const accTitle = accHeader.createSpan({ cls: "notes-accordion-title", text: "Notes" });

      const accBody = accordion.createDiv({ cls: "citation-card-notes-body" });
      accBody.style.display = "none";

      const previewLength = 30;
      const previewText = cleanNotes.length > previewLength 
        ? `${cleanNotes.slice(0, previewLength)}...` 
        : cleanNotes;

      const snippetEl = accBody.createDiv({ 
        cls: "citation-card-note-snippet", 
        title: "Click to edit literature notes in modal" 
      });
      snippetEl.setText(`“${previewText}”`);
      snippetEl.addEventListener("click", (e) => {
        e.stopPropagation();
        new CitationNotesModal(this.app, ref, this.storageManager, async () => {
          await this.refreshData();
        }).open();
      });

      let isOpen = false;
      accHeader.addEventListener("click", () => {
        isOpen = !isOpen;
        if (isOpen) {
          accordion.addClass("open");
          accBody.style.display = "block";
          setIcon(accChevron, "chevron-down");
          accTitle.style.display = "none"; // Hide title when opened as requested
        } else {
          accordion.removeClass("open");
          accBody.style.display = "none";
          setIcon(accChevron, "chevron-right");
          accTitle.style.display = "inline"; // Show title when collapsed
        }
      });
    }

    // Actions Row
    const actionsRow = card.createDiv({ cls: "citation-card-actions" });

    // Insert Button
    const insertBtn = actionsRow.createEl("button", { cls: "citation-card-btn", title: "Insert Citation at Cursor" });
    setIcon(insertBtn.createSpan({ cls: "btn-icon" }), "quote-glyph");
    insertBtn.createSpan({ text: " Insert" });
    insertBtn.addEventListener("click", async () => {
      await this.insertCitationIntoActiveEditor(ref, project);
    });

    // Notes Button (Opens isolated literature note editor modal)
    const notesBtn = actionsRow.createEl("button", { 
      cls: `citation-card-btn ${ref.userNotes ? 'has-notes' : ''}`, 
      title: "View & Edit Research Notes in Modal" 
    });
    setIcon(notesBtn.createSpan({ cls: "btn-icon" }), "file-text");
    notesBtn.createSpan({ text: " Notes" });
    notesBtn.addEventListener("click", () => {
      new CitationNotesModal(this.app, ref, this.storageManager, async () => {
        await this.refreshData();
      }).open();
    });

    // Edit Button
    const editBtn = actionsRow.createEl("button", { cls: "citation-card-btn", title: "Edit Reference Metadata" });
    setIcon(editBtn.createSpan({ cls: "btn-icon" }), "edit-3");
    editBtn.createSpan({ text: " Edit" });
    editBtn.addEventListener("click", () => {
      new ReferenceEditorModal(
        this.app,
        ref,
        async (updatedRef, origCitekey) => {
          await this.storageManager.saveReference(updatedRef, origCitekey);
          const res = await this.projectIndexer.syncReferenceUpdateAcrossDocuments(
            ref,
            updatedRef,
            project,
            project?.citationStyle || this.settings.defaultCitationStyle,
            this.settings.referencesFolder
          );
          this.statusMessage = `[Updated citation across ${res.modifiedFiles} file(s) in ${res.timeMs}ms]`;
          await this.refreshData();
        },
        false
      ).open();
    });

    // PDF Button (Opens attached PDF reliably)
    if (ref.pdfAttachment) {
      const pdfBtn = actionsRow.createEl("button", { cls: "citation-card-btn", title: "Open Attached PDF" });
      setIcon(pdfBtn.createSpan({ cls: "btn-icon" }), "paperclip");
      pdfBtn.createSpan({ text: " PDF" });
      pdfBtn.addEventListener("click", async () => {
        await this.openAttachedPDF(ref);
      });
    }

    // Delete Button
    const deleteBtn = actionsRow.createEl("button", { cls: "citation-card-btn btn-danger", title: "Delete Reference" });
    setIcon(deleteBtn.createSpan({ cls: "btn-icon" }), "trash-2");
    deleteBtn.addEventListener("click", () => {
      if (this.settings.blockDeletionIfInUse && this.stats) {
        const check = this.projectIndexer.canDelete(ref.citekey, this.stats);
        if (!check.allowed) {
          new Notice(`Cannot delete [${ref.citekey}]: cited in ${check.occurrences.length} location(s).`);
          new UsageLocationsModal(this.app, ref.citekey, check.occurrences).open();
          return;
        }
      }

      new ConfirmModal(
        this.app,
        `Delete Reference: ${ref.citekey}`,
        `Delete '${ref.title}'? Permanently removes its entry.`,
        "Delete",
        true,
        async () => {
          await this.storageManager.deleteReference(ref.citekey);
          new Notice(`Deleted [${ref.citekey}]`);
          await this.refreshData();
        }
      ).open();
    });
  }

  private async openAttachedPDF(ref: ReferenceMetadata) {
    if (!ref.pdfAttachment) return;
    const pathsToTry = [
      normalizePath(ref.pdfAttachment),
      normalizePath(`${this.settings.referencesFolder}/attachments/${ref.citekey}.pdf`),
      normalizePath(`${this.settings.referencesFolder}/${ref.citekey}.pdf`),
    ];

    for (const p of pathsToTry) {
      const file = this.app.vault.getAbstractFileByPath(p);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file);
        return;
      }
    }

    const adapter: any = this.app.vault.adapter;
    let basePath = adapter.basePath || "";
    if (!basePath && typeof adapter.getBasePath === "function") {
      basePath = adapter.getBasePath();
    }

    for (const p of pathsToTry) {
      if (await this.app.vault.adapter.exists(p)) {
        try {
          const electron = (window as any).require ? (window as any).require('electron') : null;
          const path = (window as any).require ? (window as any).require('path') : null;
          if (electron && path && basePath) {
            const absPath = path.resolve(basePath, p);
            await electron.shell.openPath(absPath);
            return;
          }
        } catch {}

        if ((this.app as any).openWithDefaultApp) {
          const fullPath = adapter.getFullPath ? adapter.getFullPath(p) : (basePath ? `${basePath}/${p}` : p);
          (this.app as any).openWithDefaultApp(fullPath);
          return;
        }
      }
    }

    new Notice(`PDF attachment not found for [${ref.citekey}]`);
  }

  // --- SUBPANEL 2: ADD SOURCE SUBPANEL ---
  private renderAddSourceSubpanel(container: HTMLElement, project: ProjectRecord | null) {
    const wrapper = container.createDiv({ cls: "citation-subpanel-fullheight" });

    // 1. Prominent Top "+ New Citation" Button
    const topActionCard = wrapper.createDiv({ cls: "citation-card citation-top-action-card" });
    const bigManualBtn = topActionCard.createEl("button", { cls: "citation-big-cta-btn", text: "+ New Citation" });
    bigManualBtn.addEventListener("click", () => {
      new ReferenceEditorModal(
        this.app,
        { projects: project ? [project.id] : [] },
        async (newRef) => {
          if (project && !newRef.projects.includes(project.id)) newRef.projects.push(project.id);
          await this.storageManager.saveReference(newRef);
          this.currentSubpanel = 'citations';
          await this.refreshData();
        },
        true
      ).open();
    });

    // 2. Quick Web / Identifier Input
    const quickCard = wrapper.createDiv({ cls: "citation-card" });
    quickCard.createEl("h5", { text: "Import via DOI, arXiv, URL, ISBN, or BibTeX" });

    const inputRow = quickCard.createDiv({ cls: "citation-quick-input-row" });
    const quickInput = inputRow.createEl("input", {
      type: "text",
      placeholder: "e.g. 10.1145/3313831.3376722 or https://...",
      cls: "citation-quick-input"
    });

    const addBtn = inputRow.createEl("button", { cls: "citation-small-btn", text: "Fetch & Add" });

    const doFetch = async () => {
      const val = quickInput.value.trim();
      if (!val) {
        new Notice("Please enter a DOI, URL, or identifier.");
        return;
      }
      addBtn.disabled = true;
      addBtn.setText("Fetching...");
      await this.handleQuickResolve(val, project);
      quickInput.value = "";
      addBtn.disabled = false;
      addBtn.setText("Fetch & Add");
    };

    addBtn.addEventListener("click", doFetch);
    quickInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doFetch();
      }
    });

    // 3. Spacious Drag & Drop PDF Zone
    const dropCard = wrapper.createDiv({ cls: "citation-card citation-drop-card-flex" });
    dropCard.createEl("h5", { text: "Import PDF Document" });

    const dropZone = dropCard.createDiv({ cls: "citation-drop-zone-spacious-full" });
    setIcon(dropZone.createDiv({ cls: "drop-icon" }), "file-plus");
    dropZone.createDiv({ cls: "drop-text-primary", text: "Drag & Drop PDF document here" });
    dropZone.createDiv({ cls: "drop-text-secondary", text: "or click anywhere in this box to browse files" });

    const fileInput = dropZone.createEl("input", { type: "file", accept: ".pdf" });
    fileInput.style.display = "none";

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        this.openPDFImport(fileInput.files[0], project);
      }
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.addClass("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.removeClass("drag-over"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.removeClass("drag-over");
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith(".pdf")) {
          this.openPDFImport(file, project);
        } else {
          new Notice("Please drop a .pdf file.");
        }
      }
    });
  }

  // --- SUBPANEL 3: BIBLIOGRAPHY SUBPANEL ---
  private renderBibliographySubpanel(container: HTMLElement, project: ProjectRecord | null) {
    const wrapper = container.createDiv({ cls: "citation-subpanel-fullheight" });

    // 1. Export Action Card (Situated at the Top Above the Monospace Preview)
    const exportCard = wrapper.createDiv({ cls: "citation-card" });
    const btnRow = exportCard.createDiv({ cls: "citation-export-actions-row" });

    // Copy to Clipboard
    const copyBtn = btnRow.createEl("button", { cls: "citation-small-btn", text: "Copy to Clipboard" });
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(this.getFormattedBib(project));
      new Notice("Bibliography copied to clipboard!");
    });

    // Append to Note
    const appendBtn = btnRow.createEl("button", { cls: "citation-small-btn citation-btn-secondary", text: "Append to Note" });
    appendBtn.addEventListener("click", () => {
      let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView && this.lastActiveMarkdownView) {
        activeView = this.lastActiveMarkdownView;
      }

      if (!activeView) {
        new Notice("Please open a markdown note first.");
        return;
      }

      const bibText = this.getFormattedBib(project);
      const editor = activeView.editor;
      const doc = editor.getValue();
      const separator = doc.endsWith("\n") ? "\n" : "\n\n";
      editor.replaceRange(`${separator}${bibText}\n`, { line: editor.lineCount(), ch: 0 });
      new Notice(`Appended bibliography to ${activeView.file?.basename}`);
    });

    // Export for Publication Button
    const pubStudioBtn = exportCard.createEl("button", { 
      cls: "citation-small-btn citation-btn-secondary full-width-btn"
    });
    setIcon(pubStudioBtn.createSpan({ cls: "btn-icon" }), "printer");
    pubStudioBtn.createSpan({ text: " Export for Publication" });
    pubStudioBtn.style.marginTop = "6px";
    pubStudioBtn.addEventListener("click", () => {
      new ExportPublicationModal(
        this.app,
        project,
        this.referencesMap,
        this.projectIndexer,
        this.settings
      ).open();
    });

    // 2. Live Output Box (Displays only cited items across attached project files)
    const previewBox = wrapper.createEl("pre", { cls: "citation-bib-preview-box" });
    previewBox.setText(this.getFormattedBib(project));
  }

  private getFormattedBib(project: ProjectRecord | null): string {
    const style = project?.citationStyle || this.settings.defaultCitationStyle || 'apa7';
    const virtualProj: ProjectRecord = (project && project.id !== ALL_PROJECTS_ID) ? project : {
      id: ALL_PROJECTS_ID,
      name: "All Citations",
      registeredFiles: [],
      referenceIds: Array.from(this.referencesMap.keys()),
      created: "",
      modified: "",
    };

    return this.projectIndexer.generateBibliography(
      virtualProj,
      Array.from(this.referencesMap.values()),
      style,
      true, // Only cited across attached files
      this.stats || undefined
    );
  }

  // --- SUBPANEL 4: STATS, CONTROLS & LINKED FILES ---
  private renderStatsSubpanel(container: HTMLElement, project: ProjectRecord | null) {
    const wrapper = container.createDiv({ cls: "citation-subpanel-fullheight" });

    // Format & Style Controls Card (if in project)
    if (project) {
      const controlsCard = wrapper.createDiv({ cls: "citation-card" });
      controlsCard.createEl("h5", { text: `Bucket Settings: ${project.name}` });

      const row = controlsCard.createDiv({ cls: "citation-format-controls-row" });

      // Single Unified Citation Standard Dropdown
      const formatWrap = row.createDiv({ cls: "format-control-item" });
      formatWrap.createSpan({ cls: "control-label", text: "Citation Standard:" });
      const formatSelect = formatWrap.createEl("select", { cls: "dropdown mini-dropdown" });
      formatSelect.createEl("option", { value: "apa7_parenthetical", text: "APA 7 (Author, Year)" });
      formatSelect.createEl("option", { value: "apa7_narrative", text: "APA 7 Narrative Author (Year)" });
      formatSelect.createEl("option", { value: "ieee", text: "IEEE [1]" });
      formatSelect.createEl("option", { value: "harvard", text: "Harvard (Author Year)" });
      formatSelect.createEl("option", { value: "chicago", text: "Chicago (Author Year)" });
      formatSelect.createEl("option", { value: "vancouver", text: "Vancouver (1)" });
      formatSelect.createEl("option", { value: "citekey", text: "Pandoc Citekey [@key]" });

      // Calculate current value
      let currentVal = "apa7_parenthetical";
      if (project.inBodyFormat === 'citekey') currentVal = "citekey";
      else if (project.inBodyFormat === 'narrative') currentVal = "apa7_narrative";
      else if (project.citationStyle === 'ieee') currentVal = "ieee";
      else if (project.citationStyle === 'harvard') currentVal = "harvard";
      else if (project.citationStyle === 'chicago') currentVal = "chicago";
      else if (project.citationStyle === 'vancouver') currentVal = "vancouver";
      else currentVal = "apa7_parenthetical";

      formatSelect.value = currentVal;

      formatSelect.addEventListener("change", async () => {
        const val = formatSelect.value;
        let newStyle: CitationStyle = 'apa7';
        let newFormat: InBodyFormat = 'parenthetical';

        if (val === 'citekey') {
          newStyle = project.citationStyle || 'apa7';
          newFormat = 'citekey';
        } else if (val === 'apa7_narrative') {
          newStyle = 'apa7';
          newFormat = 'narrative';
        } else if (val === 'ieee') {
          newStyle = 'ieee';
          newFormat = 'parenthetical';
        } else if (val === 'harvard') {
          newStyle = 'harvard';
          newFormat = 'parenthetical';
        } else if (val === 'chicago') {
          newStyle = 'chicago';
          newFormat = 'parenthetical';
        } else if (val === 'vancouver') {
          newStyle = 'vancouver';
          newFormat = 'parenthetical';
        } else {
          newStyle = 'apa7';
          newFormat = 'parenthetical';
        }

        project.citationStyle = newStyle;
        project.inBodyFormat = newFormat;
        await this.onSaveSettings();

        new ConfirmModal(
          this.app,
          "Update Citations in Bucket?",
          `Standard changed to '${formatSelect.selectedOptions[0]?.text}'. Synchronize citations across ${project.name} documents?`,
          "Update Documents",
          false,
          async () => {
            const mod = await this.projectIndexer.propagateFormatChange(
              project,
              newFormat,
              this.referencesMap,
              newStyle,
              this.settings.referencesFolder,
              this.settings.enableFootnoteMode
            );
            new Notice(`Updated citations across ${mod} document(s).`);
            await this.refreshData();
          }
        ).open();
      });

      // Resync / Catch-Up Button (Offline redundancy & recovery)
      const syncBtn = controlsCard.createEl("button", { cls: "citation-small-btn citation-btn-secondary full-width-btn" });
      setIcon(syncBtn.createSpan({ cls: "btn-icon" }), "refresh-cw");
      syncBtn.createSpan({ text: " Resync & Catch Up Bucket Notes" });
      syncBtn.style.marginTop = "8px";
      syncBtn.title = "Manual catch-up tool if files were modified offline or external changes occurred";
      syncBtn.addEventListener("click", async () => {
        syncBtn.disabled = true;
        const res = await this.projectIndexer.syncFootnotesInRegisteredFiles(
          project,
          this.referencesMap,
          project.citationStyle || this.settings.defaultCitationStyle,
          this.settings.referencesFolder
        );
        new Notice(`Resynced ${res.updatedFootnotesCount} definition(s) across ${res.updatedFilesCount} document(s).`);
        syncBtn.disabled = false;
        await this.refreshData();
      });
    }

    // Metric Tiles
    if (this.stats) {
      const statsGrid = wrapper.createDiv({ cls: "citation-stats-grid" });

      const createStatCard = (label: string, val: number, extraCls: string = "") => {
        const c = statsGrid.createDiv({ cls: `stat-card ${extraCls}` });
        c.createDiv({ cls: "stat-val", text: String(val) });
        c.createDiv({ cls: "stat-label", text: label });
      };

      createStatCard("Total Citations", this.stats.totalReferences);
      createStatCard("In-Text Instances", this.stats.totalCitationsInFiles);
      createStatCard("Used Citations", this.stats.usedReferencesCount, "success");
      createStatCard("Unused Citations", this.stats.unusedReferencesCount, "muted");

      // Single Unified Hybrid Container with Switchable Bottom Tabs
      const hybridCard = wrapper.createDiv({ cls: "citation-card citation-hybrid-card-flex" });
      const warningCount = this.stats.lintWarnings?.length || 0;
      const fileCount = project?.registeredFiles?.length || 0;

      // Header area
      const headerArea = hybridCard.createDiv({ cls: "citation-card-header-flex" });
      if (this.statsActiveTab === 'docs') {
        headerArea.createEl("h5", { text: `Linked Documents (${fileCount})` });
      } else {
        headerArea.createEl("h5", { text: `Citation Diagnostics (${warningCount})` });
      }

      // Content area
      const contentBody = hybridCard.createDiv({ cls: "citation-card-tab-content" });

      if (this.statsActiveTab === 'docs') {
        // Tab 1: Linked Documents List
        if (project && project.registeredFiles.length > 0) {
          const fileList = contentBody.createEl("ul", { cls: "citation-registered-files-list" });
          for (const filePath of project.registeredFiles) {
            const li = fileList.createEl("li");
            const nameSpan = li.createSpan({ cls: "file-name", text: filePath.split("/").pop() || filePath });
            nameSpan.addEventListener("click", () => {
              const f = this.app.vault.getAbstractFileByPath(filePath);
              if (f instanceof TFile) {
                this.app.workspace.getLeaf().openFile(f);
              }
            });

            const removeBtn = li.createEl("button", { cls: "file-remove-btn", title: "Unlink file" });
            removeBtn.setText("×");
            removeBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              project.registeredFiles = project.registeredFiles.filter(p => p !== filePath);
              const fileObj = this.app.vault.getAbstractFileByPath(filePath);
              if (fileObj instanceof TFile) {
                await this.projectIndexer.removeProjectFromFrontmatter(fileObj, project.name);
              }
              await this.onSaveSettings();
              this.updateActiveDocBanner();
              await this.refreshData();
            });
          }
        } else {
          contentBody.createEl("p", { cls: "citation-card-muted-text", text: "No documents linked to this bucket yet. Open a note to link it via the bottom bar." });
        }
      } else {
        // Tab 2: Citation Diagnostics / Warnings List
        if (warningCount > 0) {
          // Full-width Warning CTA button consuming horizontal space
          const fixRow = contentBody.createDiv({ cls: "citation-fix-fullwidth-row" });
          fixRow.style.marginBottom = "8px";
          fixRow.style.width = "100%";

          const fixBtn = fixRow.createEl("button", { 
            cls: "citation-warn-cta-btn full-width-btn", 
            text: `Fix All Inconsistencies (${warningCount})` 
          });
          fixBtn.style.width = "100%";
          fixBtn.style.display = "block";
          fixBtn.style.padding = "6px 12px";
          fixBtn.style.fontSize = "11.5px";
          fixBtn.style.fontWeight = "600";
          fixBtn.style.background = "var(--text-warning, #eab308)";
          fixBtn.style.color = "#000000";
          fixBtn.style.border = "none";
          fixBtn.style.borderRadius = "var(--radius-s)";
          fixBtn.style.cursor = "pointer";
          fixBtn.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.12)";

          fixBtn.addEventListener("click", () => {
            new FixInconsistenciesModal(
              this.app,
              this.stats!.lintWarnings,
              this.storageManager,
              async (selected) => {
                let fixedCount = 0;
                const fileGroup = new Map<string, typeof selected>();
                for (const item of selected) {
                  if (!fileGroup.has(item.filePath)) fileGroup.set(item.filePath, []);
                  fileGroup.get(item.filePath)!.push(item);
                }

                for (const [filePath, items] of fileGroup.entries()) {
                  const fileObj = this.app.vault.getAbstractFileByPath(filePath);
                  if (fileObj instanceof TFile) {
                    let content = await this.app.vault.read(fileObj);
                    for (const item of items) {
                      if (item.suggestedFix !== undefined) {
                        if (item.suggestedFix === "") {
                          // Strip orphan definition line
                          const escapedRaw = item.rawCitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                          content = content.replace(new RegExp(`^.*${escapedRaw}.*$\\r?\\n?`, 'gm'), '');
                          fixedCount++;
                        } else {
                          content = content.replace(item.rawCitation, item.suggestedFix);
                          fixedCount++;
                          // If converting in-body footnote [^key] to in-body format, convert bottom footnote definition to standard reference entry (strip [^key]: prefix, keep reference text)
                          if (item.rawCitation.startsWith('[^') && !item.rawCitation.includes(':') && !item.suggestedFix.startsWith('[^')) {
                            const key = item.citekey || item.rawCitation.replace(/^\[\^?|\]$/g, '');
                            const fnDefRegex = new RegExp(`^\\s*\\[\\^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:\\s*(.*)$`, 'gm');
                            if (fnDefRegex.test(content)) {
                              content = content.replace(fnDefRegex, '$1');
                            }
                          }
                        }
                      }
                    }
                    await this.app.vault.modify(fileObj, content);
                  }
                }

                new Notice(`Applied ${fixedCount} citation fix(es) across ${fileGroup.size} note(s).`);
                await this.refreshData();
              },
              async () => {
                await this.refreshData();
              }
            ).open();
          });

          // Diagnostics item list
          const fileList = contentBody.createEl("ul", { cls: "citation-registered-files-list" });
          for (const w of this.stats.lintWarnings.slice(0, 15)) {
            const li = fileList.createEl("li");
            li.style.flexDirection = "column";
            li.style.alignItems = "stretch";
            li.style.gap = "2px";
            li.style.padding = "4px 6px";

            const topFlex = li.createDiv();
            topFlex.style.display = "flex";
            topFlex.style.alignItems = "center";
            topFlex.style.justifyContent = "space-between";

            const leftInfo = topFlex.createDiv();
            leftInfo.style.display = "flex";
            leftInfo.style.alignItems = "center";
            leftInfo.style.gap = "6px";

            const fileLink = leftInfo.createSpan({ cls: "file-name", text: `${w.fileName}:${w.lineNumber}` });
            fileLink.addEventListener("click", () => {
              const f = this.app.vault.getAbstractFileByPath(w.filePath);
              if (f instanceof TFile) this.app.workspace.getLeaf().openFile(f);
            });

            leftInfo.createEl("code", { text: w.rawCitation });

            const badgeText = w.type === 'format_mismatch' 
              ? "Format" 
              : (w.type === 'style_mismatch' 
                  ? "Style" 
                  : (w.type === 'orphan_definition' ? "Orphan" : "Unresolved"));
            const badge = leftInfo.createSpan({ cls: "status-badge-pill", text: badgeText });
            badge.style.fontSize = "8.5px";
            badge.style.padding = "1px 4px";

            const dismissBtn = topFlex.createEl("button", { cls: "file-remove-btn", title: "Dismiss this warning" });
            dismissBtn.setText("×");
            dismissBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              await this.storageManager.saveDismissedLint(w.id);
              this.dismissedLints.add(w.id);
              new Notice("Warning dismissed.");
              await this.refreshData();
            });

            const descRow = li.createDiv({ cls: "status-hint" });
            descRow.style.fontSize = "9.5px";
            descRow.setText(w.message);
          }
        } else {
          const isAll = (project?.id === ALL_PROJECTS_ID || !project || project.id === '__ALL_PROJECTS__' || project.name === 'All References' || project.name === 'All Citations');
          const emptyText = isAll 
            ? "Formatting and consistency linting is scoped to individual Citation Buckets. Select a specific bucket to view and resolve diagnostics."
            : "No citation inconsistencies detected. All notes align with bucket standards.";
          contentBody.createEl("p", { cls: "citation-card-muted-text", text: emptyText });
        }
      }

      // Bottom Switchable Tabs Bar
      const tabBar = hybridCard.createDiv({ cls: "citation-bottom-tab-bar" });

      const docsTabBtn = tabBar.createEl("button", { 
        cls: `citation-bottom-tab-btn ${this.statsActiveTab === 'docs' ? 'active' : ''}` 
      });
      docsTabBtn.createSpan({ text: "Linked Docs" });
      docsTabBtn.createSpan({ cls: "tab-badge", text: String(fileCount) });
      docsTabBtn.addEventListener("click", () => {
        this.statsActiveTab = 'docs';
        this.renderUI();
      });

      const diagTabBtn = tabBar.createEl("button", { 
        cls: `citation-bottom-tab-btn ${this.statsActiveTab === 'diagnostics' ? 'active' : ''} ${warningCount > 0 ? 'has-warnings' : ''}` 
      });
      diagTabBtn.createSpan({ text: "Diagnostics" });
      diagTabBtn.createSpan({ cls: "tab-badge", text: String(warningCount) });
      diagTabBtn.addEventListener("click", () => {
        this.statsActiveTab = 'diagnostics';
        this.renderUI();
      });
    }
  }

  // --- 4. DISTINCT & VISIBLE STATUS BAR (Bottom Island) ---
  private renderVisibleStatusBar(container: HTMLElement, project: ProjectRecord | null) {
    const footer = container.createDiv({ cls: "citation-visible-status-island" });
    const leftGroup = footer.createDiv({ cls: "status-island-left" });
    this.renderStatusBarLeftContent(leftGroup, project);

    const rightGroup = footer.createDiv({ cls: "status-island-right" });

    // Settings / Stats Toggle Button (Standard Obsidian Settings Icon with Yellow Glow on warnings)
    const hasWarnings = Boolean(this.stats?.lintWarnings && this.stats.lintWarnings.length > 0);
    const settingsBtn = rightGroup.createEl("button", { 
      cls: `status-stats-icon-btn ${this.currentSubpanel === 'stats' ? 'active' : ''} ${hasWarnings ? 'has-warnings' : ''}`, 
      title: hasWarnings ? `Bucket Settings & Diagnostics (${this.stats?.lintWarnings.length} Warnings)` : "Bucket Settings & Statistics" 
    });
    setIcon(settingsBtn, "settings");
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.currentSubpanel = this.currentSubpanel === 'stats' ? 'citations' : 'stats';
      this.renderUI();
    });
  }

  private renderStatusBarLeftContent(leftGroup: HTMLElement, project: ProjectRecord | null) {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView) || this.lastActiveMarkdownView;
    const activeFile = mdView?.file || this.app.workspace.getActiveFile();

    if (!activeFile) {
      const hint = leftGroup.createSpan({ cls: "status-hint" });
      setIcon(hint.createSpan({ cls: "inline-icon" }), "file-text");
      hint.createSpan({ text: " No note open" });
    } else if (activeFile.path.startsWith(normalizePath(this.settings.referencesFolder))) {
      const hint = leftGroup.createSpan({ cls: "status-hint" });
      setIcon(hint.createSpan({ cls: "inline-icon" }), "book-open");
      hint.createSpan({ text: ` Note: ${activeFile.basename}` });
    } else {
      const fileWrap = leftGroup.createSpan({ cls: "status-file-wrap" });
      setIcon(fileWrap.createSpan({ cls: "inline-icon" }), "file-text");
      fileWrap.createSpan({ cls: "status-file-name", text: ` ${activeFile.basename}` });

      if (project) {
        const isRegistered = this.projectIndexer.isFileInProject(activeFile, project);
        if (isRegistered) {
          leftGroup.createSpan({ cls: "status-badge-pill registered", text: `In ${project.name}` });
          const unlinkBtn = leftGroup.createEl("button", { cls: "status-unlink-icon-btn", title: `Unlink from ${project.name}` });
          setIcon(unlinkBtn, "unlink");
          unlinkBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            project.registeredFiles = project.registeredFiles.filter(p => p !== activeFile.path);
            this.updateActiveDocBanner();
            await this.projectIndexer.removeProjectFromFrontmatter(activeFile, project.name);
            await this.onSaveSettings();
            new Notice(`Unlinked "${activeFile.basename}" from ${project.name}`);
            this.refreshDataDebounced(50);
          });
        } else {
          const linkBtn = leftGroup.createEl("button", { cls: "status-link-btn-pill", text: `+ Link to Bucket` });
          linkBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!project.registeredFiles.includes(activeFile.path)) {
              project.registeredFiles.push(activeFile.path);
            }
            this.updateActiveDocBanner();
            await this.projectIndexer.addProjectToFrontmatter(activeFile, project.name);
            await this.onSaveSettings();
            new Notice(`Linked "${activeFile.basename}" to ${project.name}`);
            this.refreshDataDebounced(50);
          });
        }
      }
    }
  }

  private updateActiveDocBanner() {
    const leftGroup = this.containerEl.querySelector(".status-island-left") as HTMLElement;
    if (leftGroup) {
      leftGroup.empty();
      const project = this.getActiveProjectRecord();
      this.renderStatusBarLeftContent(leftGroup, project);
    }
  }

  private getFilteredReferences(project: ProjectRecord | null): ReferenceMetadata[] {
    const all = Array.from(this.referencesMap.values());
    return all.filter(ref => {
      if (project && project.id !== ALL_PROJECTS_ID) {
        const inProject = ref.projects && (ref.projects.includes(project.id) || ref.projects.includes(project.name));
        if (!inProject) return false;
      }

      if (this.selectedTypeFilter !== "all" && ref.type !== this.selectedTypeFilter) {
        return false;
      }

      if (this.searchQuery) {
        const authors = (ref.authors || []).join(" ").toLowerCase();
        const title = (ref.title || "").toLowerCase();
        const citekey = (ref.citekey || "").toLowerCase();
        const doi = (ref.doi || "").toLowerCase();
        const tags = (ref.tags || []).join(" ").toLowerCase();
        const q = this.searchQuery;
        if (!title.includes(q) && !authors.includes(q) && !citekey.includes(q) && !doi.includes(q) && !tags.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }

  private async insertCitationIntoActiveEditor(ref: ReferenceMetadata, project: ProjectRecord | null) {
    const t0 = performance.now();
    let mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView && this.lastActiveMarkdownView) {
      mdView = this.lastActiveMarkdownView;
    }

    if (!mdView) {
      new Notice("Please open a note in the editor first.");
      return;
    }

    const editor = mdView.editor;
    const isFootnoteMode = Boolean(this.settings.enableFootnoteMode);
    const format: InBodyFormat = (project?.inBodyFormat === ('footnote' as any) || !project?.inBodyFormat)
      ? 'parenthetical'
      : (project.inBodyFormat as InBodyFormat);
    const style: CitationStyle = project?.citationStyle || 'apa7';

    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const docText = editor.getValue();
    const existingFnMatches = docText.match(/^\[\^[^\]]+\]:/gm) || [];
    const footnoteIndex = existingFnMatches.length + 1;

    const overload = CitationEngine.detectAndOverloadAtCursor(
      lineText,
      cursor.ch,
      [ref],
      this.referencesMap,
      style,
      format,
      isFootnoteMode,
      footnoteIndex
    );

    if (overload.isOverloaded) {
      editor.replaceRange(
        overload.replacementText,
        { line: cursor.line, ch: overload.replaceStartCh },
        { line: cursor.line, ch: overload.replaceEndCh }
      );
    } else {
      editor.replaceRange(overload.replacementText, cursor);
    }

    const updatedDocText = editor.getValue();

    if (isFootnoteMode) {
      const fnDefRegex = new RegExp(`^\\[\\^${ref.citekey}\\]:`, 'm');
      if (!fnDefRegex.test(updatedDocText)) {
        const fnDefinition = CitationEngine.formatFootnoteDefinition(
          ref,
          style,
          footnoteIndex
        );
        const hasTrailingNewline = updatedDocText.endsWith("\n");
        const separator = hasTrailingNewline ? "\n" : "\n\n";
        editor.replaceRange(`${separator}${fnDefinition}\n`, { line: editor.lineCount(), ch: 0 });
      }
    } else {
      // In standard mode, maintain per-file reference list at bottom if not already present
      const bibEntry = CitationEngine.formatBibliographyEntry(
        ref,
        style,
        footnoteIndex
      );
      if (!updatedDocText.includes(ref.title) && !updatedDocText.includes(ref.citekey)) {
        const hasTrailingNewline = updatedDocText.endsWith("\n");
        const separator = hasTrailingNewline ? "\n" : "\n\n";
        editor.replaceRange(`${separator}${bibEntry}\n`, { line: editor.lineCount(), ch: 0 });
      }
    }

    editor.focus();
    const elapsed = Math.round(performance.now() - t0);
    this.statusMessage = `[Inserted '${ref.citekey}' in ${elapsed}ms]`;
    new Notice(`Inserted: ${overload.replacementText}`);
    await this.refreshData();
  }

  private async handleQuickResolve(input: string, project: ProjectRecord | null) {
    try {
      const resolved = await MetadataResolvers.detectAndResolve(input);
      if (project) {
        if (!resolved.projects) resolved.projects = [];
        if (!resolved.projects.includes(project.id)) resolved.projects.push(project.id);
      }

      const ref = resolved as ReferenceMetadata;
      await this.storageManager.saveReference(ref);
      this.statusMessage = `[Added citation '${ref.citekey}']`;
      new Notice(`Added citation: [${ref.citekey}]`);
      this.currentSubpanel = 'citations';
      await this.refreshData();
    } catch (e: any) {
      new Notice(`Error resolving identifier: ${e.message}`);
    }
  }

  private openPDFImport(file: File, project: ProjectRecord | null) {
    new PDFImportModal(
      this.app,
      file,
      project,
      Array.from(this.referencesMap.values()),
      this.storageManager,
      async () => {
        this.currentSubpanel = 'citations';
        await this.refreshData();
      }
    ).open();
  }

  private openLinkFileModal(file: TFile) {
    if (this.settings.projects.length === 0) {
      new PromptModal(
        this.app,
        "Create Citation Bucket for this File",
        "e.g. Spatial HCI",
        "",
        async (name) => {
          const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          const newProj: ProjectRecord = {
            id,
            name,
            registeredFiles: [file.path],
            referenceIds: [],
            citationStyle: this.settings.defaultCitationStyle,
            inBodyFormat: this.settings.defaultInBodyFormat,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
          };
          this.settings.projects.push(newProj);
          this.settings.activeProjectId = id;
          await this.projectIndexer.addProjectToFrontmatter(file, name);
          await this.onSaveSettings();
          await this.refreshData();
          new Notice(`Linked "${file.basename}" to new bucket '${name}'`);
        }
      ).open();
      return;
    }

    const modal = new (class extends PromptModal {
      constructor(app: App, projects: ProjectRecord[], onSelect: (proj: ProjectRecord) => void) {
        super(app, "Link Current File to Bucket", "Type bucket name or select below", "", async (name) => {
          const matched = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
          if (matched) onSelect(matched);
        });
      }
    })(this.app, this.settings.projects, async (targetProj) => {
      if (!targetProj.registeredFiles.includes(file.path)) {
        targetProj.registeredFiles.push(file.path);
      }
      await this.projectIndexer.addProjectToFrontmatter(file, targetProj.name);
      await this.onSaveSettings();
      await this.refreshData();
      new Notice(`Linked "${file.basename}" to ${targetProj.name}`);
    });
    modal.open();
  }

  async onClose() {}
}
