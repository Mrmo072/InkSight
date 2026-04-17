import { getAppContext } from './app-context.js';
import { buildRecoveryDiagnostics, findLoadedDocumentMatch } from './document-relink.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getCardsCollection(cardSystem) {
    if (cardSystem?.cards instanceof Map) {
        return Array.from(cardSystem.cards.values());
    }

    return Object.values(cardSystem?.cards || {});
}

function getDocumentImpact(documentId, diagnostics) {
    const cardCount = diagnostics.unresolvedCards.filter((card) => card.sourceId === documentId).length;
    const highlightCount = diagnostics.unresolvedHighlights.filter((highlight) => highlight.sourceId === documentId).length;

    return {
        cardCount,
        highlightCount,
        referenceCount: cardCount + highlightCount
    };
}

function buildAffectedPreview(documentId, diagnostics) {
    const cardPreview = diagnostics.unresolvedCards
        .filter((card) => card.sourceId === documentId)
        .slice(0, 2)
        .map((card) => card.content || card.note || card.id);
    const highlightPreview = diagnostics.unresolvedHighlights
        .filter((highlight) => highlight.sourceId === documentId)
        .slice(0, 2)
        .map((highlight) => highlight.text || highlight.id);

    return [...cardPreview, ...highlightPreview].slice(0, 3);
}

export function relinkRecoveredDocument({
    documentId,
    loadedDocumentId,
    appContext = getAppContext()
} = {}) {
    if (!documentId || !loadedDocumentId) {
        return false;
    }

    const missingDocument = appContext.documentManager?.getDocumentInfo?.(documentId);
    const loadedDocument = appContext.documentManager?.getDocumentInfo?.(loadedDocumentId);

    if (!missingDocument || missingDocument.loaded || !loadedDocument?.loaded) {
        return false;
    }

    appContext.highlightManager?.remapSourceIds?.(loadedDocument.id, missingDocument.id);
    appContext.cardSystem?.remapSourceIds?.(loadedDocument.id, missingDocument.id);
    appContext.cardSystem?.updateSourceNames?.(loadedDocument.id, loadedDocument.name);
    appContext.highlightManager?.updateSourceNames?.(loadedDocument.id, loadedDocument.name);
    appContext.documentManager?.unregisterDocument?.(missingDocument.id);

    return true;
}

export function buildRecoveryWorkbenchModel(appContext = getAppContext()) {
    const diagnostics = buildRecoveryDiagnostics(appContext);
    const loadedDocuments = diagnostics.loadedDocuments;
    const lastSummary = appContext.recoveryWorkbenchSummary || null;
    const documents = diagnostics.missingDocuments.map((document) => {
        const impact = getDocumentImpact(document.id, diagnostics);
        const loadedMatch = findLoadedDocumentMatch({
            document,
            loadedDocuments,
            documentManager: appContext.documentManager
        });

        return {
            ...document,
            ...impact,
            affectedPreview: buildAffectedPreview(document.id, diagnostics),
            loadedMatch,
            autoMatchReady: Boolean(loadedMatch),
            status: loadedMatch ? 'needs_validation' : 'needs_import',
            statusLabel: loadedMatch ? 'Needs validation' : 'Needs source import'
        };
    });

    const readyMatches = documents.filter((document) => document.autoMatchReady).length;

    return {
        ...diagnostics,
        documents,
        readyMatches,
        impactedDocuments: documents.filter((document) => document.referenceCount > 0).length,
        lastSummary
    };
}

