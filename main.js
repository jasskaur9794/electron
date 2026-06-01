const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, screen, nativeImage, net, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ─── Logging (silent by default) ────────────────────────────────────────────
const VERBOSE = process.argv.includes('--verbose');
const log = (...args) => { if (VERBOSE) console.log('[Finder]', ...args); };
const logErr = (...args) => { if (VERBOSE) console.error('[Finder]', ...args); };

// ─── Configuration ──────────────────────────────────────────────────────────
const BACKEND_URL = process.env.BACKEND_URL || 'https://electron-zeta.vercel.app';
const API_SECRET = process.env.API_SECRET || '';
const HOTKEY_SCREENSHOT = 'CommandOrControl+Shift+X';
const HOTKEY_TOGGLE = 'CommandOrControl+Shift+D';
const HOTKEY_QUIT = 'CommandOrControl+Shift+Q';
const HOTKEY_SCROLL_UP = 'CommandOrControl+Shift+Up';
const HOTKEY_SCROLL_DOWN = 'CommandOrControl+Shift+Down';
const HOTKEY_CLEAR = 'CommandOrControl+Shift+C';
const HOTKEY_CONTENT_UP = 'CommandOrControl+Shift+K';
const HOTKEY_CONTENT_DOWN = 'CommandOrControl+Shift+J';
const HOTKEY_THEME = 'CommandOrControl+Shift+T';

// ─── State ──────────────────────────────────────────────────────────────────
let overlayWindow = null;
let tray = null;
let isOverlayVisible = true;
let isProcessing = false;

// Answer history
let answers = [];
let currentIndex = -1;
const MAX_HISTORY = 50;

// ─── Backend API Call ───────────────────────────────────────────────────────
async function callBackend(base64Image) {
  const url = `${BACKEND_URL}/api/solve`;
  const body = JSON.stringify({
    image: base64Image,
    secret: API_SECRET || undefined,
  });

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url,
    });

    request.setHeader('Content-Type', 'application/json');
    if (API_SECRET) {
      request.setHeader('Authorization', `Bearer ${API_SECRET}`);
    }

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (response.statusCode === 200 && parsed.answer) {
            log(`Backend responded (key ${parsed.keyUsed}/${parsed.totalKeys})`);
            resolve(parsed.answer);
          } else {
            reject(new Error(parsed.error || parsed.details || `HTTP ${response.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Invalid response from backend: ${responseData.substring(0, 200)}`));
        }
      });
    });

    request.on('error', (err) => {
      reject(new Error(`Backend connection failed: ${err.message}`));
    });

    request.write(body);
    request.end();
  });
}

// ─── Screenshot + Process Pipeline ──────────────────────────────────────────
async function captureAndSolve() {
  if (isProcessing) {
    log('Already processing, skipping...');
    return;
  }

  isProcessing = true;
  log('Capturing screenshot...');

  // Notify overlay of loading state
  sendToOverlay('show-loading');

  try {
    // Capture screenshot natively using Electron API
    // This is much more robust than external libraries on Windows
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { 
        width: Math.floor(width * scaleFactor), 
        height: Math.floor(height * scaleFactor) 
      }
    });

    // Find the primary display source
    const source = sources.find(s => s.display_id === primaryDisplay.id.toString()) || sources[0];
    if (!source) {
      throw new Error('Could not find screen source for capture');
    }

    const imgBuffer = source.thumbnail.toPNG();
    const base64Image = imgBuffer.toString('base64');

    log('Screenshot captured, sending to backend...');

    // Process with backend AI proxy
    const answer = await callBackend(base64Image);
    log('Answer:', answer.substring(0, 80) + (answer.length > 80 ? '...' : ''));

    // Add to history
    answers.push(answer);
    if (answers.length > MAX_HISTORY) answers.shift();
    currentIndex = answers.length - 1;

    // Send answer to overlay
    sendToOverlay('show-answer', {
      text: answer,
      index: currentIndex + 1,
      total: answers.length,
    });

    // Make sure overlay is visible
    if (overlayWindow && !overlayWindow.isDestroyed() && isOverlayVisible) {
      overlayWindow.showInactive();
    }
  } catch (err) {
    logErr('Capture/solve error:', err.message);
    sendToOverlay('show-answer', {
      text: `Error: ${err.message}`,
      index: 0,
      total: 0,
    });
    if (overlayWindow && !overlayWindow.isDestroyed() && isOverlayVisible) {
      overlayWindow.showInactive();
    }
  } finally {
    isProcessing = false;
  }
}

