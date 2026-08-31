import { App, Modal, Setting, setIcon } from 'obsidian';

export class ConfirmModal extends Modal {
  private title: string;
  private message: string;
  private confirmText: string;
  private isDanger: boolean;
  private onConfirm: () => Promise<void> | void;

  constructor(
    app: App,
    title: string,
    message: string,
    confirmText: string = "Confirm",
    isDanger: boolean = true,
    onConfirm: () => Promise<void> | void
  ) {
    super(app);
    this.title = title;
    this.message = message;
    this.confirmText = confirmText;
    this.isDanger = isDanger;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-confirm-modal");

    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon danger" });
    setIcon(iconSpan, "alert-triangle");
    header.createEl("h2", { text: this.title });

    contentEl.createEl("p", { text: this.message });

    const buttonRow = contentEl.createDiv({ cls: "citation-modal-button-row" });
    new Setting(buttonRow)
      .addButton(btn => btn
        .setButtonText("Cancel")
        .onClick(() => this.close()))
      .addButton(btn => {
        btn.setButtonText(this.confirmText);
        if (this.isDanger) {
          btn.setClass("mod-warning");
        } else {
          btn.setCta();
        }

        btn.onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Processing...");
          try {
            await this.onConfirm();
            this.close();
          } catch (err: any) {
            btn.setDisabled(false);
            btn.setButtonText(this.confirmText);
          }
        });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}
