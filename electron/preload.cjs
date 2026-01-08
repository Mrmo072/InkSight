const { ipcRenderer } = require('electron');

console.log('[Preload] Exposing ipcRenderer to window...');

// Direct attachment (works when contextIsolation: false)
window.ipcRenderer = ipcRenderer;

console.log('[Preload] ipcRenderer exposed.');
