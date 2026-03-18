import { createLogger } from '../core/logger.js';

const logger = createLogger('InkSightFileRestore');

function hasRestorePayload(payload) {
    return Boolean(
        payload &&
        (
            payload.bookMd5 ||
            payload.cards ||
            payload.connections ||
            payload.highlights
        )
    );
}

export function validateInksightRestorePayload(payload, options = {}) {
    const { expectedMd5, onMismatch } = options;

    if (!payload?.bookMd5 || !expectedMd5 || payload.bookMd5 === expectedMd5) {
        return true;
    }

    onMismatch?.({
        expectedMd5,
        actualMd5: payload.bookMd5
    });

    return false;
}

export function getInksightExpectedElementCount(payload) {
    if (!Array.isArray(payload?.elements)) {
        return 0;
    }

    return payload.elements.length;
}

export function restoreInksightPersistence(payload, appContext = {}, options = {}) {
    const {
        clearPdfHighlights = true,
        onBookMismatch,
        fallbackToCurrentBookIdWithoutMd5 = false
    } = options;

    if (!hasRestorePayload(payload)) {
        return;
    }

    const savedMd5 = payload.bookMd5;
    const currentMd5 = appContext.currentBook?.md5;
    const bookName = payload.bookName || 'Unknown';

    if (savedMd5) {
        if (currentMd5 && savedMd5 !== currentMd5) {
            onBookMismatch?.({ savedMd5, currentMd5, bookName });
        } else if (!currentMd5) {
            logger.debug('Opened mind map without an active book. Nodes will be displayed independently.');
        }
    }

    const shouldRemap = currentMd5 && savedMd5 && currentMd5 === savedMd5;
    const newId = shouldRemap
        ? appContext.currentBook.id
        : (!savedMd5 && fallbackToCurrentBookIdWithoutMd5 ? appContext.currentBook?.id || null : null);

    logger.debug('Restore MD5 check', {
        currentMd5,
        savedMd5,
        match: currentMd5 === savedMd5,
        newId
    });

    if (!currentMd5 && savedMd5) {
        appContext.pendingRestore = { md5: savedMd5, id: payload.bookId };
    }

    if (appContext.cardSystem?.restorePersistenceData) {
        appContext.cardSystem.restorePersistenceData({
            cards: payload.cards,
            connections: payload.connections
        }, newId);
    }

    if (appContext.highlightManager?.restorePersistenceData) {
        if (clearPdfHighlights && appContext.pdfReader?.clearAllHighlights) {
            logger.debug('Clearing existing PDF highlights before restore');
            appContext.pdfReader.clearAllHighlights();
        }

        appContext.highlightManager.restorePersistenceData({
            highlights: payload.highlights
        }, newId);
    }
}
