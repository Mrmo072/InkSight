import { describe, expect, it, vi } from 'vitest';
import { handleRecoveryPanelClick } from '../recovery-panel-actions.js';

describe('recovery panel actions', () => {
    it('routes relink and recovery actions from DOM clicks', () => {
        const relinkHost = document.createElement('div');
        relinkHost.innerHTML = '<button data-relink-document-id="doc-1"><span>Relink</span></button>';
        const actionHost = document.createElement('div');
        actionHost.innerHTML = '<button data-recovery-action="validate"><span>Validate</span></button>';

        const onRelinkDocument = vi.fn();
        const onRecoveryAction = vi.fn();

        const relinkEvent = {
            target: relinkHost.querySelector('span'),
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        };

        const actionEvent = {
            target: actionHost.querySelector('span'),
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        };

        expect(handleRecoveryPanelClick(relinkEvent, { onRelinkDocument, onRecoveryAction })).toBe(true);
        expect(onRelinkDocument).toHaveBeenCalledWith('doc-1');

        expect(handleRecoveryPanelClick(actionEvent, { onRelinkDocument, onRecoveryAction })).toBe(true);
        expect(onRecoveryAction).toHaveBeenCalledWith('validate');
    });
});
