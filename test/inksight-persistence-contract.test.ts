import { beforeEach, describe, expect, it, vi } from 'vitest';

const fileSave = vi.fn();
const fileOpen = vi.fn();
const normalizeFile = vi.fn();
const loadFromBlob = vi.fn();
const parseFileContents = vi.fn();

vi.mock('../src/drawnix/drawnix/src/data/filesystem.ts', () => ({
  fileSave,
  fileOpen,
}));

vi.mock('../src/drawnix/drawnix/src/data/blob.ts', () => ({
  normalizeFile,
  loadFromBlob,
  parseFileContents,
}));

describe('.inksight persistence contract', () => {
  beforeEach(() => {
    fileSave.mockReset();
    fileOpen.mockReset();
    normalizeFile.mockReset();
    loadFromBlob.mockReset();
    parseFileContents.mockReset();
  });

  it('saves a complete .inksight payload with the expected file contract', async () => {
    fileSave.mockResolvedValue({ kind: 'file' });
    const { saveInksightFile } = await import('../src/inksight-file/inksight-file-io.js');

    const result = await saveInksightFile({
      board: {
        children: [{ id: 'node-1' }],
        viewport: { x: 10, y: 20, zoom: 2 },
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
      name: 'Example',
      lastPage: 3,
    });

    expect(fileSave).toHaveBeenCalledWith(expect.any(Blob), {
      name: 'Example',
      extension: 'inksight',
      description: 'InkSight file',
    });

    const [blob] = fileSave.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);

    expect(result.payload).toMatchObject({
      type: 'drawnix',
      source: 'web',
      elements: [{ id: 'node-1' }],
      viewport: { x: 10, y: 20, zoom: 2 },
      theme: { themeColorMode: 'dark' },
      bookMd5: 'book-md5',
      bookName: 'Example.pdf',
      bookId: 'book-id',
      documents: [['doc-1', { id: 'doc-1', name: 'Example.pdf', type: 'application/pdf', loaded: true }]],
      cards: [{ id: 'card-1' }],
      connections: [{ id: 'conn-1' }],
      highlights: [{ id: 'hl-1' }],
      lastPage: 3,
    });
  });

  it('loads a valid .inksight payload through the shared file contract', async () => {
    const payload = {
      type: 'drawnix',
      version: 1,
      source: 'web',
      elements: [{ id: 'node-2' }],
      viewport: { zoom: 1 },
      theme: { themeColorMode: 'default' },
      bookMd5: 'book-md5',
    };

    fileOpen.mockResolvedValue({ name: 'Example.inksight' });
    normalizeFile.mockResolvedValue({ name: 'Example.inksight' });
    loadFromBlob.mockResolvedValue(payload);
    parseFileContents.mockResolvedValue(JSON.stringify(payload));

    const { loadInksightFile } = await import('../src/inksight-file/inksight-file-io.js');
    const result = await loadInksightFile({ children: [] });

    expect(fileOpen).toHaveBeenCalledWith({
      description: 'InkSight files',
      extensions: ['inksight', 'drawnix', 'json'],
    });
    expect(loadFromBlob).toHaveBeenCalled();
    expect(result).toEqual(payload);
  });

  it('rejects invalid payloads during load', async () => {
    const invalidPayload = {
      type: 'drawnix',
      source: 'web',
      elements: null,
      viewport: { zoom: 1 },
    };

    fileOpen.mockResolvedValue({ name: 'Broken.inksight' });
    normalizeFile.mockResolvedValue({ name: 'Broken.inksight' });
    loadFromBlob.mockResolvedValue(invalidPayload);
    parseFileContents.mockResolvedValue(JSON.stringify(invalidPayload));

    const { loadInksightFile } = await import('../src/inksight-file/inksight-file-io.js');

    await expect(loadInksightFile({ children: [] })).rejects.toThrow('Error: invalid file');
  });
});
