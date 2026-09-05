import { describe, expect, it } from 'vitest';
import { buildGraphTree } from '../graph-view/graph-tree.js';

function createBoard(children) {
    return { children };
}

function cardNode(id, cardId) {
    return { id, type: 'geometry', shape: 'rectangle', data: { cardId } };
}

function arrowNode(id, sourceBoundId, targetBoundId) {
    return { id, type: 'arrow-line', source: { boundId: sourceBoundId }, target: { boundId: targetBoundId } };
}

const CARDS = {
    a: { id: 'a', sourceName: 'Paper A', content: 'Root excerpt', note: 'root note', color: '#ff0000' },
    b: { id: 'b', sourceName: 'Paper B', content: 'Child B excerpt' },
    c: { id: 'c', sourceName: '', content: '' },
    d: { id: 'd', sourceName: 'Paper D', content: 'Child D excerpt' }
};

function getCardById(id) {
    return CARDS[id] || null;
}

describe('buildGraphTree', () => {
    it('returns null without a root card id or when the card is missing entirely', () => {
        expect(buildGraphTree({ board: createBoard([]), getCardById, rootCardId: null })).toBeNull();
        expect(buildGraphTree({ board: createBoard([]), getCardById, rootCardId: 'ghost' })).toBeNull();
    });

    it('builds a root-only tree for a card that is not on the board', () => {
        const { tree } = buildGraphTree({ board: createBoard([]), getCardById, rootCardId: 'a' });

        expect(tree).toEqual({
            id: 'a',
            tag: 'Paper A',
            text: 'Root excerpt\n\nroot note',
            color: '#ff0000',
            children: []
        });
    });

    it('builds a single-node tree when the root has no outgoing arrows', () => {
        const board = createBoard([cardNode('el-a', 'a')]);
        const { tree } = buildGraphTree({ board, getCardById, rootCardId: 'a' });

        expect(tree).toEqual({
            id: 'a',
            tag: 'Paper A',
            text: 'Root excerpt\n\nroot note',
            color: '#ff0000',
            children: []
        });
    });

    it('traverses arrows directionally from the root', () => {
        const board = createBoard([
            cardNode('el-a', 'a'),
            cardNode('el-b', 'b'),
            cardNode('el-c', 'c'),
            cardNode('el-d', 'd'),
            arrowNode('edge-ab', 'el-a', 'el-b'),
            arrowNode('edge-bc', 'el-b', 'el-c'),
            arrowNode('edge-cd', 'el-c', 'el-d')
        ]);
        const { tree } = buildGraphTree({ board, getCardById, rootCardId: 'a' });

        expect(tree.id).toBe('a');
        expect(tree.children.map((c) => c.id)).toEqual(['b']);
        expect(tree.children[0].children.map((c) => c.id)).toEqual(['c']);
        expect(tree.children[0].children[0].children.map((c) => c.id)).toEqual(['d']);
    });

    it('never revisits nodes when the graph contains cycles', () => {
        const board = createBoard([
            cardNode('el-a', 'a'),
            cardNode('el-b', 'b'),
            arrowNode('edge-ab', 'el-a', 'el-b'),
            arrowNode('edge-ba', 'el-b', 'el-a')
        ]);
        const { tree } = buildGraphTree({ board, getCardById, rootCardId: 'a' });

        expect(tree.children.map((c) => c.id)).toEqual(['b']);
        expect(tree.children[0].children).toEqual([]);
    });

    it('keeps a node reachable through two paths only in the first branch', () => {
        const board = createBoard([
            cardNode('el-a', 'a'),
            cardNode('el-b', 'b'),
            cardNode('el-c', 'c'),
            arrowNode('edge-ab', 'el-a', 'el-b'),
            arrowNode('edge-ac', 'el-a', 'el-c'),
            arrowNode('edge-bc', 'el-b', 'el-c')
        ]);
        const { tree } = buildGraphTree({ board, getCardById, rootCardId: 'a' });

        const bNode = tree.children.find((c) => c.id === 'b');
        const cNode = tree.children.find((c) => c.id === 'c');
        expect(bNode.children.map((c) => c.id)).toEqual(['c']);
        expect(cNode.children).toEqual([]);
    });

    it('falls back to default tag and text for missing cards', () => {
        const board = createBoard([cardNode('el-x', 'missing')]);
        const { tree } = buildGraphTree({ board, getCardById, rootCardId: 'missing' });

        expect(tree.tag).toBe('标注');
        expect(tree.text).toBe('（无内容）');
    });
});
