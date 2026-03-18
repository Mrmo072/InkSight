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

export function simplifyOrthogonalPoints(points) {
    if (!points || points.length < 2) return points;

    const snapped = points.map(([x, y]) => [x, y]);

    for (let i = 0; i < snapped.length - 1; i++) {
        const current = snapped[i];
        const next = snapped[i + 1];

        if (Math.abs(current[0] - next[0]) < 5) {
            next[0] = current[0];
        }

        if (Math.abs(current[1] - next[1]) < 5) {
            next[1] = current[1];
        }
    }

    const result = [snapped[0]];
    for (let i = 1; i < snapped.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = snapped[i];
        const next = snapped[i + 1];

        const isHorizontal = Math.abs(prev[1] - curr[1]) < 1 && Math.abs(curr[1] - next[1]) < 1;
        const isVertical = Math.abs(prev[0] - curr[0]) < 1 && Math.abs(curr[0] - next[0]) < 1;

        if (!isHorizontal && !isVertical) {
            result.push(curr);
        }
    }

    result.push(snapped[snapped.length - 1]);
    return result;
}

export function createLayoutGraph(children) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    children.forEach((element, index) => {
        if (element.type === 'geometry' || element.type === 'image') {
            const width = Math.abs(element.points[1][0] - element.points[0][0]);
            const height = Math.abs(element.points[1][1] - element.points[0][1]);
            nodes.push({
                id: element.id,
                width,
                height,
                _originalIndex: index
            });
            nodeMap.set(element.id, element);
            return;
        }

        if (element.type === 'arrow-line' && element.source?.boundId && element.target?.boundId) {
            edges.push({
                id: element.id,
                sources: [element.source.boundId],
                targets: [element.target.boundId],
                _originalIndex: index
            });
        }
    });

    return {
        nodeMap,
        graph: {
            id: 'root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': 'RIGHT',
                'elk.edgeRouting': 'ORTHOGONAL',
                'elk.spacing.nodeNode': '80',
                'elk.layered.spacing.nodeNodeBetweenLayers': '100',
                'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
                'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
                'elk.portConstraints': 'FIXED_SIDE',
                'elk.layered.mergeEdges': 'true',
                'elk.spacing.edgeNode': '20'
            },
            children: nodes,
            edges
        }
    };
}

export function extractEdgeSectionPoints(section) {
    const points = [[section.startPoint.x, section.startPoint.y]];

    if (section.bendPoints) {
        section.bendPoints.forEach((point) => {
            points.push([point.x, point.y]);
        });
    }

    points.push([section.endPoint.x, section.endPoint.y]);
    return points;
}
