import { buildInksightFilePayload } from './inksight-file-snapshot.js';
import {
    bundleProjectData,
    hydrateProjectData,
    INKSIGHT_PROJECT_MANIFEST
} from './inksight-project-bundle.js';

export const INKSIGHT_PROJECT_METADATA = '.inksight/meta.json';

function isAbortError(error) {
    return error?.name === 'AbortError';
}

function ensureDirectoryApi() {
    if (typeof window?.showDirectoryPicker !== 'function') {
        throw new Error('Directory project storage is not supported in this browser.');
    }
}

async function getDirectoryHandle(rootHandle, pathSegments, { create = false } = {}) {
    let currentHandle = rootHandle;

    for (const segment of pathSegments) {
        currentHandle = await currentHandle.getDirectoryHandle(segment, { create });
    }

    return currentHandle;
}

async function writeDirectoryFile(rootHandle, relativePath, contents) {
    const segments = relativePath.split('/').filter(Boolean);
    const fileName = segments.pop();
    const directoryHandle = segments.length
        ? await getDirectoryHandle(rootHandle, segments, { create: true })
        : rootHandle;
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
}

async function readDirectoryFile(rootHandle, relativePath) {
    const segments = relativePath.split('/').filter(Boolean);
    const fileName = segments.pop();
    const directoryHandle = segments.length
        ? await getDirectoryHandle(rootHandle, segments)
        : rootHandle;
    const fileHandle = await directoryHandle.getFileHandle(fileName);
    return fileHandle.getFile();
}

async function cleanupDirectoryFiles(rootHandle, folderName, expectedPaths) {
    if (typeof rootHandle.getDirectoryHandle !== 'function') {
        return;
    }

    try {
        const directoryHandle = await rootHandle.getDirectoryHandle(folderName);
        const expectedNames = new Set(
            [...expectedPaths]
                .filter((path) => path.startsWith(`${folderName}/`))
                .map((path) => path.slice(folderName.length + 1))
        );

        // eslint-disable-next-line no-restricted-syntax
        for await (const [name, handle] of directoryHandle.entries()) {
            if (handle.kind !== 'file' || expectedNames.has(name)) {
                continue;
            }

            await directoryHandle.removeEntry(name);
        }
    } catch (error) {
        if (error?.name !== 'NotFoundError') {
            throw error;
        }
    }
}

export async function saveInksightProjectDirectory({
    board,
    appContext = {},
    projectFiles = [],
    name,
    lastPage,
    directoryHandle = null,
    projectMetadata = null
} = {}) {
    ensureDirectoryApi();

    const payload = buildInksightFilePayload({ appContext, board, lastPage });
    const targetDirectoryHandle = directoryHandle
        || await window.showDirectoryPicker({ id: `inksight-project-${name || 'workspace'}`, mode: 'readwrite' });
    const { manifest, assetEntries, documentEntries } = await bundleProjectData({
        payload,
        projectFiles
    });

    await writeDirectoryFile(
        targetDirectoryHandle,
        INKSIGHT_PROJECT_MANIFEST,
        JSON.stringify(manifest, null, 2)
    );

    if (projectMetadata) {
        await writeDirectoryFile(
            targetDirectoryHandle,
            INKSIGHT_PROJECT_METADATA,
            JSON.stringify({
                ...projectMetadata,
                savedAt: new Date().toISOString()
            }, null, 2)
        );
    }

    for (const assetEntry of assetEntries) {
        await writeDirectoryFile(targetDirectoryHandle, assetEntry.path, assetEntry.blob);
    }

    for (const documentEntry of documentEntries) {
        await writeDirectoryFile(targetDirectoryHandle, documentEntry.path, documentEntry.file);
    }

    await cleanupDirectoryFiles(
        targetDirectoryHandle,
        'assets',
        new Set(assetEntries.map((entry) => entry.path))
    );
    await cleanupDirectoryFiles(
        targetDirectoryHandle,
        'documents',
        new Set(documentEntries.map((entry) => entry.path))
    );

    return {
        directoryHandle: targetDirectoryHandle,
        manifest,
        projectMetadata,
        payload: manifest.payload,
        assets: manifest.assets,
        documents: manifest.documents
    };
}

export async function openInksightProjectDirectory({ directoryHandle = null } = {}) {
    ensureDirectoryApi();

    const targetDirectoryHandle = directoryHandle
        || await window.showDirectoryPicker({ id: 'inksight-project-open', mode: 'read' });
    const manifestFile = await readDirectoryFile(targetDirectoryHandle, INKSIGHT_PROJECT_MANIFEST);
    const manifest = JSON.parse(await manifestFile.text());
    let projectMetadata = null;
    try {
        const metadataFile = await readDirectoryFile(targetDirectoryHandle, INKSIGHT_PROJECT_METADATA);
        projectMetadata = JSON.parse(await metadataFile.text());
    } catch (error) {
        if (error?.name !== 'NotFoundError') {
            throw error;
        }
    }
    const hydrated = await hydrateProjectData({
        manifest,
        readBlob: async (relativePath) => readDirectoryFile(targetDirectoryHandle, relativePath)
    });

    return {
        directoryHandle: targetDirectoryHandle,
        manifest,
        projectMetadata,
        payload: hydrated.payload,
        projectFiles: hydrated.projectFiles,
        cleanup: hydrated.cleanup
    };
}

export { isAbortError };
