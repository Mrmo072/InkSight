const DEFAULT_CONTEXT = {
    currentBook: {
        md5: null,
        name: null,
        id: null
    },
    cardSystem: null,
    highlightManager: null,
    documentManager: null,
    pdfReader: null,
    outlineSidebar: null,
    annotationList: null,
    board: null,
    pendingRestore: null,
    pendingDocumentImport: null,
    openProjectFile: null,
    getProjectFiles: null,
    hydrateProjectFiles: null,
    currentProjectId: null,
    runtimeUserId: null,
    runtimeSessionId: null,
    runtimeStorageInfo: null,
    currentProjectDirectoryHandle: null,
    currentProjectCleanup: null
};

export function initAppContext() {
    const existing = window.inksight || {};
    const context = {
        ...DEFAULT_CONTEXT,
        ...existing,
        currentBook: {
            ...DEFAULT_CONTEXT.currentBook,
            ...(existing.currentBook || {})
        }
    };

    window.inksight = context;
    return context;
}

export function getAppContext() {
    return window.inksight || initAppContext();
}

export function getAppService(key) {
    return getAppContext()[key];
}

export function setAppService(key, value) {
    const context = getAppContext();
    context[key] = value;
    return value;
}

export function updateCurrentBook(patch) {
    const context = getAppContext();
    Object.assign(context.currentBook, patch);
    return context.currentBook;
}
