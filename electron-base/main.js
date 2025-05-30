// Modules to control application life and create native browser window
import { app, BrowserWindow, Notification } from 'electron';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'child_process';

const __dirname = import.meta.dirname;

import * as fs from 'fs';
const str = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
const URL = JSON.parse(str).url;

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the URL of the website.
  mainWindow.loadURL(URL)

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

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
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

const deleteMyself = () => {
  console.log('Deleting myself');

  const appPath = process.platform === 'win32'
    ? path.resolve('.', 'singular.exe')
    : process.execPath.replace(/\.app.*$/, '.app');
  console.log('appPath', appPath);

  const script = `tell application "Finder" 
  move (application file of application process "fooble" as alias) to trash 
end tell`;

  const humanReadableOutput = true;
  const outputArguments = humanReadableOutput ? [] : ['-ss'];
	const stdout = execFileSync('osascript', ['-e', script, ...outputArguments], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		timeout: 5000,
	});
  console.log('stdout', stdout.trim());

  /*
  //fs.unlinkSync(appPath, (err) => {
  fs.unlink(appPath, (err) => {
    if (err) {

      new Notification({
        title: 'ERROR',
        body: err.message,
      }).show();

      console.error('Error removing app file:', err);
    } else {
      console.log('App file removed successfully');
    }
  });
  */
};

//app.on('quit', deleteMyself);

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
