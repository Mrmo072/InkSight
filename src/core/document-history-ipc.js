import { createLogger } from './logger.js';
import { createIdbFallbackIpc } from './document-history-idb.js';

const logger = createLogger('DocumentHistoryIPC');

export function createWrappedIpcRenderer(rawIpc) {
    if (!rawIpc?.invoke) {
        return null;
    }

    return {
        saveFile: (filename, content) => rawIpc.invoke('save-file', filename, content),
        loadFile: (filename) => rawIpc.invoke('load-file', filename),
        ensureSaveDir: () => rawIpc.invoke('ensure-save-dir'),
        findSaveByMd5: (md5) => rawIpc.invoke('find-save-by-md5', md5),
        getRuntimeStorageInfo: () => rawIpc.invoke('get-runtime-storage-info'),
        saveRuntimeProject: (payload) => rawIpc.invoke('save-runtime-project', payload),
        listRuntimeProjectSnapshots: (payload) => rawIpc.invoke('list-runtime-project-snapshots', payload),
        loadRuntimeProject: (payload) => rawIpc.invoke('load-runtime-project', payload)
    };
}

export function resolveDocumentHistoryIpc() {
    try {
        if (window.electronAPI) {
            logger.debug('IPC initialized via window.electronAPI');
            return window.electronAPI;
        }

        if (window.ipcRenderer) {
            logger.debug('IPC initialized via window.ipcRenderer (wrapped)');
            return createWrappedIpcRenderer(window.ipcRenderer);
        }

        if (window.require) {
            const electron = window.require('electron');
            const wrapped = createWrappedIpcRenderer(electron?.ipcRenderer);
            if (wrapped) {
                logger.debug('IPC initialized via window.require (wrapped)');
                return wrapped;
            }
        }

        if (typeof require !== 'undefined') {
            try {
                const electron = require('electron');
                const wrapped = createWrappedIpcRenderer(electron?.ipcRenderer);
                if (wrapped) {
                    logger.debug('IPC initialized via global require (wrapped)');
                    return wrapped;
                }
                logger.warn('global require loaded electron without ipcRenderer');
            } catch (err) {
                logger.warn('global require found but failed to load electron', err);
            }
        }

        // No Electron bridge: fall back to IndexedDB so the pure-browser
        // build still persists auto-saves, snapshots and MD5 recovery data.
        logger.debug('IPC not available. Using IndexedDB persistence fallback.');
        return createIdbFallbackIpc();
    } catch (error) {
        logger.error('Failed to init IPC', error);
        return createIdbFallbackIpc();
    }
}
