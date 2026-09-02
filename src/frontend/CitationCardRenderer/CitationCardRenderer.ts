import { App, Notice, setIcon, normalizePath } from 'obsidian';
import { ReferenceMetadata, ProjectRecord, ProjectHealthStats, CitationManagerSettings } from '../../backend/types';
import { StorageManager } from '../../backend/storageManager';
import { ProjectIndexer } from '../../backend/projectIndexer';
import { ReferenceEditorModal } from '../ReferenceEditorModal';
import { UsageLocationsModal } from '../UsageLocationsModal';
import { CitationNotesModal } from '../CitationNotesModal';
import { ConfirmModal } from '../ConfirmModal';
import { MoveToCollectionModal } from '../MoveToCollectionModal';

export class CitationCardRenderer {
  public static getSourceUrl(ref: ReferenceMetadata): string | null {
    if (ref.doi && ref.doi.trim()) {
      const clean = ref.doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
      return `https://doi.org/${clean}`;
    }
    if (ref.arxivId && ref.arxivId.trim()) {
      const clean = ref.arxivId.trim().replace(/^arxiv:\s*/i, '');
      return `https://arxiv.org/abs/${clean}`;
    }
    if (ref.url && ref.url.trim() && /^https?:\/\//i.test(ref.url.trim())) {
      return ref.url.trim();
    }
    return null;
  }

  public static async openSourceUrl(app: App, url: string) {
    if (!url) return;

    try {
      // 1. Surfing Community Plugin Integration
      const surfingPlugin = (app as any).plugins?.plugins?.['surfing'];
      if (surfingPlugin) {
        if (typeof surfingPlugin.openUrl === 'function') {
          surfingPlugin.openUrl(url);
          return;
        }
        const leaf = app.workspace.getLeaf('tab') || app.workspace.getLeaf(true);
        if (leaf) {
          await leaf.setViewState({
            type: 'surfing-view',
            active: true,
            state: { url }
          });
          app.workspace.revealLeaf(leaf);
          return;
        }
      }

      // 2. Obsidian Native Web Viewer Core Plugin Integration
      const webViewerPlugin = (app as any).internalPlugins?.plugins?.['web-viewer'];
      if (webViewerPlugin?.enabled) {
        const leaf = app.workspace.getLeaf('tab') || app.workspace.getLeaf(true);
        if (leaf) {
          await leaf.setViewState({
            type: 'web-viewer',
            active: true,
            state: { url }
          });
          app.workspace.revealLeaf(leaf);
          return;
        }
      }

      // 3. Fallback: Default Browser
      window.open(url, '_blank');
    } catch {
      window.open(url, '_blank');
    }
  }

