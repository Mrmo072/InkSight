import { getAppContext } from './app-context.js';
import { buildRecoveryDiagnostics } from './document-relink.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function describeDocumentStatus(file, index) {
    if (file.loaded) {
        return `Document ${index + 1}`;
    }

    return 'Source file missing - re-import to relink';
}

export function getCardsCollection(cardSystem = getAppContext().cardSystem) {
    const cards = cardSystem?.cards;
    if (cards instanceof Map) {
        return Array.from(cards.values());
    }

    return Object.values(cards || {});
}

export function getVisibleDocuments(files, documentManager = getAppContext().documentManager) {
    const registeredDocuments = documentManager?.getAllDocuments?.() ?? [];
    const importedFileIds = new Set(files.map((file) => file.id));
    const visibleDocuments = files.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
        loaded: true,
        fileData: file
    }));

    registeredDocuments.forEach((doc) => {
        if (importedFileIds.has(doc.id)) {
            return;
        }

        visibleDocuments.push({
            ...doc,
            fileData: null
        });
    });

    return visibleDocuments;
}

export function getDocumentReferenceDetails(documentId, {
    cardSystem = getAppContext().cardSystem,
    highlightManager = getAppContext().highlightManager
} = {}) {
    const cardCount = getCardsCollection(cardSystem).filter((card) => card.sourceId === documentId).length;
    const highlightCount = highlightManager?.highlights?.filter((highlight) => highlight.sourceId === documentId).length ?? 0;

    return {
        cardCount,
        highlightCount,
        referenceCount: cardCount + highlightCount
    };
}

export function createFileLibraryRenderer({
    fileListElement,
    getFiles,
    getCurrentFileId,
    getProjectStatus
}) {
    return function renderFileList() {
        const files = getFiles();
        const visibleDocuments = getVisibleDocuments(files);
        const diagnostics = buildRecoveryDiagnostics(getAppContext());
        const missingDocuments = diagnostics.missingDocuments;
        const projectStatus = getProjectStatus();

        const projectPanelMarkup = `
        <section class="library-project-panel" aria-label="Project actions">
          <div class="library-project-header">
            <span class="material-icons-round">folder_managed</span>
            <div class="library-project-copy">
              <strong>${projectStatus.title}</strong>
              <p>${projectStatus.description}</p>
            </div>
          </div>
          <div class="library-project-meta">
            <span>${projectStatus.summary}</span>
            <span>${projectStatus.linkedToDirectory ? 'Local export linked' : 'Server workspace autosave'}</span>
            ${projectStatus.projectDirectoryName ? `<span title="${escapeHtml(projectStatus.projectDirectoryName)}">${escapeHtml(projectStatus.projectDirectoryName)}</span>` : ''}
            ${projectStatus.runtimeRoot ? `<span title="${escapeHtml(projectStatus.runtimeRoot)}">runtime-data</span>` : ''}
          </div>
          <div class="library-project-actions">
            <button type="button" class="library-project-btn primary" data-project-action="open">Open Project Folder</button>
            <button type="button" class="library-project-btn" data-project-action="save">Save Project Folder</button>
            <button type="button" class="library-project-btn" data-project-action="import">Import Documents</button>
          </div>
        </section>
    `;

        if (!visibleDocuments.length) {
            fileListElement.innerHTML = `
            ${projectPanelMarkup}
            <div class="library-empty-state">
              <span class="material-icons-round">upload_file</span>
              <h3>Your library is empty</h3>
              <p>Import reading sources or open a saved project folder to get started.</p>
            </div>
        `;
            return;
        }

        const recoveryMarkup = missingDocuments.length ? `
        <section class="library-recovery-panel" aria-label="Missing source files">
          <div class="library-recovery-header">
            <span class="material-icons-round">link_off</span>
            <div class="library-recovery-copy">
              <strong>${missingDocuments.length} source ${missingDocuments.length === 1 ? 'file is' : 'files are'} waiting to be relinked</strong>
              <p>Re-import the original documents to restore jump-back navigation from the mind map.</p>
            </div>
          </div>
          <div class="library-recovery-stats">
            <span>${diagnostics.unresolvedCards.length} cards</span>
            <span>${diagnostics.unresolvedHighlights.length} highlights</span>
            <span>${diagnostics.totalDocuments} saved docs</span>
          </div>
          <div class="library-recovery-actions">
            <button type="button" class="library-recovery-secondary-btn" data-recovery-action="auto">Auto match</button>
            <button type="button" class="library-recovery-secondary-btn" data-recovery-action="bulk">Import sources</button>
            <button type="button" class="library-recovery-secondary-btn" data-recovery-action="validate">Validate links</button>
          </div>
          <div class="library-recovery-list">
            ${missingDocuments.map((doc) => `
              <div class="library-recovery-item">
                <div class="library-recovery-item-copy">
                  <span class="library-recovery-name">${escapeHtml(doc.name)}</span>
                  <span class="library-recovery-meta">${escapeHtml(doc.type || 'Unknown file type')}</span>
                </div>
                <button type="button" class="library-recovery-btn" data-relink-document-id="${escapeHtml(doc.id)}">Relink</button>
              </div>
            `).join('')}
          </div>
        </section>
    ` : '';

        fileListElement.innerHTML = `
        ${projectPanelMarkup}
        ${recoveryMarkup}
        ${visibleDocuments.map((file, index) => `
        <div class="file-item ${getCurrentFileId() === file.id ? 'active' : ''} ${file.loaded ? '' : 'disabled'}" 
             data-open-file-id="${escapeHtml(file.id)}"
             data-file-index="${index}"
             draggable="${file.loaded ? 'true' : 'false'}"
             title="${escapeHtml(file.loaded ? file.name : `${file.name} - re-import this source file to relink annotations`)}">
          <span class="material-icons-round file-item-icon">description</span>
          <span class="file-item-body">
            <span class="text-truncate file-item-name">${escapeHtml(file.name)}</span>
            <span class="file-item-meta">${describeDocumentStatus(file, index)}</span>
          </span>
          ${file.loaded ? `
          <span class="file-item-actions">
            <button type="button" class="file-item-action-btn" data-file-action="move-up" data-file-id="${escapeHtml(file.id)}" title="Move Up" ${index === 0 ? 'disabled' : ''}>
              <span class="material-icons-round">keyboard_arrow_up</span>
            </button>
            <button type="button" class="file-item-action-btn" data-file-action="move-down" data-file-id="${escapeHtml(file.id)}" title="Move Down" ${index === files.length - 1 ? 'disabled' : ''}>
              <span class="material-icons-round">keyboard_arrow_down</span>
            </button>
            <button type="button" class="file-item-action-btn danger" data-file-action="remove" data-file-id="${escapeHtml(file.id)}" title="Remove From Library">
              <span class="material-icons-round">delete</span>
            </button>
          </span>
          ` : ''}
        </div>
    `).join('')}
    `;
    };
}
