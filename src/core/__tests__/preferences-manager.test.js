import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preferencesManager, DEFAULT_PREFERENCES, LIMITS } from '../preferences-manager.js';

describe('PreferencesManager', () => {
    beforeEach(() => {
        localStorage.clear();
        preferencesManager.reset();
    });

    it('should initialize with default preferences', () => {
        expect(preferencesManager.get()).toEqual({ ...DEFAULT_PREFERENCES });
        expect(document.documentElement.style.getPropertyValue('--reading-font-size')).toBe('16px');
        expect(document.documentElement.style.getPropertyValue('--reading-line-height')).toBe('1.6');
    });

    it('should set and persist a preference', () => {
        preferencesManager.set({ fontSize: 20 });

        expect(preferencesManager.get().fontSize).toBe(20);
        expect(document.documentElement.style.getPropertyValue('--reading-font-size')).toBe('20px');
        expect(JSON.parse(localStorage.getItem('inksight:preferences'))).toMatchObject({ fontSize: 20 });
    });

    it('should clamp values to the configured limits', () => {
        preferencesManager.set({ fontSize: 100, lineHeight: 0.1 });

        expect(preferencesManager.get().fontSize).toBe(LIMITS.fontSize.max);
        expect(preferencesManager.get().lineHeight).toBe(LIMITS.lineHeight.min);
    });

    it('should ignore non-numeric values', () => {
        preferencesManager.set({ fontSize: 'abc' });

        expect(preferencesManager.get().fontSize).toBe(DEFAULT_PREFERENCES.fontSize);
    });

    it('should restore defaults on reset', () => {
        preferencesManager.set({ fontSize: 24, lineHeight: 2 });
        preferencesManager.reset();

        expect(preferencesManager.get()).toEqual({ ...DEFAULT_PREFERENCES });
        expect(JSON.parse(localStorage.getItem('inksight:preferences'))).toMatchObject(DEFAULT_PREFERENCES);
    });

    it('should notify listeners on change but not on unchanged set', () => {
        const listener = vi.fn();
        const unsubscribe = preferencesManager.subscribe(listener);

        preferencesManager.set({ fontSize: 18 });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 18 }));

        listener.mockClear();
        preferencesManager.set({ fontSize: 18 });
        expect(listener).not.toHaveBeenCalled();

        unsubscribe();
    });

    it('should restore persisted preferences on construction', async () => {
        localStorage.setItem('inksight:preferences', JSON.stringify({ fontSize: 22, lineHeight: 2 }));

        vi.resetModules();
        const { preferencesManager: freshManager } = await import('../preferences-manager.js');

        expect(freshManager.get()).toEqual({ fontSize: 22, lineHeight: 2 });

        localStorage.clear();
    });
});
