import { ConnectingPosition, GlobalLayout, MindLayoutType } from '@plait/layouts';

export function createCenteredPoints(cx, cy, width, height) {
    return [
        [cx - width / 2, cy - height / 2],
        [cx + width / 2, cy + height / 2]
    ];
}

export function calculateNodeSize(text) {
    if (!text) return { width: 200, height: 120 };

    const MIN_WIDTH = 120;
    const MAX_WIDTH = 320;
    const PADDING_X = 32;
    const PADDING_Y = 32;
    const LINE_HEIGHT = 24;
    const CHAR_WIDTH_CN = 16;
    const CHAR_WIDTH_EN = 9;

    let visualLength = 0;
    for (const char of text) {
        visualLength += char.charCodeAt(0) > 255 ? CHAR_WIDTH_CN : CHAR_WIDTH_EN;
    }

    let width;
    let height;

    if (visualLength + PADDING_X <= MAX_WIDTH) {
        width = Math.max(MIN_WIDTH, visualLength + PADDING_X);
        height = LINE_HEIGHT + PADDING_Y;
    } else {
        width = MAX_WIDTH;
        const textWidth = MAX_WIDTH - PADDING_X;
        const lines = Math.ceil(visualLength / textWidth);
        height = lines * LINE_HEIGHT + PADDING_Y;
    }

    return {
        width: Math.round(width),
        height: Math.round(Math.max(height, 60))
    };
}

const NODE_HORIZONTAL_GAP = 56;
const NODE_VERTICAL_GAP = 26;
const COMPONENT_VERTICAL_GAP = 140;
const OUTER_EDGE_LANE_GAP = 56;
const OUTER_EDGE_MARGIN = 96;
const EXTRA_EDGE_EXIT = 40;
const DETACHED_PORT_OFFSET = 16;
const PORT_SLOT_SPACING = 10;
const PORT_EDGE_MARGIN = 10;
const GRID_GAP_X = 72;
const GRID_GAP_Y = 56;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getRectFromElement(element) {
    if (!element?.points || element.points.length < 2) {
        return null;
    }

    const [p1, p2] = element.points;
    const left = Math.min(p1[0], p2[0]);
    const right = Math.max(p1[0], p2[0]);
    const top = Math.min(p1[1], p2[1]);
    const bottom = Math.max(p1[1], p2[1]);

    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
    };
}

function getRectBounds(rect) {
    return {
        left: rect.x,
        right: rect.x + rect.width,
        top: rect.y,
        bottom: rect.y + rect.height
    };
}

function getConnectionRatio(rect, y) {
    if (!rect.height) {
        return 0.5;
    }

    return clamp((y - rect.y) / rect.height, 0, 1);
}

function getRectCenter(rect) {
    return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
    };
}

function getBoundsFromRects(rects) {
    const values = Array.from(rects.values());
    if (values.length === 0) {
        return null;
    }

    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    values.forEach((rect) => {
        const bounds = getRectBounds(rect);
        left = Math.min(left, bounds.left);
        right = Math.max(right, bounds.right);
        top = Math.min(top, bounds.top);
        bottom = Math.max(bottom, bounds.bottom);
    });

    return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top
    };
}

function compareSortValues(valueA, valueB) {
    const maxLength = Math.max(valueA.length, valueB.length);

    for (let index = 0; index < maxLength; index++) {
        const left = valueA[index];
        const right = valueB[index];

        if (left === right) {
            continue;
        }

        if (left === undefined) {
            return 1;
        }

        if (right === undefined) {
            return -1;
        }

        if (typeof left === 'number' && typeof right === 'number') {
            return left - right;
        }

        return String(left).localeCompare(String(right));
    }

    return 0;
}

function createNodeSortValue(nodeId, nodesById, nodeOrderMap) {
    const node = nodesById.get(nodeId);
    const metadataOrder = nodeOrderMap.get(nodeId);
    const metadataPrefix = metadataOrder ? [0, ...metadataOrder] : [1];

    return [
        ...metadataPrefix,
        node.rect.y,
        node.rect.x,
        nodeId
    ];
}

