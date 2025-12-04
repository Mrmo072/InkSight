import './styles/styles.css';
import { PDFReader } from './readers/pdf-reader.js';
import { EpubReader } from './readers/epub-reader.js';
import { TextReader } from './readers/text-reader.js';
import { MindmapView } from './mindmap/mindmap-view.js';
import { DrawnixView } from './mindmap/drawnix-view.js';
import { highlightManager } from './core/highlight-manager.js';
import { SplitView } from './ui/split-view.js';
import { suppressResizeObserverLoop } from './drawnix/react-board/src/utils/resizeObserverFix.js';

suppressResizeObserverLoop();

// Initialize global bridge object
window.inksight = {
    currentBook: {
        md5: null,
        name: null,
        id: null
    },
    cardSystem: null, // Will be populated below
    highlightManager: null, // Will be populated below
    pdfReader: null // Will be populated when PDF is loaded
};

// Import cardSystem (it's already imported by other modules, but we need it here)
import { cardSystem } from './core/card-system.js';
import { documentManager } from './core/document-manager.js';
window.inksight.cardSystem = cardSystem;
window.inksight.highlightManager = highlightManager;
window.inksight.documentManager = documentManager;

// State
const state = {
    currentFile: null,
    files: [],
    zoom: 1.0,
    currentPage: 1,
    totalPages: 0
};

// DOM Elements
const elements = {
    fileInput: document.getElementById('file-input'),
    addFileBtn: document.getElementById('add-file-btn'),
    fileList: document.getElementById('file-list'),
    viewer: document.getElementById('viewer'),
    docTitle: document.getElementById('doc-title'),
    prevBtn: document.getElementById('prev-page'),
    nextBtn: document.getElementById('next-page'),
    pageInfo: document.getElementById('page-info')
};

let currentReader = null;
let mindmapView = null;
let drawnixView = null;
let splitView = null;

// Initialization
function init() {

    try {
        loadFilesFromStorage();

        // Init Mindmap or Drawnix
        const mindmapContainer = document.getElementById('mindmap-container');
        if (mindmapContainer) {
            // mindmapView = new MindmapView(mindmapContainer);
            // console.log('MindmapView initialized');

            drawnixView = new DrawnixView(mindmapContainer);

        }

        // Init SplitView BEFORE setupEventListeners
        splitView = new SplitView({
            leftId: 'sidebar',
            centerId: 'reader-container',
            rightId: 'notes-panel',
            resizerLeftId: 'resizer-left',
            resizerRightId: 'resizer-right'
        });

        // Setup event listeners AFTER SplitView is initialized
        setupEventListeners();

    } catch (e) {
        console.error('Initialization error:', e);
    }
}

