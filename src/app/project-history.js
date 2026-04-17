import { loadRuntimeProjectSnapshot, listRuntimeProjectSnapshots } from '../inksight-file/inksight-runtime-project-io.js';

export const PROJECT_HISTORY_LIMIT = 10;

export function buildProjectSnapshotSummary(snapshot = {}) {
    return {
        snapshotId: snapshot.snapshotId,
        savedAt: snapshot.savedAt || null,
        projectName: snapshot.projectName || 'Workspace snapshot',
        bookName: snapshot.bookName || 'Workspace',
        elementCount: Number(snapshot.elementCount || 0),
        cardCount: Number(snapshot.cardCount || 0),
        highlightCount: Number(snapshot.highlightCount || 0),
        documentCount: Number(snapshot.documentCount || 0)
    };
}

export function normalizeProjectSnapshots(snapshots = []) {
    return snapshots
        .map(buildProjectSnapshotSummary)
        .sort((left, right) => Date.parse(right.savedAt || 0) - Date.parse(left.savedAt || 0))
        .slice(0, PROJECT_HISTORY_LIMIT);
}

export async function recordProjectSnapshot(meta = {}) {
    return buildProjectSnapshotSummary(meta);
}

export async function listProjectSnapshots(runtimeIdentity = {}) {
    const result = await listRuntimeProjectSnapshots({ runtimeIdentity }).catch(() => null);
    const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
    return normalizeProjectSnapshots(snapshots);
}

export async function restoreProjectSnapshot({ runtimeIdentity = {}, snapshotId } = {}) {
    return loadRuntimeProjectSnapshot({
        runtimeIdentity,
        snapshotId
    });
}