function sortNodeIds(ids, nodesById, nodeOrderMap) {
    return [...ids].sort((a, b) => {
        return compareSortValues(
            createNodeSortValue(a, nodesById, nodeOrderMap),
            createNodeSortValue(b, nodesById, nodeOrderMap)
        );
    });
}

function collectBoardGraph(children, options = {}) {
    const nodesById = new Map();
    const edges = [];
    const nodeOrderMap = new Map();

    children.forEach((element) => {
        if (element.type === 'geometry' || element.type === 'image') {
            const rect = getRectFromElement(element);
            if (!rect) {
                return;
            }

            nodesById.set(element.id, {
                id: element.id,
                rect
            });
            if (typeof options.getNodeOrder === 'function') {
                const order = options.getNodeOrder(element);
                if (Array.isArray(order) && order.length > 0) {
                    nodeOrderMap.set(element.id, order);
                }
            }
            return;
        }

        if (element.type === 'arrow-line' && element.source?.boundId && element.target?.boundId) {
            edges.push({
                id: element.id,
                sourceId: element.source.boundId,
                targetId: element.target.boundId
            });
        }
    });

    return { nodesById, edges, nodeOrderMap };
}

function buildForest(nodesById, edges, nodeOrderMap) {
    const outgoing = new Map();
    const incomingCount = new Map();
    const treeChildren = new Map();
    const treeEdgeIds = new Set();
    const parentById = new Map();
    const depthById = new Map();
    const roots = [];
    const visited = new Set();
    const nodeIds = Array.from(nodesById.keys());

    nodeIds.forEach((nodeId) => {
        outgoing.set(nodeId, []);
        incomingCount.set(nodeId, 0);
        treeChildren.set(nodeId, []);
    });

    edges.forEach((edge) => {
        if (!nodesById.has(edge.sourceId) || !nodesById.has(edge.targetId) || edge.sourceId === edge.targetId) {
            return;
        }

        outgoing.get(edge.sourceId).push(edge);
        incomingCount.set(edge.targetId, (incomingCount.get(edge.targetId) || 0) + 1);
    });

    outgoing.forEach((edgeList) => {
        edgeList.sort((edgeA, edgeB) => {
            return compareSortValues(
                createNodeSortValue(edgeA.targetId, nodesById, nodeOrderMap),
                createNodeSortValue(edgeB.targetId, nodesById, nodeOrderMap)
            );
        });
    });

    const sortedNodeIds = sortNodeIds(nodeIds, nodesById, nodeOrderMap);
    const zeroIndegreeRoots = sortedNodeIds.filter((nodeId) => (incomingCount.get(nodeId) || 0) === 0);

    const traverseFromRoot = (rootId) => {
        if (visited.has(rootId)) {
            return;
        }

        roots.push(rootId);
        const queue = [rootId];
        visited.add(rootId);
        parentById.set(rootId, null);
        depthById.set(rootId, 0);

        while (queue.length > 0) {
            const currentId = queue.shift();
            const nextEdges = outgoing.get(currentId) || [];
            const currentDepth = depthById.get(currentId) || 0;

            nextEdges.forEach((edge) => {
                if (visited.has(edge.targetId)) {
                    return;
                }

                visited.add(edge.targetId);
                treeEdgeIds.add(edge.id);
                treeChildren.get(currentId).push(edge.targetId);
                parentById.set(edge.targetId, currentId);
                depthById.set(edge.targetId, currentDepth + 1);
                queue.push(edge.targetId);
            });
        }
    };

    zeroIndegreeRoots.forEach(traverseFromRoot);

    sortNodeIds(nodeIds.filter((nodeId) => !visited.has(nodeId)), nodesById, nodeOrderMap).forEach((nodeId) => {
        traverseFromRoot(nodeId);
    });

    return {
        roots,
        treeChildren,
        treeEdgeIds,
        parentById,
        depthById
    };
}