  public static async openAttachedPDF(app: App, ref: ReferenceMetadata, referencesFolder: string) {
    if (!ref.pdfAttachment) return;
    const pathsToTry = [
      normalizePath(ref.pdfAttachment),
      normalizePath(`${referencesFolder}/attachments/${ref.citekey}.pdf`),
      normalizePath(`${referencesFolder}/${ref.citekey}.pdf`),
    ];

    let targetFile: any = null;
    for (const p of pathsToTry) {
      const file = app.vault.getAbstractFileByPath(p);
      if (file) {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) {
      new Notice(`Attached PDF not found for [${ref.citekey}]`);
      return;
    }

    try {
      // 1. Surfing Community Plugin Integration for attached local PDF
      const surfingPlugin = (app as any).plugins?.plugins?.['surfing'];
      if (surfingPlugin) {
        const resourcePath = app.vault.getResourcePath(targetFile);
        if (typeof surfingPlugin.openUrl === 'function') {
          surfingPlugin.openUrl(resourcePath);
          return;
        }
        const leaf = app.workspace.getLeaf('tab') || app.workspace.getLeaf(true);
        if (leaf) {
          await leaf.setViewState({
            type: 'surfing-view',
            active: true,
            state: { url: resourcePath }
          });
          app.workspace.revealLeaf(leaf);
          return;
        }
      }

      // 2. Fallback: Obsidian Native Tab Leaf PDF Viewer
      const leaf = app.workspace.getLeaf('tab') || app.workspace.getLeaf(true);
      if (leaf) {
        await leaf.openFile(targetFile);
        app.workspace.revealLeaf(leaf);
      }
    } catch {
      const leaf = app.workspace.getLeaf('tab') || app.workspace.getLeaf(true);
      if (leaf) {
        await leaf.openFile(targetFile);
      }
    }
  }

  static renderCard(
    app: App,
    container: HTMLElement,
    ref: ReferenceMetadata,
    project: ProjectRecord | null,
    stats: ProjectHealthStats | null,
    storageManager: StorageManager,
    projectIndexer: ProjectIndexer,
    settings: CitationManagerSettings,
    onInsert: (ref: ReferenceMetadata) => Promise<void>,
    onRefresh: () => Promise<void>
  ) {
    const card = container.createDiv({ cls: 'citation-card' });

    // Open source link when clicking on the card body (Surfing / Web Viewer / Browser)
    const sourceUrl = CitationCardRenderer.getSourceUrl(ref);
    if (sourceUrl) {
      card.addClass('has-source-link');
      card.title = `Click to open source: ${sourceUrl}`;
      card.addEventListener('click', async (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        // Ignore clicks on buttons, pills, dropdowns, accordions, etc.
        if (target.closest('button, .citation-usage-pill, .citation-pdf-pill, .citation-notes-pill, .citation-card-notes-accordion, input, select, a')) {
          return;
        }
        await CitationCardRenderer.openSourceUrl(app, sourceUrl);
      });
    }

    // Header
    const cardHeader = card.createDiv({ cls: 'citation-card-header' });
    cardHeader.createSpan({ cls: 'citation-type-badge type-' + ref.type, text: ref.type.toUpperCase() });
    cardHeader.createSpan({ cls: 'citation-key-pill', text: ref.citekey });

    // PDF attachment pill
    if (ref.pdfAttachment) {
      const pdfBadge = cardHeader.createSpan({
        cls: 'citation-pdf-pill',
        text: 'PDF',
        title: 'Open attached PDF'
      });
      setIcon(pdfBadge.createSpan({ cls: 'inline-icon' }), 'file-text');
      pdfBadge.addEventListener('click', async (e) => {
        e.stopPropagation();
        await CitationCardRenderer.openAttachedPDF(app, ref, settings.referencesFolder);
      });
    }

    // Usage badge
    const occurrences = stats?.referenceUsageMap[ref.citekey] || [];
    if (occurrences.length > 0) {
      const usageBadge = cardHeader.createSpan({
        cls: 'citation-usage-pill used',
        text: 'Cited (' + occurrences.length + 'x)',
        title: 'Click to see document occurrences'
      });
      usageBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        new UsageLocationsModal(app, ref.citekey, occurrences).open();
      });
    } else {
      cardHeader.createSpan({ cls: 'citation-usage-pill unused', text: 'Unused' });
    }

    // Title & Authors
    card.createDiv({ cls: 'citation-card-title', text: ref.title });
    const authorYear = card.createDiv({ cls: 'citation-card-author-year' });
    authorYear.createSpan({ text: (ref.authors || []).slice(0, 3).join(', ') + ((ref.authors?.length || 0) > 3 ? ' et al.' : '') });
    authorYear.createSpan({ cls: 'citation-year-dot', text: ' • ' + ref.year });

    if (ref.publication) {
      card.createDiv({ cls: 'citation-card-publication', text: ref.publication });
    }

    // Expandable In-Card Notes Accordion
    const rawNotes = (ref.userNotes || '').trim();
    const cleanNotes = rawNotes.replace(/\s+/g, ' ').trim();

