import { describe, expect, it, vi } from 'vitest';

describe('InkSight project bundle', () => {
  it('extracts image payloads into project assets and bundles source documents', async () => {
    const { bundleProjectData } = await import('../src/inksight-file/inksight-project-bundle.js');

    const payload = {
      type: 'drawnix',
      source: 'web',
      version: 1,
      elements: [
        {
          id: 'node-1',
          type: 'image',
          url: 'data:image/png;base64,QUJD',
          data: {
            imageData: 'data:image/png;base64,QUJD',
          },
        },
      ],
      viewport: { zoom: 1 },
      cards: [
        {
          id: 'card-1',
          type: 'image',
          imageData: 'data:image/png;base64,QUJD',
        },
      ],
      documents: [
        ['doc-1', { id: 'doc-1', name: 'Sample.pdf', type: 'application/pdf', loaded: true }],
      ],
    };

    const readBlobFromReference = vi.fn(async () => new Blob(['image-bytes'], { type: 'image/png' }));
    const file = new File(['pdf-bytes'], 'Sample.pdf', {
      type: 'application/pdf',
      lastModified: 1700000000000,
    });

    const result = await bundleProjectData({
      payload,
      projectFiles: [
        {
          id: 'doc-1',
          name: 'Sample.pdf',
          type: 'application/pdf',
          lastModified: 1700000000000,
          fileObj: file,
        },
      ],
      readBlobFromReference,
    });

    expect(readBlobFromReference).toHaveBeenCalledTimes(1);
    expect(result.assetEntries).toHaveLength(1);
    expect(result.manifest.assets).toEqual([
      expect.objectContaining({
        path: expect.stringMatching(/^assets\//),
        mimeType: 'image/png',
      }),
    ]);
    expect(result.manifest.documents).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        path: expect.stringMatching(/^documents\//),
        name: 'Sample.pdf',
      }),
    ]);
    expect(result.manifest.payload.cards[0].imageData).toMatch(/^assets\//);
    expect(result.manifest.payload.elements[0].url).toMatch(/^assets\//);
    expect(result.manifest.payload.elements[0].data.imageData).toMatch(/^assets\//);
    expect(result.manifest.payload.documents[0][1]).toMatchObject({
      loaded: true,
      projectPath: expect.stringMatching(/^documents\//),
    });
  });

  it('hydrates bundled assets and documents back into runtime objects', async () => {
    const { hydrateProjectData } = await import('../src/inksight-file/inksight-project-bundle.js');

    const manifest = {
      kind: 'inksight-project',
      version: 1,
      payload: {
        type: 'drawnix',
        source: 'web',
        version: 1,
        elements: [
          {
            id: 'node-1',
            type: 'image',
            url: 'assets/0001-node-1.png',
            data: {
              imageData: 'assets/0001-node-1.png',
            },
          },
        ],
        viewport: { zoom: 1 },
        cards: [
          {
            id: 'card-1',
            type: 'image',
            imageData: 'assets/0001-node-1.png',
          },
        ],
      },
      documents: [
        {
          id: 'doc-1',
          name: 'Sample.pdf',
          type: 'application/pdf',
          lastModified: 1700000000000,
          path: 'documents/001-sample.pdf',
        },
      ],
      assets: [
        {
          path: 'assets/0001-node-1.png',
          mimeType: 'image/png',
          size: 11,
        },
      ],
    };

    const createObjectURL = vi.fn(() => 'blob:asset-1');
    const revokeObjectURL = vi.fn();
    const readBlob = vi.fn(async (path: string) => {
      if (path.startsWith('assets/')) {
        return new Blob(['image-bytes'], { type: 'image/png' });
      }

      return new File(['pdf-bytes'], 'Sample.pdf', {
        type: 'application/pdf',
        lastModified: 1700000000000,
      });
    });

    const result = await hydrateProjectData({
      manifest,
      readBlob,
      createObjectURL,
      revokeObjectURL,
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result.payload.cards[0].imageData).toBe('blob:asset-1');
    expect(result.payload.elements[0].url).toBe('blob:asset-1');
    expect(result.payload.elements[0].data.imageData).toBe('blob:asset-1');
    expect(result.projectFiles).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        name: 'Sample.pdf',
        fileObj: expect.any(File),
      }),
    ]);

    result.cleanup();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset-1');
  });
});
