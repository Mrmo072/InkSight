export function handleRecoveryPanelClick(event, handlers = {}) {
    const matchButton = event.target.closest?.('[data-recovery-match-id]');
    if (matchButton) {
        event.preventDefault?.();
        event.stopPropagation?.();
        handlers.onMatchDocument?.(matchButton.dataset.recoveryMatchId);
        return true;
    }

    const relinkButton = event.target.closest?.('[data-relink-document-id]');
    if (relinkButton) {
        event.preventDefault?.();
        event.stopPropagation?.();
        handlers.onRelinkDocument?.(relinkButton.dataset.relinkDocumentId);
        return true;
    }

    const recoveryAction = event.target.closest?.('[data-recovery-action]');
    if (!recoveryAction) {
        return false;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    handlers.onRecoveryAction?.(recoveryAction.dataset.recoveryAction);
    return true;
}
