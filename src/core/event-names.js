/**
 * Canonical registry of application-level window CustomEvent names.
 *
 * These events are the implicit contract between modules (readers ↔ core ↔
 * mindmap ↔ app shell). Always reference names through APP_EVENTS instead of
 * raw string literals so renames are toolable and the full contract stays
 * discoverable in one place. DOM events (click, keydown, …) are not included.
 */
export const APP_EVENTS = Object.freeze({
    // Card lifecycle (CardSystem ↔ board ↔ workspace)
    CARD_ADDED: 'card-added',
    CARD_REMOVED: 'card-removed',
    CARD_UPDATED: 'card-updated',
    CARD_SELECTED: 'card-selected',
    CARD_RESTORED: 'card-restored',
    CARD_SOFT_DELETED: 'card-soft-deleted',
    CARDS_CLEARED: 'cards-cleared',
    CARDS_RESTORED: 'cards-restored',
    RESTORE_BOARD_STATE: 'restore-board-state',
    BOARD_READY: 'board-ready',
    ADD_CARD_TO_BOARD: 'add-card-to-board',

    // Highlight lifecycle (HighlightManager ↔ readers ↔ annotation list)
    HIGHLIGHT_CREATED: 'highlight-created',
    HIGHLIGHT_REMOVED: 'highlight-removed',
    HIGHLIGHT_UPDATED: 'highlight-updated',
    HIGHLIGHT_SELECTED: 'highlight-selected',
    HIGHLIGHT_CLICKED: 'highlight-clicked',
    HIGHLIGHTS_CLEARED: 'highlights-cleared',
    HIGHLIGHTS_RESTORED: 'highlights-restored',
    ANNOTATION_SELECTED: 'annotation-selected',

    // Document / source navigation
    JUMP_TO_SOURCE: 'jump-to-source',
    RESTORE_PAGE_POSITION: 'restore-page-position',
    DOCUMENT_REGISTERED: 'document-registered',
    DOCUMENT_UNREGISTERED: 'document-unregistered',
    DOCUMENT_LOADED_CHANGED: 'document-loaded-changed',
    DOCUMENTS_RESTORED: 'documents-restored',
    DOCUMENTS_CLEARED: 'documents-cleared',

    // Workspace / project shell
    REQUEST_SAVE: 'request-save',
    PROJECT_OPENED: 'project-opened',
    PROJECT_SAVE_COMPLETED: 'project-save-completed',
    RECOVERY_VALIDATE_REQUESTED: 'recovery-validate-requested',
    OUTLINE_VISIBILITY_CHANGED: 'outline-visibility-changed',
    LAYOUT_PANEL_TOGGLED: 'layout-panel-toggled',
    LAYOUT_PANEL_PRESET_CHANGED: 'layout-panel-preset-changed',

    // Mind map
    MINDMAP_SELECTION_CHANGED: 'mindmap-selection-changed',
    MINDMAP_NODE_UPDATED: 'mindmap-node-updated'
});
