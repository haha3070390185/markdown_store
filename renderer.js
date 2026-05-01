const pathSep = window.electronAPI.pathSep;
const pathJoin = window.electronAPI.pathJoin;
const pathResolve = window.electronAPI.pathResolve;

if (typeof marked !== 'undefined') {
  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {}
      }
      if (typeof hljs !== 'undefined') {
        return hljs.highlightAuto(code).value;
      }
      return code;
    },
    breaks: true,
    gfm: true
  });
}

class MarkdownPreviewApp {
  constructor() {
    this.currentFolder = null;
    this.currentFile = null;
    this.folderHistory = [];
    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
  }

  bindElements() {
    this.selectFolderBtn = document.getElementById('selectFolderBtn');
    this.fileList = document.getElementById('fileList');
    this.currentPath = document.getElementById('currentPath');
    this.breadcrumb = document.getElementById('breadcrumb');
    this.previewContent = document.getElementById('previewContent');
    this.welcomeScreen = document.getElementById('welcomeScreen');
    this.fileName = document.querySelector('.file-name');
  }

  bindEvents() {
    this.selectFolderBtn.addEventListener('click', () => this.selectFolder());
  }

  async selectFolder() {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      this.currentFolder = folderPath;
      this.folderHistory = [folderPath];
      await this.loadFolder(folderPath);
    }
  }

  async loadFolder(folderPath, addToHistory = false) {
    this.currentFolder = folderPath;
    
    if (addToHistory && this.folderHistory[this.folderHistory.length - 1] !== folderPath) {
      this.folderHistory.push(folderPath);
    }

    this.currentPath.textContent = folderPath;
    this.updateBreadcrumb();

    const items = await window.electronAPI.readFolder(folderPath);
    this.renderFileList(items, folderPath);
  }

  updateBreadcrumb() {
    if (!this.currentFolder) {
      this.breadcrumb.innerHTML = '';
      return;
    }

    const parts = this.currentFolder.split(pathSep).filter(p => p);
    let html = '';
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = index === 0 ? part + pathSep : pathJoin(currentPath, part);
      
      html += `<span class="breadcrumb-item" data-path="${currentPath}">${part}</span>`;
      
      if (index < parts.length - 1) {
        html += `<span class="breadcrumb-separator">›</span>`;
      }
    });

    this.breadcrumb.innerHTML = html;

    this.breadcrumb.querySelectorAll('.breadcrumb-item').forEach((item, index) => {
      if (index === parts.length - 1) {
        item.classList.add('current');
      }
      
      item.addEventListener('click', () => {
        const targetPath = item.dataset.path;
        const historyIndex = this.folderHistory.indexOf(targetPath);
        if (historyIndex !== -1) {
          this.folderHistory = this.folderHistory.slice(0, historyIndex + 1);
        }
        this.loadFolder(targetPath);
      });
    });
  }

  renderFileList(items, folderPath) {
    if (items.length === 0) {
      this.fileList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <p>此文件夹为空</p>
        </div>
      `;
      return;
    }

    let html = '';

    if (this.folderHistory.length > 1) {
      html += `
        <div class="file-item folder-back" data-action="back">
          <span class="file-item-icon">⬆️</span>
          <span class="file-item-name">返回上一级</span>
        </div>
      `;
    }

    items.forEach(item => {
      const icon = item.type === 'folder' ? '📁' : '📄';
      const activeClass = this.currentFile === item.path ? 'active' : '';
      
      html += `
        <div class="file-item ${activeClass}" data-path="${item.path}" data-type="${item.type}">
          <span class="file-item-icon">${icon}</span>
          <span class="file-item-name">${item.name}</span>
        </div>
      `;
    });

    this.fileList.innerHTML = html;

    this.fileList.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = item.dataset.action;
        const itemPath = item.dataset.path;
        const itemType = item.dataset.type;

        if (action === 'back') {
          this.goBack();
        } else if (itemType === 'folder') {
          this.loadFolder(itemPath, true);
        } else if (itemType === 'file') {
          this.openFile(itemPath, item);
        }
      });
    });
  }

  goBack() {
    if (this.folderHistory.length > 1) {
      this.folderHistory.pop();
      const previousFolder = this.folderHistory[this.folderHistory.length - 1];
      this.loadFolder(previousFolder);
    }
  }

  async openFile(filePath, element) {
    this.currentFile = filePath;

    this.fileList.querySelectorAll('.file-item').forEach(item => {
      item.classList.remove('active');
    });
    if (element) {
      element.classList.add('active');
    }

    const fileName = await window.electronAPI.pathBasename(filePath);
    this.fileName.textContent = fileName;

    const content = await window.electronAPI.readFile(filePath);
    if (content !== null) {
      this.renderMarkdown(content);
    }
  }

  renderMarkdown(markdown) {
    let html = '';
    if (typeof marked !== 'undefined') {
      html = marked.parse(markdown);
    } else {
      html = `<pre>${this.escapeHtml(markdown)}</pre>`;
    }
    
    this.previewContent.innerHTML = html;
    
    this.welcomeScreen.classList.add('hidden');
    this.previewContent.classList.add('active');

    if (typeof hljs !== 'undefined') {
      this.previewContent.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }

    this.previewContent.querySelectorAll('img').forEach(async (img) => {
      if (this.currentFile) {
        const dirname = await window.electronAPI.pathDirname(this.currentFile);
        if (!img.src.startsWith('http') && !img.src.startsWith('file://')) {
          const imgPath = pathResolve(dirname, img.getAttribute('src'));
          img.src = 'file://' + imgPath;
        }
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MarkdownPreviewApp();
});