// ─── Answer Navigation ──────────────────────────────────────────────────────
function scrollAnswer(direction) {
  if (answers.length === 0) return;

  if (direction === 'up') {
    currentIndex = Math.max(0, currentIndex - 1);
  } else {
    currentIndex = Math.min(answers.length - 1, currentIndex + 1);
  }

  sendToOverlay('show-answer', {
    text: answers[currentIndex],
    index: currentIndex + 1,
    total: answers.length,
  });
}

// ─── Helper: Send to overlay safely ─────────────────────────────────────────
function sendToOverlay(channel, data) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, data);
  }
}

// ─── Overlay Window ─────────────────────────────────────────────────────────
function createOverlay() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    show: false,
    // Disguise window title
    title: 'Windows Defender',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Make completely click-through
  overlayWindow.setIgnoreMouseEvents(true);

  // Keep on top of everything including fullscreen apps
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Don't show in alt+tab
  overlayWindow.setSkipTaskbar(true);

  // CRITICAL: Exclude overlay from screen captures / screenshots
  // This means we don't need to hide/show the overlay when taking screenshots
  overlayWindow.setContentProtection(true);

  overlayWindow.loadFile('overlay.html');

  overlayWindow.once('ready-to-show', () => {
    if (isOverlayVisible) {
      overlayWindow.showInactive();
    }
    log('Overlay ready');
  });
}

// ─── Toggle Overlay ─────────────────────────────────────────────────────────
function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (isOverlayVisible) {
    overlayWindow.hide();
    isOverlayVisible = false;
    log('Overlay hidden');
  } else {
    overlayWindow.showInactive();
    isOverlayVisible = true;
    log('Overlay shown');
  }
}

// ─── System Tray ────────────────────────────────────────────────────────────
function createTray() {
  // Create a tiny 16x16 transparent icon programmatically
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAADdJREFUOE9jZKAQMFKon2HUAIZRLzAwkBEEA+IFIIP+//8/gZGRcQIjI+MEEC0IjCQHIslhQDIAAK0aCBGMQSMAAAAASUVORK5CYII=',
      'base64'
    )
  );

  tray = new Tray(icon);
  tray.setToolTip('Finder');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Capture (Ctrl+Shift+X)',
      click: () => captureAndSolve(),
    },
    {
      label: 'Toggle Overlay (Ctrl+Shift+D)',
      click: () => toggleOverlay(),
    },
    {
      label: 'Toggle Theme (Ctrl+Shift+T)',
      click: () => sendToOverlay('toggle-theme'),
    },
    {
      label: 'Previous Answer (Ctrl+Shift+Up)',
      click: () => scrollAnswer('up'),
    },
    {
      label: 'Next Answer (Ctrl+Shift+Down)',
      click: () => scrollAnswer('down'),
    },
    { type: 'separator' },
    {
      label: 'Clear All',
      click: () => {
        answers = [];
        currentIndex = -1;
        sendToOverlay('clear-answer');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit (Ctrl+Shift+Q)',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ─── Register Global Shortcuts ──────────────────────────────────────────────
function registerShortcuts() {
  const shortcuts = [
    [HOTKEY_SCREENSHOT, () => captureAndSolve(), 'Screenshot & Solve'],
    [HOTKEY_TOGGLE, () => toggleOverlay(), 'Toggle Overlay'],
    [HOTKEY_THEME, () => sendToOverlay('toggle-theme'), 'Toggle Theme'],
    [HOTKEY_SCROLL_UP, () => scrollAnswer('up'), 'Previous Answer'],
    [HOTKEY_SCROLL_DOWN, () => scrollAnswer('down'), 'Next Answer'],
    [HOTKEY_CONTENT_UP, () => sendToOverlay('scroll-content', 'up'), 'Scroll Content Up'],
    [HOTKEY_CONTENT_DOWN, () => sendToOverlay('scroll-content', 'down'), 'Scroll Content Down'],
    [HOTKEY_CLEAR, () => {
      answers = [];
      currentIndex = -1;
      sendToOverlay('clear-answer');
    }, 'Clear All'],
    [HOTKEY_QUIT, () => app.quit(), 'Quit'],
  ];

  for (const [key, handler, label] of shortcuts) {
    const ok = globalShortcut.register(key, handler);
    if (ok) log(`Registered: ${key} → ${label}`);
    else logErr(`Failed to register ${key}`);
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.disableHardwareAcceleration(); // helps with transparency on some systems

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // If user tries to run again, just capture
    captureAndSolve();
  });
}

app.whenReady().then(() => {
  log('Starting up...');
  log(`Backend URL: ${BACKEND_URL}`);

  // Create transparent overlay
  createOverlay();

  // Create system tray
  createTray();

  // Register global shortcuts
  registerShortcuts();

  log('Ready');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep app running even when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});
