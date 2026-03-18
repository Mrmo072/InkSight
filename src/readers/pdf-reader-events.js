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

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseleave', endPan);
    container.addEventListener('mouseup', endPan);
    container.addEventListener('mousemove', handleMouseMove);

    return () => {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mouseleave', endPan);
        container.removeEventListener('mouseup', endPan);
        container.removeEventListener('mousemove', handleMouseMove);
    };
}

export function setupPdfZoomHandling(container, getScale, onScaleChange, options = {}) {
    let isPinching = false;
    let pinchStartDistance = 0;
    let pinchStartScale = 1;
    let pinchPreviewScale = null;

    const clampScale = (scale) => Math.max(0.5, Math.min(scale, 3.0));
    const getTouchDistance = (touches) => {
        const [first, second] = touches;
        return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    };
    const getTouchCenter = (touches) => ({
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    });

    const handleWheel = (e) => {
        if (!e.ctrlKey) return;

        e.preventDefault();
        const zoomStep = 0.1;
        const delta = -Math.sign(e.deltaY);
        const newScale = clampScale(getScale() + (delta * zoomStep));
        onScaleChange(newScale);
    };

    const handleTouchStart = (e) => {
        if (e.touches.length !== 2) {
            return;
        }

        if (e.cancelable) e.preventDefault();
        isPinching = true;
        pinchStartDistance = getTouchDistance(e.touches);
        pinchStartScale = getScale();
        pinchPreviewScale = pinchStartScale;
        options.onPreviewStart?.({
            scale: pinchStartScale,
            center: getTouchCenter(e.touches)
        });
    };

    const handleTouchMove = (e) => {
        if (!isPinching || e.touches.length !== 2) {
            return;
        }

        if (e.cancelable) e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        if (!pinchStartDistance) {
            pinchStartDistance = currentDistance;
            return;
        }

        const nextScale = clampScale(pinchStartScale * (currentDistance / pinchStartDistance));
        pinchPreviewScale = nextScale;
        const center = getTouchCenter(e.touches);
        if (options.onPreviewUpdate) {
            options.onPreviewUpdate({
                scale: nextScale,
                center
            });
        } else {
            onScaleChange(nextScale);
        }
    };

    const endPinch = (e) => {
        if (e.touches.length >= 2) {
            return;
        }

        if (isPinching) {
            const committedScale = clampScale(pinchPreviewScale ?? getScale());
            if (Math.abs(committedScale - getScale()) > 0.01) {
                if (options.onPreviewCommit) {
                    options.onPreviewCommit({
                        scale: committedScale
                    });
                } else {
                    onScaleChange(committedScale);
                }
            } else {
                options.onPreviewCancel?.();
            }
        }

        isPinching = false;
        pinchStartDistance = 0;
        pinchStartScale = getScale();
        pinchPreviewScale = null;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', endPinch);
    container.addEventListener('touchcancel', endPinch);

    return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', endPinch);
        container.removeEventListener('touchcancel', endPinch);
    };
}
