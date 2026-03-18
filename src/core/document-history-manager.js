
import { getAppContext } from '../app/app-context.js';
import { resolveDocumentHistoryIpc } from './document-history-ipc.js';
import {
    applySaveResultToHistory,
    buildAutoSavePayload,
    getBaseBookName,
    getRestoreCandidates,
    getSaveFilename,
    resolveHistoryFilename,
    sanitizeSaveFilename
} from './document-history-helpers.js';
import {
    DOCUMENT_HISTORY_STORAGE_KEY,
    loadDocumentHistory,
    saveDocumentHistory,
    updateDocumentHistoryPage
} from './document-history-store.js';

export class DocumentHistoryManager {
    constructor() {
        this.ipcRenderer = null;
        this.history = {};
        this.autoSaveInterval = null;
        this.currentMd5 = null;
        this.currentBookName = null;
        this.HISTORY_KEY = DOCUMENT_HISTORY_STORAGE_KEY;
        this.hasPendingRestore = false;
        this.isStatsRestored = true;
        this.initialElementCount = 0;

        this.init();
    }

    sanitizeSaveFilename(filename) {
        return sanitizeSaveFilename(filename);
    }

    getBaseBookName(bookName) {
        return getBaseBookName(bookName);
    }

    getSaveFilename(bookName) {
        return getSaveFilename(bookName);
    }

    getRestoreCandidates(bookName) {
        return getRestoreCandidates(bookName);
    }

    init() {
        this.ipcRenderer = resolveDocumentHistoryIpc();
        this.history = loadDocumentHistory(localStorage, this.HISTORY_KEY);
    }

    getHistory(md5) {
        return this.history[md5];
    }

    updatePage(md5, page) {
        updateDocumentHistoryPage(this.history, md5, page);
        this.saveHistory();
    }

    saveHistory() {
        saveDocumentHistory(this.history, localStorage, this.HISTORY_KEY);
    }

    startAutoSave(md5, bookName) {
        this.stopAutoSave();
        this.currentMd5 = md5;
        this.currentBookName = bookName;

        console.log('[DocumentHistoryManager] Starting auto-save for:', bookName);

        // Auto-save every 3 minutes
        this.autoSaveInterval = setInterval(() => {
            this.performAutoSave();
        }, 3 * 60 * 1000);
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
        this.currentMd5 = null;
        this.currentBookName = null;
    }

    async performAutoSave() {
        // Late init retry
        if (!this.ipcRenderer) {
            this.init();
        }

        const appContext = getAppContext();
        if (!this.currentMd5 || !this.ipcRenderer || !appContext) {
            return; // Silent fail if not ready
        }

        // SAFETY: Do not save if restore hasn't confirmed success
        if (!this.isStatsRestored && this.hasPendingRestore) {
            console.warn('[DocumentHistoryManager] Skipping auto-save: Restore pending or in progress.');
            return;
        }

        try {
            const board = appContext.board;
            if (!board) return;

            // SAFETY VALVE: Empty Board Protection
            // If we expected elements (from restore) but board is empty, DO NOT SAVE.
            if (this.initialElementCount > 0 && board.children.length === 0) {
                console.error('[DocumentHistoryManager] CRITICAL: Attempted to save EMPTY board over existing data. Aborting save.');
                return;
            }

            const data = buildAutoSavePayload({
                appContext,
                board,
                historyEntry: this.history[this.currentMd5]
            });

            const jsonStr = JSON.stringify(data, null, 2);

            // Construct filename
            const safeFileName = this.getSaveFilename(this.currentBookName);

            // Use IPC to save
            const result = await this.ipcRenderer.saveFile(safeFileName, jsonStr);

            if (result.success) {
                console.log('[DocumentHistoryManager] Auto-saved to', result.path);
                applySaveResultToHistory({
                    history: this.history,
                    md5: this.currentMd5,
                    resultPath: result.path,
                    saveFilename: safeFileName
                });
                this.saveHistory();
            } else {
                console.error('[DocumentHistoryManager] IPC save failed:', result.error);
            }

        } catch (e) {
            console.error('[DocumentHistoryManager] Auto-save failed', e);
        }
    }

    cacheResolvedFilename(md5, filename) {
        this.updatePage(md5, 1);
        if (this.history[md5]) {
            this.history[md5].saveFilename = filename;
            this.saveHistory();
        }
    }

    async findFilenameByMd5(md5) {
        if (!this.ipcRenderer?.findSaveByMd5) {
            return null;
        }

        const searchResult = await this.ipcRenderer.findSaveByMd5(md5);
        if (searchResult.success && searchResult.filename) {
            console.log('[DocumentHistoryManager] MD5 match found:', searchResult.filename);
            this.cacheResolvedFilename(md5, searchResult.filename);
            return searchResult.filename;
        }

        return null;
    }

    async determineRestoreFilename(md5) {
        const record = this.history[md5];
        if (record && (record.saveFilename || record.autoSavePath)) {
            return resolveHistoryFilename(record);
        }

        const bookName = getAppContext().currentBook?.name;
        if (bookName) {
            const candidates = this.getRestoreCandidates(bookName);
            console.log('[DocumentHistoryManager] No history found, trying fallback candidates:', candidates);
            const fallbackFilename = candidates[0] || null;
            console.log('[DocumentHistoryManager] Selected fallback filename:', fallbackFilename);
            if (fallbackFilename) {
                return fallbackFilename;
            }
        }

        console.log('[DocumentHistoryManager] No filename determined for restore. Attempting MD5 match...');
        return await this.findFilenameByMd5(md5);
    }

