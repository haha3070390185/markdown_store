const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  pathBasename: (filePath) => ipcRenderer.invoke('path-basename', filePath),
  pathDirname: (filePath) => ipcRenderer.invoke('path-dirname', filePath),
  pathSep: path.sep,
  pathJoin: (...paths) => path.join(...paths),
  pathResolve: (...paths) => path.resolve(...paths)
});