function buildOriginNode(nodeId, treeChildren, nodesById) {
    const node = nodesById.get(nodeId);
    const children = (treeChildren.get(nodeId) || []).map((childId) => buildOriginNode(childId, treeChildren, nodesById));

    return {
        id: nodeId,
        width: node.rect.width,
        height: node.rect.height,
        rightNodeCount: children.length,
        children
    };
}

function createLayoutOptions() {
    return {
        getWidth: (node) => node.width,
        getHeight: (node) => node.height,
        getHorizontalGap: (_node, parent) => parent ? NODE_HORIZONTAL_GAP : 0,
        getVerticalGap: (_node, parent) => parent ? NODE_VERTICAL_GAP : 0,
        getVerticalConnectingPosition: () => ConnectingPosition.middle,
        getExtendHeight: () => 0,
        getIndentedCrossLevelGap: () => 0
    };
}

function getSubtreeWeight(nodeId, treeChildren) {
    const children = treeChildren.get(nodeId) || [];
    return 1 + children.reduce((sum, childId) => sum + getSubtreeWeight(childId, treeChildren), 0);
}

function createVirtualRoot(rootId, childIds, treeChildren, nodesById) {
    const rootRect = nodesById.get(rootId).rect;
    return {
        id: rootId,
        width: rootRect.width,
        height: rootRect.height,
        rightNodeCount: childIds.length,
        children: childIds.map((childId) => buildOriginNode(childId, treeChildren, nodesById))
    };
}

function normalizeLayoutRects(layoutTree, nodesById, offsetX = 0, offsetY = 0) {
    const bounds = layoutTree.getBoundingBox();
    layoutTree.translate(offsetX - bounds.left, offsetY - bounds.top);

    const rects = new Map();
    layoutTree.eachNode((layoutNode) => {
        const originalNode = nodesById.get(layoutNode.origin.id);
        rects.set(layoutNode.origin.id, {
            x: layoutNode.x + layoutNode.hGap,
            y: layoutNode.y + layoutNode.vGap,
            width: originalNode.rect.width,
            height: originalNode.rect.height
        });
    });

    return {
        rects,
        bounds: getBoundsFromRects(rects)
    };
}

function mergeRects(...rectMaps) {
    const merged = new Map();
    rectMaps.forEach((rectMap) => {
        rectMap.forEach((rect, id) => {
            merged.set(id, rect);
        });
    });
    return merged;
}

function getDistributedSlot(index, count, center, spacing = 18) {
    if (count <= 1) {
        return center;
    }

    return center + (index - (count - 1) / 2) * spacing;
}

function getClampedPortY(rect, index, count) {
    const centerY = rect.y + rect.height / 2;
    const raw = getDistributedSlot(index, count, centerY, PORT_SLOT_SPACING);
    const minY = rect.y + PORT_EDGE_MARGIN;
    const maxY = rect.y + rect.height - PORT_EDGE_MARGIN;
    return clamp(raw, minY, maxY);
}

function splitRootChildren(rootId, treeChildren) {
    const childIds = [...(treeChildren.get(rootId) || [])];
    const weights = childIds.map((childId) => getSubtreeWeight(childId, treeChildren));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    let bestCut = Math.max(1, Math.floor(childIds.length / 2));
    let bestDelta = Number.POSITIVE_INFINITY;
    let runningWeight = 0;

    for (let index = 0; index < childIds.length - 1; index++) {
        runningWeight += weights[index];
        const delta = Math.abs(totalWeight / 2 - runningWeight);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestCut = index + 1;
        }
    }

    const leftChildren = childIds.slice(0, bestCut);
    const rightChildren = childIds.slice(bestCut);

    return { leftChildren, rightChildren };
}

