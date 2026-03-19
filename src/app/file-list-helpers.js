export function reorderFilesById(files = [], fileId, targetIndex) {
    const currentIndex = files.findIndex((file) => file.id === fileId);
    if (currentIndex < 0) {
        return files.slice();
    }

    const boundedIndex = Math.max(0, Math.min(targetIndex, files.length - 1));
    if (currentIndex === boundedIndex) {
        return files.slice();
    }

    const nextFiles = files.slice();
    const [movedFile] = nextFiles.splice(currentIndex, 1);
    nextFiles.splice(boundedIndex, 0, movedFile);
    return nextFiles;
}

export function buildDocumentRemovalPrompt({
    name,
    cardCount = 0,
    highlightCount = 0,
    isCurrentDocument = false
} = {}) {
    const referenceCount = cardCount + highlightCount;

    if (referenceCount <= 0 && !isCurrentDocument) {
        return `Remove "${name}" from the library?`;
    }

    const details = [];
    if (cardCount > 0) {
        details.push(`${cardCount} linked ${cardCount === 1 ? 'card' : 'cards'}`);
    }
    if (highlightCount > 0) {
        details.push(`${highlightCount} linked ${highlightCount === 1 ? 'highlight' : 'highlights'}`);
    }
    if (isCurrentDocument) {
        details.push('this is the currently open document');
    }

    return `Remove "${name}" from the library?\n\nThis will keep the notes and mind map data, but source navigation will need relinking for ${details.join(', ')}.`;
}
