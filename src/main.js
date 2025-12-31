import './styles/styles.css';
import { PDFReader } from './readers/pdf-reader.js';
import { EpubReader } from './readers/epub-reader.js';
import { TextReader } from './readers/text-reader.js';
import { MindmapView } from './mindmap/mindmap-view.js';
import { DrawnixView } from './mindmap/drawnix-view.js';
import { highlightManager } from './core/highlight-manager.js';
import { SplitView } from './ui/split-view.js';
import { OutlineSidebar } from './ui/outline-sidebar.js';
import { AnnotationList } from './ui/annotation-list.js'; // Import new module
import { suppressResizeObserverLoop } from './drawnix/react-board/src/utils/resizeObserverFix.js';

suppressResizeObserverLoop();

// Initialize global bridge object
window.inksight = {
    currentBook: {
        md5: null,
        name: null,
        id: null
    },
    cardSystem: null,
    highlightManager: null,
    pdfReader: null,
    outlineSidebar: null,
    annotationList: null
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
let outlineSidebar = null;
let annotationList = null;

// Initialization
function init() {

    try {
        loadFilesFromStorage();

        // Init Mindmap or Drawnix
        const mindmapContainer = document.getElementById('mindmap-container');
        if (mindmapContainer) {
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

        // Init Outline Sidebar
        outlineSidebar = new OutlineSidebar('outline-sidebar', 'outline-content', 'toggle-outline');
        window.inksight.outlineSidebar = outlineSidebar;

        // Init Annotation List
        annotationList = new AnnotationList('annotation-list', window.inksight.cardSystem);
        window.inksight.annotationList = annotationList;

        // Setup event listeners AFTER SplitView is initialized
        setupEventListeners();

        // Setup Right Panel Tabs
        setupRightPanelTabs();

    } catch (e) {
        console.error('Initialization error:', e);
    }
}

function setupRightPanelTabs() {
    const tabMindmap = document.getElementById('tab-mindmap');
    const tabAnnotations = document.getElementById('tab-annotations');
    const containerMindmap = document.getElementById('mindmap-container');
    const containerAnnotations = document.getElementById('annotation-list');

    if (!tabMindmap || !tabAnnotations) return;

    tabMindmap.addEventListener('click', () => {
        tabMindmap.classList.add('active');
        tabAnnotations.classList.remove('active');
        containerMindmap.style.display = 'block';
        containerAnnotations.style.display = 'none';
        // splitView.toggleRight(true); // Ensure open
    });

    tabAnnotations.addEventListener('click', () => {
        tabAnnotations.classList.add('active');
        tabMindmap.classList.remove('active');
        containerAnnotations.style.display = 'flex';
        containerMindmap.style.display = 'none';

        // Refresh list when switching to it
        if (annotationList && state.currentFile) {
            annotationList.load(state.currentFile.id);
        }
    });
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
    const docInfoEl = document.getElementById('mindmap-doc-info');

    window.addEventListener('mindmap-selection-changed', (e) => {
        const { sourceId } = e.detail;
        if (sourceId && docInfoEl) {
            const file = state.files.find(f => f.id === sourceId);
            if (file) {
                docInfoEl.textContent = file.name;
                docInfoEl.style.display = 'inline-flex';
                docInfoEl.title = file.name;
            } else if (e.detail.sourceName) {
                docInfoEl.textContent = e.detail.sourceName;
                docInfoEl.style.display = 'inline-flex';
                docInfoEl.title = e.detail.sourceName;
            } else {
                docInfoEl.style.display = 'none';
            }
        } else if (docInfoEl) {
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

        highlighterModeBtn.addEventListener('mouseenter', () => {
            if (highlighterModeBtn.classList.contains('active')) {
                highlighterPanel.classList.add('visible');
                void highlighterPanel.offsetHeight;
                const btnRect = highlighterModeBtn.getBoundingClientRect();
                const offsetParent = highlighterPanel.offsetParent || document.body;
                const containerRect = offsetParent.getBoundingClientRect();
                const panelWidth = 220;
                let left = (btnRect.left - containerRect.left) + (btnRect.width / 2) - (panelWidth / 2);
                const containerWidth = containerRect.width;
                if (left < 10) left = 10;
                if (left + panelWidth > containerWidth - 10) left = containerWidth - panelWidth - 10;
                const top = (btnRect.bottom - containerRect.top) + 12;
                highlighterPanel.style.top = `${top}px`;
                highlighterPanel.style.left = `${left}px`;
                highlighterPanel.style.transform = 'translateX(0)';
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
            if (Math.abs(deltaY) > clickThreshold) isDragging = true;
            if (isDragging) {
                let newHeight = startHeight + deltaY;
                newHeight = Math.max(8, Math.min(48, newHeight));
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

        if (heightSlider) {
            heightSlider.addEventListener('input', (e) => {
                const newHeight = parseInt(e.target.value);
                if (currentReader && currentReader.highlighterTool) {
                    currentReader.highlighterTool.setHeight(newHeight);
                }
            });
        }

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

    const fileSignature = `${file.name}-${file.size}-${file.lastModified}`;
    const fileId = await generateHash(fileSignature);

    const fileData = {
        id: fileId,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        fileObj: file
    };

    const existingIndex = state.files.findIndex(f => f.id === fileId);
    if (existingIndex >= 0) {
        state.files[existingIndex] = fileData;
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
    return hashHex.substring(0, 32);
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
    let highlight = null;
    if (window.inksight && window.inksight.highlightManager) {
        highlight = window.inksight.highlightManager.highlights.find(h => h.id === highlightId);
    }

    const effectiveSourceId = highlight ? highlight.sourceId : sourceId;
    const file = state.files.find(f => f.id === effectiveSourceId);
    if (!file) {
        console.warn('[Main] Source file not found:', effectiveSourceId, 'Original:', sourceId);
        return;
    }

    if (!highlight) {
        console.warn('[Main] Highlight not found:', highlightId);
        return;
    }

    if (!state.currentFile || state.currentFile.id !== effectiveSourceId) {
        await openFile(file);
    }

    if (currentReader) {
        if (currentReader.scrollToHighlight) {
            await currentReader.scrollToHighlight(highlightId);
        } else {
            const pageInfo = currentReader.pages ? currentReader.pages[highlight.location.page - 1] : null;
            if (pageInfo && pageInfo.wrapper) {
                pageInfo.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    if (window.inksight.documentManager) {
        window.inksight.documentManager.registerDocument(
            fileData.id,
            fileData.name,
            fileData.type,
            true
        );
    }

    if (window.inksight.cardSystem) {
        window.inksight.cardSystem.updateSourceNames(fileData.id, fileData.name);
    }
    if (window.inksight.highlightManager) {
        window.inksight.highlightManager.updateSourceNames(fileData.id, fileData.name);
    }

    // Load Annotations List
    if (window.inksight.annotationList) {
        window.inksight.annotationList.load(fileData.id);
    }

    if (fileData.type === 'application/pdf') {
        if (currentReader) {
            if (currentReader.destroy) {
                currentReader.destroy();
            }
            currentReader = null;
        }

        // Reset outline
        outlineSidebar.reset();

        elements.viewer.innerHTML = '<div class="loading">Loading PDF...</div>';
        currentReader = new PDFReader(elements.viewer);
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

            // Load Outline
            const outline = currentReader.getOutline();
            outlineSidebar.render(outline, currentReader.pdfDoc);

        } catch (e) {
            elements.viewer.innerHTML = `<div class="error">Error loading PDF: ${e.message}</div>`;
            console.error(e);
        }
    } else if (fileData.type === 'application/epub+zip' || fileData.type === 'application/epub' || fileData.name.toLowerCase().endsWith('.epub')) {
        outlineSidebar.reset();
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
