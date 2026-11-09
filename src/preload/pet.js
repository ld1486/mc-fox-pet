'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),

  ignoreMouse: (ignore) => ipcRenderer.send('pet:ignore-mouse', !!ignore),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  contextMenu: () => ipcRenderer.send('pet:context-menu'),
  openPanel: () => ipcRenderer.send('pet:command', 'open-panel'),
  setSkin: (id) => ipcRenderer.send('set-skin', id),
  setScale: (scale) => ipcRenderer.send('set-scale', scale),
  setItem: (id) => ipcRenderer.send('set-item', id),
  setView: (view) => ipcRenderer.send('view:set', view),
  setSetting: (patch) => ipcRenderer.invoke('settings:set', patch),
  clipboard: (text) => ipcRenderer.invoke('clipboard:write', text),

  onSkin: (cb) => ipcRenderer.on('skin:changed', (_e, skin) => cb(skin)),
  onItem: (cb) => ipcRenderer.on('item:changed', (_e, id) => cb(id)),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  onSay: (cb) => ipcRenderer.on('pet:say', (_e, text) => cb(text)),
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  onDragEnd: (cb) => ipcRenderer.on('pet:drag-end', () => cb()),
  onDragVelocity: (cb) => ipcRenderer.on('pet:drag-velocity', (_e, vx) => cb(vx)),
});
