export function chooseDocumentTarget({ file, pendingDocumentImport = null, documentManager, reservedIds = new Set() }) {
    if (!file || !documentManager) {
        return null;
    }

    if (pendingDocumentImport?.id) {
        const expectedDocument = documentManager.getDocumentInfo?.(pendingDocumentImport.id) ?? pendingDocumentImport;
        const compatible = documentManager.isTypeCompatible?.(expectedDocument?.type, file.type) ?? true;
        if (!compatible) {
            return null;
        }

        return expectedDocument;
    }

    const matchedDocument = documentManager.findRestorableMatch?.({
        name: file.name,
        type: file.type
    }) ?? null;

    if (!matchedDocument || reservedIds.has(matchedDocument.id)) {
        return null;
    }

    return matchedDocument;
}

export function findLoadedDocumentMatch({ document, loadedDocuments = [], documentManager }) {
    if (!document || !documentManager) {
        return null;
    }

    const normalize = documentManager.normalizeDocumentName?.bind(documentManager) ?? ((value) => String(value ?? '').trim().toLowerCase());
    const targetName = normalize(document.name);

    return loadedDocuments.find((candidate) => {
        if (!candidate?.loaded || candidate.id === document.id) {
            return false;
        }

        if (normalize(candidate.name) !== targetName) {
            return false;
        }

        return documentManager.isTypeCompatible?.(document.type, candidate.type) ?? true;
    }) ?? null;
}

export function buildRecoveryDiagnostics(appContext = {}) {
    const documents = appContext.documentManager?.getAllDocuments?.() ?? [];
    const missingDocuments = appContext.documentManager?.getMissingDocuments?.() ?? [];
    const missingIds = new Set(missingDocuments.map((doc) => doc.id));
    const cards = appContext.cardSystem?.cards instanceof Map
        ? Array.from(appContext.cardSystem.cards.values())
        : Object.values(appContext.cardSystem?.cards || {});
    const highlights = Array.isArray(appContext.highlightManager?.highlights)
        ? appContext.highlightManager.highlights
        : [];
    const loadedDocuments = documents.filter((doc) => doc.loaded);
    const activeCards = cards.filter((card) => !card.deleted);

    const unresolvedCards = activeCards.filter((card) => missingIds.has(card.sourceId));
    const unresolvedHighlights = highlights.filter((highlight) => missingIds.has(highlight.sourceId));

    return {
        totalDocuments: documents.length,
        loadedDocuments,
        missingDocuments,
        totalCards: activeCards.length,
        totalHighlights: highlights.length,
        readyCards: activeCards.length - unresolvedCards.length,
        readyHighlights: highlights.length - unresolvedHighlights.length,
        unresolvedCards,
        unresolvedHighlights
    };
}
