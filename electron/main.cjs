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

// Get the save directory path (Project Root/files/saves)
const getSaveDir = () => {
    // In dev: process.cwd() is project root
    // In prod: process.cwd() might be app dir. 
    // Secure defaults: app.getPath('userData')/saves
    // But user specifically requested: "d:\Programs\Projects\InkSight\files\saves" style.
    // We try to use process.cwd() which usually maps to execution folder.
    return path.join(process.cwd(), 'files', 'saves');
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
