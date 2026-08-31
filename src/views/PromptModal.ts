import { App, Modal, Setting, setIcon } from 'obsidian';

export class PromptModal extends Modal {
  private title: string;
  private placeholder: string;
  private initialValue: string;
  private onSubmit: (value: string) => Promise<void> | void;

  constructor(
    app: App,
    title: string,
    placeholder: string,
    initialValue: string = "",
    onSubmit: (value: string) => Promise<void> | void
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.initialValue = initialValue;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("citation-prompt-modal");

    const header = contentEl.createDiv({ cls: "citation-modal-header-row" });
    const iconSpan = header.createSpan({ cls: "modal-header-icon" });
    setIcon(iconSpan, "edit-3");
    header.createEl("h2", { text: this.title });

    let inputValue = this.initialValue;

    const inputSetting = new Setting(contentEl)
      .addText(text => {
        text.setPlaceholder(this.placeholder)
          .setValue(this.initialValue)
          .onChange(val => { inputValue = val; });
        
        text.inputEl.style.width = "100%";
        text.inputEl.focus();

        text.inputEl.addEventListener("keydown", async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (inputValue.trim()) {
              await this.onSubmit(inputValue.trim());
              this.close();
            }
          }
        });
      });

    const buttonRow = contentEl.createDiv({ cls: "citation-modal-button-row" });
    new Setting(buttonRow)
      .addButton(btn => btn
        .setButtonText("Cancel")
        .onClick(() => this.close()))
      .addButton(btn => btn
        .setButtonText("Confirm")
        .setCta()
        .onClick(async () => {
          if (inputValue.trim()) {
            await this.onSubmit(inputValue.trim());
            this.close();
          }
        }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