function layoutSingleRootMindmap(rootId, treeChildren, nodesById) {
    const rootRect = nodesById.get(rootId).rect;
    const { leftChildren, rightChildren } = splitRootChildren(rootId, treeChildren);
    const rootPosition = {
        x: 0,
        y: 0,
        width: rootRect.width,
        height: rootRect.height
    };

    let leftRects = new Map();
    let rightRects = new Map();

    if (rightChildren.length > 0) {
        const rightTree = GlobalLayout.layout(
            createVirtualRoot(rootId, rightChildren, treeChildren, nodesById),
            createLayoutOptions(),
            MindLayoutType.right
        );
        rightRects = normalizeLayoutRects(rightTree, nodesById).rects;
    }

    if (leftChildren.length > 0) {
        const leftTree = GlobalLayout.layout(
            createVirtualRoot(rootId, leftChildren, treeChildren, nodesById),
            createLayoutOptions(),
            MindLayoutType.left
        );
        leftRects = normalizeLayoutRects(leftTree, nodesById).rects;
    }

    rightRects.delete(rootId);
    leftRects.delete(rootId);

    const rightBounds = getBoundsFromRects(rightRects);
    const leftBounds = getBoundsFromRects(leftRects);
    const rightOffsetX = rootRect.width + NODE_HORIZONTAL_GAP;
    const leftOffsetX = leftBounds ? -(leftBounds.width + NODE_HORIZONTAL_GAP + rootRect.width) : 0;

    if (rightRects.size > 0) {
        rightRects = translateRects(rightRects, rightOffsetX, 0);
    }

    if (leftRects.size > 0) {
        leftRects = translateRects(leftRects, leftOffsetX, 0);
    }

    const branchCenters = [];
    const shiftedLeftBounds = getBoundsFromRects(leftRects);
    const shiftedRightBounds = getBoundsFromRects(rightRects);
    if (shiftedLeftBounds) {
        branchCenters.push((shiftedLeftBounds.top + shiftedLeftBounds.bottom) / 2);
    }
    if (shiftedRightBounds) {
        branchCenters.push((shiftedRightBounds.top + shiftedRightBounds.bottom) / 2);
    }

    const targetCenterY = branchCenters.length > 0
        ? branchCenters.reduce((sum, value) => sum + value, 0) / branchCenters.length
        : rootRect.height / 2;

    const rootCenteredRect = {
        ...rootPosition,
        y: targetCenterY - rootRect.height / 2
    };

    return mergeRects(
        new Map([[rootId, rootCenteredRect]]),
        leftRects,
        rightRects
    );
}

function layoutForest(roots, treeChildren, nodesById) {
    const rects = new Map();
    let currentTop = 0;

    roots.forEach((rootId) => {
        const originRoot = buildOriginNode(rootId, treeChildren, nodesById);
        const componentRects = normalizeLayoutRects(
            GlobalLayout.layout(originRoot, createLayoutOptions(), MindLayoutType.right),
            nodesById
        ).rects;
        const bounds = getBoundsFromRects(componentRects);

        const shiftedRects = translateRects(componentRects, 0, currentTop - bounds.top);
        shiftedRects.forEach((rect, id) => {
            rects.set(id, rect);
        });

        currentTop += bounds.height + COMPONENT_VERTICAL_GAP;
    });

    return rects;
}

function translateRects(rects, deltaX, deltaY) {
    const translated = new Map();

    rects.forEach((rect, id) => {
        translated.set(id, {
            ...rect,
            x: rect.x + deltaX,
            y: rect.y + deltaY
        });
    });

    return translated;
}

function layoutNodesInGrid(nodesById) {
    const rects = new Map();
    const nodeIds = sortNodeIds(Array.from(nodesById.keys()), nodesById, new Map());
    const columnCount = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
    const maxWidth = nodeIds.reduce((result, nodeId) => Math.max(result, nodesById.get(nodeId).rect.width), 0);
    const maxHeight = nodeIds.reduce((result, nodeId) => Math.max(result, nodesById.get(nodeId).rect.height), 0);

    nodeIds.forEach((nodeId, index) => {
        const node = nodesById.get(nodeId);
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);

        rects.set(nodeId, {
            x: column * (maxWidth + GRID_GAP_X),
            y: row * (maxHeight + GRID_GAP_Y),
            width: node.rect.width,
            height: node.rect.height
        });
    });

    return rects;
}

