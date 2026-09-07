import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('document-history-ipc', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        window.electronAPI = undefined;
    });

    afterEach(() => {
        delete window.electronAPI;
        vi.restoreAllMocks();
    });

    it('wraps raw ipcRenderer invoke calls', async () => {
        const invoke = vi.fn().mockResolvedValue({ success: true });
        const { createWrappedIpcRenderer } = await import('../document-history-ipc.js');
        const ipc = createWrappedIpcRenderer({ invoke });

        await ipc.saveFile('Book.inksight', '{}');
        await ipc.loadFile('Book.inksight');
        await ipc.ensureSaveDir();
        await ipc.findSaveByMd5('md5-1');
        await ipc.getRuntimeStorageInfo();
        await ipc.saveRuntimeProject({ projectId: 'project-1' });
        await ipc.listRuntimeProjectSnapshots({ projectId: 'project-1' });
        await ipc.loadRuntimeProject({ projectId: 'project-1' });

        expect(invoke).toHaveBeenNthCalledWith(1, 'save-file', 'Book.inksight', '{}');
        expect(invoke).toHaveBeenNthCalledWith(2, 'load-file', 'Book.inksight');
        expect(invoke).toHaveBeenNthCalledWith(3, 'ensure-save-dir');
        expect(invoke).toHaveBeenNthCalledWith(4, 'find-save-by-md5', 'md5-1');
        expect(invoke).toHaveBeenNthCalledWith(5, 'get-runtime-storage-info');
        expect(invoke).toHaveBeenNthCalledWith(6, 'save-runtime-project', { projectId: 'project-1' });
        expect(invoke).toHaveBeenNthCalledWith(7, 'list-runtime-project-snapshots', { projectId: 'project-1' });
        expect(invoke).toHaveBeenNthCalledWith(8, 'load-runtime-project', { projectId: 'project-1' });
    });

    it('returns window.electronAPI directly when available', async () => {
        const electronAPI = {
            saveFile: vi.fn(),
            loadFile: vi.fn(),
            ensureSaveDir: vi.fn(),
            findSaveByMd5: vi.fn(),
            getRuntimeStorageInfo: vi.fn(),
            saveRuntimeProject: vi.fn(),
            listRuntimeProjectSnapshots: vi.fn(),
            loadRuntimeProject: vi.fn()
        };
        window.electronAPI = electronAPI;

        const { resolveDocumentHistoryIpc } = await import('../document-history-ipc.js');

        expect(resolveDocumentHistoryIpc()).toBe(electronAPI);
    });

    it('falls back to the IndexedDB adapter when no IPC bridge is available', async () => {
        const { resolveDocumentHistoryIpc } = await import('../document-history-ipc.js');
        const ipc = resolveDocumentHistoryIpc();

        expect(ipc).not.toBeNull();
        expect(ipc.storageType).toBe('indexeddb');
        for (const method of ['saveFile', 'loadFile', 'ensureSaveDir', 'findSaveByMd5', 'getRuntimeStorageInfo', 'saveRuntimeProject', 'listRuntimeProjectSnapshots', 'loadRuntimeProject']) {
            expect(typeof ipc[method]).toBe('function');
        }
    });
});