function setupEventListeners() {
    // File Import
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Navigation
    elements.prevBtn.addEventListener('click', () => currentReader?.onPrevPage());
    elements.nextBtn.addEventListener('click', () => currentReader?.onNextPage());

    // Backlinks
    window.addEventListener('jump-to-source', (e) => {
        const { sourceId, highlightId } = e.detail;
        handleJumpToSource(sourceId, highlightId);
    });

    // Mind Map Selection Change (Show Document Name)
    // Mind Map Selection Change (Show Document Name)
    const docInfoEl = document.getElementById('mindmap-doc-info');

    window.addEventListener('mindmap-selection-changed', (e) => {
        const { sourceId } = e.detail;
        // console.log('[Main] mindmap-selection-changed received. sourceId:', sourceId);

        if (sourceId && docInfoEl) {
            // console.log('[Main] Looking for file with ID:', sourceId);
            const file = state.files.find(f => f.id === sourceId);
            if (file) {
                // console.log('[Main] File found:', file.name);
                docInfoEl.textContent = file.name;
                docInfoEl.style.display = 'inline-flex';
                docInfoEl.title = file.name;
            } else if (e.detail.sourceName) {
                // console.log('[Main] File not loaded, using persisted sourceName:', e.detail.sourceName);
                docInfoEl.textContent = e.detail.sourceName;
                docInfoEl.style.display = 'inline-flex';
                docInfoEl.title = e.detail.sourceName;
            } else {
                // console.warn('[Main] File not found for sourceId:', sourceId);
                docInfoEl.style.display = 'none';
            }
        } else if (docInfoEl) {
            // console.log('[Main] No sourceId or element missing');
            docInfoEl.style.display = 'none';
        }
    });

    // Layout Toggles
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const toggleNotesBtn = document.getElementById('toggle-notes');

    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            if (splitView) splitView.toggleLeft();
        });
    }

    if (toggleNotesBtn) {
        toggleNotesBtn.addEventListener('click', () => {
            if (splitView) splitView.toggleRight();
        });
    }

    // Selection mode toggle buttons
    const textModeBtn = document.getElementById('text-mode');
    const rectModeBtn = document.getElementById('rect-mode');
    const ellipseModeBtn = document.getElementById('ellipse-mode');
    const highlighterModeBtn = document.getElementById('highlighter-mode');

    const modeButtons = [textModeBtn, rectModeBtn, ellipseModeBtn, highlighterModeBtn].filter(Boolean);

    const setActiveMode = (mode, activeBtn) => {
        if (currentReader && currentReader.setSelectionMode) {
            currentReader.setSelectionMode(mode);
            modeButtons.forEach(btn => btn.classList.remove('active'));
            if (activeBtn) activeBtn.classList.add('active');
        }
    };

    if (textModeBtn) {
        textModeBtn.addEventListener('click', () => setActiveMode('text', textModeBtn));
    }

    if (rectModeBtn) {
        rectModeBtn.addEventListener('click', () => setActiveMode('rectangle', rectModeBtn));
    }

    if (ellipseModeBtn) {
        ellipseModeBtn.addEventListener('click', () => setActiveMode('ellipse', ellipseModeBtn));
    }

    if (highlighterModeBtn) {
        highlighterModeBtn.addEventListener('click', () => setActiveMode('highlighter', highlighterModeBtn));
    }

    // Highlighter Height Control Panel
    const heightSlider = document.getElementById('highlighter-height');
    const highlighterPanel = document.getElementById('highlighter-panel');

    if (highlighterModeBtn && highlighterPanel) {
        let isDragging = false;
        let startY = 0;
        let startHeight = 16;
        let clickThreshold = 5;

        // Show panel on hover (only if active)
        highlighterModeBtn.addEventListener('mouseenter', () => {
            if (highlighterModeBtn.classList.contains('active')) {
                // First make the panel visible to ensure it's rendered
                highlighterPanel.classList.add('visible');

                // Force a reflow to ensure the panel is fully rendered before calculating position
                void highlighterPanel.offsetHeight;

                // Calculate position relative to the offset parent (likely reader-container or body)
                const btnRect = highlighterModeBtn.getBoundingClientRect();
                // Check if offsetParent exists, otherwise fallback to body
                const offsetParent = highlighterPanel.offsetParent || document.body;
                const containerRect = offsetParent.getBoundingClientRect();
                const panelWidth = 220; // Width defined in CSS

                // Calculate left position relative to container
                let left = (btnRect.left - containerRect.left) + (btnRect.width / 2) - (panelWidth / 2);

                // Ensure it doesn't go off-screen (relative to container width)
                const containerWidth = containerRect.width;
                if (left < 10) left = 10;
                if (left + panelWidth > containerWidth - 10) left = containerWidth - panelWidth - 10;

                // Calculate top position relative to container
                const top = (btnRect.bottom - containerRect.top) + 12; // 12px gap

                highlighterPanel.style.top = `${top}px`;
                highlighterPanel.style.left = `${left}px`;
                highlighterPanel.style.transform = 'translateX(0)'; // Reset any centering transform if present
            }
        });

        highlighterModeBtn.addEventListener('mousedown', (e) => {
            isDragging = false;
            startY = e.clientY;

            if (currentReader && currentReader.highlighterTool) {
                startHeight = currentReader.highlighterTool.height;
            } else if (heightSlider) {
                startHeight = parseInt(heightSlider.value) || 16;
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const onMouseMove = (e) => {
            const deltaY = startY - e.clientY;
            if (Math.abs(deltaY) > clickThreshold) {
                isDragging = true;
            }

            if (isDragging) {
                // Calculate new height
                let newHeight = startHeight + deltaY;
                // Clamp height between 8 and 48
                newHeight = Math.max(8, Math.min(48, newHeight));

                // Update slider and tool
                if (heightSlider) heightSlider.value = newHeight;
                if (currentReader && currentReader.highlighterTool) {
                    currentReader.highlighterTool.setHeight(newHeight);
                }
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        // Handle slider change directly
        if (heightSlider) {
            heightSlider.addEventListener('input', (e) => {
                const newHeight = parseInt(e.target.value);
                if (currentReader && currentReader.highlighterTool) {
                    currentReader.highlighterTool.setHeight(newHeight);
                }
            });
        }

        // Hide panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!highlighterPanel.contains(e.target) && e.target !== highlighterModeBtn) {
                highlighterPanel.classList.remove('visible');
            }
        });
    }

    // Auto-layout button
    const layoutBtn = document.getElementById('layout-btn');
    if (layoutBtn) {
        layoutBtn.addEventListener('click', () => {
            if (window.applyAutoLayout) {
                window.applyAutoLayout();

            } else {
                console.warn('Auto-layout function not available yet');
            }
        });
    }
}

// File Handling
async function handleFileSelect(e) {

    const file = e.target.files[0];
    if (!file) return;

    // Generate a deterministic ID based on file metadata
    // This ensures that if the user reloads and re-opens the same file,
    // the ID remains the same, matching the sourceId stored in persisted cards.
    const fileSignature = `${file.name}-${file.size}-${file.lastModified}`;
    const fileId = await generateHash(fileSignature);

    const fileData = {
        id: fileId,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        fileObj: file
    };

    // Check if file already exists in state to avoid duplicates
    const existingIndex = state.files.findIndex(f => f.id === fileId);
    if (existingIndex >= 0) {
        state.files[existingIndex] = fileData; // Update existing
    } else {
        state.files.push(fileData);
    }

    renderFileList();
    openFile(fileData);
}

// Simple hash function for deterministic IDs
async function generateHash(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 32); // Use first 32 chars as ID
}

