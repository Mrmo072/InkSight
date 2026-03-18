import { describe, expect, it } from 'vitest';
import { buildAutoLayoutPlan } from '../drawnix-board-utils.js';

function createNode(id, x, y, width = 120, height = 60) {
    return {
        id,
        type: 'geometry',
        points: [[x, y], [x + width, y + height]]
    };
}

function createEdge(id, sourceId, targetId) {
    return {
        id,
        type: 'arrow-line',
        points: [],
        source: { boundId: sourceId },
        target: { boundId: targetId }
    };
}

describe('buildAutoLayoutPlan', () => {
    it('lays out a single-root mind map as a clean one-sided tree', () => {
        const children = [
            createNode('root', 420, 260),
            createNode('child-a', 140, 120),
            createNode('child-b', 180, 240),
            createNode('child-c', 160, 360),
            createNode('grandchild-c', 80, 460),
            createEdge('edge-root-a', 'root', 'child-a'),
            createEdge('edge-root-b', 'root', 'child-b'),
            createEdge('edge-root-c', 'root', 'child-c'),
            createEdge('edge-c-grandchild', 'child-c', 'grandchild-c')
        ];

        const { nodeRects, edgeRoutes } = buildAutoLayoutPlan(children);
        const rootRect = nodeRects.get('root');
        const childRects = ['child-a', 'child-b', 'child-c'].map((id) => nodeRects.get(id));
        const rightCount = childRects.filter((rect) => rect.x >= rootRect.x + rootRect.width).length;
        const outwardEdge = ['edge-root-a', 'edge-root-b', 'edge-root-c']
            .map((id) => edgeRoutes.get(id)?.points)
            .find((points) => points[0][0] > rootRect.x + rootRect.width);

        expect(rightCount).toBeGreaterThan(0);
        expect(outwardEdge).toBeTruthy();
        expect(outwardEdge[outwardEdge.length - 1][0]).toBeGreaterThan(rootRect.x + rootRect.width);
    });

    it('arranges connected nodes into a readable outward tree and routes tree edges without horizontal backtracking', () => {
        const children = [
            createNode('root', 420, 220),
            createNode('child-a', 120, 80),
            createNode('child-b', 140, 360),
            createNode('grandchild', 40, 460),
            createEdge('edge-root-a', 'root', 'child-a'),
            createEdge('edge-root-b', 'root', 'child-b'),
            createEdge('edge-b-grandchild', 'child-b', 'grandchild')
        ];

        const { nodeRects, edgeRoutes } = buildAutoLayoutPlan(children);
        const rootRect = nodeRects.get('root');
        const childARect = nodeRects.get('child-a');
        const childBRect = nodeRects.get('child-b');
        const grandchildRect = nodeRects.get('grandchild');
        const rootEdge = edgeRoutes.get('edge-root-a').points;

        expect(childARect.x).toBeGreaterThan(rootRect.x + rootRect.width);
        expect(childBRect.x).toBeGreaterThan(rootRect.x + rootRect.width);
        expect(grandchildRect.x).toBeGreaterThan(childBRect.x + childBRect.width);

        expect(rootEdge).toHaveLength(4);
        expect(rootEdge[0][0]).toBeGreaterThan(rootRect.x + rootRect.width);
        expect(rootEdge[1][0]).toBeGreaterThan(rootEdge[0][0]);
        expect(rootEdge[rootEdge.length - 1][0]).toBeLessThan(childARect.x);
    });

    it('pushes non-tree edges to outer lanes so they avoid the node cluster', () => {
        const children = [
            createNode('root', 400, 220),
            createNode('child-a', 180, 120),
            createNode('child-b', 180, 320),
            createNode('child-c', 180, 520),
            createEdge('edge-root-a', 'root', 'child-a'),
            createEdge('edge-root-b', 'root', 'child-b'),
            createEdge('edge-root-c', 'root', 'child-c'),
            createEdge('edge-extra', 'child-a', 'child-c')
        ];

        const { nodeRects, edgeRoutes } = buildAutoLayoutPlan(children);
        const extraEdge = edgeRoutes.get('edge-extra').points;
        const bounds = Array.from(nodeRects.values()).reduce((acc, rect) => ({
            top: Math.min(acc.top, rect.y),
            bottom: Math.max(acc.bottom, rect.y + rect.height)
        }), { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });

        expect(extraEdge).toHaveLength(6);
        const laneY = extraEdge[2][1];
        expect(laneY < bounds.top || laneY > bounds.bottom).toBe(true);
    });

    it('sorts sibling branches by provided document order instead of current canvas position', () => {
        const children = [
            {
                ...createNode('root', 420, 260),
                data: { cardId: 'root-card' }
            },
            {
                ...createNode('parent', 260, 260),
                data: { cardId: 'parent-card' }
            },
            {
                ...createNode('child-early', 180, 380),
                data: { cardId: 'early-card' }
            },
            {
                ...createNode('child-late', 180, 120),
                data: { cardId: 'late-card' }
            },
            createEdge('edge-root-parent', 'root', 'parent'),
            createEdge('edge-parent-early', 'parent', 'child-early'),
            createEdge('edge-parent-late', 'parent', 'child-late')
        ];

        const { nodeRects } = buildAutoLayoutPlan(children, {
            getNodeOrder: (element) => {
                const cardId = element.data?.cardId;
                if (cardId === 'parent-card') {
                    return ['doc-1', 0, 0.5];
                }
                if (cardId === 'early-card') {
                    return ['doc-1', 1, 0.1];
                }
                if (cardId === 'late-card') {
                    return ['doc-1', 3, 0.8];
                }
                return ['doc-1', 0, 0];
            }
        });

        expect(nodeRects.get('child-early').y).toBeLessThan(nodeRects.get('child-late').y);
    });

    it('keeps sibling edge bundles monotonic from top to bottom', () => {
        const children = [
            createNode('root', 420, 260),
            createNode('child-a', 160, 120),
            createNode('child-b', 160, 240),
            createNode('child-c', 160, 360),
            createEdge('edge-root-a', 'root', 'child-a'),
            createEdge('edge-root-b', 'root', 'child-b'),
            createEdge('edge-root-c', 'root', 'child-c')
        ];

        const { edgeRoutes } = buildAutoLayoutPlan(children, {
            getNodeOrder: (element) => {
                const key = element.id;
                if (key === 'child-a') return ['doc-1', 1];
                if (key === 'child-b') return ['doc-1', 2];
                if (key === 'child-c') return ['doc-1', 3];
                return ['doc-1', 0];
            }
        });

        const startYs = ['edge-root-a', 'edge-root-b', 'edge-root-c']
            .map((id) => edgeRoutes.get(id).points[0][1]);

        expect(startYs[0]).toBeLessThan(startYs[1]);
        expect(startYs[1]).toBeLessThan(startYs[2]);
    });
});
