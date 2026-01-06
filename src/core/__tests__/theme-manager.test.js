import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { themeManager } from '../theme-manager';

describe('ThemeManager', () => {
    beforeEach(() => {
        // Reset theme to default before each test
        // Accessing private internal state for testing purposes, or just using public API if possible
        // Ideally we should have a reset method, but for now we can rely on public API

        // Since themeManager is a singleton, its state persists across tests.
        // We need to ensure a clean state.
        if (themeManager.getTheme() !== 'default') {
            themeManager.setTheme('default');
        }

        // Clear mocks if any
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
});
