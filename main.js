const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: true,
    titleBarStyle: 'default',
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const folderPath = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory']
            });
            if (folderPath.filePaths[0]) {
              mainWindow.webContents.send('folder-changed', folderPath.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 Markdown Preview',
              message: 'Markdown Preview v1.0.0',
              detail: '一个精美的 Markdown 预览桌面应用\n采用液态玻璃(Glassmorphism)设计风格'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

ipcMain.handle('select-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择文件夹',
      properties: ['openDirectory'],
      buttonLabel: '选择此文件夹'
    });
    return result.canceled ? null : result.filePaths[0] || null;
  } catch (error) {
    console.error('Error selecting folder:', error);
    return null;
  }
});

ipcMain.handle('read-folder', async (event, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) {
      console.error('Folder not found:', folderPath);
      return [];
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      console.error('Not a directory:', folderPath);
      return [];
    }

    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    const folders = [];
    const files = [];

    for (const item of items) {
      const itemPath = path.join(folderPath, item.name);
      
      try {
        if (item.isDirectory()) {
          folders.push({
            name: item.name,
            path: itemPath,
            type: 'folder'
          });
        } else if (item.isFile() && item.name.toLowerCase().endsWith('.md')) {
          files.push({
            name: item.name,
            path: itemPath,
            type: 'file'
          });
        }
      } catch (err) {
        console.warn(`Skipping item ${item.name}:`, err.message);
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    return [...folders, ...files];
  } catch (error) {
    console.error('Error reading folder:', folderPath, error);
    return [];
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return null;
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      console.error('Not a file:', filePath);
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error('Error reading file:', filePath, error);
    return null;
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Error writing file:', filePath, error);
    return false;
  }
});

ipcMain.handle('get-app-path', async () => {
  return app.getAppPath();
});

ipcMain.handle('path-basename', async (event, filePath, ext) => {
  return path.basename(filePath, ext);
});

ipcMain.handle('path-dirname', async (event, filePath) => {
  return path.dirname(filePath);
});
