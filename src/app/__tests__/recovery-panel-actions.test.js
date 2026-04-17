import { describe, expect, it, vi } from 'vitest';
import { handleRecoveryPanelClick } from '../recovery-panel-actions.js';

describe('recovery panel actions', () => {
    it('routes relink and recovery actions from DOM clicks', () => {
        const matchHost = document.createElement('div');
        matchHost.innerHTML = '<button data-recovery-match-id="doc-2"><span>Match existing</span></button>';
        const relinkHost = document.createElement('div');
        relinkHost.innerHTML = '<button data-relink-document-id="doc-1"><span>Relink</span></button>';
        const actionHost = document.createElement('div');
        actionHost.innerHTML = '<button data-recovery-action="validate"><span>Validate</span></button>';

        const onMatchDocument = vi.fn();
        const onRelinkDocument = vi.fn();
        const onRecoveryAction = vi.fn();

        const matchEvent = {
            target: matchHost.querySelector('span'),
            preventDefault: vi.fn(),
            stopPropagation: vi.fn()
        };

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

        expect(handleRecoveryPanelClick(matchEvent, { onMatchDocument, onRelinkDocument, onRecoveryAction })).toBe(true);
        expect(onMatchDocument).toHaveBeenCalledWith('doc-2');

        expect(handleRecoveryPanelClick(relinkEvent, { onMatchDocument, onRelinkDocument, onRecoveryAction })).toBe(true);
        expect(onRelinkDocument).toHaveBeenCalledWith('doc-1');

        expect(handleRecoveryPanelClick(actionEvent, { onMatchDocument, onRelinkDocument, onRecoveryAction })).toBe(true);
        expect(onRecoveryAction).toHaveBeenCalledWith('validate');
    });
});
