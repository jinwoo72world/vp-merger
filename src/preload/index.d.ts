import { ElectronAPI } from '@electron-toolkit/preload'

export interface QueueJob {
  id: string
  name: string
  options: any
  status: 'pending' | 'rendering' | 'completed' | 'failed' | 'paused' | 'cancelled'
  progress: {
    percent: number
    step: string
    elapsed: string
    remaining: string
    speed: string
    fps: string
  }
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      selectDirectory: () => Promise<string | null>
      selectVideo: () => Promise<string | null>
      detectFFmpeg: () => Promise<{ ffmpeg: boolean; ffprobe: boolean }>
      downloadFFmpeg: () => Promise<void>
      detectGPU: () => Promise<{ selected: string; available: string[] }>
      saveProject: (data: any) => Promise<string | null>
      loadProject: () => Promise<{ filePath: string; data: any } | null>
      scanSongsDir: (dir: string) => Promise<any[]>
      addQueueJob: (name: string, options: any) => Promise<QueueJob>
      removeQueueJob: (id: string) => Promise<void>
      clearQueue: () => Promise<void>
      cancelActiveJob: () => Promise<void>
      pauseActiveJob: () => Promise<boolean>
      resumeActiveJob: () => Promise<boolean>
      getSystemMetrics: () => Promise<{ cpu: number; ram: number; gpu: number }>
      openOutputFolder: (folderPath: string) => Promise<void>
      onFFmpegDownloadProgress: (cb: (data: { step: string; percent: number }) => void) => () => void
      onQueueUpdate: (cb: (queue: QueueJob[]) => void) => () => void
      onRenderLog: (cb: (line: string) => void) => () => void
    }
  }
}
