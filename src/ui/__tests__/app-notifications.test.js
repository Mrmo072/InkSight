import { describe, expect, it, vi } from 'vitest';
import { APP_NOTIFY_EVENT, mountAppNotifications } from '../app-notifications.js';

describe('app notifications', () => {
    it('renders notifications from app-notify events and runs action callbacks', () => {
        vi.useFakeTimers();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const cleanup = mountAppNotifications(container);
        const onClick = vi.fn();

        window.dispatchEvent(new CustomEvent(APP_NOTIFY_EVENT, {
            detail: {
                title: 'Recovery',
                message: 'Missing sources remain',
                level: 'warning',
                actions: [
                    { label: 'Validate', onClick }
                ]
            }
        }));

        expect(container.querySelector('.app-notification-message')?.textContent).toBe('Missing sources remain');
        container.querySelector('.app-notification-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(container.querySelector('.app-notification')).toBeNull();

        cleanup();
        vi.useRealTimers();
    });
});
