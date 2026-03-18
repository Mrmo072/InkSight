import { getAppContext } from './app-context.js';

export function setupSelectionSync({
    findCardById,
    findCardByHighlightId,
    isCompactLayout,
    collapseNotesPanel
}) {
    const handleSelectionSync = (itemId, origin) => {
        console.log('[Sync] Selection sync:', { itemId, origin });

        if (origin !== 'highlight' && getAppContext().pdfReader) {
            const highlightId = origin === 'mindmap' || origin === 'annotation'
                ? findCardById(itemId)?.highlightId
                : itemId;

            if (highlightId) {
                getAppContext().pdfReader.scrollToHighlight(highlightId);
            }
        }

        if (origin !== 'mindmap') {
            const cardId = origin === 'highlight'
                ? findCardByHighlightId(itemId)?.id
                : itemId;

            if (cardId) {
                window.dispatchEvent(new CustomEvent('highlight-selected', {
                    detail: { cardId }
                }));
            }
        }

        if (origin !== 'annotation') {
            const cardId = origin === 'highlight'
                ? findCardByHighlightId(itemId)?.id
                : itemId;

            if (cardId) {
                window.dispatchEvent(new CustomEvent('card-selected', {
                    detail: cardId
                }));
            }
        }
    };

    window.addEventListener('jump-to-source', (e) => {
        const { highlightId, cardId } = e.detail;
        handleSelectionSync(cardId || highlightId, 'mindmap');
    });

    window.addEventListener('annotation-selected', (e) => {
        handleSelectionSync(e.detail.cardId, 'annotation');
        if (isCompactLayout()) {
            collapseNotesPanel();
        }
    });

    window.addEventListener('highlight-clicked', (e) => {
        handleSelectionSync(e.detail.highlightId, 'highlight');
        if (isCompactLayout()) {
            collapseNotesPanel();
        }
    });
}
