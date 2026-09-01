import { App, PluginSettingTab, Setting, normalizePath } from 'obsidian';
import CitationManagerPlugin from './main';
import { CitationStyle, InBodyFormat } from './types';
import { Logger } from './logger';

export class CitationManagerSettingTab extends PluginSettingTab {
  plugin: CitationManagerPlugin;

  constructor(app: App, plugin: CitationManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Citation Manager Settings' });

    // References Directory
    new Setting(containerEl)
      .setName('References Folder')
      .setDesc('Folder where reference notes and PDF attachments are stored.')
      .addText(text => text
        .setPlaceholder('.references')
        .setValue(this.plugin.settings.referencesFolder)
        .onChange(async (value) => {
          this.plugin.settings.referencesFolder = normalizePath(value.trim() || '.references');
          await this.plugin.saveSettings();
          this.plugin.storageManager.updateSettings(this.plugin.settings);
        }));

    // Obsidian Footnote Mode (Global Companion Setting)
    new Setting(containerEl)
      .setName('Enable Obsidian Footnote Mode ([^citekey])')
      .setDesc('Uses [^citekey] in-text and maintains formatted footnote definitions at note bottom for Obsidian Footnotes plugin support. Automatically converted upon publication export.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableFootnoteMode)
        .onChange(async (value) => {
          this.plugin.settings.enableFootnoteMode = value;
          await this.plugin.saveSettings();
          const refsMap = await this.plugin.storageManager.loadAllReferences();
          const res = await this.plugin.projectIndexer.propagateFootnoteModeGlobally(
            value,
            refsMap,
            this.plugin.settings.projects,
            this.plugin.settings.referencesFolder
          );
          new Notice(`Footnote Mode ${value ? 'Enabled' : 'Disabled'}: synced across ${res.updatedFilesCount} note(s).`);
          this.plugin.refreshOpenViews();
        }));

    // In-Editor Auto-Suggest
    new Setting(containerEl)
      .setName('In-Editor Citation Autocomplete')
      .setDesc('Suggest matching citations when typing [@ or \\cite{ or (( in any markdown document.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableEditorSuggest)
        .onChange(async (value) => {
          this.plugin.settings.enableEditorSuggest = value;
          await this.plugin.saveSettings();
        }));

    // Deletion Guard
    new Setting(containerEl)
      .setName('Deletion Guard (Prevent Broken References)')
      .setDesc('Block deleting a reference if it is currently cited in any registered project document.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.blockDeletionIfInUse)
        .onChange(async (value) => {
          this.plugin.settings.blockDeletionIfInUse = value;
          await this.plugin.saveSettings();
        }));

    // Debug Mode
    new Setting(containerEl)
      .setName('Verbose Debug Logging')
      .setDesc('Enable detailed console diagnostics and variable telemetry for troubleshooting.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugMode)
        .onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          Logger.setEnabled(value);
          await this.plugin.saveSettings();
        }));
  }
}