    async loadRestorePayload(md5, filename) {
        let activeFilename = filename;
        let result = { success: false };

        if (activeFilename) {
            console.log('[DocumentHistoryManager] Requesting restore for', activeFilename);
            result = await this.ipcRenderer.loadFile(activeFilename);
        }

        if (!result.success) {
            console.warn('[DocumentHistoryManager] Primary load failed (' + (result.error || 'No filename') + '). Attempting MD5 Auto-Discovery...');
            const discoveredFilename = await this.findFilenameByMd5(md5);
            if (discoveredFilename) {
                activeFilename = discoveredFilename;
                console.log('[DocumentHistoryManager] MD5 match found! Recovering from:', activeFilename);
                result = await this.ipcRenderer.loadFile(activeFilename);
            } else {
                console.log('[DocumentHistoryManager] MD5 Auto-Discovery found no matches.');
            }
        }

        return { filename: activeFilename, result };
    }

    completeRestore({ restored = true } = {}) {
        this.isStatsRestored = restored;
        this.hasPendingRestore = false;
    }

    async restoreBoardWhenReady(data) {
        const performBoardRestore = () => {
            console.log('[DocumentHistoryManager] Dispatching restore-board-state (Elements:', data.elements.length, ')');
            window.dispatchEvent(new CustomEvent('restore-board-state', {
                detail: {
                    elements: data.elements,
                    viewport: data.viewport
                }
            }));
        };

        if (getAppContext().board) {
            performBoardRestore();
            this.completeRestore({ restored: true });
            return;
        }

        console.log('[DocumentHistoryManager] Board not ready. Waiting for board-ready event...');
        await new Promise((resolve) => {
            let settled = false;

            const finish = () => {
                if (settled) return;
                settled = true;
                window.removeEventListener('board-ready', onBoardReady);
                this.completeRestore({ restored: true });
                resolve();
            };

            const onBoardReady = () => {
                console.log('[DocumentHistoryManager] Board ready signal received. Proceeding with restore.');
                performBoardRestore();
                finish();
            };

            window.addEventListener('board-ready', onBoardReady);
            setTimeout(() => {
                if (!settled) {
                    console.warn('[DocumentHistoryManager] Board restore timed out. FORCE ENABLING auto-save but checking element count.');
                    finish();
                }
            }, 5000);
        });
    }

    validateRestorePayload(md5, data) {
        if (data.bookMd5 && data.bookMd5 !== md5) {
            console.warn('[DocumentHistoryManager] MD5 mismatch in save file', { expected: md5, actual: data.bookMd5 });
        }
    }

    restorePagePosition(md5, data) {
        if (!data.lastPage) {
            return;
        }

        console.log('[DocumentHistoryManager] Found lastPage in save file:', data.lastPage);
        this.updatePage(md5, data.lastPage);
        window.dispatchEvent(new CustomEvent('restore-page-position', {
            detail: { page: data.lastPage }
        }));
    }

    trackExpectedElements(data) {
        if (!data.elements || !Array.isArray(data.elements)) {
            return;
        }

        this.initialElementCount = data.elements.length;
        console.log('[DocumentHistoryManager] Expecting to restore', this.initialElementCount, 'elements.');
    }

    restoreHighlights(data, appContext) {
        if (!appContext.highlightManager?.restorePersistenceData || !data.highlights) {
            return;
        }

        const currentBookId = appContext.currentBook ? appContext.currentBook.id : null;
        appContext.highlightManager.restorePersistenceData({
            highlights: data.highlights
        }, currentBookId);
    }

    restoreCards(data, appContext) {
        if (!appContext.cardSystem?.restorePersistenceData || !data.cards) {
            return;
        }

        const currentBookId = appContext.currentBook ? appContext.currentBook.id : null;
        appContext.cardSystem.restorePersistenceData({
            cards: data.cards,
            connections: data.connections
        }, currentBookId);
    }

    restorePersistenceState(data, appContext) {
        this.restoreHighlights(data, appContext);
        this.restoreCards(data, appContext);
    }

    async restoreState(md5) {
        if (!md5 || !this.ipcRenderer) return;
        this.hasPendingRestore = true; // Mark restore start
        this.initialElementCount = 0;   // Reset count

        const filename = await this.determineRestoreFilename(md5);
        if (!filename) {
            console.log('[DocumentHistoryManager] No filename determined after all fallbacks. Assuming new document.');
            this.completeRestore({ restored: true });
            return;
        }

        try {
            const { result } = await this.loadRestorePayload(md5, filename);

            if (!result.success) {
                console.warn('[DocumentHistoryManager] All restore attempts failed. Assuming valid NEW document.');
                this.completeRestore({ restored: true });
                return;
            }

            const data = JSON.parse(result.content);
            this.validateRestorePayload(md5, data);
            this.restorePagePosition(md5, data);
            this.trackExpectedElements(data);

            // Restore Data
            const ag = getAppContext();
            if (!ag) return;
            this.restorePersistenceState(data, ag);

            if (data.elements) {
                void this.restoreBoardWhenReady(data);
            } else {
                this.completeRestore({ restored: true });
            }

        } catch (e) {
            console.error('[DocumentHistoryManager] Restore failed', e);
            // On hard failure, avoid auto-save to protect file
            this.completeRestore({ restored: false });
        }
    }
}

export const documentHistoryManager = new DocumentHistoryManager();
