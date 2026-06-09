import { dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'

export interface ProjectData {
  songsDir: string
  introPath: string
  mainPath: string
  outroPath: string
  outputPath: string
  resolution: string
  preset: string
  bitrate: string
  customBitrate: number
  frameRate: number
  audioSettings: {
    fadeIn: number
    fadeOut: number
    normalize: boolean
    crossfade: boolean
  }
  videoFade?: boolean
  videoFadeDuration?: number
}

export async function saveProject(window: BrowserWindow, data: ProjectData): Promise<string | null> {
  const { filePath } = await dialog.showSaveDialog(window, {
    title: 'Save VP Merger Project',
    defaultPath: 'project.vpm',
    filters: [{ name: 'VP Merger Project', extensions: ['vpm'] }]
  })

  if (!filePath) return null

  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return filePath
}

export async function loadProject(window: BrowserWindow): Promise<{ filePath: string; data: ProjectData } | null> {
  const { filePaths } = await dialog.showOpenDialog(window, {
    title: 'Load VP Merger Project',
    filters: [{ name: 'VP Merger Project', extensions: ['vpm'] }],
    properties: ['openFile']
  })

  if (filePaths.length === 0) return null

  const filePath = filePaths[0]
  const content = await fs.promises.readFile(filePath, 'utf-8')
  const data = JSON.parse(content) as ProjectData
  return { filePath, data }
}
