// utils/resizeObserverFix.js
export function suppressResizeObserverLoop() {
    // Suppress "ResizeObserver loop completed with undelivered notifications"
    // This error is benign and occurs when a ResizeObserver callback modifies the DOM
    // in a way that triggers another ResizeObserver notification in the same frame.

    const IGNORED_ERRORS = [
        'ResizeObserver loop completed with undelivered notifications',
        'ResizeObserver loop limit exceeded'
    ];

    // Method 1: Global Error Handler (Capture Phase)
    // Using capture: true ensures we catch it before other listeners (like Vite's overlay)
    const errorHandler = (e) => {
        if (e && e.message && IGNORED_ERRORS.some(msg => e.message.includes(msg))) {
            e.stopImmediatePropagation();
            e.preventDefault(); // Prevent browser console error
            return;
        }
    };

    window.addEventListener('error', errorHandler, { capture: true });

    // Method 2: window.onerror (Backup)
    const originalOnError = window.onerror;
    window.onerror = function (msg, url, line, col, error) {
        if (msg && IGNORED_ERRORS.some(ignored => msg.includes(ignored))) {
            return true; // Suppress error
        }
        if (originalOnError) {
            return originalOnError.apply(this, arguments);
        }
        return false;
    };

    // Method 3: Wrap ResizeObserver (Deep suppression)
    const OriginalResizeObserver = window.ResizeObserver;
    if (OriginalResizeObserver) {
        window.ResizeObserver = class extends OriginalResizeObserver {
            constructor(callback) {
                super((entries, observer) => {
                    // Wrap callback to catch synchronous errors inside it
                    try {
                        // RequestAnimationFrame can sometimes help break the loop if we delay the callback
                        // but that might break logic expecting synchronous updates.
                        // For now, just run it.
                        callback(entries, observer);
                    } catch (e) {
                        if (e && e.message && IGNORED_ERRORS.some(msg => e.message.includes(msg))) {
                            return;
                        }
                        throw e;
                    }
                });
            }
        };
    }
}
