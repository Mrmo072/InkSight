import { createLogger } from './logger.js';

const logger = createLogger('DocumentHistoryIPC');

export function createWrappedIpcRenderer(rawIpc) {
    if (!rawIpc?.invoke) {
        return null;
    }

    return {
        saveFile: (filename, content) => rawIpc.invoke('save-file', filename, content),
        loadFile: (filename) => rawIpc.invoke('load-file', filename),
        ensureSaveDir: () => rawIpc.invoke('ensure-save-dir'),
        findSaveByMd5: (md5) => rawIpc.invoke('find-save-by-md5', md5)
    };
}

export function resolveDocumentHistoryIpc() {
    try {
        if (window.ipcRenderer) {
            logger.debug('IPC initialized via window.ipcRenderer (wrapped)');
            return createWrappedIpcRenderer(window.ipcRenderer);
        }

        if (window.electronAPI) {
            logger.debug('IPC initialized via window.electronAPI');
            return window.electronAPI;
        }

        if (window.require) {
            const electron = window.require('electron');
            logger.debug('IPC initialized via window.require (wrapped)');
            return createWrappedIpcRenderer(electron.ipcRenderer);
        }

        if (typeof require !== 'undefined') {
            try {
                const electron = require('electron');
                logger.debug('IPC initialized via global require (wrapped)');
                return createWrappedIpcRenderer(electron.ipcRenderer);
            } catch (err) {
                logger.warn('global require found but failed to load electron', err);
                return null;
            }
        }

        logger.warn('IPC not available. Auto-save disabled. (Retries may occur)');
        return null;
    } catch (error) {
        logger.error('Failed to init IPC', error);
        return null;
    }
}
