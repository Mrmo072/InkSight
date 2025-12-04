/**
 * ThemeManager - Centralized theme management for the entire application
 * Syncs with Drawnix Mind Map theme changes
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'default'; // default, colorful, soft, retro, dark, starry
        this.listeners = new Set();
        this.init();
    }

    init() {
        // Set initial theme on document
        document.documentElement.dataset.theme = this.currentTheme;
    }

    setTheme(themeName) {
        if (this.currentTheme === themeName) return;

        this.currentTheme = themeName;
        document.documentElement.dataset.theme = themeName;

        // Notify all listeners
        this.listeners.forEach(fn => fn(themeName));

        console.log(`Theme changed to: ${themeName}`);
    }

    getTheme() {
        return this.currentTheme;
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.unsubscribe(callback);
    }

    unsubscribe(callback) {
        this.listeners.delete(callback);
    }
}

export const themeManager = new ThemeManager();
