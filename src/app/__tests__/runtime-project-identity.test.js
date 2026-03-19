import { describe, expect, it } from 'vitest';
import {
    ensureRuntimeProjectId,
    ensureRuntimeSessionId,
    ensureRuntimeUserId,
    setRuntimeProjectId
} from '../runtime-project-identity.js';

function createStorage() {
    const state = new Map();
    return {
        getItem(key) {
            return state.has(key) ? state.get(key) : null;
        },
        setItem(key, value) {
            state.set(key, String(value));
        },
        removeItem(key) {
            state.delete(key);
        }
    };
}

describe('runtime project identity', () => {
    it('persists user, session, and project ids', () => {
        const local = createStorage();
        const session = createStorage();

        const userId = ensureRuntimeUserId(local);
        const sessionId = ensureRuntimeSessionId(session);
        const projectId = ensureRuntimeProjectId(local);

        expect(ensureRuntimeUserId(local)).toBe(userId);
        expect(ensureRuntimeSessionId(session)).toBe(sessionId);
        expect(ensureRuntimeProjectId(local)).toBe(projectId);
    });

    it('updates and clears project ids explicitly', () => {
        const local = createStorage();

        expect(setRuntimeProjectId('project-fixed', local)).toBe('project-fixed');
        expect(ensureRuntimeProjectId(local)).toBe('project-fixed');
        expect(setRuntimeProjectId(null, local)).toBeNull();
        expect(ensureRuntimeProjectId(local)).not.toBe('project-fixed');
    });
});

