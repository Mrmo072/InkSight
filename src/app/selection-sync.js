import { getAppContext } from './app-context.js';
import { registerEventListeners } from './event-listeners.js';

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

    return registerEventListeners([
        {
            target: window,
            event: 'jump-to-source',
            handler: (e) => {
                const { highlightId, cardId } = e.detail;
                handleSelectionSync(cardId || highlightId, 'mindmap');
            }
        },
        {
            target: window,
            event: 'annotation-selected',
            handler: (e) => {
                handleSelectionSync(e.detail.cardId, 'annotation');
                if (isCompactLayout()) {
                    collapseNotesPanel();
                }
            }
        },
        {
            target: window,
            event: 'highlight-clicked',
            handler: (e) => {
                handleSelectionSync(e.detail.highlightId, 'highlight');
                if (isCompactLayout()) {
                    collapseNotesPanel();
                }
            }
        }
    ]);
}
