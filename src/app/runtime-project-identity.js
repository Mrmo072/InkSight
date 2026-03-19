export const RUNTIME_USER_ID_KEY = 'inksight_runtime_user_id';
export const RUNTIME_PROJECT_ID_KEY = 'inksight_runtime_project_id';
export const RUNTIME_SESSION_ID_KEY = 'inksight_runtime_session_id';

function createRandomId(prefix = 'id') {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    const randomPart = Math.random().toString(36).slice(2, 10);
    const timePart = Date.now().toString(36);
    return `${prefix}-${timePart}-${randomPart}`;
}

export function ensureRuntimeUserId(storage = localStorage) {
    const existing = storage.getItem(RUNTIME_USER_ID_KEY);
    if (existing) {
        return existing;
    }

    const nextId = createRandomId('user');
    storage.setItem(RUNTIME_USER_ID_KEY, nextId);
    return nextId;
}

export function ensureRuntimeSessionId(storage = sessionStorage) {
    const existing = storage.getItem(RUNTIME_SESSION_ID_KEY);
    if (existing) {
        return existing;
    }

    const nextId = createRandomId('session');
    storage.setItem(RUNTIME_SESSION_ID_KEY, nextId);
    return nextId;
}

export function ensureRuntimeProjectId(storage = localStorage) {
    const existing = storage.getItem(RUNTIME_PROJECT_ID_KEY);
    if (existing) {
        return existing;
    }

    const nextId = createRandomId('project');
    storage.setItem(RUNTIME_PROJECT_ID_KEY, nextId);
    return nextId;
}

export function setRuntimeProjectId(projectId, storage = localStorage) {
    if (!projectId) {
        storage.removeItem(RUNTIME_PROJECT_ID_KEY);
        return null;
    }

    storage.setItem(RUNTIME_PROJECT_ID_KEY, projectId);
    return projectId;
}

