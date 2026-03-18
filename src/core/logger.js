function isVerboseLoggingEnabled() {
    if (typeof localStorage !== 'undefined') {
        const storedValue = localStorage.getItem('inksight:debug-logs');
        if (storedValue === '1' || storedValue === 'true') {
            return true;
        }
    }

    return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
}

function logWithConsole(method, namespace, args) {
    if (typeof args[0] === 'string') {
        const [message, ...rest] = args;
        console[method](`[${namespace}] ${message}`, ...rest);
        return;
    }

    console[method](`[${namespace}]`, ...args);
}

export function createLogger(namespace) {
    return {
        debug: (...args) => {
            if (isVerboseLoggingEnabled()) {
                logWithConsole('log', namespace, args);
            }
        },
        info: (...args) => {
            if (isVerboseLoggingEnabled()) {
                logWithConsole('info', namespace, args);
            }
        },
        warn: (...args) => {
            logWithConsole('warn', namespace, args);
        },
        error: (...args) => {
            logWithConsole('error', namespace, args);
        }
    };
}
