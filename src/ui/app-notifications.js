export const APP_NOTIFY_EVENT = 'app-notify';

let notificationIdCounter = 0;

export function emitAppNotification(detail) {
    window.dispatchEvent(new CustomEvent(APP_NOTIFY_EVENT, {
        detail: typeof detail === 'string' ? { message: detail } : detail
    }));
}

export function mountAppNotifications(container) {
    if (!container) {
        return () => {};
    }

    const renderNotification = ({ title, message, level = 'info', duration = 4200, actions = [] } = {}) => {
        if (!message) {
            return null;
        }

        const notification = document.createElement('div');
        notification.className = `app-notification ${level}`;
        notification.dataset.notificationId = `notification-${notificationIdCounter++}`;

        if (title) {
            const titleEl = document.createElement('span');
            titleEl.className = 'app-notification-title';
            titleEl.textContent = title;
            notification.appendChild(titleEl);
        }

        const messageEl = document.createElement('div');
        messageEl.className = 'app-notification-message';
        messageEl.textContent = message;
        notification.appendChild(messageEl);

        if (Array.isArray(actions) && actions.length > 0) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'app-notification-actions';

            actions.forEach((action) => {
                if (!action?.label || typeof action.onClick !== 'function') {
                    return;
                }

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'app-notification-btn';
                button.textContent = action.label;
                button.addEventListener('click', () => {
                    action.onClick();
                    notification.remove();
                });
                actionsEl.appendChild(button);
            });

            if (actionsEl.children.length > 0) {
                notification.appendChild(actionsEl);
            }
        }

        container.appendChild(notification);
        window.setTimeout(() => {
            notification.remove();
        }, duration);

        return notification;
    };

    const handleNotify = (event) => {
        renderNotification(event.detail || {});
    };

    window.addEventListener(APP_NOTIFY_EVENT, handleNotify);
    return () => {
        window.removeEventListener(APP_NOTIFY_EVENT, handleNotify);
    };
}