function getHorizontalConnectionEndpoints(sourceRect, targetRect) {
    const sourceBounds = getRectBounds(sourceRect);
    const targetBounds = getRectBounds(targetRect);
    const sourceCenterY = sourceRect.y + sourceRect.height / 2;
    const targetCenterY = targetRect.y + targetRect.height / 2;
    const targetIsOnRight = targetBounds.left >= sourceBounds.right || targetRect.x >= sourceRect.x;

    return targetIsOnRight
        ? {
            start: [sourceBounds.right, sourceCenterY],
            end: [targetBounds.left, targetCenterY],
            sourceAnchor: [1, 0.5],
            targetAnchor: [0, 0.5]
        }
        : {
            start: [sourceBounds.left, sourceCenterY],
            end: [targetBounds.right, targetCenterY],
            sourceAnchor: [0, 0.5],
            targetAnchor: [1, 0.5]
        };
}

function routeTreeEdge(sourceRect, targetRect, siblingIndex = 0, siblingCount = 1) {
    const { start, end, sourceAnchor, targetAnchor } = getHorizontalConnectionEndpoints(sourceRect, targetRect);
    const sourceSlotY = getClampedPortY(sourceRect, siblingIndex, siblingCount);
    const targetSlotY = getClampedPortY(targetRect, siblingIndex, siblingCount);
    const direction = Math.sign(end[0] - start[0]) || 1;
    const detachedStart = [start[0] + DETACHED_PORT_OFFSET * direction, sourceSlotY];
    const detachedEnd = [end[0] - DETACHED_PORT_OFFSET * direction, targetSlotY];
    const horizontalGap = Math.abs(detachedEnd[0] - detachedStart[0]);
    const midpointX = detachedStart[0] + direction * Math.max(18, horizontalGap * 0.52);
    const spreadOffset = (siblingIndex - (siblingCount - 1) / 2) * 3;
    const midpointY = ((sourceSlotY + targetSlotY) / 2) + spreadOffset;

    return {
        points: [
            detachedStart,
            [midpointX, midpointY],
            detachedEnd
        ],
        sourceConnection: [sourceAnchor[0], getConnectionRatio(sourceRect, sourceSlotY)],
        targetConnection: [targetAnchor[0], getConnectionRatio(targetRect, targetSlotY)]
    };
}

function routeOuterCurve(sourceRect, targetRect, laneY) {
    const { start, end, sourceAnchor, targetAnchor } = getHorizontalConnectionEndpoints(sourceRect, targetRect);
    const direction = Math.sign(end[0] - start[0]) || 1;
    const detachedStart = [start[0] + DETACHED_PORT_OFFSET * direction, start[1]];
    const detachedEnd = [end[0] - DETACHED_PORT_OFFSET * direction, end[1]];
    const approachX = EXTRA_EDGE_EXIT * 0.9;
    const laneLift = (laneY - ((detachedStart[1] + detachedEnd[1]) / 2)) * 0.92;

    return {
        points: [
            detachedStart,
            [detachedStart[0] + approachX * direction, detachedStart[1] + laneLift * 0.45],
            [detachedEnd[0] - approachX * direction, detachedEnd[1] + laneLift * 0.45],
            detachedEnd
        ],
        sourceConnection: [sourceAnchor[0], getConnectionRatio(sourceRect, start[1])],
        targetConnection: [targetAnchor[0], getConnectionRatio(targetRect, end[1])]
    };
}

