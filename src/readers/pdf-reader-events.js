export function registerPdfReaderGlobalListeners(reader) {
    const globalListeners = [
        [window, 'card-soft-deleted', reader.handleCardSoftDeleted],
        [window, 'card-restored', reader.handleCardRestored],
        [window, 'highlights-restored', reader.handleHighlightsRestored],
        [window, 'mindmap-node-updated', reader.handleMindmapNodeUpdated],
        [window, 'highlight-removed', reader.handleHighlightRemoved],
        [document, 'keydown', reader.handleKeyDown]
    ];

    globalListeners.forEach(([target, eventName, handler]) => {
        target.addEventListener(eventName, handler);
    });

    return () => {
        globalListeners.forEach(([target, eventName, handler]) => {
            target.removeEventListener(eventName, handler);
        });
    };
}

export function setupPdfPanHandling(container, getSelectionMode) {
    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const startPan = (pageX, pageY) => {
        isPanning = true;
        container.style.cursor = 'grabbing';
        startX = pageX - container.offsetLeft;
        startY = pageY - container.offsetTop;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;
    };

    const movePan = (pageX, pageY) => {
        if (!isPanning) return;
        const x = pageX - container.offsetLeft;
        const y = pageY - container.offsetTop;
        container.scrollLeft = scrollLeft - (x - startX);
        container.scrollTop = scrollTop - (y - startY);
    };

    const endPan = () => {
        isPanning = false;
        container.style.cursor = getSelectionMode() === 'pan' ? 'grab' : '';
    };

    const handleMouseDown = (e) => {
        if (e.button === 1 || (e.button === 0 && getSelectionMode() === 'pan')) {
            e.preventDefault();
            startPan(e.pageX, e.pageY);
        }
    };

    const handleMouseMove = (e) => {
        if (!isPanning) return;
        e.preventDefault();
        movePan(e.pageX, e.pageY);
    };

    const handleTouchStart = (e) => {
        if (getSelectionMode() === 'pan' && e.touches.length === 1) {
            if (e.cancelable) e.preventDefault();
            startPan(e.touches[0].pageX, e.touches[0].pageY);
        }
    };

    const handleTouchMove = (e) => {
        if (isPanning && e.touches.length === 1) {
            if (e.cancelable) e.preventDefault();
            movePan(e.touches[0].pageX, e.touches[0].pageY);
        }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseleave', endPan);
    container.addEventListener('mouseup', endPan);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', endPan);

    return () => {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mouseleave', endPan);
        container.removeEventListener('mouseup', endPan);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', endPan);
    };
}

export function setupPdfZoomHandling(container, getScale, onScaleChange) {
    const handleWheel = (e) => {
        if (!e.ctrlKey) return;

        e.preventDefault();
        const zoomStep = 0.1;
        const delta = -Math.sign(e.deltaY);
        const newScale = Math.max(0.5, Math.min(getScale() + (delta * zoomStep), 3.0));
        onScaleChange(newScale);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
        container.removeEventListener('wheel', handleWheel);
    };
}
