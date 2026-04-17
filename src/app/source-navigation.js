export async function navigateToLinkedSource({
    sourceId,
    highlightId,
    findHighlightById,
    findFileById,
    openFile,
    getCurrentFile,
    getCurrentReader,
    notify
}) {
    const highlight = findHighlightById?.(highlightId) ?? null;
    const effectiveSourceId = highlight ? highlight.sourceId : sourceId;
    const file = findFileById?.(effectiveSourceId) ?? null;

    if (!file) {
        notify?.({
            message: `Source file is not loaded yet. Re-import it from the library to restore linked navigation.`,
            level: 'warning'
        });
        return { status: 'missing-file', effectiveSourceId, highlight };
    }

    if (!highlight) {
        notify?.({
            message: 'The linked highlight could not be found in the restored project state.',
            level: 'warning'
        });
        return { status: 'missing-highlight', effectiveSourceId, file };
    }

    const currentFile = getCurrentFile?.() ?? null;
    if (!currentFile || currentFile.id !== effectiveSourceId) {
        await openFile?.(file);
    }

    const reader = getCurrentReader?.();
    if (!reader) {
        return { status: 'no-reader', effectiveSourceId, file, highlight };
    }

    if (typeof reader.scrollToHighlight === 'function') {
        await reader.scrollToHighlight(highlightId);
        if (highlight.needsValidation) {
            notify?.({
                message: 'This restored source location used a fallback match and should be validated against the original document.',
                level: 'warning'
            });
            return { status: 'needs-validation', effectiveSourceId, file, highlight };
        }
        return { status: 'scrolled-highlight', effectiveSourceId, file, highlight };
    }

    const pageInfo = reader.pages ? reader.pages[highlight.location?.page - 1] : null;
    if (pageInfo?.wrapper) {
        pageInfo.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof reader.flashHighlight === 'function') {
            setTimeout(() => {
                reader.flashHighlight(highlightId);
            }, 500);
        }
        return { status: 'scrolled-page', effectiveSourceId, file, highlight };
    }

    return { status: 'no-scroll-target', effectiveSourceId, file, highlight };
}