function routeSiblingCurve(sourceRect, targetRect, laneX, siblingIndex = 0, siblingCount = 1) {
    const sourceBounds = getRectBounds(sourceRect);
    const targetBounds = getRectBounds(targetRect);
    const useRightSide = laneX >= Math.max(sourceBounds.right, targetBounds.right);
    const sourceSlotY = getClampedPortY(sourceRect, siblingIndex, siblingCount);
    const targetSlotY = getClampedPortY(targetRect, siblingIndex, siblingCount);
    const side = useRightSide ? 1 : 0;
    const sourceX = useRightSide ? sourceBounds.right : sourceBounds.left;
    const targetX = useRightSide ? targetBounds.right : targetBounds.left;
    const direction = useRightSide ? 1 : -1;
    const detachedStart = [sourceX + DETACHED_PORT_OFFSET * direction, sourceSlotY];
    const detachedEnd = [targetX + DETACHED_PORT_OFFSET * direction, targetSlotY];
    const laneBendX = laneX - direction * 6;

    return {
        points: [
            detachedStart,
            [laneBendX, sourceSlotY],
            [laneBendX, targetSlotY],
            detachedEnd
        ],
        sourceConnection: [side, getConnectionRatio(sourceRect, sourceSlotY)],
        targetConnection: [side, getConnectionRatio(targetRect, targetSlotY)]
    };
}

function buildChildIndexMap(treeChildren) {
    const childIndexMap = new Map();

    treeChildren.forEach((childIds, parentId) => {
        childIds.forEach((childId, index) => {
            childIndexMap.set(`${parentId}::${childId}`, {
                index,
                count: childIds.length
            });
        });
    });

    return childIndexMap;
}

function buildSubtreeBounds(rects, roots, treeChildren) {
    const subtreeBounds = new Map();

    const visit = (nodeId) => {
        const ownRect = rects.get(nodeId);
        if (!ownRect) {
            return null;
        }

        let bounds = getRectBounds(ownRect);
        (treeChildren.get(nodeId) || []).forEach((childId) => {
            const childBounds = visit(childId);
            if (!childBounds) {
                return;
            }

            bounds = {
                left: Math.min(bounds.left, childBounds.left),
                right: Math.max(bounds.right, childBounds.right),
                top: Math.min(bounds.top, childBounds.top),
                bottom: Math.max(bounds.bottom, childBounds.bottom)
            };
        });

        subtreeBounds.set(nodeId, bounds);
        return bounds;
    };

    roots.forEach((rootId) => {
        visit(rootId);
    });

    return subtreeBounds;
}

