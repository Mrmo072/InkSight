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

        expect(rootEdge).toHaveLength(3);
        expect(rootEdge[0][0]).toBeGreaterThan(rootRect.x + rootRect.width);
        expect(rootEdge[1][0]).toBeGreaterThan(rootEdge[0][0]);
        expect(rootEdge[rootEdge.length - 1][0]).toBeLessThan(childARect.x);
    });

    it('routes same-level extra edges through a sibling corridor instead of across the node stack', () => {
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
        const rootSubtreeRight = Math.max(
            nodeRects.get('root').x + nodeRects.get('root').width,
            nodeRects.get('child-a').x + nodeRects.get('child-a').width,
            nodeRects.get('child-b').x + nodeRects.get('child-b').width,
            nodeRects.get('child-c').x + nodeRects.get('child-c').width
        );

        expect(extraEdge).toHaveLength(4);
        expect(extraEdge[1][0]).toBeGreaterThan(rootSubtreeRight);
        expect(extraEdge[2][0]).toBeGreaterThan(rootSubtreeRight);
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

    it('routes sibling-to-sibling edges outside their parent subtree when a same-level link exists', () => {
        const children = [
            createNode('root', 420, 260),
            createNode('node-b', 160, 120),
            createNode('node-c', 160, 260),
            createNode('node-d', 160, 400),
            createEdge('edge-root-b', 'root', 'node-b'),
            createEdge('edge-root-c', 'root', 'node-c'),
            createEdge('edge-root-d', 'root', 'node-d'),
            createEdge('edge-b-c', 'node-b', 'node-c')
        ];

        const { nodeRects, edgeRoutes } = buildAutoLayoutPlan(children);
        const route = edgeRoutes.get('edge-b-c');
        const subtreeRight = Math.max(
            nodeRects.get('root').x + nodeRects.get('root').width,
            nodeRects.get('node-b').x + nodeRects.get('node-b').width,
            nodeRects.get('node-c').x + nodeRects.get('node-c').width,
            nodeRects.get('node-d').x + nodeRects.get('node-d').width
        );

        expect(route.points).toHaveLength(4);
        expect(route.points[1][0]).toBeGreaterThan(subtreeRight);
        expect(route.points[2][0]).toBeGreaterThan(subtreeRight);
        expect(route.sourceConnection[0]).toBe(1);
        expect(route.targetConnection[0]).toBe(1);
    });
});
