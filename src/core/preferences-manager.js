/**
 * PreferencesManager - Global reading preferences (font size, line height).
 * Follows the same singleton + localStorage + subscribe pattern as ThemeManager.
 */

const DEFAULT_PREFERENCES = Object.freeze({
    fontSize: 16,
    lineHeight: 1.6
});

const LIMITS = Object.freeze({
    fontSize: { min: 12, max: 24 },
    lineHeight: { min: 1.2, max: 2.2 }
});

function clampNumber(value, { min, max }, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, num));
}

class PreferencesManager {
    constructor() {
        this.preferences = { ...DEFAULT_PREFERENCES };
        this.listeners = new Set();
        this.STORAGE_KEY = 'inksight:preferences';
        this.init();
    }

    init() {
        try {
            const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY) : null;
            if (stored) {
                const parsed = JSON.parse(stored);
                this.preferences = {
                    fontSize: clampNumber(parsed?.fontSize, LIMITS.fontSize, DEFAULT_PREFERENCES.fontSize),
                    lineHeight: clampNumber(parsed?.lineHeight, LIMITS.lineHeight, DEFAULT_PREFERENCES.lineHeight)
                };
            }
        } catch {
            // Corrupted or unavailable storage — fall back to defaults.
            this.preferences = { ...DEFAULT_PREFERENCES };
        }
        this.applyToDocument();
    }

    get() {
        return { ...this.preferences };
    }

    getLimits() {
        return LIMITS;
    }

    set(patch) {
        const next = { ...this.preferences };

        if (patch?.fontSize !== undefined) {
            next.fontSize = clampNumber(patch.fontSize, LIMITS.fontSize, this.preferences.fontSize);
        }
        if (patch?.lineHeight !== undefined) {
            next.lineHeight = clampNumber(patch.lineHeight, LIMITS.lineHeight, this.preferences.lineHeight);
        }

        const changed = Object.keys(next).some((key) => next[key] !== this.preferences[key]);
        if (!changed) {
            return this.get();
        }

        this.preferences = next;
        this.applyToDocument();
        this.persist();
        this.listeners.forEach((fn) => fn(this.get()));
        return this.get();
    }

    reset() {
        return this.set(DEFAULT_PREFERENCES);
    }

    applyToDocument() {
        if (typeof document === 'undefined') {
            return;
        }
        const root = document.documentElement;
        root.style.setProperty('--reading-font-size', `${this.preferences.fontSize}px`);
        root.style.setProperty('--reading-line-height', String(this.preferences.lineHeight));
    }

    persist() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.preferences));
        } catch {
            // Ignore persistence failures — the session preferences still apply.
        }
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.unsubscribe(callback);
    }

    unsubscribe(callback) {
        this.listeners.delete(callback);
    }
}

export const preferencesManager = new PreferencesManager();
export { DEFAULT_PREFERENCES, LIMITS };
