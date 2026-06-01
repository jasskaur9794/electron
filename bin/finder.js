#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

async function main() {
  const args = process.argv.slice(2);
  const isKill = args.includes('--kill');
  const isDebug = args.includes('--debug') || args.includes('--verbose');

  // Handle --kill flag
  if (isKill) {
    try {
      const { execSync } = require('child_process');
      if (isWin) {
        execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' });
      } else {
        execSync('pkill -f "electron.*Finder" 2>/dev/null', { stdio: 'ignore' });
      }
    } catch (_) { /* nothing running */ }
    process.exit(0);
  }

  // Resolve electron binary
  let electronPath;
  
  // 1. Try require('electron') - returns binary path string in Node
  try {
    electronPath = require('electron');
    if (typeof electronPath !== 'string') {
      // If it returned an object (unlikely in Node), try to find the path property
      electronPath = electronPath.path || require.resolve('electron/cli.js');
    }
  } catch (_) {
    // 2. Fallback to local node_modules
    const localPath = path.join(ROOT, 'node_modules', '.bin', isWin ? 'electron.cmd' : 'electron');
    if (fs.existsSync(localPath)) {
      electronPath = localPath;
    } else {
      console.error('Error: Electron binary not found.');
      console.error('Please run "npm install" in: ' + ROOT);
      process.exit(1);
    }
  }

  if (isDebug) {
    console.log('[Finder Launcher]');
    console.log('Root Path:', ROOT);
    console.log('Electron Path:', electronPath);
    console.log('Debug mode enabled - keeping terminal attached.\n');
  }

  // Spawn Electron
  const spawnOptions = {
    detached: !isDebug,
    stdio: isDebug ? 'inherit' : 'ignore',
    cwd: ROOT,
    windowsHide: !isDebug,
    // Use shell for .cmd files on Windows
    shell: isWin && electronPath.endsWith('.cmd'),
    env: { 
      ...process.env, 
      ELECTRON_NO_ATTACH_CONSOLE: isDebug ? '0' : '1' 
    },
  };

  const child = spawn(electronPath, [ROOT, ...args], spawnOptions);

  child.on('error', (err) => {
    console.error('\n[Launcher Error] Failed to start Electron:');
    console.error(err.message);
    if (err.code === 'ENOENT') {
      console.error('The Electron binary was not found at the expected path.');
    }
    process.exit(1);
  });

  if (!isDebug) {
    // Give it a moment to catch immediate startup errors (like ENOENT)
    const timer = setTimeout(() => {
      child.unref();
      process.exit(0);
    }, 1000);

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        console.error(`\n[Launcher Error] Electron exited immediately with code ${code}.`);
        console.error('Try running with --debug to see the logs.');
        process.exit(code);
      }
    });
  }
}

main();
