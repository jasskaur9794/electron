// Detached launcher — spawns Electron and exits immediately.
// The terminal can close; Electron keeps running.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const isWin = process.platform === 'win32';

async function main() {
  const args = process.argv.slice(2);
  const isDebug = args.includes('--debug') || args.includes('--verbose');

  // Resolve electron binary
  let electronPath;
  try {
    electronPath = require('electron');
    if (typeof electronPath !== 'string') {
      electronPath = electronPath.path || require.resolve('electron/cli.js');
    }
  } catch (_) {
    const localPath = path.join(ROOT, 'node_modules', '.bin', isWin ? 'electron.cmd' : 'electron');
    if (fs.existsSync(localPath)) {
      electronPath = localPath;
    } else {
      console.error('Error: Electron binary not found. Run "npm install".');
      process.exit(1);
    }
  }

  if (isDebug) {
    console.log('[Finder Launcher]');
    console.log('Electron Path:', electronPath);
    console.log('Debug mode enabled.\n');
  }

  const spawnOptions = {
    detached: !isDebug,
    stdio: isDebug ? 'inherit' : 'ignore',
    cwd: ROOT,
    windowsHide: !isDebug,
    shell: isWin && electronPath.endsWith('.cmd'),
    env: { 
      ...process.env, 
      ELECTRON_NO_ATTACH_CONSOLE: isDebug ? '0' : '1' 
    },
  };

  const child = spawn(electronPath, [ROOT, ...args], spawnOptions);

  child.on('error', (err) => {
    console.error('\n[Launcher Error] Failed to start Electron:', err.message);
    process.exit(1);
  });

  if (!isDebug) {
    const timer = setTimeout(() => {
      child.unref();
      process.exit(0);
    }, 1000);

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        console.error(`\n[Launcher Error] Electron exited with code ${code}.`);
        console.error('Try running with --debug to see logs.');
        process.exit(code);
      }
    });
  }
}

main();
