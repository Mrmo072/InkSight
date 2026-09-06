import { messages, supportedLocales } from './locales.js';

export { supportedLocales } from './locales.js';

export const LOCALE_STORAGE_KEY = 'inksight:locale';
export const LOCALE_CHANGED_EVENT = 'inksight:locale-changed';

const originalValues = new WeakMap();
let observer = null;

export function normalizeLocale(value) {
    const locale = String(value || '').toLowerCase();
    return locale.startsWith('zh') ? 'zh-CN' : 'en-US';
}

function readStoredLocale() {
    try {
        return localStorage.getItem(LOCALE_STORAGE_KEY) || localStorage.getItem('language');
    } catch {
        return null;
    }
}

export function getLocale() {
    const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
    return normalizeLocale(readStoredLocale() || browserLocale);
}

export function t(key, params = {}, locale = getLocale()) {
    const template = messages[locale]?.[key] ?? messages['en-US'][key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

function remember(element, name, value) {
    let values = originalValues.get(element);
    if (!values) {
        values = {};
        originalValues.set(element, values);
    }
    if (!(name in values)) {
        values[name] = value;
    }
    return values[name];
}

function applyElement(element) {
    if (!(element instanceof HTMLElement)) {
        return;
    }

    const textKey = element.dataset.i18n;
    if (textKey) {
        element.textContent = t(textKey);
    }

    for (const [attribute, dataName] of [
        ['title', 'i18nTitle'],
        ['aria-label', 'i18nAriaLabel'],
        ['placeholder', 'i18nPlaceholder']
    ]) {
        const key = element.dataset[dataName];
        if (key) {
            remember(element, attribute, element.getAttribute(attribute));
            element.setAttribute(attribute, t(key));
        }
    }
}

export function localizeDocument(root = document) {
    if (typeof document === 'undefined' || !root) {
        return;
    }
    if (root instanceof HTMLElement) {
        applyElement(root);
    }
    root.querySelectorAll?.('[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]')
        .forEach(applyElement);
    document.documentElement.lang = getLocale();
}

export function setLocale(locale) {
    const normalized = normalizeLocale(locale);
    if (!supportedLocales.includes(normalized)) {
        return getLocale();
    }
    try {
        localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
        // Drawnix uses this legacy key internally.
        localStorage.setItem('language', normalized === 'zh-CN' ? 'zh' : 'en');
    } catch {
        // Keep the in-memory UI usable even if persistence is unavailable.
    }
    localizeDocument();
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT, { detail: { locale: normalized } }));
    return normalized;
}

export function initializeI18n() {
    const locale = getLocale();
    try {
        localStorage.setItem('language', locale === 'zh-CN' ? 'zh' : 'en');
    } catch {
        // Ignore storage restrictions.
    }
    localizeDocument();
    if (typeof MutationObserver !== 'undefined' && document.body && !observer) {
        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    localizeDocument(node);
                }
            }));
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    return locale;
}
