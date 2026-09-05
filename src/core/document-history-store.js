export const DOCUMENT_HISTORY_STORAGE_KEY = 'inksight_document_history';

export function loadDocumentHistory(storage = localStorage, key = DOCUMENT_HISTORY_STORAGE_KEY) {
    const stored = storage.getItem(key);
    if (!stored) {
        return {};
    }

    try {
        return JSON.parse(stored);
    } catch (error) {
        console.error('[DocumentHistoryManager] Failed to parse history', error);
        return {};
    }
}

export function saveDocumentHistory(history, storage = localStorage, key = DOCUMENT_HISTORY_STORAGE_KEY) {
    try {
        storage.setItem(key, JSON.stringify(history));
    } catch (error) {
        // Quota errors must not crash the autosave loop — history is a small
        // index; the heavy payloads live in the runtime snapshot storage.
        console.error('[DocumentHistoryManager] Failed to persist history', error);
    }
}

function ensureHistoryEntry(history, md5) {
    if (!md5) {
        return null;
    }

    if (!history[md5]) {
        history[md5] = {};
    }

    return history[md5];
}

export function updateDocumentHistoryPage(history, md5, page, timestamp = Date.now()) {
    const entry = ensureHistoryEntry(history, md5);
    if (!entry) {
        return history;
    }

    entry.lastPage = page;
    entry.lastOpened = timestamp;
    return history;
}

export function updateDocumentHistoryLocation(history, md5, location = {}, timestamp = Date.now()) {
    const entry = ensureHistoryEntry(history, md5);
    if (!entry) {
        return history;
    }

    entry.lastLocation = {
        ...(entry.lastLocation || {}),
        ...location
    };
    entry.lastOpened = timestamp;
    return history;
}

export function updateDocumentHistoryScroll(history, md5, scrollTop, timestamp = Date.now()) {
    const entry = ensureHistoryEntry(history, md5);
    if (!entry) {
        return history;
    }

    entry.lastScrollTop = Number.isFinite(scrollTop) ? scrollTop : 0;
    entry.lastOpened = timestamp;
    return history;
}
