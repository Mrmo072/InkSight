import { beforeEach, describe, expect, it } from 'vitest';
import { graphNodesStore } from '../graph-view/graph-nodes-store.js';

describe('GraphNodesStore', () => {
    beforeEach(() => {
        graphNodesStore.clear();
    });

    it('upserts nodes with sanitized fields', () => {
        const node = graphNodesStore.upsert({ id: 'n1', parentId: 'card-1', kind: 'ai', title: '  什么是力导向？  ', content: '回答' });

        expect(node.title).toBe('什么是力导向？');
        expect(node.kind).toBe('ai');
        expect(node.question).toBe('什么是力导向？');
        expect(node.titleCustomized).toBe(false);
        expect(graphNodesStore.get('n1').content).toBe('回答');
    });

    it('falls back to default title for blank input', () => {
        const node = graphNodesStore.upsert({ id: 'n2', parentId: 'card-1', title: '   ' });
        expect(node.title).toBe('延伸思考');
        expect(node.kind).toBe('manual');
    });

    it('records the owning root annotation and filters by it', () => {
        graphNodesStore.upsert({ id: 'a', parentId: 'card-1', rootCardId: 'root-1', title: 'A' });
        graphNodesStore.upsert({ id: 'b', parentId: 'card-1', rootCardId: 'root-2', title: 'B' });

        const scoped = graphNodesStore.getAll().filter((n) => n.rootCardId === 'root-1');
        expect(scoped.map((n) => n.id)).toEqual(['a']);
    });

    it('serializes and restores the node list', () => {
        graphNodesStore.upsert({ id: 'n1', parentId: 'card-1', title: 'A', content: 'x' });
        graphNodesStore.upsert({ id: 'n2', parentId: 'n1', title: 'B', content: 'y' });

        const data = graphNodesStore.getPersistenceData();
        expect(data.version).toBe(3);
        expect(data.nodes).toHaveLength(2);

        graphNodesStore.clear();
        expect(graphNodesStore.hasData()).toBe(false);
        graphNodesStore.restorePersistenceData(data);
        expect(graphNodesStore.get('n2').parentId).toBe('n1');
    });

    it('persists selected and expanded bubble state per graph root', () => {
        graphNodesStore.setSelectedNode('root-1', 'node-1');
        graphNodesStore.setExpandedNode('root-1', 'node-1', true);
        graphNodesStore.setExpandedNode('root-1', 'node-2', true);
        const data = graphNodesStore.getPersistenceData();

        graphNodesStore.clear();
        graphNodesStore.restorePersistenceData(data);

        expect(graphNodesStore.getViewState('root-1')).toEqual({
            selectedNodeId: 'node-1',
            expandedNodeIds: ['node-1', 'node-2']
        });
        expect(graphNodesStore.hasData()).toBe(true);
    });

    it('drops corrupted entries on restore', () => {
        graphNodesStore.restorePersistenceData({
            nodes: [{ id: 'ok', parentId: 'card-1', title: 'ok' }, { id: 'bad' }, null, { parentId: 'no-id' }]
        });
        expect(graphNodesStore.hasData()).toBe(true);
        expect(graphNodesStore.get('ok')).toBeTruthy();
        expect(graphNodesStore.get('bad')).toBeNull();
    });

    it('migrates version 1 AI titles into separate questions', () => {
        graphNodesStore.restorePersistenceData({
            version: 1,
            nodes: [{ id: 'legacy', parentId: 'card-1', kind: 'ai', title: '旧问题', content: '旧回答' }]
        });

        expect(graphNodesStore.get('legacy')).toMatchObject({
            title: '旧问题',
            question: '旧问题',
            titleCustomized: false,
            content: '旧回答'
        });
    });

    it('removes the whole subtree on removeSubtree', () => {
        graphNodesStore.upsert({ id: 'a', parentId: 'card-1', title: 'A' });
        graphNodesStore.upsert({ id: 'b', parentId: 'a', title: 'B' });
        graphNodesStore.upsert({ id: 'c', parentId: 'b', title: 'C' });
        graphNodesStore.upsert({ id: 'sibling', parentId: 'card-1', title: 'S' });

        const removed = graphNodesStore.removeSubtree('a');

        expect(removed.sort()).toEqual(['a', 'b', 'c']);
        expect(graphNodesStore.get('sibling')).toBeTruthy();
        expect(graphNodesStore.hasData()).toBe(true);
    });

    it('reattaches a subtree under a new parent', () => {
        graphNodesStore.upsert({ id: 'a', parentId: 'card-1', title: 'A' });
        graphNodesStore.upsert({ id: 'b', parentId: 'a', title: 'B' });

        const moved = graphNodesStore.reattachSubtree('a', 'card-2');

        expect(moved.map((n) => n.id).sort()).toEqual(['a', 'b']);
        expect(graphNodesStore.get('a').parentId).toBe('card-2');
        expect(graphNodesStore.get('b').parentId).toBe('a');
    });

    it('updates title and content of existing nodes', () => {
        graphNodesStore.upsert({ id: 'n', parentId: 'card-1', title: 'old' });
        graphNodesStore.setTitle('n', 'new title');
        graphNodesStore.setContent('n', 'new content');

        expect(graphNodesStore.get('n').title).toBe('new title');
        expect(graphNodesStore.get('n').content).toBe('new content');
        expect(graphNodesStore.setTitle('missing', 'x')).toBeNull();
    });

    it('keeps custom titles independent while questions continue to update', () => {
        graphNodesStore.upsert({ id: 'n', parentId: 'card-1', kind: 'ai', title: '原问题' });

        graphNodesStore.setQuestion('n', '第一次修改');
        expect(graphNodesStore.get('n').title).toBe('第一次修改');

        graphNodesStore.setTitle('n', '短标题');
        graphNodesStore.setQuestion('n', '完整的新问题');
        expect(graphNodesStore.get('n')).toMatchObject({
            title: '短标题',
            question: '完整的新问题',
            titleCustomized: true
        });

        graphNodesStore.resetTitleToQuestion('n');
        expect(graphNodesStore.get('n')).toMatchObject({
            title: '完整的新问题',
            titleCustomized: false
        });
    });
});
