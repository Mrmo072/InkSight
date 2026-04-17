import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../recovery-panel-actions.js', () => ({
    handleRecoveryPanelClick: vi.fn(() => false)
}));

describe('workspace-events', () => {
    let createWorkspaceEventListeners;
    let handleRecoveryPanelClick;
    let elements;
    let callbacks;
    let draggedFileId;

    beforeEach(async () => {
        vi.resetModules();
        ({ createWorkspaceEventListeners } = await import('../workspace-events.js'));
        ({ handleRecoveryPanelClick } = await import('../recovery-panel-actions.js'));

        document.body.innerHTML = `
            <input id="file-input" />
            <button id="toolbar-import"></button>
            <button id="toolbar-open"></button>
            <button id="toolbar-save"></button>
            <button id="mobile-import"></button>
            <button id="mobile-open"></button>
            <button id="mobile-save"></button>
            <button id="empty-import"></button>
            <button id="empty-open"></button>
            <button id="prev"></button>
            <button id="next"></button>
            <button id="mobile-prev"></button>
            <button id="mobile-next"></button>
            <div id="file-list">
              <button data-file-action="move-up" data-file-id="a" id="move-up"></button>
              <button data-project-action="open" id="project-open"></button>
              <div data-open-file-id="doc-1" class="file-item" id="file-item"></div>
            </div>
        `;

        elements = {
            fileInput: document.getElementById('file-input'),
            toolbarImportDocumentsBtn: document.getElementById('toolbar-import'),
            toolbarOpenProjectBtn: document.getElementById('toolbar-open'),
            toolbarSaveProjectBtn: document.getElementById('toolbar-save'),
            mobileImportDocumentsBtn: document.getElementById('mobile-import'),
            mobileOpenProjectBtn: document.getElementById('mobile-open'),
            mobileSaveProjectBtn: document.getElementById('mobile-save'),
            emptyImportDocumentBtn: document.getElementById('empty-import'),
            emptyOpenProjectBtn: document.getElementById('empty-open'),
            prevBtn: document.getElementById('prev'),
            nextBtn: document.getElementById('next'),
            mobilePrevBtn: document.getElementById('mobile-prev'),
            mobileNextBtn: document.getElementById('mobile-next'),
            fileList: document.getElementById('file-list')
        };

        draggedFileId = null;
        callbacks = {
            projectWorkspace: {
                promptOpenProject: vi.fn(),
                promptSaveProject: vi.fn(),
                handleProjectSaveCompleted: vi.fn(),
                handleProjectOpened: vi.fn()
            },
            workspaceDocuments: {
                handleFileSelect: vi.fn(),
                moveFileByOffset: vi.fn(),
                removeFileFromWorkspace: vi.fn(),
                moveFileToIndex: vi.fn(),
                openFileById: vi.fn()
            },
            ui: {
                promptImportDocument: vi.fn(),
                promptBulkRelink: vi.fn(),
                matchRecoveredDocument: vi.fn(),
                setWorkspaceMode: vi.fn(),
                attemptAutoRelinkRecoveredDocuments: vi.fn(),
                renderFileList: vi.fn(),
                showRecoveryValidation: vi.fn(),
                promptRelinkDocument: vi.fn()
            },
            navigation: {
                getCurrentReader: () => ({
                    onPrevPage: vi.fn(),
                    onNextPage: vi.fn()
                }),
                handleJumpToSource: vi.fn(),
                closeCompactPanels: vi.fn()
            },
            dragState: {
                getDraggedFileId: () => draggedFileId,
                setDraggedFileId: (id) => {
                    draggedFileId = id;
                },
                getFiles: () => [{ id: 'doc-1' }, { id: 'doc-2' }]
            }
        };
    });

    function bindAll(listeners) {
        listeners.forEach(({ target, event, handler }) => target.addEventListener(event, handler));
    }

    function createDragLikeEvent(type, dataTransfer) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', {
            value: dataTransfer
        });
        return event;
    }

    it('routes file list actions to the correct handlers', () => {
        const listeners = createWorkspaceEventListeners({
            elements,
            windowTarget: window,
            ...callbacks
        });
        bindAll(listeners);

        document.getElementById('move-up').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.getElementById('project-open').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.getElementById('file-item').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(callbacks.workspaceDocuments.moveFileByOffset).toHaveBeenCalledWith('a', -1);
        expect(callbacks.projectWorkspace.promptOpenProject).toHaveBeenCalled();
        expect(callbacks.workspaceDocuments.openFileById).toHaveBeenCalledWith('doc-1');
    });

    it('handles drag and drop reorder events', () => {
        const listeners = createWorkspaceEventListeners({
            elements,
            windowTarget: window,
            ...callbacks
        });
        bindAll(listeners);

        const source = document.getElementById('file-item');
        const target = document.createElement('div');
        target.className = 'file-item';
        target.setAttribute('data-open-file-id', 'doc-2');
        elements.fileList.appendChild(target);

        const dataTransfer = {
            effectAllowed: '',
            dropEffect: '',
            setData: vi.fn()
        };

        source.dispatchEvent(createDragLikeEvent('dragstart', dataTransfer));
        target.dispatchEvent(createDragLikeEvent('dragover', dataTransfer));
        target.dispatchEvent(createDragLikeEvent('drop', dataTransfer));
        elements.fileList.dispatchEvent(createDragLikeEvent('dragend', dataTransfer));

        expect(callbacks.workspaceDocuments.moveFileToIndex).toHaveBeenCalledWith('doc-1', 1);
        expect(draggedFileId).toBeNull();
    });

    it('delegates recovery panel actions through the configured callbacks', () => {
        handleRecoveryPanelClick.mockImplementationOnce((event, options) => {
            options.onMatchDocument('doc-9');
            options.onRecoveryAction('bulk');
            return true;
        });

        const listeners = createWorkspaceEventListeners({
            elements,
            windowTarget: window,
            ...callbacks
        });
        bindAll(listeners);

        elements.fileList.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(callbacks.ui.matchRecoveredDocument).toHaveBeenCalledWith('doc-9');
        expect(callbacks.ui.promptBulkRelink).toHaveBeenCalled();
    });
});
