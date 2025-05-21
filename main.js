// Modules to control application life and create native browser window
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process';
import packager from '@electron/packager'
import * as fs from 'fs';
import zip from 'cross-zip';
import { URL } from 'url';

const WIN_HEIGHT = 500;
const WIN_WIDTH = 600;

// Disable asar, it breaks packaging
process.noAsar = true;

const __dirname = import.meta.dirname

/*
// if spawned copy for url opening, log to file so we can debug
if (app.commandLine.hasSwitch('url2')) {
  const tempDir = app.getPath('temp');
  const access = fs.createWriteStream(path.join(tempDir, 'singular.log'));
  process.stdout.write = process.stderr.write = access.write.bind(access);
}
*/

process.on('uncaughtException', function(err) {
  console.error((err && err.stack) ? err.stack : err);
});

function createWindow() {
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

function openURL(url) {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the URL of the website.
  mainWindow.loadURL(url)

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
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

const initTempProfile = () => {
  const PROFILE = `p${Date.now()}`;

  console.log('PROFILE', PROFILE);

  // Profile dirs are subdir of userData dir
  // ..................................... ↓ we set this per profile
  //
  // {home} / {appData} / {userData} / {profileDir}
  //
  // Chromium's data in a subfolder of profile folder
  //
  // ................................................. ↓ we set this per profile
  //
  // {home} / {appData} / {userData} / {profileDir} / {sessionData}


  // specify various app data paths and make if not exist
  const appDataPath = app.getPath('appData');
  const userDataPath = app.getPath('userData');
  //const profileDataPath = path.join(userDataPath, PROFILE);
  //const sessionDataPath = path.join(profileDataPath, 'chromium');

  console.log('adp', app.getPath('appData'));
  console.log('udp', app.getPath('userData'));

  const tempDir = app.getPath('temp');
  console.log('tempDir', tempDir);

  const tempAppDataPath = path.join(tempDir, PROFILE);
  app.setPath('appData', tempAppDataPath);

  console.log('adp', app.getPath('appData'));
  console.log('udp', app.getPath('userData'));
  //console.log('pdp', profileDataPath);
  //console.log('sdp', sessionDataPath);
};

const getAppPath = () => {
  const appName = 'singular';
  const appPath = process.platform === 'win32'
    ? path.resolve('.', `${appName}.exe`)
    : process.execPath.replace(/\.app.*$/, '.app');
  return appPath;
};

const openSelf = url => {
  // running in dev or prod
  const isPackaged = app.isPackaged;
  console.log('isPackaged', isPackaged);

  if (isPackaged) {
    // we're running from a package
    const appPath = getAppPath();
    console.log('appPath', appPath);
  }
  else {
    // we're running from source
  }

  //const cmd = 'electron';
  const cmd = "electron-forge";

  const args = [
    'start',
    //'.',
    //path.join(process.cwd(), 'electron-base'),
    '--',
    `--url2=${url}`
  ];

  // start new process
  const p2 = spawn(cmd, args, {
    env: process.env,
    // make the new process its own leader
    detached: true,
    // DEBUG: send its output to the current terminal
    //stdio: 'inherit',
    stdio: 'ignore',
  }).on('error', err => {
    console.error(err);
    process.exit(2);
  }).on('spawn', () => {
    // unref the process so we can exit
    p2.unref();
    console.log('spawn complete, exiting process');
    process.exit(0);
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  console.log('ready');

  // We're initial process to open a URL
  if (app.commandLine.hasSwitch('url')) {
    console.log('url switch found');

    const url = app.commandLine.getSwitchValue('url');
    console.log('url', url);

    if (!validURL(url)) {
      console.error('Bad URL');
    }
    else {
      openSelf(url);
      console.log('self opened');
    
      // exit
      app.quit()
      console.log('app quit');
    }
  }
  // We're a temporary spawn to open a URL
  else if (app.commandLine.hasSwitch('url2')) {
    // If we're opening a temporary URL then we need to
    // create a temporary profile for the data
    initTempProfile();
    console.log('temp profile created');

    const url = app.commandLine.getSwitchValue('url2');
    console.log('url2', url);
    openURL(url);
  }
  // Window for generating and installing URL as app
  else {
    createWindow();

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    });
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
});

