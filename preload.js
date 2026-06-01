const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finder', {
  onShowAnswer: (callback) => {
    ipcRenderer.on('show-answer', (_event, data) => callback(data));
  },
  onClearAnswer: (callback) => {
    ipcRenderer.on('clear-answer', () => callback());
  },
  onShowLoading: (callback) => {
    ipcRenderer.on('show-loading', () => callback());
  },
  onScrollContent: (callback) => {
    ipcRenderer.on('scroll-content', (_event, direction) => callback(direction));
  },
  onToggleTheme: (callback) => {
    ipcRenderer.on('toggle-theme', () => callback());
  },
});
