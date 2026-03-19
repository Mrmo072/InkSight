import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentManager } from '../document-manager.js';

function listenOnce(eventName) {
    const handler = vi.fn();
    window.addEventListener(eventName, handler);
    return handler;
}

describe('DocumentManager', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        documentManager.clearAll();
    });

    it('registers documents and emits registration events', () => {
        const listener = listenOnce('document-registered');

        const doc = documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf');

        expect(doc.id).toBe('doc-1');
        expect(documentManager.getDocumentInfo('doc-1')).toEqual(doc);
        expect(documentManager.getAllDocuments()).toHaveLength(1);
        expect(listener).toHaveBeenCalled();
    });

    it('updates loaded status and exposes query helpers', () => {
        const listener = listenOnce('document-loaded-changed');
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf', false);

        documentManager.markDocumentLoaded('doc-1', true);

        expect(documentManager.isDocumentLoaded('doc-1')).toBe(true);
        expect(documentManager.getDocumentName('doc-1')).toBe('Book.pdf');
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            detail: { id: 'doc-1', loaded: true }
        }));
    });

    it('unregisters known documents and ignores unknown ones', () => {
        const listener = listenOnce('document-unregistered');
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf');

        documentManager.unregisterDocument('doc-1');
        documentManager.unregisterDocument('missing');

        expect(documentManager.getDocumentInfo('doc-1')).toBeNull();
        expect(listener).toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unknown document:'), 'missing');
    });

    it('restores persisted documents as unloaded references', () => {
        const listener = listenOnce('documents-restored');
        documentManager.restorePersistenceData({
            documents: [
                ['doc-1', { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: true }],
                ['doc-2', { id: 'doc-2', name: 'Notes.md', type: 'text/markdown', loaded: true }]
            ]
        });

        expect(documentManager.isDocumentLoaded('doc-1')).toBe(false);
        expect(documentManager.isDocumentLoaded('doc-2')).toBe(false);
        expect(documentManager.getAllDocuments()).toHaveLength(2);
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            detail: { count: 2 }
        }));
    });

    it('finds matching unloaded documents for source relinking', () => {
        documentManager.restorePersistenceData({
            documents: [
                ['doc-1', { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: true }],
                ['doc-2', { id: 'doc-2', name: 'Notes.md', type: 'text/markdown', loaded: true }]
            ]
        });

        expect(documentManager.findRestorableMatch({
            name: 'book.pdf',
            type: 'application/pdf'
        })).toEqual(expect.objectContaining({ id: 'doc-1' }));
        expect(documentManager.findRestorableMatch({
            name: 'Notes.md',
            type: 'text/plain'
        })).toBeNull();
        expect(documentManager.getMissingDocuments()).toHaveLength(2);
    });

    it('clears all document registrations and exposes persistence payloads', () => {
        const listener = listenOnce('documents-cleared');
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf');

        const payload = documentManager.getPersistenceData();
        documentManager.clearAll();

        expect(payload.documents).toHaveLength(1);
        expect(documentManager.getAllDocuments()).toHaveLength(0);
        expect(listener).toHaveBeenCalled();
    });
});
