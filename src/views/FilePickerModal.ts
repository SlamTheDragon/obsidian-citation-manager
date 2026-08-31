import { App, FuzzySuggestModal, TFile } from 'obsidian';

export class FilePickerModal extends FuzzySuggestModal<TFile> {
  private onSelectFile: (file: TFile) => void;

  constructor(app: App, onSelectFile: (file: TFile) => void) {
    super(app);
    this.onSelectFile = onSelectFile;
    this.setPlaceholder("Select a markdown note to export bibliography to...");
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
    this.onSelectFile(file);
  }
}
