const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

let marked;
let hljs;

try {
  marked = require('marked');
  console.log('marked loaded successfully in preload');
} catch (e) {
  console.error('Failed to load marked:', e);
}

try {
  hljs = require('highlight.js');
  console.log('highlight.js loaded successfully in preload');
} catch (e) {
  console.error('Failed to load highlight.js:', e);
}

const pathUtils = {
  sep: path.sep,
  delimiter: path.delimiter,
  
  basename: (filePath, ext) => path.basename(filePath, ext),
  dirname: (filePath) => path.dirname(filePath),
  extname: (filePath) => path.extname(filePath),
  
  join: (...paths) => path.join(...paths),
  resolve: (...paths) => path.resolve(...paths),
  normalize: (filePath) => path.normalize(filePath),
  
  isAbsolute: (filePath) => path.isAbsolute(filePath),
  relative: (from, to) => path.relative(from, to),
  
  parse: (filePath) => path.parse(filePath),
  format: (pathObject) => path.format(pathObject),
  
  splitPath: (filePath) => {
    const parts = [];
    let current = filePath;
    let prev = '';
    
    while (current !== prev) {
      const base = path.basename(current);
      if (base) parts.unshift(base);
      prev = current;
      current = path.dirname(current);
    }
    
    if (path.isAbsolute(filePath)) {
      const root = path.parse(filePath).root;
      if (root) parts.unshift(root);
    }
    
    return parts;
  },
  
  getWindowsDrive: (filePath) => {
    if (process.platform === 'win32') {
      const match = filePath.match(/^([a-zA-Z]:)/);
      return match ? match[1] : null;
    }
    return null;
  }
};

const markdownUtils = {
  isMarkedAvailable: () => !!marked,
  isHljsAvailable: () => !!hljs,
  
  setMarkedOptions: (options) => {
    if (marked) {
      marked.setOptions(options);
    }
  },
  
  parse: (markdown) => {
    if (marked) {
      return marked.parse(markdown);
    }
    return null;
  },
  
  parseInline: (markdown) => {
    if (marked && marked.parseInline) {
      return marked.parseInline(markdown);
    }
    return null;
  },
  
  highlight: (code, lang) => {
    if (hljs) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          console.warn('Highlight error:', e);
        }
      }
      try {
        return hljs.highlightAuto(code).value;
      } catch (e) {
        console.warn('Auto-highlight error:', e);
      }
    }
    return code;
  },
  
  highlightElement: (element) => {
    if (hljs && hljs.highlightElement) {
      hljs.highlightElement(element);
    }
  },
  
  getSupportedLanguages: () => {
    if (hljs && hljs.listLanguages) {
      return hljs.listLanguages();
    }
    return [];
  }
};

const fileUtils = {
  existsSync: (filePath) => {
    try {
      return fs.existsSync(filePath);
    } catch (e) {
      return false;
    }
  },
  
  statSync: (filePath) => {
    try {
      const stat = fs.statSync(filePath);
      return {
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        size: stat.size,
        mtime: stat.mtimeMs,
        ctime: stat.ctimeMs
      };
    } catch (e) {
      return null;
    }
  },
  
  readFileSync: (filePath, encoding = 'utf-8') => {
    try {
      return fs.readFileSync(filePath, encoding);
    } catch (e) {
      console.error('readFileSync error:', e);
      return null;
    }
  },
  
  readdirSync: (folderPath, options = {}) => {
    try {
      const items = fs.readdirSync(folderPath, { withFileTypes: true, ...options });
      return items.map(item => ({
        name: item.name,
        isFile: item.isFile(),
        isDirectory: item.isDirectory(),
        isSymbolicLink: item.isSymbolicLink()
      }));
    } catch (e) {
      console.error('readdirSync error:', e);
      return [];
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  
  pathUtils: pathUtils,
  markdownUtils: markdownUtils,
  fileUtils: fileUtils,
  
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
  
  appPath: () => ipcRenderer.invoke('get-app-path'),
  
  on: (channel, callback) => {
    const validChannels = ['file-changed', 'folder-changed'];
    if (validChannels.includes(channel)) {
      const newCallback = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, newCallback);
      return () => ipcRenderer.removeListener(channel, newCallback);
    }
    return () => {};
  },
  
  send: (channel, ...args) => {
    const validChannels = ['open-folder', 'refresh'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  }
});

console.log('Preload script loaded successfully');
console.log('Platform:', process.platform);
console.log('Marked available:', !!marked);
console.log('Highlight.js available:', !!hljs);
