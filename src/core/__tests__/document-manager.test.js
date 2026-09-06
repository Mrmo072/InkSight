import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentManager } from '../document-manager.js';
import { APP_EVENTS } from '../event-names.js';

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
        const listener = listenOnce(APP_EVENTS.DOCUMENT_REGISTERED);

        const doc = documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf');

        expect(doc.id).toBe('doc-1');
        expect(documentManager.getDocumentInfo('doc-1')).toEqual(doc);
        expect(documentManager.getAllDocuments()).toHaveLength(1);
        expect(listener).toHaveBeenCalled();
    });

    it('updates loaded status and exposes query helpers', () => {
        const listener = listenOnce(APP_EVENTS.DOCUMENT_LOADED_CHANGED);
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf', false);

        documentManager.markDocumentLoaded('doc-1', true);

        expect(documentManager.isDocumentLoaded('doc-1')).toBe(true);
        expect(documentManager.getDocumentName('doc-1')).toBe('Book.pdf');
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            detail: { id: 'doc-1', loaded: true }
        }));
    });

    it('unregisters known documents and ignores unknown ones', () => {
        const listener = listenOnce(APP_EVENTS.DOCUMENT_UNREGISTERED);
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf');

        documentManager.unregisterDocument('doc-1');
        documentManager.unregisterDocument('missing');

        expect(documentManager.getDocumentInfo('doc-1')).toBeNull();
        expect(listener).toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('unknown document:'), 'missing');
    });

    it('restores persisted documents as unloaded references', () => {
        const listener = listenOnce(APP_EVENTS.DOCUMENTS_RESTORED);
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

    it('keeps currently open documents loaded across a restore', () => {
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf', true);
        documentManager.registerDocument('doc-2', 'Other.pdf', 'application/pdf', true);

        // doc-1 当前打开且在 payload 中，恢复后必须保持 loaded；
        // doc-2 当前打开但不在 payload 中，注册也不能丢；
        // doc-3 只存在于 payload，按未加载引用恢复
        documentManager.restorePersistenceData({
            documents: [
                ['doc-1', { id: 'doc-1', name: 'Book.pdf', type: 'application/pdf', loaded: true }],
                ['doc-3', { id: 'doc-3', name: 'Fresh.pdf', type: 'application/pdf', loaded: true }]
            ]
        });

        expect(documentManager.isDocumentLoaded('doc-1')).toBe(true);
        expect(documentManager.isDocumentLoaded('doc-2')).toBe(true);
        expect(documentManager.isDocumentLoaded('doc-3')).toBe(false);
        expect(documentManager.getMissingDocuments().map((doc) => doc.id)).toEqual(['doc-3']);
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
        const listener = listenOnce(APP_EVENTS.DOCUMENTS_CLEARED);
        documentManager.registerDocument('doc-1', 'Book.pdf', 'application/pdf');

        const payload = documentManager.getPersistenceData();
        documentManager.clearAll();

        expect(payload.documents).toHaveLength(1);
        expect(documentManager.getAllDocuments()).toHaveLength(0);
        expect(listener).toHaveBeenCalled();
    });
});
