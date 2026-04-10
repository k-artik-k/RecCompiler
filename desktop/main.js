/**
 * main.js — Electron main process
 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#181818',
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'renderer', 'icon.png'),
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ── IPC handlers ──────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow.minimize());
ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow.close());

ipcMain.handle('file:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: 'C Source', extensions: ['c'] }],
        properties: ['openFile'],
    });
    if (result.canceled) return null;
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    return { path: filePath, content };
});

ipcMain.handle('file:save', async (_, { path: filePath, content }) => {
    if (filePath) {
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
    }
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [{ name: 'C Source', extensions: ['c'] }],
    });
    if (result.canceled) return null;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
});

ipcMain.handle('file:loadExample', async (_, name) => {
    const testsDir = path.join(__dirname, '..', 'tests');
    const filePath = path.join(testsDir, name);
    if (fs.existsSync(filePath)) {
        return { path: filePath, content: fs.readFileSync(filePath, 'utf8') };
    }
    return null;
});
