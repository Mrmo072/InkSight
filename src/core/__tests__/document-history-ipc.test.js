import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('document-history-ipc', () => {
    let originalRequire;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        originalRequire = globalThis.require;
        globalThis.require = undefined;
        window.require = undefined;
        window.ipcRenderer = undefined;
        window.electronAPI = undefined;
    });

    afterEach(() => {
        globalThis.require = originalRequire;
        delete window.require;
        delete window.ipcRenderer;
        delete window.electronAPI;
        vi.restoreAllMocks();
    });

    it('wraps window.ipcRenderer invoke calls', async () => {
        const invoke = vi.fn().mockResolvedValue({ success: true });
        window.ipcRenderer = { invoke };

        const { resolveDocumentHistoryIpc } = await import('../document-history-ipc.js');
        const ipc = resolveDocumentHistoryIpc();

        await ipc.saveFile('Book.inksight', '{}');
        await ipc.loadFile('Book.inksight');
        await ipc.ensureSaveDir();
        await ipc.findSaveByMd5('md5-1');
        await ipc.getRuntimeStorageInfo();
        await ipc.saveRuntimeProject({ projectId: 'project-1' });
        await ipc.loadRuntimeProject({ projectId: 'project-1' });

        expect(invoke).toHaveBeenNthCalledWith(1, 'save-file', 'Book.inksight', '{}');
        expect(invoke).toHaveBeenNthCalledWith(2, 'load-file', 'Book.inksight');
        expect(invoke).toHaveBeenNthCalledWith(3, 'ensure-save-dir');
        expect(invoke).toHaveBeenNthCalledWith(4, 'find-save-by-md5', 'md5-1');
        expect(invoke).toHaveBeenNthCalledWith(5, 'get-runtime-storage-info');
        expect(invoke).toHaveBeenNthCalledWith(6, 'save-runtime-project', { projectId: 'project-1' });
        expect(invoke).toHaveBeenNthCalledWith(7, 'load-runtime-project', { projectId: 'project-1' });
    });

    it('returns window.electronAPI directly when available', async () => {
        const electronAPI = {
            saveFile: vi.fn(),
            loadFile: vi.fn(),
            ensureSaveDir: vi.fn(),
            findSaveByMd5: vi.fn(),
            getRuntimeStorageInfo: vi.fn(),
            saveRuntimeProject: vi.fn(),
            loadRuntimeProject: vi.fn()
        };
        window.electronAPI = electronAPI;

        const { resolveDocumentHistoryIpc } = await import('../document-history-ipc.js');

        expect(resolveDocumentHistoryIpc()).toBe(electronAPI);
    });

    it('falls back to window.require electron ipcRenderer', async () => {
        const invoke = vi.fn().mockResolvedValue({ success: true });
        window.require = vi.fn(() => ({ ipcRenderer: { invoke } }));

        const { resolveDocumentHistoryIpc } = await import('../document-history-ipc.js');
        const ipc = resolveDocumentHistoryIpc();

        await ipc.loadFile('Recovered.inksight');
        expect(window.require).toHaveBeenCalledWith('electron');
        expect(invoke).toHaveBeenCalledWith('load-file', 'Recovered.inksight');
    });

    it('returns null when no IPC bridge is available', async () => {
        const { resolveDocumentHistoryIpc } = await import('../document-history-ipc.js');

        expect(resolveDocumentHistoryIpc()).toBeNull();
    });
});
