function normalizeName(value, documentManager) {
    return documentManager?.normalizeDocumentName?.(value) ?? String(value ?? '').trim().toLowerCase();
}

function isCompatibleType(left, right, documentManager) {
    return documentManager?.isTypeCompatible?.(left, right) ?? left === right;
}

function findLoadedDuplicate({ file, currentFiles = [], documentManager }) {
    const normalizedName = normalizeName(file?.name, documentManager);
    return currentFiles.find((entry) => {
        if (!entry) {
            return false;
        }

        return normalizeName(entry.name, documentManager) === normalizedName &&
            isCompatibleType(entry.type, file.type, documentManager);
    }) ?? null;
}

export function resolveImportDecision({
    file,
    pendingDocumentImport = null,
    documentManager,
    currentFiles = [],
    prompt = (message, defaultValue) => window.prompt(message, defaultValue)
} = {}) {
    if (!file || !documentManager) {
        return {
            mode: 'new',
            targetDocumentId: null,
            reason: 'missing-context'
        };
    }

    if (pendingDocumentImport?.id) {
        const expectedDocument = documentManager.getDocumentInfo?.(pendingDocumentImport.id) ?? pendingDocumentImport;
        const compatible = isCompatibleType(expectedDocument?.type, file.type, documentManager);
        if (!compatible) {
            return {
                mode: 'relink-only',
                targetDocumentId: null,
                reason: 'incompatible-relink-type'
            };
        }

        return {
            mode: 'relink-only',
            targetDocumentId: expectedDocument.id,
            reason: 'pending-relink'
        };
    }

    const duplicate = findLoadedDuplicate({ file, currentFiles, documentManager });
    const missingMatch = documentManager.findRestorableMatch?.({
        name: file.name,
        type: file.type
    }) ?? null;

    if (!duplicate && !missingMatch) {
        return {
            mode: 'new',
            targetDocumentId: null,
            reason: 'new-document'
        };
    }

    const availableModes = [
        duplicate ? 'replace' : null,
        'new',
        missingMatch ? 'relink-only' : null
    ].filter(Boolean);
    const defaultMode = missingMatch ? 'relink-only' : duplicate ? 'replace' : 'new';

    const choice = prompt(
        `Import mode for "${file.name}"? Available: ${availableModes.join(' / ')}.`,
        defaultMode
    );
    const selectedMode = availableModes.includes(choice) ? choice : defaultMode;

    return {
        mode: selectedMode,
        targetDocumentId: selectedMode === 'replace'
            ? duplicate?.id ?? null
            : selectedMode === 'relink-only'
                ? missingMatch?.id ?? null
                : null,
        reason: selectedMode === 'replace'
            ? 'loaded-duplicate'
            : selectedMode === 'relink-only'
                ? 'missing-document-match'
                : 'user-selected-new'
    };
}
