import { App, Modal, Setting, Notice } from 'obsidian';
import { CitationCollection, DEFAULT_COLLECTION_ID } from '../../backend/types';

export class CollectionEditorModal extends Modal {
  private collection: CitationCollection | null;
  private onSave: (collection: CitationCollection) => Promise<void>;
  private name: string = "";
  private description: string = "";

  constructor(
    app: App,
    collection: CitationCollection | null,
    onSave: (collection: CitationCollection) => Promise<void>
  ) {
    super(app);
    this.collection = collection;
    this.onSave = onSave;
    if (collection) {
      this.name = collection.name;
      this.description = collection.description || "";
    }
  }

  onOpen() {
    this.titleEl.setText(this.collection ? `Edit Collection: ${this.collection.name}` : "Create Citation Collection");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-modal-body");

    const card = contentEl.createDiv({ cls: "citation-modal-section-card" });

    const titleSetting = new Setting(card)
      .setName("Collection Title")
      .setDesc("A clear name for this citation group (e.g. 'Methodology Papers', 'Background Literature').")
      .addText(text => {
        text.setPlaceholder("e.g. Methodology Papers");
        text.setValue(this.name);
        text.onChange(val => { this.name = val; });
      });

    const descCard = contentEl.createDiv({ cls: "citation-modal-section-card citation-modal-vertical-card" });
    const descSetting = new Setting(descCard)
      .setName("Description")
      .setDesc("Optional summary describing the purpose or scope of this collection.")
      .addTextArea(area => {
        area.setPlaceholder("Optional description...");
        area.setValue(this.description);
        area.onChange(val => { this.description = val; });
      });
    descSetting.setClass("citation-modal-vertical-setting");

    const buttonRow = contentEl.createDiv({ cls: "modal-button-container citation-modal-buttons" });
    const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = buttonRow.createEl("button", { cls: "mod-cta", text: this.collection ? "Save Changes" : "Create Collection" });
    saveBtn.addEventListener("click", async () => {
      const cleanName = this.name.trim();
      if (!cleanName) {
        new Notice("Collection title cannot be empty.");
        return;
      }

      const id = this.collection ? this.collection.id : `col-${Date.now()}`;
      const savedCollection: CitationCollection = {
        id,
        name: cleanName,
        description: this.description.trim(),
        isDefault: this.collection?.isDefault || false,
        created: this.collection?.created || new Date().toISOString(),
        modified: new Date().toISOString()
      };

      await this.onSave(savedCollection);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
