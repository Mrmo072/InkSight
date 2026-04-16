const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('electronAPI', {
    saveFile: (filename, content) => invoke('save-file', filename, content),
    loadFile: (filename) => invoke('load-file', filename),
    ensureSaveDir: () => invoke('ensure-save-dir'),
    findSaveByMd5: (md5) => invoke('find-save-by-md5', md5),
    getRuntimeStorageInfo: () => invoke('get-runtime-storage-info'),
    saveRuntimeProject: (payload) => invoke('save-runtime-project', payload),
    loadRuntimeProject: (payload) => invoke('load-runtime-project', payload)
});
