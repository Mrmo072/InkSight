export function findHighlightById(highlights, highlightId) {
    if (!Array.isArray(highlights) || !highlightId) {
        return null;
    }

    return highlights.find((highlight) => highlight.id === highlightId) ?? null;
}

export function getIntersectionArea(rect1, rect2) {
    const x1 = Math.max(rect1.left, rect2.left);
    const y1 = Math.max(rect1.top, rect2.top);
    const x2 = Math.min(rect1.left + rect1.width, rect2.left + rect2.width);
    const y2 = Math.min(rect1.top + rect1.height, rect2.top + rect2.height);

    if (x2 <= x1 || y2 <= y1) return 0;
    return (x2 - x1) * (y2 - y1);
}

export function collectSelectionRects(range, pages) {
    const highlightRects = [];
    const overlayDescriptors = [];
    const processedRects = [];

    for (const rect of range.getClientRects()) {
        if (rect.width === 0 || rect.height === 0) continue;

        let bestPage = null;
        let maxIntersection = 0;

        for (const page of pages) {
            if (!page.wrapper) continue;

            const wrapperRect = page.wrapper.getBoundingClientRect();
            const intersection = getIntersectionArea(rect, wrapperRect);
            const minExpectedOverlap = rect.width * rect.height * 0.5;

            if (intersection > maxIntersection && intersection > minExpectedOverlap) {
                maxIntersection = intersection;
                bestPage = page;
            }
        }

        if (!bestPage) continue;

        const wrapperRect = bestPage.wrapper.getBoundingClientRect();
        if (rect.width > wrapperRect.width * 0.9 && rect.height > wrapperRect.height * 0.9) {
            continue;
        }

        const topPx = rect.top - wrapperRect.top;
        const leftPx = rect.left - wrapperRect.left;
        const normalizedRect = {
            page: bestPage.num,
            top: topPx / wrapperRect.height,
            left: leftPx / wrapperRect.width,
            width: rect.width / wrapperRect.width,
            height: rect.height / wrapperRect.height
        };

        const isDuplicate = processedRects.some((processed) =>
            processed.page === normalizedRect.page
            && Math.abs(processed.top - normalizedRect.top) < 0.01
            && Math.abs(processed.left - normalizedRect.left) < 0.01
            && Math.abs(processed.width - normalizedRect.width) < 0.01
        );

        if (isDuplicate) continue;

        processedRects.push(normalizedRect);
        highlightRects.push(normalizedRect);
        overlayDescriptors.push({
            pageWrapper: bestPage.wrapper,
            topPx,
            leftPx,
            width: rect.width,
            height: rect.height
        });
    }

    return {
        highlightRects,
        overlayDescriptors
    };
}

export function createPageWrapper(pageNum, viewport) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.backgroundColor = 'white';
    wrapper.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    wrapper.style.overflow = 'hidden';
    wrapper.style.margin = '20px auto';
    wrapper.style.flexShrink = '0';
    wrapper.style.isolation = 'isolate';
    wrapper.dataset.pageNum = pageNum;
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    return wrapper;
}

export function applyHighlightColorToElements(container, highlightId, color) {
    const overlays = container.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
    overlays.forEach((element) => {
        if (element.classList.contains('highlight-overlay')) {
            element.style.backgroundColor = color.replace(')', ', 0.4)').replace('rgb', 'rgba');
            if (color.startsWith('#')) {
                element.style.backgroundColor = color;
                element.style.opacity = '0.4';
            }
            return;
        }

        if (element.classList.contains('area-highlight-border')) {
            element.style.borderColor = color;
            element.style.backgroundColor = `${color}1A`;
        }
    });

    const svgElements = container.querySelectorAll(`[data-highlight-svg-id="${highlightId}"]`);
    svgElements.forEach((svg) => {
        const rect = svg.querySelector('rect');
        if (rect) {
            rect.setAttribute('fill', color);
            rect.setAttribute('opacity', '0.4');
        }
    });
}

export function syncDefaultHighlightColor(defaultColors, highlightType, color) {
    if (highlightType === 'text') {
        defaultColors.text = color;
        return;
    }

    if (highlightType === 'highlighter') {
        defaultColors.highlighter = color;
        return;
    }

    if (highlightType === 'rect' || highlightType === 'rectangle') {
        defaultColors.rect = color;
        return;
    }

    if (highlightType === 'ellipse') {
        defaultColors.ellipse = color;
        return;
    }

    if (highlightType === 'image') {
        defaultColors.rect = color;
        defaultColors.ellipse = color;
    }
}

export async function resolveDestinationPageNumber(pdfDoc, dest) {
    let resolvedDest = dest;
    if (typeof resolvedDest === 'string') {
        resolvedDest = await pdfDoc.getDestination(resolvedDest);
    }

    if (!resolvedDest) {
        return null;
    }

    const pageRef = resolvedDest[0];
    const pageIndex = await pdfDoc.getPageIndex(pageRef);
    return pageIndex + 1;
}

export function getNearestPageNumber(pages, containerTop) {
    let bestPage = 1;
    let minDiff = Infinity;

    pages.forEach((page) => {
        const diff = Math.abs(page.wrapper.offsetTop - containerTop);
        if (diff < minDiff) {
            minDiff = diff;
            bestPage = page.num;
        }
    });

    return bestPage;
}
