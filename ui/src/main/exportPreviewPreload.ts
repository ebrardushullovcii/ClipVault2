import { contextBridge, ipcRenderer, clipboard } from 'electron'

type YouTubePrivacy = 'private' | 'unlisted' | 'public'

contextBridge.exposeInMainWorld('exportPreviewAPI', {
  copyPath: (filePath: string) => {
    clipboard.writeText(filePath)
  },
  startDrag: (filePath: string) => {
    ipcRenderer.send('export:startDrag', filePath)
  },
  openFolder: (filePath: string) => {
    ipcRenderer.send('export:openFolder', filePath)
  },
  shareDiscord: (params: { filePath: string; message?: string }) => {
    return ipcRenderer.invoke('social:shareDiscord', params)
  },
  shareYouTube: (params: {
    filePath: string
    title?: string
    description?: string
    tags?: string[]
    privacy?: YouTubePrivacy
  }) => {
    return ipcRenderer.invoke('social:shareYouTube', params)
  },
  openExternal: (url: string) => {
    return ipcRenderer.invoke('system:openExternal', url)
  },
})
