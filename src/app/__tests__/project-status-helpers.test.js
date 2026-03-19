import { describe, expect, it } from 'vitest';
import {
    formatAutosaveTime,
    loadProjectSnapshotMeta,
    loadProjectAutosavePrefs,
    saveProjectAutosavePrefs
} from '../project-status-helpers.js';

describe('project status helpers', () => {
    it('loads and saves autosave prefs', () => {
        const storage = {
            value: null,
            getItem() {
                return this.value;
            },
            setItem(_key, value) {
                this.value = value;
            }
        };

        expect(loadProjectAutosavePrefs(storage)).toEqual({
            enabled: true,
            intervalMinutes: 3
        });

        saveProjectAutosavePrefs({
            enabled: true,
            intervalMinutes: 10
        }, storage);

        expect(loadProjectAutosavePrefs(storage)).toEqual({
            enabled: true,
            intervalMinutes: 10
        });
    });

    it('formats autosave times safely', () => {
        expect(formatAutosaveTime(null)).toBe('Not saved yet');
        expect(typeof formatAutosaveTime(Date.now())).toBe('string');
    });

    it('loads snapshot metadata safely', () => {
        const storage = {
            value: JSON.stringify({ savedAt: 1234 }),
            getItem() {
                return this.value;
            }
        };

        expect(loadProjectSnapshotMeta(storage)).toEqual({
            savedAt: 1234
        });
    });
});
