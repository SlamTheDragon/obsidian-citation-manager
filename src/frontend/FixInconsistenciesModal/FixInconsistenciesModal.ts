import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
import { LintWarning, LintSeverity, ReferenceMetadata } from '../../backend/types';
import { LintEngine } from '../../backend/lintEngine';
import { ReferenceEditorModal } from '../ReferenceEditorModal';
import { StorageManager } from '../../backend/storageManager';

export class FixInconsistenciesModal extends Modal {
  private warnings: LintWarning[];
  private openWarningId: string | null = null;
  private selectedIds: Set<string>;
  private storageManager: StorageManager;
  private onApplyFixes: (selectedWarnings: LintWarning[]) => Promise<void>;
  private onRefresh: () => Promise<LintWarning[] | void>;
  private activeSeverityFilter: 'all' | 'error' | 'warning' | 'info' = 'all';

  constructor(
    app: App,
    warnings: LintWarning[],
    storageManager: StorageManager,
    onApplyFixes: (selectedWarnings: LintWarning[]) => Promise<void>,
    onRefresh: () => Promise<LintWarning[] | void>
  ) {
    super(app);
    this.warnings = warnings;
    this.storageManager = storageManager;
    this.selectedIds = new Set(this.warnings.filter(w => w.suggestedFix !== undefined).map(w => w.id));
    this.onApplyFixes = onApplyFixes;
    this.onRefresh = onRefresh;
  }

  onOpen() {
    this.titleEl.setText('Citation Diagnostics & Corrections');
    this.renderModal();
  }

  private async refreshWarningsFromParent() {
    const fresh = await this.onRefresh();
    if (Array.isArray(fresh)) {
      this.warnings = fresh;
      this.selectedIds = new Set(this.warnings.filter(w => w.suggestedFix !== undefined).map(w => w.id));
    }
    this.renderModal();
  }

  private renderModal() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('citation-modal-body');

    if (this.warnings.length === 0) {
      const emptyBox = contentEl.createDiv({ cls: 'citation-empty-clean' });
      setIcon(emptyBox.createDiv({ cls: 'empty-icon' }), 'check-circle');
      emptyBox.createEl('h3', { text: 'No citation inconsistencies found' });
      emptyBox.createEl('p', { cls: 'status-hint', text: 'All citations and definitions across linked documents align with project standards.' });
      return;
    }

    // 1. SEVERITY FILTER TABS & STATS BAR
    const filterBar = contentEl.createDiv({ cls: 'citation-modal-section-card' });
    filterBar.style.padding = '8px 10px';
    filterBar.style.marginBottom = '8px';

    const topFilterFlex = filterBar.createDiv();
    topFilterFlex.style.display = 'flex';
    topFilterFlex.style.alignItems = 'center';
    topFilterFlex.style.justifyContent = 'space-between';

    const tabGroup = topFilterFlex.createDiv({ cls: 'citation-pill-tab-group' });
    tabGroup.style.display = 'flex';
    tabGroup.style.gap = '4px';

    const errorCount = this.warnings.filter(w => w.severity === 'error' || (!w.severity && w.type === 'unresolved')).length;
    const warnCount = this.warnings.filter(w => w.severity === 'warning' || (!w.severity && w.type !== 'unresolved' && w.type !== 'compounded_order_mismatch')).length;
    const infoCount = this.warnings.filter(w => w.severity === 'info' || w.type === 'compounded_order_mismatch' || w.type === 'unformatted_prose_mention').length;

    const tabs: Array<{ id: 'all' | 'error' | 'warning' | 'info'; label: string; count: number }> = [
      { id: 'all', label: 'All Issues', count: this.warnings.length },
      { id: 'error', label: 'Errors', count: errorCount },
      { id: 'warning', label: 'Warnings', count: warnCount },
      { id: 'info', label: 'Suggestions', count: infoCount },
    ];

    for (const tab of tabs) {
      const tabBtn = tabGroup.createEl('button', {
        cls: `citation-mini-btn ${this.activeSeverityFilter === tab.id ? 'mod-cta' : ''}`,
        text: `${tab.label} (${tab.count})`,
      });
      tabBtn.style.width = 'auto';
      tabBtn.style.padding = '2px 8px';
      tabBtn.addEventListener('click', () => {
        this.activeSeverityFilter = tab.id;
        this.renderModal();
      });
    }

    // Batch selection toggles
    const batchActions = topFilterFlex.createDiv();
    batchActions.style.display = 'flex';
    batchActions.style.gap = '6px';

    const filteredWarnings = this.warnings.filter(w => {
      if (this.activeSeverityFilter === 'all') return true;
      if (this.activeSeverityFilter === 'error') return w.severity === 'error' || (!w.severity && w.type === 'unresolved');
      if (this.activeSeverityFilter === 'warning') return w.severity === 'warning' || (!w.severity && w.type !== 'unresolved' && w.type !== 'compounded_order_mismatch');
      if (this.activeSeverityFilter === 'info') return w.severity === 'info' || w.type === 'compounded_order_mismatch' || w.type === 'unformatted_prose_mention';
      return true;
    });

