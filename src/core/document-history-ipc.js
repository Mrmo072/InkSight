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
            console.log('[DocumentHistoryManager] IPC initialized via window.ipcRenderer (Wrapped)');
            return createWrappedIpcRenderer(window.ipcRenderer);
        }

        if (window.electronAPI) {
            console.log('[DocumentHistoryManager] IPC initialized via window.electronAPI');
            return window.electronAPI;
        }

        if (window.require) {
            const electron = window.require('electron');
            console.log('[DocumentHistoryManager] IPC initialized via window.require (Wrapped)');
            return createWrappedIpcRenderer(electron.ipcRenderer);
        }

        if (typeof require !== 'undefined') {
            try {
                const electron = require('electron');
                console.log('[DocumentHistoryManager] IPC initialized via global require (Wrapped)');
                return createWrappedIpcRenderer(electron.ipcRenderer);
            } catch (err) {
                console.warn('[DocumentHistoryManager] global require found but failed to load electron', err);
                return null;
            }
        }

        console.warn('[DocumentHistoryManager] IPC not available. Auto-save disabled. (Retries may occur)');
        return null;
    } catch (error) {
        console.error('[DocumentHistoryManager] Failed to init IPC', error);
        return null;
    }
}
