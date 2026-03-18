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
    storage.setItem(key, JSON.stringify(history));
}

export function updateDocumentHistoryPage(history, md5, page, timestamp = Date.now()) {
    if (!md5) {
        return history;
    }

    if (!history[md5]) {
        history[md5] = {};
    }

    history[md5].lastPage = page;
    history[md5].lastOpened = timestamp;
    return history;
}
