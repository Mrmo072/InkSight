import { handleRecoveryPanelClick } from './recovery-panel-actions.js';

export function createWorkspaceEventListeners({
    elements,
    windowTarget = window,
    projectWorkspace,
    workspaceDocuments,
    ui,
    navigation,
    dragState
}) {
    return [
        { target: elements.fileInput, event: 'change', handler: workspaceDocuments.handleFileSelect },
        { target: elements.toolbarImportDocumentsBtn, event: 'click', handler: ui.promptImportDocument },
        { target: elements.toolbarOpenProjectBtn, event: 'click', handler: () => void projectWorkspace.promptOpenProject() },
        { target: elements.toolbarSaveProjectBtn, event: 'click', handler: () => void projectWorkspace.promptSaveProject() },
        { target: elements.mobileImportDocumentsBtn, event: 'click', handler: ui.promptImportDocument },
        { target: elements.mobileOpenProjectBtn, event: 'click', handler: () => void projectWorkspace.promptOpenProject() },
        { target: elements.mobileSaveProjectBtn, event: 'click', handler: () => void projectWorkspace.promptSaveProject() },
        { target: elements.emptyImportDocumentBtn, event: 'click', handler: ui.promptImportDocument },
        { target: elements.emptyOpenProjectBtn, event: 'click', handler: () => void projectWorkspace.promptOpenProject() },
        { target: elements.prevBtn, event: 'click', handler: () => navigation.getCurrentReader()?.onPrevPage() },
        { target: elements.nextBtn, event: 'click', handler: () => navigation.getCurrentReader()?.onNextPage() },
        { target: elements.mobilePrevBtn, event: 'click', handler: () => navigation.getCurrentReader()?.onPrevPage() },
        { target: elements.mobileNextBtn, event: 'click', handler: () => navigation.getCurrentReader()?.onNextPage() },
        {
            target: windowTarget,
            event: 'add-card-to-board',
            handler: () => ui.setWorkspaceMode('map')
        },
        {
            target: windowTarget,
            event: 'document-registered',
            handler: () => {
                ui.attemptAutoRelinkRecoveredDocuments();
                ui.renderFileList();
            }
        },
        {
            target: windowTarget,
            event: 'document-loaded-changed',
            handler: () => {
                ui.attemptAutoRelinkRecoveredDocuments();
                ui.renderFileList();
            }
        },
        {
            target: windowTarget,
            event: 'documents-restored',
            handler: () => {
                ui.attemptAutoRelinkRecoveredDocuments();
                ui.renderFileList();
            }
        },
        {
            target: windowTarget,
            event: 'recovery-validate-requested',
            handler: () => {
                ui.showRecoveryValidation();
            }
        },
        {
            target: windowTarget,
            event: 'project-save-completed',
            handler: (event) => projectWorkspace.handleProjectSaveCompleted(event)
        },
        {
            target: windowTarget,
            event: 'project-opened',
            handler: (event) => projectWorkspace.handleProjectOpened(event)
        },
        {
            target: elements.fileList,
            event: 'click',
            handler: (event) => {
                const handled = handleRecoveryPanelClick(event, {
                    onRelinkDocument: (documentId) => ui.promptRelinkDocument(documentId),
                    onRecoveryAction: (action) => {
                        if (action === 'auto') {
                            ui.attemptAutoRelinkRecoveredDocuments({ notify: true });
                        }
                        if (action === 'bulk') {
                            ui.promptBulkRelink();
                        }
                        if (action === 'validate') {
                            ui.showRecoveryValidation();
                        }
                    }
                });
                if (handled) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                const actionButton = event.target.closest('[data-file-action]');
                if (actionButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    const fileId = actionButton.getAttribute('data-file-id');
                    const action = actionButton.getAttribute('data-file-action');

                    if (!fileId || !action) {
                        return;
                    }

                    if (action === 'move-up') {
                        void workspaceDocuments.moveFileByOffset(fileId, -1);
                    } else if (action === 'move-down') {
                        void workspaceDocuments.moveFileByOffset(fileId, 1);
                    } else if (action === 'remove') {
                        void workspaceDocuments.removeFileFromWorkspace(fileId);
                    }
                    return;
                }

                const projectActionButton = event.target.closest('[data-project-action]');
                if (projectActionButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = projectActionButton.getAttribute('data-project-action');

                    if (action === 'open') {
                        void projectWorkspace.promptOpenProject();
                    } else if (action === 'save') {
                        void projectWorkspace.promptSaveProject();
                    } else if (action === 'import') {
                        ui.promptImportDocument();
                    }
                    return;
                }

                const fileItem = event.target.closest('[data-open-file-id]');
                if (fileItem) {
                    const fileId = fileItem.getAttribute('data-open-file-id');
                    if (fileId) {
                        workspaceDocuments.openFileById(fileId);
                    }
                }
            }
        },
        {
            target: elements.fileList,
            event: 'dragstart',
            handler: (event) => {
                const item = event.target.closest('[data-open-file-id]');
                if (!item || item.classList.contains('disabled')) {
                    return;
                }

                const draggedFileId = item.getAttribute('data-open-file-id');
                dragState.setDraggedFileId(draggedFileId);
                item.classList.add('dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', draggedFileId || '');
            }
        },
        {
            target: elements.fileList,
            event: 'dragover',
            handler: (event) => {
                const targetItem = event.target.closest('[data-open-file-id]');
                if (!dragState.getDraggedFileId() || !targetItem) {
                    return;
                }

                event.preventDefault();
                const targetFileId = targetItem.getAttribute('data-open-file-id');
                if (!targetFileId || targetFileId === dragState.getDraggedFileId()) {
                    return;
                }

                elements.fileList.querySelectorAll('.file-item.drop-target').forEach((item) => {
                    item.classList.remove('drop-target');
                });
                targetItem.classList.add('drop-target');
                event.dataTransfer.dropEffect = 'move';
            }
        },
        {
            target: elements.fileList,
            event: 'drop',
            handler: (event) => {
                const targetItem = event.target.closest('[data-open-file-id]');
                const draggedFileId = dragState.getDraggedFileId();
                if (!draggedFileId || !targetItem) {
                    return;
                }

                event.preventDefault();
                const targetFileId = targetItem.getAttribute('data-open-file-id');
                if (!targetFileId || targetFileId === draggedFileId) {
                    return;
                }

                const targetIndex = dragState.getFiles().findIndex((file) => file.id === targetFileId);
                if (targetIndex >= 0) {
                    workspaceDocuments.moveFileToIndex(draggedFileId, targetIndex);
                }
            }
        },
        {
            target: elements.fileList,
            event: 'dragend',
            handler: () => {
                dragState.setDraggedFileId(null);
                elements.fileList.querySelectorAll('.file-item.dragging, .file-item.drop-target').forEach((item) => {
                    item.classList.remove('dragging', 'drop-target');
                });
            }
        },
        {
            target: windowTarget,
            event: 'jump-to-source',
            handler: (e) => {
                const { sourceId, highlightId } = e.detail;
                navigation.handleJumpToSource(sourceId, highlightId);
                navigation.closeCompactPanels();
            }
        }
    ].filter(({ target }) => target);
}
