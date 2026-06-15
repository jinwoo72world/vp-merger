import { app } from 'electron'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { promisify } from 'util'

const execPromise = promisify(exec)

let ffmpegPath = ''
let ffprobePath = ''

export function getBinariesDir(): string {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'binaries')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export async function detectFFmpeg(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  const binariesDir = getBinariesDir()
  const isWin = process.platform === 'win32'
  const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg'
  const ffprobeName = isWin ? 'ffprobe.exe' : 'ffprobe'
  const localFFmpeg = path.join(binariesDir, ffmpegName)
  const localFFprobe = path.join(binariesDir, ffprobeName)

  // 1. Check local binaries folder first
  if (fs.existsSync(localFFmpeg) && fs.existsSync(localFFprobe)) {
    ffmpegPath = localFFmpeg
    ffprobePath = localFFprobe
    return { ffmpeg: true, ffprobe: true }
  }

  // 2. Check system PATH
  let systemFFmpeg = false
  let systemFFprobe = false

  try {
    await execPromise('ffmpeg -version')
    ffmpegPath = 'ffmpeg'
    systemFFmpeg = true
  } catch (e) {
    // Not found
  }

  try {
    await execPromise('ffprobe -version')
    ffprobePath = 'ffprobe'
    systemFFprobe = true
  } catch (e) {
    // Not found
  }

  return { ffmpeg: systemFFmpeg, ffprobe: systemFFprobe }
}

export function getPaths() {
  return { ffmpegPath, ffprobePath }
}

function downloadFile(url: string, dest: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(currentUrl: string) {
      https.get(currentUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            get(redirectUrl)
            return
          }
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download from ${currentUrl}: ${response.statusCode}`))
          return
        }

        const file = fs.createWriteStream(dest)
        const total = parseInt(response.headers['content-length'] || '0', 10)
        let received = 0

        response.pipe(file)

        response.on('data', (chunk) => {
          received += chunk.length
          if (onProgress) onProgress(received, total)
        })

        file.on('finish', () => {
          file.close()
          resolve()
        })

        file.on('error', (err) => {
          fs.unlink(dest, () => {})
          reject(err)
        })
      }).on('error', reject)
    }
    get(url)
  })
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  if (process.platform === 'win32') {
    const cmd = `powershell -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`
    await execPromise(cmd)
  } else {
    // macOS/Linux native unzip
    const cmd = `unzip -o "${zipPath}" -d "${destDir}"`
    await execPromise(cmd)
  }
}

export async function downloadBinaries(onProgress: (step: string, percent: number) => void): Promise<void> {
  const binariesDir = getBinariesDir()
  const tempDir = path.join(app.getPath('temp'), 'vp-merger-downloads')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const ffmpegZip = path.join(tempDir, 'ffmpeg.zip')
  const ffprobeZip = path.join(tempDir, 'ffprobe.zip')

  const isWin = process.platform === 'win32'
  const FFMPEG_URL = isWin
    ? 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip'
    : 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-osx-64.zip'

  const FFPROBE_URL = isWin
    ? 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-win-64.zip'
    : 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-osx-64.zip'

  // 1. Download FFmpeg
  onProgress('Downloading FFmpeg...', 0)
  await downloadFile(FFMPEG_URL, ffmpegZip, (rec, tot) => {
    const pct = tot > 0 ? Math.round((rec / tot) * 100) : 0
    onProgress('Downloading FFmpeg...', pct)
  })

  // 2. Extract FFmpeg
  onProgress('Extracting FFmpeg...', 0)
  await extractZip(ffmpegZip, binariesDir)
  onProgress('Extracting FFmpeg...', 100)

  // 3. Download FFprobe
  onProgress('Downloading FFprobe...', 0)
  await downloadFile(FFPROBE_URL, ffprobeZip, (rec, tot) => {
    const pct = tot > 0 ? Math.round((rec / tot) * 100) : 0
    onProgress('Downloading FFprobe...', pct)
  })

  // 4. Extract FFprobe
  onProgress('Extracting FFprobe...', 0)
  await extractZip(ffprobeZip, binariesDir)
  onProgress('Extracting FFprobe...', 100)

  // Cleanup temp files
  try {
    fs.unlinkSync(ffmpegZip)
    fs.unlinkSync(ffprobeZip)
  } catch (e) {
    // Ignore cleanup error
  }

  // Verify paths
  const ffmpegName = isWin ? 'ffmpeg.exe' : 'ffmpeg'
  const ffprobeName = isWin ? 'ffprobe.exe' : 'ffprobe'
  const localFFmpeg = path.join(binariesDir, ffmpegName)
  const localFFprobe = path.join(binariesDir, ffprobeName)

  if (fs.existsSync(localFFmpeg) && fs.existsSync(localFFprobe)) {
    ffmpegPath = localFFmpeg
    ffprobePath = localFFprobe
    if (!isWin) {
      fs.chmodSync(localFFmpeg, '755')
      fs.chmodSync(localFFprobe, '755')
    }
  } else {
    throw new Error('Downloaded files could not be found')
  }
}
