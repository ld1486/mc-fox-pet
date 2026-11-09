'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskAPI', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),

  write: (req) => ipcRenderer.invoke('ai:write', req),
  suggest: (req) => ipcRenderer.invoke('ai:suggest', req),
  foxChat: (req) => ipcRenderer.invoke('fox:chat', req),
  testApi: () => ipcRenderer.invoke('ai:test'),
  listModels: (api) => ipcRenderer.invoke('ai:models', api),
  balance: (api) => ipcRenderer.invoke('ai:balance', api),
  cancel: (id) => ipcRenderer.send('ai:cancel', id),

  onDelta: (cb) => ipcRenderer.on('ai:delta', (_e, msg) => cb(msg)),
  onTab: (cb) => ipcRenderer.on('panel:tab', (_e, tab) => cb(tab)),
  onPrefill: (cb) => ipcRenderer.on('panel:prefill', (_e, payload) => cb(payload)),
  onMood: (cb) => ipcRenderer.on('pet:mood', (_e, text) => cb(text)),
  onSkin: (cb) => ipcRenderer.on('skin:changed', (_e, skin) => cb(skin)),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  onI18n: (cb) => ipcRenderer.on('i18n:changed', (_e, payload) => cb(payload)),

  settings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openFolder: () => ipcRenderer.invoke('settings:open-folder'),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),

  minimize: () => ipcRenderer.invoke('panel:minimize'),
  close: () => ipcRenderer.invoke('panel:close'),
  quit: () => ipcRenderer.invoke('app:quit'),
  summonFox: () => ipcRenderer.invoke('panel:pick-fox'),
  version: () => ipcRenderer.invoke('app:version'),
});
