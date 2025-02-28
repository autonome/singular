// Modules to control application life and create native browser window
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import path from 'node:path'
import process from 'node:process'
import packager from '@electron/packager'
import * as fs from 'fs';
import zip from 'cross-zip';
import { URL } from 'url';

const WIN_HEIGHT = 500;
const WIN_WIDTH = 600;

// Disable asar, it breaks packaging
process.noAsar = true;

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

// front-end logger
const felo = (type, text) =>
  BrowserWindow.getAllWindows()[0]
    .webContents.send(type, text );

const generate = async opts => {

  const { name, url } = opts;
  console.log('generating', name, url);

  // Validation on the front-end but give it a nod anyway
  if (!name || name.length < 2 || !url || !validURL(url)) {
    const errmsg = `Name or URL is bad`;
    console.error(errmsg);
    felo('fail', errmsg);
    return;
  }

  felo('log', 'Input validated');

  // Write app files to temp dir so they're cleaned up (eventually)
  const tmpDir = app.getPath('temp');

  // Copy base app to tmp dir and work from there
  const srcAppDir = 'electron-base';
  const appDir = path.join(tmpDir, `singular-${Date.now()}`);
  fs.cpSync(srcAppDir, appDir, { recursive: true });

  // Update and write package.json
  const jsonFile = path.join(appDir, 'package.json');
  const packageJSON = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

  packageJSON.name = name;
  packageJSON.productName = name;
  packageJSON.description = `${packageJSON.description} ${url}`;
  packageJSON.url = url;

  fs.writeFileSync(jsonFile, JSON.stringify(packageJSON, null, 2));

  felo('log', 'Wrote new package.json. Packaging...');

  const pkgOpts = {
    dir: appDir,
    name: name,
    overwrite: true,
    out: tmpDir
  };

  let paths = null;
  try {
    paths = await packager(pkgOpts)
  }
  catch (ex) {
    const errmsg = `Failed to package: ${ex}`;
    console.error(errmsg);
    felo('fail', errmsg);
    return;
  }

  felo('log', 'Packaged! Zipping...');

  const appPath = path.join(paths[0], `${name}.app`);
  const zipPath = path.join(paths[0], `${name}.zip`);

  try {
    zip.zipSync(appPath, zipPath);
  }
  catch (ex) {
    const errmsg = `Failed to zip: ${ex}`;
    console.error(errmsg);
    felo('fail', errmsg);
    return;
  }

  felo('log', 'Zipped! Downloading...');

  try {
    const zipURL = `file://${zipPath}`;
    session.defaultSession.downloadURL(zipURL);
  }
  catch(ex) {
    const errmsg = `Failed to download: ${ex}`;
    console.error(errmsg);
    felo('fail', errmsg);
    return;
  }

  felo('victory', 'Download initiated! Open the zip to find your new app!');
};

ipcMain.on('generate', (e, msg) => generate(msg));

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