function renderFileList() {
    elements.fileList.innerHTML = state.files.map(file => `
        <div class="file-item ${state.currentFile?.id === file.id ? 'active' : ''}" 
             onclick="window.openFileById('${file.id}')">
          <span class="material-icons-round">description</span>
          <span class="text-truncate">${file.name}</span>
        </div>
    `).join('');
}

// Global handler for list items
window.openFileById = (id) => {
    const file = state.files.find(f => f.id === id);
    if (file) openFile(file);
};

async function handleJumpToSource(sourceId, highlightId) {


    // Try to find highlight first, as it might have the updated sourceId
    let highlight = null;
    if (window.inksight && window.inksight.highlightManager) {
        highlight = window.inksight.highlightManager.highlights.find(h => h.id === highlightId);
    }


    // If highlight found, use its sourceId as it's likely more up-to-date (remapped on load)
    const effectiveSourceId = highlight ? highlight.sourceId : sourceId;
    // console.log('[Main] Effective sourceId:', effectiveSourceId);

    const file = state.files.find(f => f.id === effectiveSourceId);
    if (!file) {
        console.warn('[Main] Source file not found:', effectiveSourceId, 'Original:', sourceId);
        return;
    }
    // console.log('[Main] Found file:', file.name);

    if (!highlight) {
        console.warn('[Main] Highlight not found:', highlightId);
        return;
    }

    // If file is not current, load it
    if (!state.currentFile || state.currentFile.id !== effectiveSourceId) {

        await openFile(file);
    }

    // Scroll to highlight
    if (currentReader) {
        if (currentReader.scrollToHighlight) {
            await currentReader.scrollToHighlight(highlightId);
        } else {
            // Fallback for other readers (Text/Epub) if they don't support scrollToHighlight yet

            // ... (keep existing fallback logic if needed, or just rely on reader)
            // For now, let's assume other readers might need similar implementation later
            // But since we only modified PDFReader, we should check type or method existence
            const pageInfo = currentReader.pages ? currentReader.pages[highlight.location.page - 1] : null;
            if (pageInfo && pageInfo.wrapper) {
                pageInfo.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash highlight after scroll
                if (currentReader.flashHighlight) {
                    setTimeout(() => {
                        currentReader.flashHighlight(highlightId);
                    }, 500);
                }
            }
        }
    }
}

