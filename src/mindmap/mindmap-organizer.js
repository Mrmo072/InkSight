function parseDateOrder(value) {
    if (!value) {
        return Number.POSITIVE_INFINITY;
    }

    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function collectConnectedCardIds(children = []) {
    const cardIds = new Set();
    const nodeById = new Map();

    children.forEach((element) => {
        if ((element.type === 'geometry' || element.type === 'image') && element.data?.cardId) {
            nodeById.set(element.id, element.data.cardId);
        }
    });

    children.forEach((element) => {
        if (element.type !== 'arrow-line') {
            return;
        }

        const sourceCardId = nodeById.get(element.source?.boundId);
        const targetCardId = nodeById.get(element.target?.boundId);
        if (sourceCardId) {
            cardIds.add(sourceCardId);
        }
        if (targetCardId) {
            cardIds.add(targetCardId);
        }
    });

    return cardIds;
}

function buildSourceOrder(card) {
    return [
        card?.sourceName || card?.sourceId || '',
        parseDateOrder(card?.createdAt),
        card?.id || ''
    ];
}

function buildTimeOrder(card) {
    return [
        parseDateOrder(card?.createdAt),
        card?.sourceName || card?.sourceId || '',
        card?.id || ''
    ];
}

function buildLooseOrder(card, connectedCardIds) {
    return [
        connectedCardIds.has(card?.id) ? 1 : 0,
        card?.sourceName || card?.sourceId || '',
        parseDateOrder(card?.createdAt),
        card?.id || ''
    ];
}

export function createMindmapOrganizerOrderResolver({
    mode = 'source',
    children = [],
    getCardById
} = {}) {
    const connectedCardIds = collectConnectedCardIds(children);

    return (element) => {
        const cardId = element?.data?.cardId;
        if (!cardId) {
            return null;
        }

        const card = getCardById?.(cardId);
        if (!card) {
            return null;
        }

        if (mode === 'time') {
            return buildTimeOrder(card);
        }

        if (mode === 'loose') {
            return buildLooseOrder(card, connectedCardIds);
        }

        return buildSourceOrder(card);
    };
}
