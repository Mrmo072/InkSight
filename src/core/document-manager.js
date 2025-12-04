/**
 * DocumentManager - Manages metadata for multiple documents in the mind map
 * Tracks document names, types, and loaded status for multi-document support
 */
export class DocumentManager {
    constructor() {
        this.documents = new Map(); // id -> {id, name, type, loaded}
    }

    /**
     * Register a document in the system
     * @param {string} id - Unique document identifier
     * @param {string} name - Document filename
     * @param {string} type - MIME type
     * @param {boolean} loaded - Whether document is currently loaded
     */
    registerDocument(id, name, type, loaded = true) {
        const docInfo = {
            id,
            name,
            type,
            loaded,
            registeredAt: new Date().toISOString()
        };

        this.documents.set(id, docInfo);

        console.log('[DocumentManager] Document registered:', { id, name, loaded });

        // Notify system of document registration
        window.dispatchEvent(new CustomEvent('document-registered', {
            detail: docInfo
        }));

        return docInfo;
    }

    /**
     * Unregister a document from the system
     * @param {string} id - Document identifier
     */
    unregisterDocument(id) {
        const docInfo = this.documents.get(id);
        if (!docInfo) {
            console.warn('[DocumentManager] Cannot unregister unknown document:', id);
            return;
        }

        this.documents.delete(id);

        console.log('[DocumentManager] Document unregistered:', id);

        // Notify system of document removal
        window.dispatchEvent(new CustomEvent('document-unregistered', {
            detail: { id }
        }));
    }

    /**
     * Get metadata for a specific document
     * @param {string} id - Document identifier
     * @returns {object|null} Document info or null if not found
     */
    getDocumentInfo(id) {
        return this.documents.get(id) || null;
    }

    /**
     * Get all registered documents
     * @returns {Array} Array of document info objects
     */
    getAllDocuments() {
        return Array.from(this.documents.values());
    }

    /**
     * Update the loaded status of a document
     * @param {string} id - Document identifier
     * @param {boolean} loaded - New loaded status
     */
    markDocumentLoaded(id, loaded) {
        const docInfo = this.documents.get(id);
        if (!docInfo) {
            console.warn('[DocumentManager] Cannot mark unknown document:', id);
            return;
        }

        docInfo.loaded = loaded;
        console.log('[DocumentManager] Document loaded status updated:', { id, loaded });

        // Notify system of status change
        window.dispatchEvent(new CustomEvent('document-loaded-changed', {
            detail: { id, loaded }
        }));
    }

    /**
     * Check if a document is currently loaded
     * @param {string} id - Document identifier
     * @returns {boolean} True if loaded, false otherwise
     */
    isDocumentLoaded(id) {
        const docInfo = this.documents.get(id);
        return docInfo ? docInfo.loaded : false;
    }

    /**
     * Get document name by ID
     * @param {string} id - Document identifier
     * @returns {string} Document name or 'Unknown Document'
     */
    getDocumentName(id) {
        const docInfo = this.documents.get(id);
        return docInfo ? docInfo.name : 'Unknown Document';
    }

    /**
     * Clear all document registrations
     * Used when resetting the workspace
     */
    clearAll() {
        console.log('[DocumentManager] Clearing all documents');
        this.documents.clear();

        window.dispatchEvent(new CustomEvent('documents-cleared'));
    }

    /**
     * Get persistence data for saving
     * @returns {object} Serializable document data
     */
    getPersistenceData() {
        return {
            documents: Array.from(this.documents.entries())
        };
    }

    /**
     * Restore documents from persistence data
     * Note: Documents will be marked as NOT loaded (loaded=false)
     * since they need to be re-imported by the user
     * @param {object} data - Persistence data
     */
    restorePersistenceData(data) {
        console.log('[DocumentManager] Restoring documents from persistence');

        if (!data || !data.documents) {
            console.warn('[DocumentManager] No documents to restore');
            return;
        }

        this.documents.clear();

        // Restore documents but mark as not loaded
        if (Array.isArray(data.documents)) {
            data.documents.forEach(([id, docInfo]) => {
                // Mark as not loaded since we're restoring from file
                docInfo.loaded = false;
                this.documents.set(id, docInfo);
            });
        }

        console.log(`[DocumentManager] Restored ${this.documents.size} document references`);

        // Notify system
        window.dispatchEvent(new CustomEvent('documents-restored', {
            detail: { count: this.documents.size }
        }));
    }
}

export const documentManager = new DocumentManager();

// Expose to global scope
if (window.inksight) {
    window.inksight.documentManager = documentManager;
}
