// Modules to control application life and create native browser window
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import path from 'node:path'
import process from 'node:process'
import packager from 'electron-packager'
import * as fs from 'fs';
import zip from 'cross-zip';
import { URL } from 'url';

const JSON_FILE = './electron-base/package.json';
const WIN_HEIGHT = 600;
const WIN_WIDTH = 600;

// Disable asar, it breaks packaging
process.noAsar = true;

// Could read this and write it back but why
const packageJSON = {
  "name": "",
  "productName": "",
  "version": "1.0.0",
  "type": "module",
  "description": "A minimal Electron application which loads a single URL: ",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "repository": "https://github.com/automome/singular",
  "keywords": [
    "Electron",
    "web",
    "nativefier"
  ],
  "author": "autonome",
  "license": "MIT",
  "devDependencies": {
    "electron": "^34.2.0",
    "electron-packager": "^17.1.2"
  }
};

const __dirname = import.meta.dirname

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()
}

const validURL = str => {
  try {
    return new URL(str);
  } catch (err) {
    return false;
  }
};

ipcMain.on('generate', async (e, msg) => {
  // Convenience log to front-end
  const mainWindow = BrowserWindow.getAllWindows()[0];
  const felo = msg => mainWindow.webContents.send('log', msg );

  const { name, url } = msg;

  // Validation on the front-end but give it a nod anyway
  if (!name || name.length < 2 || !url || !validURL(url)) {
    const errmsg = `Name or URL is bad`;
    console.error(errmsg);
    e.reply('degenerate', { res: 'fail', text: errmsg });
    return;
  }
  felo('Input validated');

  // Update and write package.json
  packageJSON.name = name;
  packageJSON.productName = name;
  packageJSON.description = `${packageJSON.description} ${url}`;
  packageJSON.url = url;

  fs.writeFileSync(JSON_FILE, JSON.stringify(packageJSON, null, 2));
  felo('Wrote new package.json. Packaging...');

  // Write app files to temp dir so they're cleaned up (eventually)
  const tmpDir = app.getPath('temp');

  // Writing zip file to this dir allows downloads to read from it
  const userDataDir = app.getPath('userData');

  const opts = {
    dir: './electron-base/',
    name: name,
    overwrite: true,
    out: tmpDir
  }

  let paths = null;
  try {
    paths = await packager(opts)
    felo('Packaged! Zipping...');
  }
  catch (ex) {
    const errmsg = `Failed to package: ${ex}`;
    console.error(errmsg);
    e.reply('degenerate', { res: 'fail', text: errmsg });
    return;
  }

  const appPath = path.join(paths[0], `${name}.app`);
  const zipPath = path.join(userDataDir, `${name}.zip`);

  try {
    zip.zipSync(appPath, zipPath);
  }
  catch (ex) {
    const errmsg = `Failed to zip: ${ex}`;
    console.error(errmsg);
    e.reply('degenerate', { res: 'fail', text: errmsg });
    return;
  }

  felo('Zipped! Downloading...');

  try {
    const zipURL = `file://${zipPath}`;
    session.defaultSession.downloadURL(zipURL);
  } catch(ex) {
    const errmsg = `Failed to download: ${ex}`;
    console.error(errmsg);
    e.reply('degenerate', { res: 'fail', text: errmsg });
    return;
  }

  felo('Download initiated! Save this zip wherever you like. Open it to find your new app!');

  e.reply('degenerate', { res: 'victory' });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
});
