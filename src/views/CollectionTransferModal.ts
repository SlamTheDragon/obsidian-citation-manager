import { App, Modal, setIcon, Notice } from 'obsidian';
import { ReferenceMetadata, CitationCollection, DEFAULT_COLLECTION_ID } from '../types';
import { StorageManager } from '../storageManager';

export class CollectionTransferModal extends Modal {
  private collection: CitationCollection;
  private allReferences: Map<string, ReferenceMetadata>;
  private storageManager: StorageManager;
  private onUpdated: () => Promise<void>;
  private filterQuery: string = "";

  constructor(
    app: App,
    collection: CitationCollection,
    allReferences: Map<string, ReferenceMetadata>,
    storageManager: StorageManager,
    onUpdated: () => Promise<void>
  ) {
    super(app);
    this.collection = collection;
    this.allReferences = allReferences;
    this.storageManager = storageManager;
    this.onUpdated = onUpdated;
  }

  onOpen() {
    this.modalEl.addClass("citation-collection-transfer-modal");
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();

    // Modal Title & Description
    this.titleEl.setText(`Manage Collection: ${this.collection.name}`);

    // Header Card
    const headerCard = contentEl.createDiv({ cls: "citation-transfer-header-card" });
    if (this.collection.description) {
      headerCard.createEl("p", { cls: "transfer-desc", text: this.collection.description });
    }

    // Search filter input for modal
    const searchRow = contentEl.createDiv({ cls: "citation-transfer-search-row" });
    const searchInput = searchRow.createEl("input", {
      type: "text",
      placeholder: "Filter citations in columns...",
      cls: "citation-transfer-search-input",
      value: this.filterQuery
    });
    searchInput.addEventListener("input", () => {
      this.filterQuery = searchInput.value.toLowerCase().trim();
      this.renderColumns(columnsContainer);
    });

    // Sub-instruction
    const tipEl = contentEl.createDiv({ cls: "citation-transfer-instruction" });
    tipEl.createSpan({ text: "Click any citation card to transfer it between columns." });

    // Two-Column Grid Container
    const columnsContainer = contentEl.createDiv({ cls: "citation-transfer-columns-grid" });
    this.renderColumns(columnsContainer);

    // Bottom Action Buttons
    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const closeBtn = buttonRow.createEl("button", { cls: "mod-cta", text: "Done" });
    closeBtn.addEventListener("click", () => this.close());
  }

  private renderColumns(container: HTMLElement) {
    container.empty();

    const allRefsList = Array.from(this.allReferences.values());
    const query = this.filterQuery;

    // Separate into Other / General vs In Collection
    const inCollection: ReferenceMetadata[] = [];
    const otherReferences: ReferenceMetadata[] = [];

    for (const ref of allRefsList) {
      const matchesSearch = !query || 
        ref.title.toLowerCase().includes(query) ||
        ref.citekey.toLowerCase().includes(query) ||
        (ref.authors || []).some(a => a.toLowerCase().includes(query));

      if (!matchesSearch) continue;

      if (ref.collectionId === this.collection.id) {
        inCollection.push(ref);
      } else {
        otherReferences.push(ref);
      }
    }

    // --- LEFT COLUMN: General / Other Citations ---
    const leftCol = container.createDiv({ cls: "citation-transfer-column left-column" });
    const leftHeader = leftCol.createDiv({ cls: "column-header" });
    leftHeader.createEl("h4", { text: `General / Other Citations (${otherReferences.length})` });

    const leftList = leftCol.createDiv({ cls: "column-cards-list" });
    if (otherReferences.length === 0) {
      const emptyLeft = leftList.createDiv({ cls: "column-empty-state" });
      emptyLeft.createSpan({ text: query ? "No matching citations" : "All citations belong to this collection" });
    } else {
      for (const ref of otherReferences) {
        this.renderTransferCard(leftList, ref, 'add');
      }
    }

    // --- RIGHT COLUMN: This Collection ---
    const rightCol = container.createDiv({ cls: "citation-transfer-column right-column" });
    const rightHeader = rightCol.createDiv({ cls: "column-header" });
    rightHeader.createEl("h4", { text: `${this.collection.name} (${inCollection.length})` });

    const rightList = rightCol.createDiv({ cls: "column-cards-list" });
    if (inCollection.length === 0) {
      const emptyRight = rightList.createDiv({ cls: "column-empty-state" });
      emptyRight.createSpan({ text: query ? "No matching citations" : "No citations in this collection yet. Click cards on the left to add." });
    } else {
      for (const ref of inCollection) {
        this.renderTransferCard(rightList, ref, 'remove');
      }
    }
  }

  private renderTransferCard(container: HTMLElement, ref: ReferenceMetadata, action: 'add' | 'remove') {
    const card = container.createDiv({
      cls: `citation-transfer-card ${action === 'add' ? 'card-transfer-add' : 'card-transfer-remove'}`
    });
    card.setAttribute("tabindex", "0");
    card.title = action === 'add' ? `Click to add [${ref.citekey}] to ${this.collection.name}` : `Click to remove [${ref.citekey}] from ${this.collection.name}`;

    // Header badge
    const headerRow = card.createDiv({ cls: "transfer-card-header" });
    headerRow.createSpan({ cls: `citation-type-badge type-${ref.type}`, text: ref.type.toUpperCase() });
    headerRow.createSpan({ cls: "citation-key-pill", text: ref.citekey });

    const transferIndicator = headerRow.createSpan({ cls: "transfer-action-indicator" });
    if (action === 'add') {
      setIcon(transferIndicator, "arrow-right");
    } else {
      setIcon(transferIndicator, "arrow-left");
    }

    // Title
    card.createDiv({ cls: "transfer-card-title", text: ref.title });

    // Authors & Year
    const authorYear = card.createDiv({ cls: "transfer-card-author-year" });
    authorYear.createSpan({ text: (ref.authors || []).slice(0, 2).join(', ') + ((ref.authors?.length || 0) > 2 ? ' et al.' : '') });
    authorYear.createSpan({ cls: "citation-year-dot", text: ` • ${ref.year}` });

    // Whole card is the click button
    const handleTransfer = async () => {
      if (action === 'add') {
        ref.collectionId = this.collection.id;
      } else {
        ref.collectionId = DEFAULT_COLLECTION_ID;
      }
      this.allReferences.set(ref.citekey, ref);
      await this.storageManager.saveReference(ref);
      await this.onUpdated();
      this.renderModal();
    };

    card.addEventListener("click", handleTransfer);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleTransfer();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
