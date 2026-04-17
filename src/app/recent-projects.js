export const RECENT_PROJECTS_STORAGE_KEY = 'inksight_recent_projects';
export const RECENT_PROJECTS_LIMIT = 8;

function normalizeTimestamp(value) {
    const timestamp = Number(value || 0);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeRecentProject(entry = {}) {
    return {
        projectId: entry.projectId || '',
        projectName: entry.projectName || 'Workspace',
        directoryName: entry.directoryName || null,
        savedAt: normalizeTimestamp(entry.savedAt),
        lastOpenedAt: normalizeTimestamp(entry.lastOpenedAt || entry.savedAt),
        source: entry.source === 'project-folder' ? 'project-folder' : 'runtime-workspace',
        snapshotCount: Number(entry.snapshotCount || 0)
    };
}

export function listRecentProjects(storage = localStorage) {
    const stored = storage.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (!stored) {
        return [];
    }

    try {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map(normalizeRecentProject)
            .filter((entry) => entry.projectId)
            .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
            .slice(0, RECENT_PROJECTS_LIMIT);
    } catch (error) {
        console.error('[RecentProjects] Failed to parse recent project index', error);
        return [];
    }
}

export function saveRecentProjects(entries, storage = localStorage) {
    storage.setItem(
        RECENT_PROJECTS_STORAGE_KEY,
        JSON.stringify(entries.map(normalizeRecentProject))
    );
}

export function recordRecentProject(entry, storage = localStorage) {
    const nextEntry = normalizeRecentProject(entry);
    if (!nextEntry.projectId) {
        return listRecentProjects(storage);
    }

    const existing = listRecentProjects(storage).filter((item) => item.projectId !== nextEntry.projectId);
    const merged = [nextEntry, ...existing]
        .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
        .slice(0, RECENT_PROJECTS_LIMIT);

    saveRecentProjects(merged, storage);
    return merged;
}
