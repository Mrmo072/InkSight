const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.cjs');
    console.log('[Main] Preload path:', preloadPath);
    console.log('[Main] Preload exists:', fs.existsSync(preloadPath));

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true, // Enable Node integration
            contextIsolation: false, // Disable Context Isolation for direct access
            preload: preloadPath
        }
    });

    console.log('[Main] Window created');

    win.webContents.setVisualZoomLevelLimits(1, 1).catch((error) => {
        console.error('[Main] Failed to lock visual zoom level:', error);
    });
    win.webContents.setZoomFactor(1);
    win.webContents.on('before-input-event', (event, input) => {
        if (!(input.control || input.meta)) {
            return;
        }

        if (['+', '-', '=', '0'].includes(input.key)) {
            event.preventDefault();
        }
    });

    // In dev, load localhost. In prod, load index.html from dist
    const isDev = !app.isPackaged;

    if (isDev) {
        win.loadURL('http://localhost:5173');
        // win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
        // win.webContents.openDevTools(); // Disabled for production
    }

    // Remove the default menu bar
    win.setMenu(null);
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers for Auto-Save ---

const RUNTIME_PROJECT_MANIFEST = 'project.json';
const RUNTIME_PROJECT_META = 'meta.json';

// Get the save directory path (Project Root/files/saves)
const getSaveDir = () => {
    // In dev: process.cwd() is project root
    // In prod: process.cwd() might be app dir. 
    // Secure defaults: app.getPath('userData')/saves
    // But user specifically requested: "d:\Programs\Projects\InkSight\files\saves" style.
    // We try to use process.cwd() which usually maps to execution folder.
    return path.join(process.cwd(), 'files', 'saves');
};

const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
};

const getInstallRuntimeDir = () => {
    const baseDir = app.isPackaged ? path.dirname(process.execPath) : process.cwd();
    return path.join(baseDir, 'runtime-data');
};

const normalizeRuntimeSegment = (value, fallback) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    const sanitized = normalized.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return sanitized || fallback;
};

const getRuntimeProjectDir = ({ userId, sessionId, projectId }) => {
    return path.join(
        getInstallRuntimeDir(),
        'users',
        normalizeRuntimeSegment(userId, 'anonymous'),
        'sessions',
        normalizeRuntimeSegment(sessionId, 'default'),
        'projects',
        normalizeRuntimeSegment(projectId, 'workspace')
    );
};

const getRuntimeUserSessionsDir = (userId) => {
    return path.join(
        getInstallRuntimeDir(),
        'users',
        normalizeRuntimeSegment(userId, 'anonymous'),
        'sessions'
    );
};

const toBuffer = (value) => {
    if (Buffer.isBuffer(value)) {
        return value;
    }

    if (value instanceof Uint8Array) {
        return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    }

    if (value instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(value));
    }

    if (Array.isArray(value)) {
        return Buffer.from(value);
    }

    throw new Error('Unsupported binary payload');
};

const writeRuntimeBinaryFile = (rootDir, relativePath, bytes) => {
    const absolutePath = path.join(rootDir, relativePath);
    ensureDir(path.dirname(absolutePath));
    fs.writeFileSync(absolutePath, toBuffer(bytes));
};

const listRelativeFiles = (rootDir, currentDir = rootDir) => {
    if (!fs.existsSync(currentDir)) {
        return [];
    }

    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    const results = [];

    for (const item of items) {
        const absolutePath = path.join(currentDir, item.name);
        if (item.isDirectory()) {
            results.push(...listRelativeFiles(rootDir, absolutePath));
        } else if (item.isFile()) {
            results.push(path.relative(rootDir, absolutePath).replace(/\\/g, '/'));
        }
    }

    return results;
};

const cleanupRuntimeSubdir = (projectDir, subdirName, expectedPaths) => {
    const targetDir = path.join(projectDir, subdirName);
    if (!fs.existsSync(targetDir)) {
        return;
    }

    const expected = new Set(expectedPaths);
    const existing = listRelativeFiles(projectDir, targetDir);
    for (const relativePath of existing) {
        if (expected.has(relativePath)) {
            continue;
        }

        fs.rmSync(path.join(projectDir, relativePath), { force: true });
    }
};

const resolveLatestRuntimeProjectDir = ({ userId, sessionId, projectId }) => {
    const preferredDir = getRuntimeProjectDir({ userId, sessionId, projectId });
    if (fs.existsSync(path.join(preferredDir, RUNTIME_PROJECT_MANIFEST))) {
        return preferredDir;
    }

    const sessionsDir = getRuntimeUserSessionsDir(userId);
    if (!fs.existsSync(sessionsDir)) {
        return null;
    }

    const sessionEntries = fs.readdirSync(sessionsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    let bestMatch = null;

    for (const sessionEntry of sessionEntries) {
        const candidateDir = getRuntimeProjectDir({
            userId,
            sessionId: sessionEntry.name,
            projectId
        });
        const metaPath = path.join(candidateDir, RUNTIME_PROJECT_META);
        const manifestPath = path.join(candidateDir, RUNTIME_PROJECT_MANIFEST);
        if (!fs.existsSync(metaPath) || !fs.existsSync(manifestPath)) {
            continue;
        }

        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            const savedAt = Date.parse(meta.savedAt || 0) || 0;
            if (!bestMatch || savedAt > bestMatch.savedAt) {
                bestMatch = {
                    dir: candidateDir,
                    savedAt
                };
            }
        } catch {
            // ignore malformed metadata
        }
    }

    return bestMatch?.dir || null;
};

