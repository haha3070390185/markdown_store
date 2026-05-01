class MarkdownPreviewApp {
  constructor() {
    this.currentFolder = null;
    this.currentFile = null;
    this.folderHistory = [];
    this.pathUtils = null;
    this.markdownUtils = null;
    this.fileUtils = null;
    this.platform = null;
    this.isInitialized = false;
    this.useCdnLibraries = false;
    
    this.init();
  }

  init() {
    console.log('MarkdownPreviewApp init starting...');
    
    if (typeof window.electronAPI === 'undefined') {
      console.error('electronAPI is not available. Make sure preload.js is correctly configured.');
      this.showError('应用初始化失败：无法访问系统API\n请确保在Electron环境中运行此应用');
      return;
    }

    this.pathUtils = window.electronAPI.pathUtils;
    this.markdownUtils = window.electronAPI.markdownUtils;
    this.fileUtils = window.electronAPI.fileUtils;
    this.platform = window.electronAPI.platform;

    if (!this.pathUtils) {
      console.error('pathUtils is not available in electronAPI');
      this.showError('应用初始化失败：路径工具不可用');
      return;
    }

    console.log('Platform:', this.platform);
    console.log('Path separator:', this.pathUtils.sep);
    console.log('MarkdownUtils available:', !!this.markdownUtils);
    console.log('Marked via preload:', this.markdownUtils ? this.markdownUtils.isMarkedAvailable() : false);
    console.log('HLJS via preload:', this.markdownUtils ? this.markdownUtils.isHljsAvailable() : false);
    console.log('Global marked available:', typeof marked !== 'undefined');
    console.log('Global hljs available:', typeof hljs !== 'undefined');

    if (this.markdownUtils && this.markdownUtils.isMarkedAvailable()) {
      console.log('Using marked from preload');
      this.initMarkedFromPreload();
    } else if (typeof marked !== 'undefined') {
      console.log('Using marked from CDN');
      this.useCdnLibraries = true;
      this.initMarkedFromCdn();
    } else {
      console.warn('No markdown parser available');
    }

    this.bindElements();
    this.bindEvents();
    this.setupIpcListeners();
    this.isInitialized = true;
    
    console.log('MarkdownPreviewApp initialized successfully');
  }

  initMarkedFromPreload() {
    if (!this.markdownUtils) return;

    try {
      this.markdownUtils.setMarkedOptions({
        highlight: (code, lang) => {
          return this.markdownUtils.highlight(code, lang);
        },
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false
      });
      console.log('marked initialized from preload');
    } catch (error) {
      console.error('Error initializing marked from preload:', error);
    }
  }

  initMarkedFromCdn() {
    if (typeof marked === 'undefined') return;

    try {
      marked.setOptions({
        highlight: (code, lang) => {
          if (typeof hljs !== 'undefined') {
            if (lang && hljs.getLanguage(lang)) {
              try {
                return hljs.highlight(code, { language: lang }).value;
              } catch (e) {
                console.warn('Highlight error for language', lang, e);
              }
            }
            try {
              return hljs.highlightAuto(code).value;
            } catch (e) {
              console.warn('Auto-highlight error', e);
            }
          }
          return code;
        },
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false
      });
      console.log('marked initialized from CDN');
    } catch (error) {
      console.error('Error initializing marked from CDN:', error);
    }
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
    if (this.selectFolderBtn) {
      this.selectFolderBtn.addEventListener('click', async () => {
        console.log('Select folder button clicked');
        await this.selectFolder();
      });
    }
  }

  setupIpcListeners() {
    if (window.electronAPI.on) {
      window.electronAPI.on('folder-changed', async (folderPath) => {
        console.log('Folder changed via IPC:', folderPath);
        if (folderPath) {
          this.currentFolder = folderPath;
          this.folderHistory = [folderPath];
          await this.loadFolder(folderPath);
        }
      });
    }
  }

  showError(message) {
    if (this.welcomeScreen) {
      this.welcomeScreen.innerHTML = `
        <div class="welcome-content">
          <span class="welcome-icon">⚠️</span>
          <h1>初始化失败</h1>
          <p style="color: #ef4444; white-space: pre-wrap;">${this.escapeHtml(message)}</p>
          <p style="margin-top: 20px; font-size: 12px; color: var(--text-secondary);">
            请检查开发者工具(F12)获取更多信息
          </p>
        </div>
      `;
    }
  }

  async selectFolder() {
    if (!this.isInitialized) {
      console.error('App not initialized');
      return null;
    }

    try {
      console.log('Calling selectFolder via electronAPI...');
      const folderPath = await window.electronAPI.selectFolder();
      console.log('Selected folder result:', folderPath);
      
      if (folderPath) {
        this.currentFolder = folderPath;
        this.folderHistory = [folderPath];
        await this.loadFolder(folderPath);
        return folderPath;
      }
      return null;
    } catch (error) {
      console.error('Error selecting folder:', error);
      this.showError('选择文件夹时发生错误：\n' + error.message);
      return null;
    }
  }

  async loadFolder(folderPath, addToHistory = false) {
    if (!folderPath) {
      console.warn('loadFolder called with empty path');
      return;
    }

    console.log('Loading folder:', folderPath);
    this.currentFolder = folderPath;
    
    if (addToHistory && this.folderHistory[this.folderHistory.length - 1] !== folderPath) {
      this.folderHistory.push(folderPath);
    }

    if (this.currentPath) {
      this.currentPath.textContent = folderPath;
    }

    this.updateBreadcrumb();

    try {
      console.log('Calling readFolder via electronAPI...');
      const items = await window.electronAPI.readFolder(folderPath);
      console.log('Items received:', items.length, items);
      this.renderFileList(items, folderPath);
    } catch (error) {
      console.error('Error reading folder:', folderPath, error);
      this.renderFileList([], folderPath);
      this.showPreviewError('读取文件夹时发生错误：' + error.message);
    }
  }

  updateBreadcrumb() {
    if (!this.currentFolder || !this.breadcrumb) {
      return;
    }

    const parts = this.splitPathForBreadcrumb(this.currentFolder);
    console.log('Breadcrumb parts:', parts);
    
    let html = '';
    let currentPath = '';

    parts.forEach((part, index) => {
      if (index === 0) {
        currentPath = part;
      } else {
        currentPath = this.pathUtils.join(currentPath, part);
      }
      
      const isLast = index === parts.length - 1;
      const itemClass = isLast ? 'breadcrumb-item current' : 'breadcrumb-item';
      
      html += `<span class="${itemClass}" data-path="${this.escapeHtml(currentPath)}">${this.escapeHtml(part)}</span>`;
      
      if (!isLast) {
        html += `<span class="breadcrumb-separator">›</span>`;
      }
    });

    this.breadcrumb.innerHTML = html;

    this.breadcrumb.querySelectorAll('.breadcrumb-item').forEach((item) => {
      item.addEventListener('click', () => {
        const targetPath = item.dataset.path;
        console.log('Breadcrumb clicked:', targetPath);
        
        const historyIndex = this.folderHistory.indexOf(targetPath);
        if (historyIndex !== -1) {
          this.folderHistory = this.folderHistory.slice(0, historyIndex + 1);
        }
        
        this.loadFolder(targetPath);
      });
    });
  }

  splitPathForBreadcrumb(filePath) {
    if (!filePath) return [];

    if (this.platform === 'win32') {
      const match = filePath.match(/^([a-zA-Z]:)(.*)$/);
      if (match) {
        const drive = match[1];
        const rest = match[2];
        const restParts = rest.split(/[\\\/]+/).filter(p => p);
        return [drive, ...restParts];
      }
    }

    const parts = filePath.split(/[\\\/]+/).filter(p => p);
    
    if (filePath.startsWith('/') || filePath.startsWith('\\')) {
      parts.unshift(this.pathUtils.sep);
    }

    return parts;
  }

  renderFileList(items, folderPath) {
    if (!this.fileList) return;

    if (!items || items.length === 0) {
      this.fileList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <p>此文件夹为空</p>
          <p style="font-size: 12px; margin-top: 8px; color: var(--text-secondary);">
            ${folderPath ? this.escapeHtml(folderPath) : ''}
          </p>
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
        <div class="file-item ${activeClass}" data-path="${this.escapeHtml(item.path)}" data-type="${item.type}">
          <span class="file-item-icon">${icon}</span>
          <span class="file-item-name">${this.escapeHtml(item.name)}</span>
        </div>
      `;
    });

    this.fileList.innerHTML = html;

    this.fileList.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = item.dataset.action;
        const itemPath = item.dataset.path;
        const itemType = item.dataset.type;

        console.log('Item clicked:', { action, itemPath, itemType });

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
    if (!filePath) {
      console.warn('openFile called with empty path');
      return;
    }

    console.log('Opening file:', filePath);
    this.currentFile = filePath;

    this.fileList.querySelectorAll('.file-item').forEach(item => {
      item.classList.remove('active');
    });
    if (element) {
      element.classList.add('active');
    }

    try {
      const fileName = this.pathUtils.basename(filePath);
      if (this.fileName) {
        this.fileName.textContent = fileName;
      }

      console.log('Calling readFile via electronAPI...');
      const content = await window.electronAPI.readFile(filePath);
      console.log('File content received, length:', content ? content.length : 0);
      
      if (content !== null) {
        this.renderMarkdown(content);
      } else {
        this.showPreviewError('无法读取文件内容');
      }
    } catch (error) {
      console.error('Error opening file:', filePath, error);
      this.showPreviewError('读取文件时发生错误：' + error.message);
    }
  }

  showPreviewError(message) {
    if (this.previewContent && this.welcomeScreen) {
      this.welcomeScreen.classList.remove('hidden');
      this.previewContent.classList.remove('active');
      
      this.welcomeScreen.innerHTML = `
        <div class="welcome-content">
          <span class="welcome-icon">❌</span>
          <h1>预览失败</h1>
          <p style="color: #ef4444;">${this.escapeHtml(message)}</p>
        </div>
      `;
    }
  }

  renderMarkdown(markdown) {
    if (!this.previewContent || !this.welcomeScreen) return;

    let html = '';
    let usePreload = this.markdownUtils && this.markdownUtils.isMarkedAvailable();
    let useCdn = this.useCdnLibraries && typeof marked !== 'undefined';
    
    console.log('Rendering markdown...');
    console.log('Use preload:', usePreload);
    console.log('Use CDN:', useCdn);

    if (usePreload) {
      try {
        html = this.markdownUtils.parse(markdown);
        console.log('Parsed via preload, html length:', html ? html.length : 0);
      } catch (error) {
        console.error('Error parsing markdown via preload:', error);
        html = `<pre style="color: #ef4444;">Markdown解析错误: ${this.escapeHtml(error.message)}</pre><pre>${this.escapeHtml(markdown)}</pre>`;
      }
    } else if (useCdn) {
      try {
        html = marked.parse(markdown);
        console.log('Parsed via CDN, html length:', html ? html.length : 0);
      } catch (error) {
        console.error('Error parsing markdown via CDN:', error);
        html = `<pre style="color: #ef4444;">Markdown解析错误: ${this.escapeHtml(error.message)}</pre><pre>${this.escapeHtml(markdown)}</pre>`;
      }
    } else {
      console.warn('No markdown parser available, showing raw text');
      html = `<div style="padding: 20px; background: rgba(0,0,0,0.3); border-radius: 8px;">
        <h3 style="color: #f59e0b; margin-bottom: 16px;">⚠️ Markdown解析器不可用</h3>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
          无法加载Markdown解析库。这可能是由于：
        </p>
        <ul style="color: var(--text-secondary); margin-left: 20px; margin-bottom: 16px;">
          <li>preload脚本未正确加载</li>
          <li>网络连接问题(CDN加载失败)</li>
          <li>依赖包未正确安装</li>
        </ul>
        <p style="color: var(--text-secondary);">以下是原始内容：</p>
      </div>
      <pre style="margin-top: 16px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px; overflow-x: auto;">${this.escapeHtml(markdown)}</pre>`;
    }
    
    this.previewContent.innerHTML = html;
    
    this.welcomeScreen.classList.add('hidden');
    this.previewContent.classList.add('active');

    this.highlightCodeBlocks();
    this.processImages();
  }

  highlightCodeBlocks() {
    if (!this.previewContent) return;

    const codeBlocks = this.previewContent.querySelectorAll('pre code');
    console.log('Found code blocks:', codeBlocks.length);

    if (this.markdownUtils && this.markdownUtils.isHljsAvailable()) {
      codeBlocks.forEach((block) => {
        try {
          this.markdownUtils.highlightElement(block);
        } catch (e) {
          console.warn('Error highlighting code block via preload:', e);
        }
      });
    } else if (typeof hljs !== 'undefined') {
      codeBlocks.forEach((block) => {
        try {
          hljs.highlightElement(block);
        } catch (e) {
          console.warn('Error highlighting code block via CDN:', e);
        }
      });
    }
  }

  async processImages() {
    if (!this.currentFile || !this.previewContent) return;

    const images = this.previewContent.querySelectorAll('img');
    console.log('Found images:', images.length);
    
    for (const img of images) {
      const src = img.getAttribute('src');
      if (!src) continue;

      if (src.startsWith('http://') || src.startsWith('https://') || 
          src.startsWith('file://') || src.startsWith('data:')) {
        continue;
      }

      try {
        const dirname = this.pathUtils.dirname(this.currentFile);
        const imgPath = this.pathUtils.resolve(dirname, src);
        
        img.src = 'file://' + imgPath;
        console.log('Processed image:', src, '->', img.src);
      } catch (error) {
        console.warn('Error processing image:', src, error);
      }
    }
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('=== DOMContentLoaded fired ===');
  console.log('electronAPI available:', typeof window.electronAPI !== 'undefined');
  
  if (typeof window.electronAPI !== 'undefined') {
    console.log('electronAPI keys:', Object.keys(window.electronAPI));
    console.log('pathUtils available:', !!window.electronAPI.pathUtils);
    console.log('markdownUtils available:', !!window.electronAPI.markdownUtils);
    console.log('fileUtils available:', !!window.electronAPI.fileUtils);
    console.log('platform:', window.electronAPI.platform);
    
    new MarkdownPreviewApp();
  } else {
    console.error('electronAPI is not available. Preload script may not have loaded correctly.');
    
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) {
      welcomeScreen.innerHTML = `
        <div class="welcome-content">
          <span class="welcome-icon">⚠️</span>
          <h1>应用初始化失败</h1>
          <p style="color: #ef4444;">无法访问系统API</p>
          <p style="margin-top: 20px; font-size: 12px; color: var(--text-secondary);">
            请确保在Electron环境中运行此应用<br>
            检查开发者工具(F12)获取更多信息
          </p>
          <div style="margin-top: 20px; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: left;">
            <p style="font-weight: 600; margin-bottom: 8px;">可能的原因：</p>
            <ul style="margin-left: 20px; color: var(--text-secondary);">
              <li>preload.js未正确配置</li>
              <li>contextIsolation设置问题</li>
              <li>Electron版本兼容性问题</li>
            </ul>
          </div>
        </div>
      `;
    }
  }
});
