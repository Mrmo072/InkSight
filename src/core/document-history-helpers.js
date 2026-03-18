import { buildInksightFilePayload, buildInksightPersistenceSnapshot } from '../inksight-file/inksight-file-snapshot.js';

export function sanitizeSaveFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_');
}

export function getBaseBookName(bookName) {
    if (!bookName) return '';
    return bookName.replace(/\.[^/.]+$/, '');
}

export function getSaveFilename(bookName) {
    return sanitizeSaveFilename(`${getBaseBookName(bookName)}.inksight`);
}

export function getRestoreCandidates(bookName) {
    if (!bookName) return [];

    const rawCandidate = sanitizeSaveFilename(`${bookName}.inksight`);
    const baseCandidate = getSaveFilename(bookName);

    return Array.from(new Set([baseCandidate, rawCandidate].filter(Boolean)));
}

export function resolveHistoryFilename(record) {
    if (!record) return null;

    if (record.saveFilename) {
        return record.saveFilename;
    }

    if (record.autoSavePath) {
        const parts = record.autoSavePath.split(/[/\\]/);
        return parts[parts.length - 1] || null;
    }

    return null;
}

export function buildPersistenceSnapshot(appContext = {}) {
    return buildInksightPersistenceSnapshot(appContext);
}

export function buildAutoSavePayload({ appContext, board, historyEntry }) {
    return buildInksightFilePayload({
        appContext,
        board,
        lastPage: historyEntry?.lastPage
    });
}

export function applySaveResultToHistory({ history, md5, resultPath, saveFilename, timestamp = Date.now() }) {
    if (!history[md5]) {
        history[md5] = {};
    }

    history[md5].autoSavePath = resultPath;
    history[md5].lastSaved = timestamp;
    history[md5].saveFilename = saveFilename;

    return history[md5];
}
