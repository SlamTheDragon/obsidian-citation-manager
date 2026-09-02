import { App, Modal, setIcon, Notice } from 'obsidian';
import { ReferenceMetadata, CitationCollection, DEFAULT_COLLECTION_ID } from '../types';
import { StorageManager } from '../storageManager';

export class MoveToCollectionModal extends Modal {
  private ref: ReferenceMetadata;
  private collections: CitationCollection[];
  private allReferences: Map<string, ReferenceMetadata>;
  private storageManager: StorageManager;
  private onMoved: () => Promise<void>;

  constructor(
    app: App,
    ref: ReferenceMetadata,
    collections: CitationCollection[],
    allReferences: Map<string, ReferenceMetadata>,
    storageManager: StorageManager,
    onMoved: () => Promise<void>
  ) {
    super(app);
    this.ref = ref;
    this.collections = collections;
    this.allReferences = allReferences;
    this.storageManager = storageManager;
    this.onMoved = onMoved;
  }

  onOpen() {
    this.titleEl.setText(`Move Citation: [${this.ref.citekey}]`);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-move-modal");

    const infoCard = contentEl.createDiv({ cls: "citation-modal-section-card" });
    infoCard.createEl("div", { cls: "section-card-title", text: this.ref.title });
    infoCard.createEl("div", {
      cls: "section-card-desc",
      text: `${(this.ref.authors || []).slice(0, 3).join(', ')} (${this.ref.year})`
    });

    const listLabel = contentEl.createDiv({ cls: "citation-transfer-instruction" });
    listLabel.createSpan({ text: "Select destination collection:" });

    const listContainer = contentEl.createDiv({ cls: "citation-move-collection-list" });

    for (const col of this.collections) {
      const isCurrent = (this.ref.collectionId || DEFAULT_COLLECTION_ID) === col.id;
      const count = Array.from(this.allReferences.values()).filter(r => (r.collectionId || DEFAULT_COLLECTION_ID) === col.id).length;

      const item = listContainer.createDiv({
        cls: `citation-move-collection-item ${isCurrent ? 'current-active' : ''}`
      });

      const iconEl = item.createSpan({ cls: "item-icon" });
      setIcon(iconEl, col.isDefault ? "folder" : "folder-open");

      const textCol = item.createDiv({ cls: "item-text-col" });
      const nameRow = textCol.createDiv({ cls: "item-name-row" });
      nameRow.createSpan({ cls: "item-name", text: col.name });
      if (col.isDefault) {
        nameRow.createSpan({ cls: "citation-default-badge", text: "DEFAULT" });
      }
      if (isCurrent) {
        nameRow.createSpan({ cls: "citation-current-badge", text: "CURRENT" });
      }

      if (col.description) {
        textCol.createDiv({ cls: "item-desc", text: col.description });
      }

      const countBadge = item.createSpan({ cls: "item-count-badge", text: `${count} citation(s)` });

      item.addEventListener("click", async () => {
        if (isCurrent) {
          this.close();
          return;
        }

        this.ref.collectionId = col.id;
        this.allReferences.set(this.ref.citekey, this.ref);
        await this.storageManager.saveReference(this.ref);
        new Notice(`Moved [${this.ref.citekey}] to "${col.name}"`);
        await this.onMoved();
        this.close();
      });
    }

    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