async function openFile(fileData) {
    state.currentFile = fileData;
    elements.docTitle.textContent = fileData.name;
    renderFileList();
    elements.viewer.innerHTML = '';

    // Register document with DocumentManager
    if (window.inksight.documentManager) {
        window.inksight.documentManager.registerDocument(
            fileData.id,
            fileData.name,
            fileData.type,
            true // loaded
        );
    }

    // Update source names in CardSystem and HighlightManager (Healing for existing files)
    if (window.inksight.cardSystem) {
        window.inksight.cardSystem.updateSourceNames(fileData.id, fileData.name);
    }
    if (window.inksight.highlightManager) {
        window.inksight.highlightManager.updateSourceNames(fileData.id, fileData.name);
    }

    if (fileData.type === 'application/pdf') {
        // Clean up existing reader if it exists
        if (currentReader) {

            if (currentReader.destroy) {
                currentReader.destroy();
            }
            currentReader = null;
        }

        elements.viewer.innerHTML = '<div class="loading">Loading PDF...</div>';
        currentReader = new PDFReader(elements.viewer);

        // Expose PDF reader globally for import operations
        window.inksight.pdfReader = currentReader;

        currentReader.setPageCountCallback((count) => {
            state.totalPages = count;
            updatePageInfo();
        });

        currentReader.setPageChangeCallback((num) => {
            state.currentPage = num;
            updatePageInfo();
        });

        try {
            await currentReader.load(fileData);
            elements.prevBtn.disabled = false;
            elements.nextBtn.disabled = false;
        } catch (e) {
            elements.viewer.innerHTML = `<div class="error">Error loading PDF: ${e.message}</div>`;
            console.error(e);
        }
    } else if (fileData.type === 'application/epub+zip' || fileData.type === 'application/epub' || fileData.name.toLowerCase().endsWith('.epub')) {
        elements.viewer.innerHTML = '<div class="loading">Loading EPUB...</div>';
        currentReader = new EpubReader(elements.viewer);

        currentReader.setPageCountCallback((count) => {
            state.totalPages = count;
            updatePageInfo();
        });

        currentReader.setPageChangeCallback((location) => {
            state.currentPage = location.start.location;
            updatePageInfo();
        });

        try {
            await currentReader.load(fileData);
            elements.prevBtn.disabled = false;
            elements.nextBtn.disabled = false;
        } catch (e) {
            elements.viewer.innerHTML = `<div class="error">Error loading EPUB: ${e.message}</div>`;
            console.error(e);
        }
    } else if (fileData.type === 'text/plain' || fileData.type === 'text/markdown' || fileData.name.toLowerCase().endsWith('.md') || fileData.name.toLowerCase().endsWith('.txt')) {
        elements.viewer.innerHTML = '<div class="loading">Loading Text...</div>';
        currentReader = new TextReader(elements.viewer);

        currentReader.setPageCountCallback((count) => {
            state.totalPages = count;
            updatePageInfo();
        });

        currentReader.setPageChangeCallback((num) => {
            state.currentPage = num;
            updatePageInfo();
        });

        try {
            await currentReader.load(fileData);
            elements.prevBtn.disabled = false;
            elements.nextBtn.disabled = false;
        } catch (e) {
            elements.viewer.innerHTML = `<div class="error">Error loading Text: ${e.message}</div>`;
            console.error(e);
        }
    } else {
        elements.viewer.innerHTML = '<div class="error">Unsupported file type: ' + fileData.type + '</div>';
    }

    updateToolAvailability(fileData.type);
}

function updateToolAvailability(fileType) {
    const isPDF = fileType === 'application/pdf';
    const toolsToToggle = ['rect-mode', 'ellipse-mode', 'highlighter-mode'];

    toolsToToggle.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !isPDF;
            if (!isPDF) {
                btn.classList.add('disabled');
                btn.title += ' (Only available for PDF)';
            } else {
                btn.classList.remove('disabled');
                btn.title = btn.title.replace(' (Only available for PDF)', '');
            }
        }
    });

    // Always switch to text mode if current mode is disabled
    const currentModeBtn = document.querySelector('.mode-btn.active');
    if (currentModeBtn && currentModeBtn.disabled) {
        const textModeBtn = document.getElementById('text-mode');
        if (textModeBtn) textModeBtn.click();
    }
}

function updatePageInfo() {
    if (state.totalPages > 0) {
        elements.pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;
    } else {
        elements.pageInfo.textContent = '-- / --';
    }
}

function loadFilesFromStorage() {
    // TODO: Implement IndexedDB loading
}

// Start app
init();
