import { describe, expect, it } from 'vitest';
import { createMindmapOrganizerOrderResolver } from '../mindmap-organizer.js';

describe('mindmap-organizer', () => {
    const cards = new Map([
        ['card-a', { id: 'card-a', sourceName: 'Beta.pdf', createdAt: '2026-04-17T09:00:00.000Z' }],
        ['card-b', { id: 'card-b', sourceName: 'Alpha.pdf', createdAt: '2026-04-17T10:00:00.000Z' }],
        ['card-c', { id: 'card-c', sourceName: 'Alpha.pdf', createdAt: '2026-04-17T08:00:00.000Z' }]
    ]);

    const children = [
        { id: 'node-a', type: 'geometry', data: { cardId: 'card-a' } },
        { id: 'node-b', type: 'geometry', data: { cardId: 'card-b' } },
        { id: 'node-c', type: 'geometry', data: { cardId: 'card-c' } },
        { id: 'edge-1', type: 'arrow-line', source: { boundId: 'node-a' }, target: { boundId: 'node-b' } }
    ];

    it('orders nodes by source name for source mode', () => {
        const resolveOrder = createMindmapOrganizerOrderResolver({
            mode: 'source',
            children,
            getCardById: (id) => cards.get(id)
        });

        expect(resolveOrder(children[1])).toEqual(['Alpha.pdf', Date.parse('2026-04-17T10:00:00.000Z'), 'card-b']);
    });

    it('orders nodes by createdAt for time mode', () => {
        const resolveOrder = createMindmapOrganizerOrderResolver({
            mode: 'time',
            children,
            getCardById: (id) => cards.get(id)
        });

        expect(resolveOrder(children[2])).toEqual([Date.parse('2026-04-17T08:00:00.000Z'), 'Alpha.pdf', 'card-c']);
    });

    it('pushes disconnected cards ahead in loose mode', () => {
        const resolveOrder = createMindmapOrganizerOrderResolver({
            mode: 'loose',
            children,
            getCardById: (id) => cards.get(id)
        });

        expect(resolveOrder(children[2])[0]).toBe(0);
        expect(resolveOrder(children[0])[0]).toBe(1);
    });
});
