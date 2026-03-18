
export class DocumentHistoryManager {
    constructor() {
        this.ipcRenderer = null;
        this.history = {};
        this.autoSaveInterval = null;
        this.currentMd5 = null;
        this.currentBookName = null;
        this.HISTORY_KEY = 'inksight_document_history';
        this.hasPendingRestore = false;
        this.isStatsRestored = true;
        this.initialElementCount = 0;

        this.init();
    }

    sanitizeSaveFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_');
    }

    getBaseBookName(bookName) {
        if (!bookName) return '';
        return bookName.replace(/\.[^/.]+$/, '');
    }

    getSaveFilename(bookName) {
        return this.sanitizeSaveFilename(`${this.getBaseBookName(bookName)}.inksight`);
    }

    getRestoreCandidates(bookName) {
        if (!bookName) return [];

        const rawCandidate = this.sanitizeSaveFilename(`${bookName}.inksight`);
        const baseCandidate = this.getSaveFilename(bookName);

        return Array.from(new Set([baseCandidate, rawCandidate].filter(Boolean)));
    }

    init() {
        // Init IPC
        try {
            if (window.ipcRenderer) {
                // Direct access via preload
                this.ipcRenderer = {
                    saveFile: (f, c) => window.ipcRenderer.invoke('save-file', f, c),
                    loadFile: (f) => window.ipcRenderer.invoke('load-file', f),
                    ensureSaveDir: () => window.ipcRenderer.invoke('ensure-save-dir'),
                    findSaveByMd5: (md5) => window.ipcRenderer.invoke('find-save-by-md5', md5)
                };
                console.log('[DocumentHistoryManager] IPC initialized via window.ipcRenderer (Wrapped)');
            } else if (window.electronAPI) {
                this.ipcRenderer = window.electronAPI;
                console.log('[DocumentHistoryManager] IPC initialized via window.electronAPI');
            } else if (window.require) {
                const electron = window.require('electron');
                const rawIpc = electron.ipcRenderer;
                this.ipcRenderer = {
                    saveFile: (f, c) => rawIpc.invoke('save-file', f, c),
                    loadFile: (f) => rawIpc.invoke('load-file', f),
                    ensureSaveDir: () => rawIpc.invoke('ensure-save-dir'),
                    findSaveByMd5: (md5) => rawIpc.invoke('find-save-by-md5', md5)
                };
                console.log('[DocumentHistoryManager] IPC initialized via window.require (Wrapped)');
            } else if (typeof require !== 'undefined') {
                // Global require (NodeIntegration)
                // Use strict check to avoid Vite confusion if possible, or try-catch
                try {
                    const electron = require('electron');
                    const rawIpc = electron.ipcRenderer;
                    this.ipcRenderer = {
                        saveFile: (f, c) => rawIpc.invoke('save-file', f, c),
                        loadFile: (f) => rawIpc.invoke('load-file', f),
                        ensureSaveDir: () => rawIpc.invoke('ensure-save-dir'),
                        findSaveByMd5: (md5) => rawIpc.invoke('find-save-by-md5', md5)
                    };
                    console.log('[DocumentHistoryManager] IPC initialized via global require (Wrapped)');
                } catch (err) {
                    console.warn('[DocumentHistoryManager] global require found but failed to load electron', err);
                }
            } else {
                console.warn('[DocumentHistoryManager] IPC not available. Auto-save disabled. (Retries may occur)');
            }
        } catch (e) {
            console.error('[DocumentHistoryManager] Failed to init IPC', e);
        }

        // Load history from localStorage
        const stored = localStorage.getItem(this.HISTORY_KEY);
        if (stored) {
            try {
                this.history = JSON.parse(stored);
            } catch (e) {
                console.error('[DocumentHistoryManager] Failed to parse history', e);
            }
        }
    }

    getHistory(md5) {
        return this.history[md5];
    }

    updatePage(md5, page) {
        if (!md5) return;
        if (!this.history[md5]) {
            this.history[md5] = {};
        }
        this.history[md5].lastPage = page;
        this.history[md5].lastOpened = Date.now();
        this.saveHistory();
    }

    saveHistory() {
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(this.history));
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

        if (!this.currentMd5 || !this.ipcRenderer || !window.inksight) {
            return; // Silent fail if not ready
        }

        // SAFETY: Do not save if restore hasn't confirmed success
        if (!this.isStatsRestored && this.hasPendingRestore) {
            console.warn('[DocumentHistoryManager] Skipping auto-save: Restore pending or in progress.');
            return;
        }

        try {
            const board = window.inksight.board;
            if (!board) return;

            // SAFETY VALVE: Empty Board Protection
            // If we expected elements (from restore) but board is empty, DO NOT SAVE.
            if (this.initialElementCount > 0 && board.children.length === 0) {
                console.error('[DocumentHistoryManager] CRITICAL: Attempted to save EMPTY board over existing data. Aborting save.');
                return;
            }

            // Collect extra data
            const extraData = {};
            if (window.inksight.currentBook && window.inksight.currentBook.md5) {
                extraData.bookMd5 = window.inksight.currentBook.md5;
                extraData.bookName = window.inksight.currentBook.name;
                extraData.bookId = window.inksight.currentBook.id;
            }
            if (window.inksight.cardSystem && window.inksight.cardSystem.getPersistenceData) {
                const persistenceData = window.inksight.cardSystem.getPersistenceData();
                extraData.cards = persistenceData.cards;
                extraData.connections = persistenceData.connections;
            }
            if (window.inksight.highlightManager && window.inksight.highlightManager.getPersistenceData) {
                const highlightData = window.inksight.highlightManager.getPersistenceData();
                extraData.highlights = highlightData.highlights;
            }

            // Save last page from history or current state
            if (this.history[this.currentMd5] && this.history[this.currentMd5].lastPage) {
                extraData.lastPage = this.history[this.currentMd5].lastPage;
            }

            // Serialize data
            const data = {
                type: 'drawnix',
                version: '0.0.1',
                source: 'web',
                elements: board.children,
                viewport: board.viewport,
                ...extraData
            };

            const jsonStr = JSON.stringify(data, null, 2);

            // Construct filename
            const safeFileName = this.getSaveFilename(this.currentBookName);

            // Use IPC to save
            const result = await this.ipcRenderer.saveFile(safeFileName, jsonStr);

            if (result.success) {
                console.log('[DocumentHistoryManager] Auto-saved to', result.path);
                // Update history with save path
                if (this.history[this.currentMd5]) {
                    const now = Date.now();
                    this.history[this.currentMd5].autoSavePath = result.path;
                    this.history[this.currentMd5].lastSaved = now;
                    this.history[this.currentMd5].saveFilename = safeFileName;
                    this.saveHistory();
                }
            } else {
                console.error('[DocumentHistoryManager] IPC save failed:', result.error);
            }

        } catch (e) {
            console.error('[DocumentHistoryManager] Auto-save failed', e);
        }
    }

    async restoreState(md5) {
        if (!md5 || !this.ipcRenderer) return;
        this.hasPendingRestore = true; // Mark restore start
        this.initialElementCount = 0;   // Reset count

        let filename = null;
        const record = this.history[md5];

        if (record && (record.saveFilename || record.autoSavePath)) {
            // Case A: History exists
            filename = record.saveFilename;
            if (!filename && record.autoSavePath) {
                const parts = record.autoSavePath.split(/[/\\]/);
                filename = parts[parts.length - 1];
            }
        } else {
            // Case B: No history, try fallback to book name
            if (window.inksight && window.inksight.currentBook && window.inksight.currentBook.name) {
                const bookName = window.inksight.currentBook.name;
                const candidates = this.getRestoreCandidates(bookName);

                console.log('[DocumentHistoryManager] No history found, trying fallback candidates:', candidates);
                filename = candidates[0] || null;
                console.log('[DocumentHistoryManager] Selected fallback filename:', filename);
            }
        }

        if (!filename) {
            console.log('[DocumentHistoryManager] No filename determined for restore. Attempting MD5 match...');
            if (this.ipcRenderer.findSaveByMd5) {
                const searchResult = await this.ipcRenderer.findSaveByMd5(md5);
                if (searchResult.success && searchResult.filename) {
                    filename = searchResult.filename;
                    console.log('[DocumentHistoryManager] MD5 match found:', filename);
                    // Update history immediately so we don't have to search next time
                    this.updatePage(md5, 1);
                    if (this.history[md5]) {
                        this.history[md5].saveFilename = filename;
                        this.saveHistory();
                    }
                }
            }
        }

        if (!filename) {
            console.log('[DocumentHistoryManager] No filename determined after all fallbacks. Assuming new document.');
            this.hasPendingRestore = false;
            this.isStatsRestored = true;
            return;
        }

        try {
            let result = { success: false };
            if (filename) {
                console.log('[DocumentHistoryManager] Requesting restore for', filename);
                result = await this.ipcRenderer.loadFile(filename);
            }

            // RECOVERY: If load failed (or no filename), try MD5 match
            if (!result.success) {
                console.warn('[DocumentHistoryManager] Primary load failed (' + (result.error || 'No filename') + '). Attempting MD5 Auto-Discovery...');

                if (this.ipcRenderer.findSaveByMd5) {
                    const searchResult = await this.ipcRenderer.findSaveByMd5(md5);
                    if (searchResult.success && searchResult.filename) {
                        filename = searchResult.filename;
                        console.log('[DocumentHistoryManager] MD5 match found! Recovering from:', filename);

                        // Update history immediately to fix the broken link
                        this.updatePage(md5, 1);
                        if (this.history[md5]) {
                            this.history[md5].saveFilename = filename;
                            this.saveHistory();
                        }

                        // Retry load with found file
                        result = await this.ipcRenderer.loadFile(filename);
                    } else {
                        console.log('[DocumentHistoryManager] MD5 Auto-Discovery found no matches.');
                    }
                }
            }

            if (!result.success) {
                console.warn('[DocumentHistoryManager] All restore attempts failed. Assuming valid NEW document.');
                this.hasPendingRestore = false;
                this.isStatsRestored = true;
                return;
            }

            const data = JSON.parse(result.content);

            // Validation (optional)
            if (data.bookMd5 && data.bookMd5 !== md5) {
                console.warn('[DocumentHistoryManager] MD5 mismatch in save file', { expected: md5, actual: data.bookMd5 });
            }

            // Restore Page Position (if available) - Critical for recovery
            if (data.lastPage) {
                console.log('[DocumentHistoryManager] Found lastPage in save file:', data.lastPage);
                this.updatePage(md5, data.lastPage); // Update internal history
                // Dispatch event for Main to pick up and scroll
                window.dispatchEvent(new CustomEvent('restore-page-position', {
                    detail: { page: data.lastPage }
                }));
            }

            // Record expected elements count for safety valve
            if (data.elements && Array.isArray(data.elements)) {
                this.initialElementCount = data.elements.length;
                console.log('[DocumentHistoryManager] Expecting to restore', this.initialElementCount, 'elements.');
            }

            // Restore Data
            const ag = window.inksight;
            if (!ag) return;

            // 1. Restore Highlights (First, so cards can link to them)
            if (ag.highlightManager && ag.highlightManager.restorePersistenceData && data.highlights) {
                const currentBookId = ag.currentBook ? ag.currentBook.id : null;
                ag.highlightManager.restorePersistenceData({
                    highlights: data.highlights
                }, currentBookId);
            }

            // 2. Restore Cards
            if (ag.cardSystem && ag.cardSystem.restorePersistenceData && data.cards) {
                const currentBookId = ag.currentBook ? ag.currentBook.id : null;
                ag.cardSystem.restorePersistenceData({
                    cards: data.cards,
                    connections: data.connections
                }, currentBookId);
            }

            // 3. Restore Mind Map Board
            const performBoardRestore = () => {
                if (data.elements) {
                    console.log('[DocumentHistoryManager] Dispatching restore-board-state (Elements:', data.elements.length, ')');
                    window.dispatchEvent(new CustomEvent('restore-board-state', {
                        detail: {
                            elements: data.elements,
                            viewport: data.viewport
                        }
                    }));
                }
                // Mark as fully restored/loaded to enable auto-save
                this.isStatsRestored = true;
                this.hasPendingRestore = false; // Restore complete
            };

            if (data.elements) {
                if (window.inksight.board) {
                    performBoardRestore();
                } else {
                    console.log('[DocumentHistoryManager] Board not ready. Waiting for board-ready event...');
                    const onBoardReady = () => {
                        console.log('[DocumentHistoryManager] Board ready signal received. Proceeding with restore.');
                        window.removeEventListener('board-ready', onBoardReady);
                        performBoardRestore();
                    };
                    window.addEventListener('board-ready', onBoardReady);
                    // Timeout safety (5s)
                    setTimeout(() => {
                        window.removeEventListener('board-ready', onBoardReady);
                        if (!this.isStatsRestored) {
                            console.warn('[DocumentHistoryManager] Board restore timed out. FORCE ENABLING auto-save but checking element count.');
                            this.isStatsRestored = true;
                            this.hasPendingRestore = false;
                        }
                    }, 5000);
                }
            } else {
                this.isStatsRestored = true;
                this.hasPendingRestore = false;
            }

        } catch (e) {
            console.error('[DocumentHistoryManager] Restore failed', e);
            // On hard failure, avoid auto-save to protect file
            this.isStatsRestored = false;
            this.hasPendingRestore = false;
        }
    }
}

export const documentHistoryManager = new DocumentHistoryManager();
