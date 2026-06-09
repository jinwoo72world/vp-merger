import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'

// Import Services
app.name = 'VP Merger'
app.setName('VP Merger')
import { detectFFmpeg, downloadBinaries } from './services/ffmpegManager'
import { detectGPUEncoders } from './services/gpuDetector'
import { scanSongsDirectory } from './services/audioProcessor'
import { runRenderJob } from './services/videoProcessor'
import {
  getQueue,
  addJob,
  removeJob,
  clearQueue,
  cancelActiveJob,
  pauseActiveJob,
  resumeActiveJob,
  setQueueUpdateCallback
} from './services/queueManager'
import { saveProject, loadProject } from './services/projectManager'
import { getSystemMetrics } from './services/systemMetrics'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'VP Merger',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.vp-merger')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. Directory and File Selection
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return filePaths[0] || null
  })

  ipcMain.handle('select-video', async () => {
    if (!mainWindow) return null
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
    })
    return filePaths[0] || null
  })

  // 2. FFmpeg detection & downloads
  ipcMain.handle('detect-ffmpeg', async () => {
    return await detectFFmpeg()
  })

  ipcMain.handle('download-ffmpeg', async () => {
    await downloadBinaries((step, percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('ffmpeg-download-progress', { step, percent })
      }
    })
  })

  // 3. GPU detection
  ipcMain.handle('detect-gpu', async () => {
    return await detectGPUEncoders()
  })

  // 4. Project loading and saving
  ipcMain.handle('save-project', async (_event, data) => {
    if (!mainWindow) return null
    return await saveProject(mainWindow, data)
  })

  ipcMain.handle('load-project', async () => {
    if (!mainWindow) return null
    return await loadProject(mainWindow)
  })

  // 5. Audio and Video jobs
  ipcMain.handle('scan-songs-dir', async (_event, dir) => {
    return await scanSongsDirectory(dir)
  })

  ipcMain.handle('add-queue-job', async (_event, name, options) => {
    return addJob(name, options)
  })

  ipcMain.handle('remove-queue-job', async (_event, id) => {
    removeJob(id)
  })

  ipcMain.handle('clear-queue', async () => {
    clearQueue()
  })

  ipcMain.handle('cancel-active-job', async () => {
    cancelActiveJob()
  })

  ipcMain.handle('pause-active-job', async () => {
    return pauseActiveJob()
  })

  ipcMain.handle('resume-active-job', async () => {
    return resumeActiveJob()
  })

  // 6. System metrics
  ipcMain.handle('get-system-metrics', async () => {
    return await getSystemMetrics()
  })

  // 7. Open output folder in Explorer
  ipcMain.handle('open-output-folder', async (_event, folderPath) => {
    if (fs.existsSync(folderPath)) {
      shell.openPath(folderPath)
    }
  })

  // Register Queue updates listener to send state to React
  setQueueUpdateCallback(() => {
    if (mainWindow) {
      mainWindow.webContents.send('queue-update', getQueue())
    }
  })

  if (process.argv.includes('--test-render')) {
    runHeadlessTest()
  } else {
    createWindow()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

async function runHeadlessTest(): Promise<void> {
  console.log('--- HEADLESS TEST MODE ACTIVE ---')
  try {
    console.log('Checking FFmpeg environment...')
    let ff = await detectFFmpeg()
    if (!ff.ffmpeg || !ff.ffprobe) {
      console.log('FFmpeg binaries missing. Downloading automatically...')
      await downloadBinaries((step, percent) => {
        console.log(`[Downloader] ${step} - ${percent}%`)
      })
      ff = await detectFFmpeg()
      if (!ff.ffmpeg || !ff.ffprobe) {
        throw new Error('FFmpeg failed to download or configure')
      }
    }
    console.log('FFmpeg binaries configured successfully.')

    const options = {
      songsDir: 'd:\\Coder\\Instagram\\songs',
      introPath: 'd:\\Coder\\Instagram\\Intro.mp4',
      mainPath: 'd:\\Coder\\Instagram\\main.mp4',
      outroPath: 'd:\\Coder\\Instagram\\outro.mp4',
      outputPath: 'd:\\Coder\\Instagram\\Output',
      resolution: '1080p' as const,
      preset: 'Fast' as const,
      bitrate: 'Auto' as const,
      customBitrate: 10,
      frameRate: 30 as const,
      audioSettings: {
        fadeIn: 2,
        fadeOut: 2,
        normalize: true,
        crossfade: true
      },
      videoFade: true,
      videoFadeDuration: 1
    }

    console.log('Starting render job with workspace files...')
    await runRenderJob(options, (prog) => {
      console.log(`[Progress] ${prog.percent}% | Step: ${prog.step} | Speed: ${prog.speed} | FPS: ${prog.fps}`)
    })

    console.log('--- HEADLESS TEST COMPLETED SUCCESSFULLY ---')
    app.quit()
    process.exit(0)
  } catch (err: any) {
    console.error('--- HEADLESS TEST FAILED ---', err)
    app.quit()
    process.exit(1)
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