    if (cleanNotes.length > 0) {
      const accordion = card.createDiv({ cls: 'citation-card-notes-accordion' });
      const accHeader = accordion.createDiv({ cls: 'citation-card-notes-header' });
      const accChevron = accHeader.createSpan({ cls: 'notes-accordion-icon' });
      setIcon(accChevron, 'chevron-right');
      const accTitle = accHeader.createSpan({ cls: 'notes-accordion-title', text: 'Notes' });

      const accBody = accordion.createDiv({ cls: 'citation-card-notes-body' });
      accBody.style.display = 'none';

      const previewLength = 60;
      const previewText = cleanNotes.length > previewLength ? (cleanNotes.slice(0, previewLength) + '...') : cleanNotes;

      const snippetEl = accBody.createDiv({
        cls: 'citation-card-note-snippet-text',
        text: previewText
      });
      snippetEl.title = 'Click to open literature notes editor';
      snippetEl.style.cursor = 'pointer';
      snippetEl.addEventListener('click', (e) => {
        e.stopPropagation();
        new CitationNotesModal(app, ref, storageManager, async () => {
          await onRefresh();
        }).open();
      });

      let isOpen = false;
      accHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        isOpen = !isOpen;
        if (isOpen) {
          accordion.addClass('open');
          accBody.style.display = 'block';
          setIcon(accChevron, 'chevron-down');
        } else {
          accordion.removeClass('open');
          accBody.style.display = 'none';
          setIcon(accChevron, 'chevron-right');
        }
      });
    }

    // Actions Row with Left & Right Flex Groups
    const actionsRow = card.createDiv({ cls: 'citation-card-actions' });
    const actionsLeft = actionsRow.createDiv({ cls: 'citation-card-actions-left' });
    const actionsRight = actionsRow.createDiv({ cls: 'citation-card-actions-right' });

    // 1. Left Group: Primary Authoring Actions (Insert, Notes, Edit)
    // Insert Button
    const insertBtn = actionsLeft.createEl('button', { cls: 'citation-card-btn mod-cta', title: 'Insert Citation at Cursor' });
    setIcon(insertBtn.createSpan({ cls: 'btn-icon' }), 'quote-glyph');
    insertBtn.createSpan({ text: 'Insert' });
    insertBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await onInsert(ref);
    });

    // Notes Button
    const notesBtn = actionsLeft.createEl('button', {
      cls: 'citation-card-btn ' + (ref.userNotes ? 'has-notes' : ''),
      title: 'View & Edit Research Notes in Modal'
    });
    setIcon(notesBtn.createSpan({ cls: 'btn-icon' }), 'file-text');
    notesBtn.createSpan({ text: 'Notes' });
    notesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      new CitationNotesModal(app, ref, storageManager, async () => {
        await onRefresh();
      }).open();
    });

    // Edit Button
    const editBtn = actionsLeft.createEl('button', { cls: 'citation-card-btn', title: 'Edit Reference Metadata' });
    setIcon(editBtn.createSpan({ cls: 'btn-icon' }), 'edit-3');
    editBtn.createSpan({ text: 'Edit' });
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      new ReferenceEditorModal(
        app,
        ref,
        async (updatedRef, origCitekey) => {
          await storageManager.saveReference(updatedRef, origCitekey);
          await projectIndexer.syncReferenceUpdateAcrossDocuments(
            ref,
            updatedRef,
            project,
            project?.citationStyle || settings.defaultCitationStyle,
            settings.referencesFolder
          );
          await onRefresh();
        },
        false,
        settings.collections || []
      ).open();
    });

    // 2. Right Group: Management & Destructive Actions (Move to Collection, Delete)
    // Move to Collection Button (Icon only)
    const moveBtn = actionsRight.createEl('button', { cls: 'citation-card-btn', title: 'Move to Collection' });
    setIcon(moveBtn.createSpan({ cls: 'btn-icon' }), 'log-out');
    moveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const allRefsMap = (storageManager as any).referencesCache || new Map();
      new MoveToCollectionModal(
        app,
        ref,
        settings.collections || [],
        allRefsMap,
        storageManager,
        async () => {
          await onRefresh();
        }
      ).open();
    });

    // Delete Button
    const deleteBtn = actionsRight.createEl('button', { cls: 'citation-card-btn btn-danger', title: 'Delete Reference' });
    setIcon(deleteBtn.createSpan({ cls: 'btn-icon' }), 'trash-2');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (settings.blockDeletionIfInUse && stats) {
        const check = projectIndexer.canDelete(ref.citekey, stats);
        if (!check.allowed) {
          new Notice('Cannot delete [' + ref.citekey + ']: cited in ' + check.occurrences.length + ' location(s).');
          new UsageLocationsModal(app, ref.citekey, check.occurrences).open();
          return;
        }
      }

      new ConfirmModal(
        app,
        'Delete Reference: ' + ref.citekey,
        'Delete "' + ref.title + '"? Permanently removes its entry.',
        'Delete',
        true,
        async () => {
          await storageManager.deleteReference(ref.citekey);
          new Notice('Deleted [' + ref.citekey + ']');
          await onRefresh();
        }
      ).open();
    });
  }
}
