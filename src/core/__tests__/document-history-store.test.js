import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DOCUMENT_HISTORY_STORAGE_KEY,
    loadDocumentHistory,
    saveDocumentHistory,
    updateDocumentHistoryLocation,
    updateDocumentHistoryPage
} from '../document-history-store.js';

describe('document-history-store', () => {
    let storage;

    beforeEach(() => {
        storage = {
            getItem: vi.fn(),
            setItem: vi.fn()
        };
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('loads empty history when storage is blank', () => {
        storage.getItem.mockReturnValue(null);

        expect(loadDocumentHistory(storage)).toEqual({});
        expect(storage.getItem).toHaveBeenCalledWith(DOCUMENT_HISTORY_STORAGE_KEY);
    });

    it('loads parsed history from storage', () => {
        storage.getItem.mockReturnValue('{"book-md5":{"lastPage":12}}');

        expect(loadDocumentHistory(storage)).toEqual({
            'book-md5': { lastPage: 12 }
        });
    });

    it('returns empty history and logs when stored data is invalid', () => {
        storage.getItem.mockReturnValue('{invalid-json');

        expect(loadDocumentHistory(storage)).toEqual({});
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to parse history'),
            expect.any(SyntaxError)
        );
    });

    it('serializes history back to storage', () => {
        const history = { 'book-md5': { lastPage: 8 } };

        saveDocumentHistory(history, storage);

        expect(storage.setItem).toHaveBeenCalledWith(
            DOCUMENT_HISTORY_STORAGE_KEY,
            JSON.stringify(history)
        );
    });

    it('updates page metadata in-place', () => {
        const history = {};

        updateDocumentHistoryPage(history, 'book-md5', 21, 123456);

        expect(history).toEqual({
            'book-md5': {
                lastPage: 21,
                lastOpened: 123456
            }
        });
    });

    it('updates reader location metadata in-place', () => {
        const history = {};

        updateDocumentHistoryLocation(history, 'book-md5', { cfi: 'epubcfi(/6/2)', scrollTop: 120 }, 123456);

        expect(history).toEqual({
            'book-md5': {
                lastLocation: {
                    cfi: 'epubcfi(/6/2)',
                    scrollTop: 120
                },
                lastOpened: 123456
            }
        });
    });
});