export function renderRecoveryWorkbenchMarkup(workbench) {
    if (!workbench?.documents?.length) {
        return '';
    }

    return `
        <section class="library-recovery-panel" aria-label="Missing source files">
          <div class="library-recovery-header">
            <span class="material-icons-round">link_off</span>
            <div class="library-recovery-copy">
              <strong>${workbench.documents.length} source ${workbench.documents.length === 1 ? 'file is' : 'files are'} waiting to be relinked</strong>
              <p class="text-two-line">Auto match, import, or validate source links.</p>
            </div>
          </div>
          <div class="library-recovery-stats">
            <span><span class="material-icons-round">sticky_note_2</span>${workbench.unresolvedCards.length}</span>
            <span><span class="material-icons-round">format_quote</span>${workbench.unresolvedHighlights.length}</span>
            <span><span class="material-icons-round">auto_awesome</span>${workbench.readyMatches}</span>
            <span><span class="material-icons-round">description</span>${workbench.totalDocuments}</span>
          </div>
          <div class="library-recovery-actions icon-row">
            <button type="button" class="library-recovery-secondary-btn icon-only-btn" data-recovery-action="auto" title="Auto Match" aria-label="Auto Match"><span class="material-icons-round">auto_awesome</span></button>
            <button type="button" class="library-recovery-secondary-btn icon-only-btn" data-recovery-action="bulk" title="Import Sources" aria-label="Import Sources"><span class="material-icons-round">upload_file</span></button>
            <button type="button" class="library-recovery-secondary-btn icon-only-btn" data-recovery-action="validate" title="Validate Links" aria-label="Validate Links"><span class="material-icons-round">task_alt</span></button>
          </div>
          ${workbench.lastSummary ? `
            <div class="library-recovery-summary">
              <strong>${workbench.lastSummary.matched.length} matched, ${workbench.lastSummary.remaining.length} still pending</strong>
              <p>${escapeHtml(workbench.lastSummary.message)}</p>
            </div>
          ` : ''}
          <div class="library-recovery-list">
            ${workbench.documents.map((document) => `
              <div class="library-recovery-item">
                <div class="library-recovery-item-copy">
                  <span class="library-recovery-name">${escapeHtml(document.name)}</span>
                  <span class="library-recovery-meta">${escapeHtml(document.type || 'Unknown file type')}</span>
                  <div class="library-recovery-tags">
                    <span title="Cards"><span class="material-icons-round">sticky_note_2</span>${document.cardCount}</span>
                    <span title="Highlights"><span class="material-icons-round">format_quote</span>${document.highlightCount}</span>
                    <span title="${escapeHtml(document.statusLabel)}"><span class="material-icons-round">${document.loadedMatch ? 'task_alt' : 'warning_amber'}</span>${escapeHtml(document.statusLabel)}</span>
                    ${document.loadedMatch ? `<span title="${escapeHtml(document.loadedMatch.name)}"><span class="material-icons-round">link</span>${escapeHtml(document.loadedMatch.name)}</span>` : ''}
                  </div>
                  ${document.affectedPreview.length ? `
                    <div class="library-recovery-preview">
                      ${document.affectedPreview.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
                <div class="library-recovery-item-actions">
                  ${document.loadedMatch ? `<button type="button" class="library-recovery-btn icon-only-btn" data-recovery-match-id="${escapeHtml(document.id)}" title="Match Existing" aria-label="Match Existing"><span class="material-icons-round">link</span></button>` : ''}
                  <button type="button" class="library-recovery-btn secondary icon-only-btn" data-relink-document-id="${escapeHtml(document.id)}" title="Relink Source" aria-label="Relink Source"><span class="material-icons-round">upload_file</span></button>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
    `;
}

export function createRecoveryWorkbenchController({
    getContext = getAppContext,
    renderFileList,
    refreshAnnotations,
    notify,
    promptBulkRelink,
    showValidation
} = {}) {
    function finalizeRelink() {
        renderFileList?.();
        refreshAnnotations?.();
    }

    function updateSummary(summary) {
        getContext().recoveryWorkbenchSummary = summary;
    }

    function attemptAutoRelinkRecoveredDocuments({ notifyUser = false } = {}) {
        const workbench = buildRecoveryWorkbenchModel(getContext());
        let matchedCount = 0;
        const matched = [];

        workbench.documents.forEach((document) => {
            if (!document.loadedMatch) {
                return;
            }

            if (relinkRecoveredDocument({
                documentId: document.id,
                loadedDocumentId: document.loadedMatch.id,
                appContext: getContext()
            })) {
                matchedCount += 1;
                matched.push({
                    id: document.id,
                    name: document.name,
                    matchedTo: document.loadedMatch.name
                });
            }
        });

        updateSummary({
            matched,
            remaining: workbench.documents.filter((document) => !document.loadedMatch).map((document) => ({
                id: document.id,
                name: document.name
            })),
            message: matchedCount > 0
                ? `Recovered ${matched.map((entry) => `"${entry.name}"`).join(', ')}.`
                : 'No automatic relink candidates were found.'
        });

        if (matchedCount > 0) {
            finalizeRelink();
        }

        if (notifyUser) {
            if (matchedCount > 0) {
                notify?.({
                    title: 'Auto Match Complete',
                    message: `Automatically relinked ${matchedCount} restored source ${matchedCount === 1 ? 'file' : 'files'} using documents already loaded in the workspace.`,
                    level: 'success',
                    actions: [
                        { label: 'Validate', onClick: () => showValidation?.() }
                    ]
                });
            } else {
                notify?.({
                    title: 'Auto Match',
                    message: 'No automatic relink candidates were found among the documents already loaded in this workspace.',
                    level: 'warning',
                    actions: [
                        { label: 'Import Sources', onClick: () => promptBulkRelink?.() }
                    ]
                });
            }
        }

        return matchedCount;
    }

    function matchRecoveredDocument(documentId) {
        const workbench = buildRecoveryWorkbenchModel(getContext());
        const document = workbench.documents.find((item) => item.id === documentId);
        if (!document?.loadedMatch) {
            return false;
        }

        const relinked = relinkRecoveredDocument({
            documentId,
            loadedDocumentId: document.loadedMatch.id,
            appContext: getContext()
        });

        if (!relinked) {
            return false;
        }

        updateSummary({
            matched: [{
                id: document.id,
                name: document.name,
                matchedTo: document.loadedMatch.name
            }],
            remaining: workbench.documents
                .filter((item) => item.id !== document.id)
                .map((item) => ({ id: item.id, name: item.name })),
            message: `Linked "${document.name}" to "${document.loadedMatch.name}".`
        });
        finalizeRelink();
        notify?.({
            title: 'Source Relinked',
            message: `"${document.name}" is now linked to "${document.loadedMatch.name}".`,
            level: 'success',
            actions: [
                { label: 'Validate', onClick: () => showValidation?.() }
            ]
        });
        return true;
    }

    function showRecoveryValidation() {
        const workbench = buildRecoveryWorkbenchModel(getContext());
        const unresolvedDocumentCount = workbench.documents.length;

        if (unresolvedDocumentCount === 0) {
            updateSummary({
                matched: [],
                remaining: [],
                message: 'All saved source documents are linked and ready.'
            });
            notify?.({
                title: 'Links Ready',
                message: `All saved source documents are linked. ${workbench.readyCards} of ${workbench.totalCards} cards and ${workbench.readyHighlights} of ${workbench.totalHighlights} highlights are ready for source navigation.`,
                level: 'success',
                duration: 5200
            });
            return workbench;
        }

        notify?.({
            title: 'Links Incomplete',
            message: `${unresolvedDocumentCount} source ${unresolvedDocumentCount === 1 ? 'file is' : 'files are'} still missing. ${workbench.readyMatches} automatic ${workbench.readyMatches === 1 ? 'match is' : 'matches are'} ready, and ${workbench.unresolvedCards.length} cards plus ${workbench.unresolvedHighlights.length} highlights still need recovery.`,
            level: 'warning',
            duration: 6200,
            actions: [
                { label: 'Auto Match', onClick: () => attemptAutoRelinkRecoveredDocuments({ notifyUser: true }) },
                { label: 'Import Sources', onClick: () => promptBulkRelink?.() }
            ]
        });
        return workbench;
    }

    return {
        attemptAutoRelinkRecoveredDocuments,
        buildRecoveryWorkbenchModel: () => buildRecoveryWorkbenchModel(getContext()),
        matchRecoveredDocument,
        showRecoveryValidation
    };
}
