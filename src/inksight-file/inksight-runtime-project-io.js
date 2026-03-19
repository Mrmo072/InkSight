import { buildInksightFilePayload } from './inksight-file-snapshot.js';
import { bundleProjectData, hydrateProjectData } from './inksight-project-bundle.js';
import { resolveDocumentHistoryIpc } from '../core/document-history-ipc.js';

async function serializeBinaryEntries(entries = [], fileKey) {
    const results = [];

    for (const entry of entries) {
        const source = entry?.[fileKey];
        if (!source || typeof source.arrayBuffer !== 'function') {
            continue;
        }

        const buffer = await source.arrayBuffer();
        results.push({
            path: entry.path,
            mimeType: entry.mimeType || entry.type || source.type || 'application/octet-stream',
            size: entry.size || source.size || 0,
            lastModified: entry.lastModified || source.lastModified || 0,
            bytes: new Uint8Array(buffer)
        });
    }

    return results;
}

export async function getRuntimeStorageInfo() {
    const ipc = resolveDocumentHistoryIpc();
    if (!ipc?.getRuntimeStorageInfo) {
        return null;
    }

    return ipc.getRuntimeStorageInfo();
}

export async function saveRuntimeProjectSnapshot({
    board,
    appContext = {},
    projectFiles = [],
    runtimeIdentity = {},
    projectName,
    lastPage
} = {}) {
    const ipc = resolveDocumentHistoryIpc();
    if (!ipc?.saveRuntimeProject) {
        throw new Error('Runtime project storage is not available.');
    }

    const payload = buildInksightFilePayload({ appContext, board, lastPage });
    const { manifest, assetEntries, documentEntries } = await bundleProjectData({
        payload,
        projectFiles
    });

    const result = await ipc.saveRuntimeProject({
        ...runtimeIdentity,
        projectName: projectName || appContext.currentBook?.name || 'workspace',
        manifest,
        assetEntries: await serializeBinaryEntries(assetEntries, 'blob'),
        documentEntries: await serializeBinaryEntries(documentEntries, 'file')
    });

    return {
        ...result,
        manifest,
        payload: manifest.payload
    };
}

export async function loadRuntimeProjectSnapshot({ runtimeIdentity = {} } = {}) {
    const ipc = resolveDocumentHistoryIpc();
    if (!ipc?.loadRuntimeProject) {
        return null;
    }

    const result = await ipc.loadRuntimeProject(runtimeIdentity);
    if (!result?.success || !result?.manifest) {
        return null;
    }

    const binaryMap = new Map((result.files || []).map((entry) => [entry.path, entry]));
    const hydrated = await hydrateProjectData({
        manifest: result.manifest,
        readBlob: async (relativePath) => {
            const entry = binaryMap.get(relativePath);
            if (!entry) {
                throw new Error(`Missing runtime project file: ${relativePath}`);
            }

            return new Blob([entry.bytes], { type: entry.mimeType || 'application/octet-stream' });
        }
    });

    return {
        ...result,
        payload: hydrated.payload,
        projectFiles: hydrated.projectFiles,
        cleanup: hydrated.cleanup
    };
}
