import { contextBridge, ipcRenderer } from 'electron'

const api = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectVideo: () => ipcRenderer.invoke('select-video'),
  detectFFmpeg: () => ipcRenderer.invoke('detect-ffmpeg'),
  downloadFFmpeg: () => ipcRenderer.invoke('download-ffmpeg'),
  detectGPU: () => ipcRenderer.invoke('detect-gpu'),
  saveProject: (data: any) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
  scanSongsDir: (dir: string) => ipcRenderer.invoke('scan-songs-dir', dir),
  addQueueJob: (name: string, options: any) => ipcRenderer.invoke('add-queue-job', name, options),
  removeQueueJob: (id: string) => ipcRenderer.invoke('remove-queue-job', id),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  cancelActiveJob: () => ipcRenderer.invoke('cancel-active-job'),
  pauseActiveJob: () => ipcRenderer.invoke('pause-active-job'),
  resumeActiveJob: () => ipcRenderer.invoke('resume-active-job'),
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  openOutputFolder: (folderPath: string) => ipcRenderer.invoke('open-output-folder', folderPath),

  onFFmpegDownloadProgress: (cb: (data: { step: string; percent: number }) => void) => {
    const handler = (_event: any, data: any) => cb(data)
    ipcRenderer.on('ffmpeg-download-progress', handler)
    return () => ipcRenderer.off('ffmpeg-download-progress', handler)
  },
  onQueueUpdate: (cb: (queue: any[]) => void) => {
    const handler = (_event: any, data: any) => cb(data)
    ipcRenderer.on('queue-update', handler)
    return () => ipcRenderer.off('queue-update', handler)
  },
  onRenderLog: (cb: (line: string) => void) => {
    const handler = (_event: any, data: any) => cb(data)
    ipcRenderer.on('render-log', handler)
    return () => ipcRenderer.off('render-log', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
