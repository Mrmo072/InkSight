
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentHistoryManager } from '../document-history-manager.js';

describe('DocumentHistoryManager Regression Tests', () => {
    let manager;
    let mockIpc;
    let mockBoard;

    beforeEach(() => {
        // Mock Window Globals
        mockBoard = { children: [], viewport: {} };
        window.inksight = {
            board: mockBoard,
            currentBook: { md5: 'test-md5', name: 'TestBook' },
            highlightManager: { getPersistenceData: () => ({ highlights: [] }), restorePersistenceData: vi.fn() },
            cardSystem: { getPersistenceData: () => ({ cards: [], connections: [] }), restorePersistenceData: vi.fn() },
        };

        // Mock IPC
        mockIpc = {
            saveFile: vi.fn().mockResolvedValue({ success: true, path: '/tmp/test.inksight' }),
            loadFile: vi.fn(),
            findSaveByMd5: vi.fn()
        };

        // Instantiate Manager
        manager = new DocumentHistoryManager();
        manager.ipcRenderer = mockIpc; // Inject mock IPC
        manager.currentMd5 = 'test-md5';
        manager.currentBookName = 'TestBook';

        // Mock Console to keep output clean
        // vi.spyOn(console, 'log').mockImplementation(() => {});
        // vi.spyOn(console, 'warn').mockImplementation(() => {});
        // vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.clearAllMocks();
        // vi.restoreAllMocks(); // Restore console
    });

    // --- 1. Safety Valve Tests ---
    describe('Safety Valve (Empty Overwrite Protection)', () => {
        it('should ABORT save if expected elements > 0 but board is empty', async () => {
            // Setup: Restore expected 5 elements
            manager.initialElementCount = 5;
            manager.isStatsRestored = true; // Assume restore "finished" but failed to populate board

            // Act: Board is empty (mockBoard.children = [])
            await manager.performAutoSave();

            // Assert: Save should NOT be called
            expect(mockIpc.saveFile).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SAFETY VALVE TRIGGERED'));
        });

        it('should ALLOW save if expected elements = 0 (New File)', async () => {
            manager.initialElementCount = 0;
            manager.isStatsRestored = true;

            await manager.performAutoSave();

            expect(mockIpc.saveFile).toHaveBeenCalled();
        });

        it('should ALLOW save if board has content', async () => {
            manager.initialElementCount = 5;
            manager.isStatsRestored = true;
            mockBoard.children = [1, 2, 3]; // Mock content

            await manager.performAutoSave();

            expect(mockIpc.saveFile).toHaveBeenCalled();
        });
    });

    // --- 2. Smart Reconnect Tests ---
    describe('Smart Reconnect (MD5 Recovery)', () => {
        it('should try MD5 search if primary load fails', async () => {
            // Setup: Primary load fails
            mockIpc.loadFile.mockResolvedValueOnce({ success: false, error: 'File not found' });

            // Setup: MD5 search succeeds
            mockIpc.findSaveByMd5.mockResolvedValueOnce({ success: true, filename: 'FoundFile.inksight' });
            mockIpc.loadFile.mockResolvedValueOnce({ success: true, content: JSON.stringify({ elements: [] }) }); // Second load succeeds

            // Act
            await manager.restoreState('test-md5');

            // Assert
            expect(mockIpc.loadFile).toHaveBeenCalledTimes(2); // First fail, second success
            expect(mockIpc.findSaveByMd5).toHaveBeenCalledWith('test-md5');
            expect(mockIpc.loadFile).toHaveBeenLastCalledWith('FoundFile.inksight');
        });

        it('should try filename fallback without extension if primary fails', async () => {
            // Mock book name with .pdf
            window.inksight.currentBook.name = 'TestBook.pdf';

            // Setup: Explicit loads fail to trigger looking at logic flow (actually logic does strict sequence)
            // But we can check if it attempts the stripped name.
            // Manager logic:
            // 1. Try history (none)
            // 2. Try candidates (Loop check? No, logic picks one and tries load)
            // Current logic picks 'TestBook.inksight' (stripped) as primary fallback

            mockIpc.loadFile.mockResolvedValue({ success: false }); // All fail

            await manager.restoreState('test-md5');

            // Verify it requested the STRIPPED name first/early
            // 'TestBook.inksight' not 'TestBook.pdf.inksight'
            expect(mockIpc.loadFile).toHaveBeenCalledWith(expect.stringContaining('TestBook.inksight'));
        });
    });

    // --- 3. Page Persistence Tests ---
    describe('Page Persistence', () => {
        it('should include lastPage in auto-save data', async () => {
            // Setup: Mock history with page info
            manager.history['test-md5'] = { lastPage: 42 };
            manager.isStatsRestored = true;

            await manager.performAutoSave();

            // Assert: saveFile content includes lastPage
            const saveCall = mockIpc.saveFile.mock.calls[0];
            const content = JSON.parse(saveCall[1]);
            expect(content.lastPage).toBe(42);
        });

        it('should dispatch restore-page-position event on restore', async () => {
            // Setup: Mock file content with lastPage
            const mockContent = {
                lastPage: 99,
                elements: []
            };
            mockIpc.loadFile.mockResolvedValue({ success: true, content: JSON.stringify(mockContent) });

            // Listen for event
            const listener = vi.fn();
            window.addEventListener('restore-page-position', listener);

            // Act
            await manager.restoreState('test-md5');

            // Assert
            expect(listener).toHaveBeenCalled();
            expect(listener.mock.calls[0][0].detail.page).toBe(99);
            window.removeEventListener('restore-page-position', listener);
        });
    });
});