function routeEdges(edges, rects, treeEdgeIds, treeChildren, roots, parentById, depthById) {
    const routes = new Map();
    const bounds = getBoundsFromRects(rects);
    const childIndexMap = buildChildIndexMap(treeChildren);
    const subtreeBounds = buildSubtreeBounds(rects, roots, treeChildren);

    if (!bounds) {
        return routes;
    }

    let upperLaneIndex = 0;
    let lowerLaneIndex = 0;
    const siblingLaneOffsets = new Map();
    const centerY = bounds.top + bounds.height / 2;

    edges.forEach((edge) => {
        const sourceRect = rects.get(edge.sourceId);
        const targetRect = rects.get(edge.targetId);

        if (!sourceRect || !targetRect) {
            return;
        }

        if (treeEdgeIds.has(edge.id)) {
            const sourceInfo = childIndexMap.get(`${edge.sourceId}::${edge.targetId}`) || { index: 0, count: 1 };

            routes.set(
                edge.id,
                routeTreeEdge(
                    sourceRect,
                    targetRect,
                    sourceInfo.index,
                    sourceInfo.count
                )
            );
            return;
        }

        const sourceParentId = parentById.get(edge.sourceId) ?? null;
        const targetParentId = parentById.get(edge.targetId) ?? null;
        const sourceDepth = depthById.get(edge.sourceId) ?? 0;
        const targetDepth = depthById.get(edge.targetId) ?? 0;
        const sharedParent = sourceParentId && sourceParentId === targetParentId;
        const sameDepth = sourceDepth === targetDepth;

        if (sharedParent || sameDepth) {
            const laneKey = sharedParent ? `parent:${sourceParentId}` : `depth:${sourceDepth}`;
            const laneIndex = siblingLaneOffsets.get(laneKey) || 0;
            siblingLaneOffsets.set(laneKey, laneIndex + 1);

            const corridorBounds = sharedParent
                ? subtreeBounds.get(sourceParentId)
                : {
                    left: Math.min(
                        subtreeBounds.get(edge.sourceId)?.left ?? sourceRect.x,
                        subtreeBounds.get(edge.targetId)?.left ?? targetRect.x
                    ),
                    right: Math.max(
                        subtreeBounds.get(edge.sourceId)?.right ?? (sourceRect.x + sourceRect.width),
                        subtreeBounds.get(edge.targetId)?.right ?? (targetRect.x + targetRect.width)
                    )
                };
            const laneX = (corridorBounds?.right ?? bounds.right) + OUTER_EDGE_MARGIN + laneIndex * OUTER_EDGE_LANE_GAP;
            const laneSourceInfo = {
                index: Math.min(laneIndex, 2),
                count: Math.max(2, Math.min((treeChildren.get(sourceParentId) || []).length, 4))
            };

            routes.set(edge.id, routeSiblingCurve(
                sourceRect,
                targetRect,
                laneX,
                laneSourceInfo.index,
                laneSourceInfo.count
            ));
            return;
        }

        const sourceCenter = getRectCenter(sourceRect);
        const targetCenter = getRectCenter(targetRect);
        const averageY = (sourceCenter.y + targetCenter.y) / 2;

        if (averageY <= centerY) {
            const laneY = bounds.top - OUTER_EDGE_MARGIN - upperLaneIndex * OUTER_EDGE_LANE_GAP;
            upperLaneIndex += 1;
            routes.set(edge.id, routeOuterCurve(sourceRect, targetRect, laneY));
        } else {
            const laneY = bounds.bottom + OUTER_EDGE_MARGIN + lowerLaneIndex * OUTER_EDGE_LANE_GAP;
            lowerLaneIndex += 1;
            routes.set(edge.id, routeOuterCurve(sourceRect, targetRect, laneY));
        }
    });

    return routes;
}

export function buildAutoLayoutPlan(children, options = {}) {
    const { nodesById, edges, nodeOrderMap } = collectBoardGraph(children, options);

    if (nodesById.size === 0) {
        return {
            nodeRects: new Map(),
            edgeRoutes: new Map()
        };
    }

    const currentBounds = getBoundsFromRects(new Map(Array.from(nodesById.entries()).map(([id, node]) => [id, node.rect])));
    if (edges.length === 0) {
        const laidOutRects = layoutNodesInGrid(nodesById);
        const newBounds = getBoundsFromRects(laidOutRects);
        let centeredRects = laidOutRects;

        if (currentBounds && newBounds) {
            const deltaX = currentBounds.left + currentBounds.width / 2 - (newBounds.left + newBounds.width / 2);
            const deltaY = currentBounds.top + currentBounds.height / 2 - (newBounds.top + newBounds.height / 2);
            centeredRects = translateRects(laidOutRects, deltaX, deltaY);
        }

        return {
            nodeRects: centeredRects,
            edgeRoutes: new Map()
        };
    }

    const { roots, treeChildren, treeEdgeIds, parentById, depthById } = buildForest(nodesById, edges, nodeOrderMap);
    const laidOutRects = layoutForest(roots, treeChildren, nodesById);
    const newBounds = getBoundsFromRects(laidOutRects);

    let centeredRects = laidOutRects;
    if (currentBounds && newBounds) {
        const deltaX = currentBounds.left + currentBounds.width / 2 - (newBounds.left + newBounds.width / 2);
        const deltaY = currentBounds.top + currentBounds.height / 2 - (newBounds.top + newBounds.height / 2);
        centeredRects = translateRects(laidOutRects, deltaX, deltaY);
    }

    return {
        nodeRects: centeredRects,
        edgeRoutes: routeEdges(edges, centeredRects, treeEdgeIds, treeChildren, roots, parentById, depthById)
    };
}
