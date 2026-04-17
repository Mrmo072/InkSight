import { emitAppNotification } from '../ui/app-notifications.js';
import { getAppContext, setAppService, updateCurrentBook } from './app-context.js';
import { chooseDocumentTarget } from './document-relink.js';
import { buildDocumentRemovalPrompt, reorderFilesById } from './file-list-helpers.js';
import { resolveImportDecision } from './import-decision.js';

async function generateHash(message, logger) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
            return hashHex.substring(0, 32);
        } catch (error) {
            logger?.warn?.('Crypto API failed, falling back', error);
        }
    }

    let hash = 5381;
    for (let i = 0; i < message.length; i++) {
        hash = ((hash << 5) + hash) + message.charCodeAt(i);
    }

    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
    const suffix = message.length.toString(16) + (message.charCodeAt(0) || 0).toString(16);
    return (hashHex + suffix).padEnd(32, '0').substring(0, 32);
}

export function createWorkspaceDocumentsController({
    logger,
    projectWorkspace,
    getDocumentReferenceDetails,
    workspace,
    readers,
    ui
}) {
    function destroyCurrentReader() {
        const currentReader = readers.getCurrentReader();
        if (currentReader?.destroy) {
            currentReader.destroy();
        }
        readers.setCurrentReader(null);
        setAppService('pdfReader', null);
    }

    function resetReadingState() {
        workspace.state.currentPage = 1;
        workspace.state.totalPages = 0;
        ui.updatePageInfo();
    }

    function clearLoadedFiles() {
        destroyCurrentReader();
        resetReadingState();
        readers.documentHistoryManager.stopAutoSave();
        workspace.state.files = [];
        workspace.state.currentFile = null;
        workspace.elements.viewer.innerHTML = '';
        updateCurrentBook({
            md5: null,
            id: null,
            name: null
        });
        ui.updateToolbarSummary();
        ui.renderProjectHome?.();
    }

    async function openFile(fileData) {
        destroyCurrentReader();
        resetReadingState();
        readers.documentHistoryManager.stopAutoSave();

        workspace.state.currentFile = fileData;
        ui.updateToolbarSummary();

        updateCurrentBook({
            md5: fileData.id,
            id: fileData.id,
            name: fileData.name
        });

        ui.renderFileList();
        workspace.elements.viewer.innerHTML = '';

        const appContext = getAppContext();
        appContext.documentManager?.registerDocument(
            fileData.id,
            fileData.name,
            fileData.type,
            true
        );

        appContext.cardSystem?.updateSourceNames?.(fileData.id, fileData.name);
        appContext.highlightManager?.updateSourceNames?.(fileData.id, fileData.name);
        appContext.annotationList?.load?.(fileData.id);

        const nextReader = await readers.readerLoader.loadReaderForFile(fileData);
        readers.setCurrentReader(nextReader);

        ui.updateToolAvailability(fileData.type);
        ui.setWorkspaceMode('reading', { force: true });
        ui.renderFileList();
    }

    async function importFiles(files, { openImportedFile = true } = {}) {
        const appContext = getAppContext();
        if (!appContext.currentProjectId) {
            projectWorkspace.ensureProjectIdentity();
        }

        const pendingDocumentImport = appContext.pendingDocumentImport;
        const reservedIds = new Set();
        const importedFileData = [];

        for (const file of files) {
            const decision = resolveImportDecision({
                file,
                pendingDocumentImport,
                documentManager: appContext.documentManager,
                currentFiles: workspace.state.files
            });
            const targetDocument = decision.mode === 'new'
                ? null
                : decision.targetDocumentId
                    ? appContext.documentManager?.getDocumentInfo?.(decision.targetDocumentId) ?? chooseDocumentTarget({
                        file,
                        pendingDocumentImport: { id: decision.targetDocumentId, type: file.type },
                        documentManager: appContext.documentManager,
                        reservedIds
                    })
                    : null;

            if ((pendingDocumentImport?.id || decision.mode === 'relink-only') && !targetDocument) {
                const relinkTargetName = pendingDocumentImport?.name || file.name;
                emitAppNotification({
                    title: 'Relink Skipped',
                    message: `"${file.name}" does not match the expected file type for "${relinkTargetName}". Please choose a compatible source file.`,
                    level: 'warning'
                });
                break;
            }

            const fileSignature = `${file.name}-${file.size}-${file.lastModified}`;
            const fileId = targetDocument?.id || await generateHash(fileSignature, logger);

            if (targetDocument?.id) {
                reservedIds.add(targetDocument.id);
            }

            const fileData = {
                id: fileId,
                name: file.name,
                type: file.type,
                lastModified: file.lastModified,
                fileObj: file,
                restoredDocumentId: targetDocument?.id || null,
                importMode: decision.mode
            };

            const existingIndex = workspace.state.files.findIndex((item) => item.id === fileId);
            if (existingIndex >= 0) {
                workspace.state.files[existingIndex] = fileData;
            } else {
                workspace.state.files.push(fileData);
            }

            appContext.documentManager?.registerDocument(
                fileId,
                file.name,
                file.type,
                true
            );

            appContext.cardSystem?.updateSourceNames?.(fileId, file.name);
            appContext.highlightManager?.updateSourceNames?.(fileId, file.name);
            importedFileData.push(fileData);
            if (decision.mode === 'replace') {
                emitAppNotification({
                    title: 'Document Replaced',
                    message: `"${file.name}" replaced the existing workspace source while preserving linked notes and cards.`,
                    level: 'success'
                });
            } else if (decision.mode === 'relink-only') {
                emitAppNotification({
                    title: 'Source Relinked',
                    message: `"${file.name}" was imported as a recovery source for saved links.`,
                    level: 'success'
                });
            }

            if (pendingDocumentImport?.id || decision.mode === 'relink-only') {
                break;
            }
        }

        setAppService('pendingDocumentImport', null);
        ui.renderFileList();

        if (!importedFileData.length) {
            return [];
        }

        if (openImportedFile) {
            await openFile(importedFileData[0]);
        }

        void projectWorkspace.performProjectAutosave({ notify: false });
        return importedFileData;
    }

    async function handleFileSelect(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) {
            return;
        }

        const pendingDocumentImport = getAppContext().pendingDocumentImport;
        const openImportedFile = !(pendingDocumentImport?.mode === 'bulk' || files.length > 1);
        await importFiles(files, { openImportedFile });
        workspace.elements.fileInput.value = '';
    }

    function openFileById(id, { onMissingDocument } = {}) {
        const file = workspace.state.files.find((item) => item.id === id);
        if (file) {
            void openFile(file);
            return;
        }

        const missingDocument = getAppContext().documentManager?.getDocumentInfo?.(id);
        if (missingDocument && !missingDocument.loaded) {
            onMissingDocument?.(id);
        }
    }

    async function moveFileByOffset(fileId, offset) {
        const currentIndex = workspace.state.files.findIndex((file) => file.id === fileId);
        if (currentIndex < 0) {
            return;
        }

        const targetIndex = currentIndex + offset;
        if (targetIndex < 0 || targetIndex >= workspace.state.files.length) {
            return;
        }

        const [file] = workspace.state.files.splice(currentIndex, 1);
        workspace.state.files.splice(targetIndex, 0, file);
        ui.renderFileList();
    }

    function moveFileToIndex(fileId, targetIndex) {
        workspace.state.files = reorderFilesById(workspace.state.files, fileId, targetIndex);
        ui.renderFileList();
    }

    async function removeFileFromWorkspace(fileId) {
        const fileIndex = workspace.state.files.findIndex((file) => file.id === fileId);
        if (fileIndex < 0) {
            return;
        }

        const fileToRemove = workspace.state.files[fileIndex];
        const appContext = getAppContext();
        const { cardCount, highlightCount, referenceCount } = getDocumentReferenceDetails(fileId);
        const isCurrentDocument = appContext.currentBook?.id === fileId;
        const confirmed = window.confirm(buildDocumentRemovalPrompt({
            name: fileToRemove.name,
            cardCount,
            highlightCount,
            isCurrentDocument
        }));

        if (!confirmed) {
            return;
        }

        const [removedFile] = workspace.state.files.splice(fileIndex, 1);

        if (referenceCount > 0 || isCurrentDocument) {
            appContext.documentManager?.markDocumentLoaded?.(fileId, false);
        } else {
            appContext.documentManager?.unregisterDocument?.(fileId);
        }

        if (workspace.state.currentFile?.id === fileId) {
            const fallbackFile = workspace.state.files[fileIndex] || workspace.state.files[fileIndex - 1] || null;
            if (fallbackFile) {
                await openFile(fallbackFile);
            } else {
                clearLoadedFiles();
                ui.renderFileList();
            }
        } else {
            ui.renderFileList();
        }

        emitAppNotification({
            title: 'Document Removed',
            message: referenceCount > 0
                ? `"${removedFile.name}" was removed from the active library list. Linked cards and highlights were preserved and now need relinking before source navigation works again.`
                : `"${removedFile.name}" was removed from the active library list.`,
            level: 'success'
        });
    }

    async function hydrateProjectFiles(projectFiles = [], { openCurrentBookId = null } = {}) {
        clearLoadedFiles();

        if (!Array.isArray(projectFiles) || !projectFiles.length) {
            renderFileList();
            return [];
        }

        const appContext = getAppContext();
        workspace.state.files = projectFiles.map((file) => ({
            ...file,
            restoredDocumentId: file.id
        }));

        workspace.state.files.forEach((file) => {
            appContext.documentManager?.registerDocument(file.id, file.name, file.type, true);
        });

        ui.renderFileList();

        const initialFile = workspace.state.files.find((file) => file.id === openCurrentBookId) || workspace.state.files[0];
        if (initialFile) {
            await openFile(initialFile);
        }

        return workspace.state.files;
    }

    return {
        clearLoadedFiles,
        destroyCurrentReader,
        handleFileSelect,
        hydrateProjectFiles,
        importFiles,
        moveFileByOffset,
        moveFileToIndex,
        openFile,
        openFileById,
        removeFileFromWorkspace,
        resetReadingState
    };
}
