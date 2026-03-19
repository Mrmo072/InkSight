export const PROJECT_AUTOSAVE_PREFS_KEY = 'inksight_project_autosave_prefs';
export const PROJECT_AUTOSAVE_SNAPSHOT_KEY = 'inksight_project_autosave_snapshot';

export function loadProjectAutosavePrefs(storage = localStorage) {
    try {
        const raw = storage.getItem(PROJECT_AUTOSAVE_PREFS_KEY);
        if (!raw) {
            return {
                enabled: true,
                intervalMinutes: 3
            };
        }

        const parsed = JSON.parse(raw);
        return {
            enabled: Boolean(parsed.enabled),
            intervalMinutes: Number.isFinite(parsed.intervalMinutes) ? parsed.intervalMinutes : 3
        };
    } catch {
        return {
            enabled: true,
            intervalMinutes: 3
        };
    }
}

export function saveProjectAutosavePrefs(prefs, storage = localStorage) {
    storage.setItem(PROJECT_AUTOSAVE_PREFS_KEY, JSON.stringify({
        enabled: Boolean(prefs?.enabled),
        intervalMinutes: Number.isFinite(prefs?.intervalMinutes) ? prefs.intervalMinutes : 3
    }));
}

export function formatAutosaveTime(timestamp) {
    if (!timestamp) {
        return 'Not saved yet';
    }

    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(new Date(timestamp));
    } catch {
        return new Date(timestamp).toLocaleTimeString();
    }
}

export function loadProjectSnapshotMeta(storage = localStorage) {
    try {
        const raw = storage.getItem(PROJECT_AUTOSAVE_SNAPSHOT_KEY);
        if (!raw) {
            return {
                savedAt: null
            };
        }

        const parsed = JSON.parse(raw);
        return {
            savedAt: Number.isFinite(parsed?.savedAt) ? parsed.savedAt : null
        };
    } catch {
        return {
            savedAt: null
        };
    }
}
