import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('InkSight file adapter', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.focus = vi.fn();
  });

  it('builds a shared InkSight payload with board and persistence data', async () => {
    const { buildInksightFilePayload } = await import('../src/inksight-file/inksight-file-snapshot.js');

    const payload = buildInksightFilePayload({
      board: {
        children: [{ id: 'node-1' }],
        viewport: { zoom: 2 },
        theme: { themeColorMode: 'dark' },
      },
      appContext: {
        currentBook: {
          md5: 'book-md5',
          name: 'Example.pdf',
          id: 'book-id',
        },
        documentManager: {
          getPersistenceData: () => ({
            documents: [['doc-1', { id: 'doc-1', name: 'Example.pdf', type: 'application/pdf', loaded: true }]],
          }),
        },
        cardSystem: {
          getPersistenceData: () => ({
            cards: [{ id: 'card-1' }],
            connections: [{ id: 'conn-1' }],
          }),
        },
        highlightManager: {
          getPersistenceData: () => ({
            highlights: [{ id: 'hl-1' }],
          }),
        },
      },
      lastPage: 12,
    });

    expect(payload).toMatchObject({
      type: 'drawnix',
      source: 'web',
      elements: [{ id: 'node-1' }],
      viewport: { zoom: 2 },
      theme: { themeColorMode: 'dark' },
      bookMd5: 'book-md5',
      bookName: 'Example.pdf',
      bookId: 'book-id',
      documents: [['doc-1', { id: 'doc-1', name: 'Example.pdf', type: 'application/pdf', loaded: true }]],
      cards: [{ id: 'card-1' }],
      connections: [{ id: 'conn-1' }],
      highlights: [{ id: 'hl-1' }],
      lastPage: 12,
    });
  });

  it('reuses the shared payload builder for auto-save data', async () => {
    const { buildAutoSavePayload } = await import('../src/core/document-history-helpers.js');

    const payload = buildAutoSavePayload({
      board: {
        children: [{ id: 'node-2' }],
        viewport: { zoom: 1.5 },
        theme: { themeColorMode: 'default' },
      },
      appContext: {
        currentBook: {
          md5: 'same-md5',
          name: 'Sample.pdf',
          id: 'book-2',
        },
      },
      historyEntry: {
        lastPage: 6,
      },
    });

    expect(payload).toMatchObject({
      elements: [{ id: 'node-2' }],
      viewport: { zoom: 1.5 },
      theme: { themeColorMode: 'default' },
      bookMd5: 'same-md5',
      lastPage: 6,
    });
  });

  it('restores persistence data and queues pending remap when no book is active', async () => {
    const { restoreInksightPersistence } = await import('../src/inksight-file/inksight-file-restore.js');
    const restoreCards = vi.fn();
    const restoreHighlights = vi.fn();
    const clearAllHighlights = vi.fn();
    const onBookMismatch = vi.fn();
    const restoreDocuments = vi.fn();
    const appContext = {
      currentBook: {
        md5: null,
        id: null,
      },
      pendingRestore: null,
      cardSystem: {
        restorePersistenceData: restoreCards,
      },
      highlightManager: {
        restorePersistenceData: restoreHighlights,
      },
      documentManager: {
        restorePersistenceData: restoreDocuments,
      },
      pdfReader: {
        clearAllHighlights,
      },
    };

    restoreInksightPersistence({
      bookMd5: 'saved-md5',
      bookId: 'old-book-id',
      bookName: 'Saved.pdf',
      documents: [['doc-1', { id: 'doc-1', name: 'Saved.pdf', type: 'application/pdf', loaded: true }]],
      cards: [{ id: 'card-1' }],
      connections: [{ id: 'conn-1' }],
      highlights: [{ id: 'hl-1' }],
    }, appContext, { onBookMismatch });

    expect(appContext.pendingRestore).toEqual({
      md5: 'saved-md5',
      id: 'old-book-id',
    });
    expect(restoreCards).toHaveBeenCalledWith({
      cards: [{ id: 'card-1' }],
      connections: [{ id: 'conn-1' }],
    }, null);
    expect(clearAllHighlights).toHaveBeenCalled();
    expect(restoreHighlights).toHaveBeenCalledWith({
      highlights: [{ id: 'hl-1' }],
    }, null);
    expect(restoreDocuments).toHaveBeenCalledWith({
      documents: [['doc-1', { id: 'doc-1', name: 'Saved.pdf', type: 'application/pdf', loaded: true }]],
    });
    expect(onBookMismatch).not.toHaveBeenCalled();
  });

  it('warns on book mismatch and remaps to the active book when md5 matches', async () => {
    const { restoreInksightPersistence } = await import('../src/inksight-file/inksight-file-restore.js');
    const restoreCards = vi.fn();
    const restoreHighlights = vi.fn();
    const onBookMismatch = vi.fn();
    const appContext = {
      currentBook: {
        md5: 'active-md5',
        id: 'active-book-id',
      },
      pendingRestore: null,
      cardSystem: {
        restorePersistenceData: restoreCards,
      },
      highlightManager: {
        restorePersistenceData: restoreHighlights,
      },
    };

    restoreInksightPersistence({
      bookMd5: 'other-md5',
      bookName: 'Other.pdf',
    }, appContext, { onBookMismatch });

    expect(onBookMismatch).toHaveBeenCalledWith({
      savedMd5: 'other-md5',
      currentMd5: 'active-md5',
      bookName: 'Other.pdf',
    });

    restoreInksightPersistence({
      bookMd5: 'active-md5',
      cards: [{ id: 'card-2' }],
      highlights: [{ id: 'hl-2' }],
    }, appContext);

    expect(restoreCards).toHaveBeenLastCalledWith({
      cards: [{ id: 'card-2' }],
      connections: undefined,
    }, 'active-book-id');
    expect(restoreHighlights).toHaveBeenLastCalledWith({
      highlights: [{ id: 'hl-2' }],
    }, 'active-book-id');
  });

  it('validates restore payload md5 and reports expected element count', async () => {
    const {
      getInksightExpectedElementCount,
      validateInksightRestorePayload,
    } = await import('../src/inksight-file/inksight-file-restore.js');
    const onMismatch = vi.fn();

    expect(validateInksightRestorePayload({
      bookMd5: 'saved-md5',
    }, {
      expectedMd5: 'saved-md5',
      onMismatch,
    })).toBe(true);

    expect(validateInksightRestorePayload({
      bookMd5: 'other-md5',
    }, {
      expectedMd5: 'saved-md5',
      onMismatch,
    })).toBe(false);

    expect(onMismatch).toHaveBeenCalledWith({
      expectedMd5: 'saved-md5',
      actualMd5: 'other-md5',
    });
    expect(getInksightExpectedElementCount({
      elements: [{ id: 'node-1' }, { id: 'node-2' }],
    })).toBe(2);
    expect(getInksightExpectedElementCount({ elements: null })).toBe(0);
  });
});
