// Modules to control application life and create native browser window
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process';
import packager from '@electron/packager'
import * as fs from 'fs';
import zip from 'cross-zip';
import { URL } from 'url';

const appName = 'singular';

const WIN_HEIGHT = 600;
const WIN_WIDTH = 700;

const DEFAULT_WEB_HEIGHT = 600;
const DEFAULT_WEB_WIDTH = 800;

// Disable asar, it breaks packaging
process.noAsar = true;

const __dirname = import.meta.dirname

// Variable set when there's a URL to open and the
// request came in before the application is ready.
let deepLinkURL = null;

// if spawned copy for url opening, log to file so we can debug
/*
const tempDir = '/tmp'; //app.getPath('temp');
const access = fs.createWriteStream(path.join(tempDir, 'singular.log'));
process.stdout.write = process.stderr.write = access.write.bind(access);
*/

process.on('uncaughtException', function(err) {
  console.error((err && err.stack) ? err.stack : err);
});

// front-end logger
const felo = (type, text) => {
  console.log(type, text);
  BrowserWindow.getAllWindows()[0]
    .webContents.send(type, text);
};

const validURL = str => {
  try {
    return new URL(str);
  } catch (err) {
    return false;
  }
};

const createAppWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    height: WIN_HEIGHT,
    width: WIN_WIDTH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')
};

const openEphemeral = (url) => {
  const args = [
    `--url=${url}`,
    `--ephemeral`
  ];

  // spawn a new process to open the URL
  openSelf(args);
};

const openURL = (url = null, partition = null) => {
  // Check URL
  if (url === null || !validURL(url)) {
    const errmsg = `URL is bad`;
    console.error(errmsg);
    felo('fail', errmsg);
    return;
  }

  let options = ({
    autoHideMenuBar: true,
    height: DEFAULT_WEB_HEIGHT,
    width: DEFAULT_WEB_WIDTH,
    /*
    skipTaskbar: true,
    frame: false,
    backgroundColor: 'transparent',
    */
    webPreferences: {}
  });

  if (typeof partition === 'string' && partition.length > 0) {
    options.webPreferences.partition = partition;
  }
  // TODO: fail on present but bad partition var

  // Create the browser window.
  const win = new BrowserWindow(options);

  // and load the URL of the website.
  win.loadURL(url);
};

// Generate app package, zip it, and trigger download
const generate = async opts => {
  const { name, url } = opts;

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
  const appDir = path.join(tmpDir, `${appName}-${Date.now()}`);
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

const initTempProfile = () => {
  const PROFILE = `p${Date.now()}`;

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

  const appDataPath = app.getPath('appData');
  const userDataPath = app.getPath('userData');

  const tempDir = app.getPath('temp');

  const tempAppDataPath = path.join(tempDir, PROFILE);
  app.setPath('appData', tempAppDataPath);
};

const getAppPath = () => {
  const appPath = process.platform === 'win32'
    // windows
    ? path.resolve('.', `${appName}.exe`)
    // mac / TODO: linux
    : process.execPath;
    //: process.execPath.replace(/\.app.*$/, '.app');
  return appPath;
};

// Spawn a new instance of ourself
const openSelf = (addlArgs = []) => {
  // running in dev or prod
  const isPackaged = app.isPackaged;

  let cmd = 'electron-forge';
  if (isPackaged) {
    // we're running from a package
    const appPath = getAppPath();
    cmd = appPath;
  }

  const args = [
    'start',
    '--',
  ].concat(addlArgs);

  // start new process
  const p2 = spawn(cmd, args, {
    env: process.env,
    // make the new process its own leader
    detached: true,
    // DEBUG: send its output to the current terminal
    //stdio: 'inherit',
    stdio: 'ignore',
  }).on('error', err => {
    // TODO: should send this to front-end
    console.error('could not spawn', err);
  }).on('spawn', () => {
    // unref the process so we are decoupled
    p2.unref();
  });
};

// TODO: fix so it remembers if has been asked already
// probably requires some local state
// or maybe make a UI option to check/set
const registerAsDefaultBrowser = () => {
  // Set Singular as default protocol handler for HTTP/HTTPS
  if (!app.commandLine.hasSwitch('url') && !app.commandLine.hasSwitch('url2')) {
    // Windows/Linux
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        const argv1Path = path.resolve(process.argv[1]);
        const isDefault = app.isDefaultProtocolClient('http', process.execPath, [argv1Path])
          && app.isDefaultProtocolClient('https', process.execPath, [argv1Path]);
        if (!isDefault) {
          app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
          app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
        }
      }
    }
    // Mac
    else if (!app.isDefaultProtocolClient('http') || !app.isDefaultProtocolClient('https')){
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('https');
    }
  }
};

//registerAsDefaultBrowser();

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // If there's a deep link URL to open then do that now and bounce
  if (deepLinkURL !== null && validURL(deepLinkURL)) {
    openURL(deepLinkURL);
    deepLinkURL = null;
    return;
  }

  // Check for protocol URL in argv, to open from other apps
  // Confirmed in macOS
  // Needs testing in Windows/Linux
  const protocolUrl = process.argv.find(
    arg => arg.startsWith('http://') || arg.startsWith('https://'));
  if (protocolUrl && !app.commandLine.hasSwitch('url') && !app.commandLine.hasSwitch('url2')) {
    openURL(protocolUrl);
  }

  // Open a URL from command line parameter `url`
  else if (app.commandLine.hasSwitch('url')) {
    const url = app.commandLine.getSwitchValue('url');

    // Validate URL
    if (!validURL(url)) {
      console.error('Bad URL');
    }
    else {
      // Open ephemeral profile
      if (app.commandLine.hasSwitch('ephemeral')) {
        // If we're opening as temporary app then
        // create a temporary profile
        initTempProfile();
      }

      const partition = app.commandLine.hasSwitch('partition') ?
        app.commandLine.getSwitchValue('partition') : null;

      openURL(url, partition);
    }
  }

  // Default app window
  else {
    createAppWindow();

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        createAppWindow();
      }
    });
  }
});

// Close the main app window
const closeAppWindow = () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length > 0) {
    allWindows[0].close();
  }
};

// Handle opening URLs from other apps
app.on('open-url', (e, url) => {
  if (!validURL(url)) {
    console.error('Bad URL');
    return;
  }

  if (app.isReady()) {
      openURL(url);
  }
  // Handled later when app is ready
  else {
    deepLinkURL = url;
  }
});

ipcMain.on('open', (e, msg) => openURL(msg.url));

ipcMain.on('ephemeral', (e, msg) => openEphemeral(msg.url));

ipcMain.on('generate', (e, msg) => generate(msg));

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
});