ipcMain.handle('ensure-save-dir', async () => {
    const dir = getSaveDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
});

ipcMain.handle('save-file', async (event, filename, content) => {
    try {
        const dir = getSaveDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, path: filePath };
    } catch (e) {
        console.error('IPC save-file error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-file', async (event, filename) => {
    try {
        const dir = getSaveDir();
        const filePath = path.join(dir, filename);
        console.log('[Main] IPC load-file request:', filename);
        console.log('[Main] Resolved path:', filePath);
        if (!fs.existsSync(filePath)) {
            console.warn('[Main] File not found at:', filePath);
            return { success: false, error: 'File not found' };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content };
    } catch (e) {
        console.error('IPC load-file error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('find-save-by-md5', async (event, targetMd5) => {
    try {
        const dir = getSaveDir();
        if (!fs.existsSync(dir)) return { success: false, error: 'Save directory not found' };

        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (!file.endsWith('.inksight')) continue;

            try {
                const filePath = path.join(dir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                // Simple substring check first
                if (content.includes(`"bookMd5": "${targetMd5}"`)) {
                    console.log('[Main] Found save file by MD5 match:', file);
                    return { success: true, filename: file };
                }
            } catch (err) {
                // Ignore read errors
            }
        }
        return { success: false, error: 'No matching save file found' };
    } catch (e) {
        console.error('IPC find-save-by-md5 error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-runtime-storage-info', async () => {
    const rootPath = ensureDir(getInstallRuntimeDir());
    return {
        rootPath,
        mode: 'runtime-data'
    };
});

ipcMain.handle('save-runtime-project', async (event, payload = {}) => {
    try {
        const {
            userId,
            sessionId,
            projectId,
            projectName,
            manifest,
            assetEntries = [],
            documentEntries = []
        } = payload;

        const projectDir = ensureDir(getRuntimeProjectDir({ userId, sessionId, projectId }));
        const manifestPath = path.join(projectDir, RUNTIME_PROJECT_MANIFEST);
        const metaPath = path.join(projectDir, RUNTIME_PROJECT_META);

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

        for (const assetEntry of assetEntries) {
            writeRuntimeBinaryFile(projectDir, assetEntry.path, assetEntry.bytes);
        }

        for (const documentEntry of documentEntries) {
            writeRuntimeBinaryFile(projectDir, documentEntry.path, documentEntry.bytes);
        }

        cleanupRuntimeSubdir(projectDir, 'assets', assetEntries.map((entry) => entry.path));
        cleanupRuntimeSubdir(projectDir, 'documents', documentEntries.map((entry) => entry.path));

        const meta = {
            userId,
            sessionId,
            projectId,
            projectName,
            savedAt: new Date().toISOString(),
            manifest: RUNTIME_PROJECT_MANIFEST,
            assetCount: assetEntries.length,
            documentCount: documentEntries.length
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

        return {
            success: true,
            projectDir,
            manifestPath,
            metaPath,
            savedAt: meta.savedAt,
            mode: 'runtime-data'
        };
    } catch (error) {
        console.error('IPC save-runtime-project error:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('load-runtime-project', async (event, payload = {}) => {
    try {
        const { userId, sessionId, projectId } = payload;
        const projectDir = resolveLatestRuntimeProjectDir({ userId, sessionId, projectId });
        if (!projectDir) {
            return {
                success: false,
                error: 'Runtime project not found'
            };
        }

        const manifestPath = path.join(projectDir, RUNTIME_PROJECT_MANIFEST);
        const metaPath = path.join(projectDir, RUNTIME_PROJECT_META);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const meta = fs.existsSync(metaPath)
            ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            : null;

        const referencedPaths = new Set();
        for (const asset of manifest.assets || []) {
            if (asset?.path) {
                referencedPaths.add(asset.path);
            }
        }
        for (const document of manifest.documents || []) {
            if (document?.path) {
                referencedPaths.add(document.path);
            }
        }

        const files = Array.from(referencedPaths).map((relativePath) => {
            const absolutePath = path.join(projectDir, relativePath);
            const bytes = fs.readFileSync(absolutePath);
            return {
                path: relativePath,
                bytes: new Uint8Array(bytes),
                mimeType: ''
            };
        });

        return {
            success: true,
            manifest,
            files,
            projectDir,
            projectId: meta?.projectId || projectId,
            projectName: meta?.projectName || null,
            savedAt: meta?.savedAt || null
        };
    } catch (error) {
        console.error('IPC load-runtime-project error:', error);
        return {
            success: false,
            error: error.message
        };
    }
});
