export function registerEventListeners(listeners) {
    listeners.forEach(({ target, event, handler, options }) => {
        target.addEventListener(event, handler, options);
    });

    return () => {
        listeners.forEach(({ target, event, handler, options }) => {
            target.removeEventListener(event, handler, options);
        });
    };
}
