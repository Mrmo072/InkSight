import { beforeEach, describe, expect, it, vi } from 'vitest';
import { themeManager } from '../theme-manager.js';

describe('ThemeManager', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        if (themeManager.getTheme() !== 'default') {
            themeManager.setTheme('default');
        }
        vi.clearAllMocks();
    });

    it('should initialize with default theme', () => {
        expect(themeManager.getTheme()).toBe('default');
        expect(document.documentElement.dataset.theme).toBe('default');
    });

    it('should set theme correctly', () => {
        themeManager.setTheme('dark');
        expect(themeManager.getTheme()).toBe('dark');
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(console.log).toHaveBeenCalledWith('Theme changed to: dark');
    });

    it('should notify listeners on theme change', () => {
        const listener = vi.fn();
        const unsubscribe = themeManager.subscribe(listener);

        themeManager.setTheme('soft');
        expect(listener).toHaveBeenCalledWith('soft');
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
    });

    it('should NOT notify listeners if theme is unchanged', () => {
        const listener = vi.fn();
        themeManager.subscribe(listener);

        themeManager.setTheme('default'); // Assuming it's already default or reset to default
        // Force set to something else first to ensure we are testing "unchanged" from a known state
        themeManager.setTheme('retro');
        listener.mockClear();

        themeManager.setTheme('retro');
        expect(listener).not.toHaveBeenCalled();
    });

    it('should unsubscribe correctly', () => {
        const listener = vi.fn();
        const unsubscribe = themeManager.subscribe(listener);

        unsubscribe();
        themeManager.setTheme('starry');
        expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners and only removes the unsubscribed one', () => {
        const first = vi.fn();
        const second = vi.fn();
        const unsubscribeFirst = themeManager.subscribe(first);
        themeManager.subscribe(second);

        unsubscribeFirst();
        themeManager.setTheme('colorful');

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledWith('colorful');
    });
});