    const fixableInFilter = filteredWarnings.filter(w => w.suggestedFix !== undefined);
    const selectedInFilterCount = fixableInFilter.filter(w => this.selectedIds.has(w.id)).length;
    const hasAnySelected = selectedInFilterCount > 0;

    if (fixableInFilter.length > 0) {
      const selectAllBtn = batchActions.createEl('button', {
        cls: 'citation-mini-btn',
        text: hasAnySelected ? 'Deselect All' : 'Select All',
      });
      selectAllBtn.style.width = 'auto';
      selectAllBtn.style.padding = '2px 8px';
      selectAllBtn.addEventListener('click', () => {
        if (hasAnySelected) {
          // Deselect All takes precedence if 1, 2, or all items in filter are selected
          fixableInFilter.forEach(w => this.selectedIds.delete(w.id));
        } else {
          // Select all in current filter
          fixableInFilter.forEach(w => this.selectedIds.add(w.id));
        }
        this.renderModal();
      });
    }

    // 2. INTERACTIVE LINT ACCORDION LIST
    const listContainer = contentEl.createDiv({ cls: 'citation-lint-accordion-list' });

    for (const w of filteredWarnings) {
      const isOpen = this.openWarningId === w.id;
      const item = listContainer.createDiv({ cls: `citation-lint-accordion-item ${isOpen ? 'open' : ''}` });

      // Accordion Header
      const header = item.createDiv({ cls: 'lint-accordion-header' });

      // Header Left: [Checkbox] [>] [Severity Icon] [Short Title]
      const hLeft = header.createDiv({ cls: 'lint-header-left' });

      const isFixable = w.suggestedFix !== undefined;
      if (isFixable) {
        const checkbox = hLeft.createEl('input', {
          type: 'checkbox',
          cls: 'lint-item-checkbox',
        });
        checkbox.checked = this.selectedIds.has(w.id);
        checkbox.title = 'Select this issue for batch correction';
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        checkbox.addEventListener('change', (e) => {
          e.stopPropagation();
          if (checkbox.checked) {
            this.selectedIds.add(w.id);
          } else {
            this.selectedIds.delete(w.id);
          }
          this.renderModal();
        });
      }

      const chevronSpan = hLeft.createSpan({ cls: 'lint-chevron-icon' });
      setIcon(chevronSpan, isOpen ? 'chevron-down' : 'chevron-right');

      const sev = w.severity || (w.type === 'unresolved' ? 'error' : (w.type === 'compounded_order_mismatch' ? 'info' : 'warning'));
      const sevBadge = hLeft.createSpan({ cls: `lint-severity-badge severity-${sev}` });
      if (sev === 'error') {
        setIcon(sevBadge, 'alert-circle');
      } else if (sev === 'info') {
        setIcon(sevBadge, 'info');
      } else {
        setIcon(sevBadge, 'alert-triangle');
      }

      const shortTitle = w.shortTitle || (w.type === 'format_mismatch' ? 'Format Mismatch' : (w.type === 'style_mismatch' ? 'Style Mismatch' : (w.type === 'orphan_definition' ? 'Orphan Definition' : 'Unresolved Reference')));
      hLeft.createSpan({ cls: 'lint-short-title', text: shortTitle });

      // Header Right: [File:Line] [Dismiss (Trash/X) Button]
      const hRight = header.createDiv({ cls: 'lint-header-right' });

      const fileBadge = hRight.createSpan({ cls: 'lint-file-badge', text: `${w.fileName}:${w.lineNumber}` });
      fileBadge.title = 'Click to open file in workspace leaf';
      fileBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileObj = this.app.vault.getAbstractFileByPath(w.filePath);
        if (fileObj instanceof TFile) this.app.workspace.getLeaf().openFile(fileObj);
      });

      const dismissBtn = hRight.createEl('button', { cls: 'lint-header-dismiss-btn', title: 'Dismiss this issue' });
      setIcon(dismissBtn, 'trash-2');
      dismissBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.storageManager.saveDismissedLint(w.id);
        new Notice('Issue dismissed.');
        await this.refreshWarningsFromParent();
      });

      // Header Click Toggle Accordion (Only one open at a time)
      header.addEventListener('click', () => {
        this.openWarningId = (this.openWarningId === w.id) ? null : w.id;
        this.renderModal();
      });

      // Accordion Body (When Expanded)
      if (isOpen) {
        const body = item.createDiv({ cls: 'lint-accordion-body' });

        // 1. Explanation row
        const explBox = body.createDiv({ cls: 'lint-explanation-box' });
        explBox.createSpan({ text: w.explanation || w.message });

        // 2. Solution & Diff row
        if (w.suggestedFix !== undefined || w.definitionSnippet) {
          const solBox = body.createDiv({ cls: 'lint-solution-box' });
          solBox.createDiv({ cls: 'lint-solution-label', text: 'Proposed Correction:' });

          const diffWrap = solBox.createDiv({ cls: 'lint-diff-preview' });
          if (w.rawCitation) {
            const oldEl = diffWrap.createSpan({ cls: 'diff-old' });
            oldEl.style.color = 'var(--text-error, #ef4444)';
            oldEl.style.textDecoration = 'line-through';
            oldEl.createEl('code', { text: w.rawCitation });
            diffWrap.createSpan({ text: '  →  ', cls: 'diff-arrow' });
          }

          const newEl = diffWrap.createSpan({ cls: 'diff-new' });
          newEl.style.fontWeight = '600';
          if (w.suggestedFix === '') {
            newEl.style.color = 'var(--text-warning, #eab308)';
            newEl.createEl('em', { text: '(Remove uncited orphan definition)' });
          } else {
            newEl.style.color = 'var(--text-success, #22c55e)';
            newEl.createEl('code', { text: w.suggestedFix || '' });
          }
        }

        // 3. Actions Row
        const actionsRow = body.createDiv({ cls: 'lint-actions-row' });

        if (w.suggestedFix !== undefined) {
          const applySingleBtn = actionsRow.createEl('button', { cls: 'mod-cta citation-mini-btn', text: 'Apply Fix' });
          applySingleBtn.style.width = 'auto';
          applySingleBtn.style.padding = '3px 10px';
          applySingleBtn.addEventListener('click', async () => {
            applySingleBtn.disabled = true;
            applySingleBtn.setText('Applying...');
            await LintEngine.applyLintFix(this.app, w);
            new Notice('Fix applied successfully.');
            await this.refreshWarningsFromParent();
          });
        }

        if (w.type === 'unresolved' || w.type === 'author_typo_fuzzy') {
          const createBtn = actionsRow.createEl('button', { cls: 'citation-mini-btn', text: '+ Create Entry' });
          createBtn.style.width = 'auto';
          createBtn.style.padding = '3px 8px';
          createBtn.style.background = 'var(--interactive-accent)';
          createBtn.style.color = 'var(--text-on-accent)';
          createBtn.addEventListener('click', () => {
            const key = w.citekey || w.rawCitation.replace(/^\[\^?|\]$/g, '').replace(/^@/, '');
            new ReferenceEditorModal(
              this.app,
              {
                citekey: key,
                title: w.definitionSnippet || `Reference ${key}`,
                authors: ['Author'],
                year: new Date().getFullYear(),
                type: 'journal',
                projects: []
              },
              async (newRef) => {
                await this.storageManager.saveReference(newRef);
                new Notice(`Created reference entry [${newRef.citekey}]`);
                await this.refreshWarningsFromParent();
              },
              true
            ).open();
          });
        }

        if (w.type === 'orphan_definition' || w.type === 'unresolved') {
          const purgeBtn = actionsRow.createEl('button', { cls: 'citation-mini-btn btn-danger', text: 'Purge' });
          purgeBtn.style.width = 'auto';
          purgeBtn.style.padding = '3px 8px';
          purgeBtn.title = 'Remove this token and definition from note';
          purgeBtn.addEventListener('click', async () => {
            await LintEngine.applyLintFix(this.app, w, { label: 'Purge', action: 'purge' });
            new Notice(`Purged reference from ${w.fileName}`);
            await this.refreshWarningsFromParent();
          });
        }

        const dismissRowBtn = actionsRow.createEl('button', { cls: 'citation-mini-btn', text: 'Dismiss' });
        dismissRowBtn.style.width = 'auto';
        dismissRowBtn.style.padding = '3px 8px';
        dismissRowBtn.addEventListener('click', async () => {
          await this.storageManager.saveDismissedLint(w.id);
          new Notice('Issue dismissed.');
          await this.refreshWarningsFromParent();
        });
      }
    }

    // 3. FOOTER BUTTONS CONTAINER
    const footerRow = contentEl.createDiv({ cls: 'modal-button-container citation-modal-buttons' });

    if (fixableInFilter.length > 0) {
      const fixableSelectedCount = this.warnings.filter(w => w.suggestedFix !== undefined && this.selectedIds.has(w.id)).length;
      const batchApplyBtn = footerRow.createEl('button', {
        cls: 'mod-cta',
        text: `Apply Selected Fixes (${fixableSelectedCount})`,
      });
      batchApplyBtn.disabled = fixableSelectedCount === 0;
      batchApplyBtn.addEventListener('click', async () => {
        batchApplyBtn.disabled = true;
        batchApplyBtn.setText('Applying...');
        const toApply = this.warnings.filter(w => w.suggestedFix !== undefined && this.selectedIds.has(w.id));
        await LintEngine.batchApplyFixes(this.app, toApply);
        new Notice('Applied selected fixes.');
        await this.refreshWarningsFromParent();
      });
    }

    const closeBtn = footerRow.createEl('button', { text: 'Close' });
    closeBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}
