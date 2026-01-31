"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Clips
  getClipsList: () => electron.ipcRenderer.invoke("clips:getList"),
  saveClipMetadata: (clipId, metadata) => electron.ipcRenderer.invoke("clips:saveMetadata", clipId, metadata),
  getClipMetadata: (clipId) => electron.ipcRenderer.invoke("clips:getMetadata", clipId),
  generateThumbnail: (clipId, videoPath) => electron.ipcRenderer.invoke("clips:generateThumbnail", clipId, videoPath),
  getVideoMetadata: (videoPath) => electron.ipcRenderer.invoke("clips:getVideoMetadata", videoPath),
  // Audio tracks
  extractAudioTracks: (clipId, videoPath) => electron.ipcRenderer.invoke("audio:extractTracks", clipId, videoPath),
  // Video loading
  getVideoFileUrl: (filename) => electron.ipcRenderer.invoke("video:getFileUrl", filename),
  // Export preview
  showExportPreview: (filePath) => electron.ipcRenderer.invoke("export:showPreview", filePath),
  // System
  openClipsFolder: () => electron.ipcRenderer.invoke("system:openFolder"),
  // Dialogs (legacy - keep for backwards compatibility)
  showSaveDialog: (options) => electron.ipcRenderer.invoke("dialog:save", options),
  // New API structure
  dialog: {
    save: (options) => electron.ipcRenderer.invoke("dialog:save", options)
  },
  editor: {
    exportClip: (params) => electron.ipcRenderer.invoke("editor:exportClip", params)
  },
  // Event listener
  on: (channel, callback) => {
    const listener = (_event, data) => callback(data);
    electron.ipcRenderer.on(channel, listener);
    return () => {
      electron.ipcRenderer.removeListener(channel, listener);
    };
  }
});
//# sourceMappingURL=index.js.map
