import { spawn, exec } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { promisify } from 'util'
import { getPaths } from './ffmpegManager'
import { detectGPUEncoders } from './gpuDetector'
import { scanSongsDirectory, processAndMergeAudio } from './audioProcessor'

const execPromise = promisify(exec)

export interface RenderOptions {
  songsDir: string
  introPath: string
  mainPath: string
  outroPath: string
  outputPath: string
  resolution: '1080p' | '2K' | '4K'
  preset: 'Fast' | 'Balanced' | 'High Quality' | 'Maximum Quality'
  bitrate: 'Auto' | '10 Mbps' | '20 Mbps' | '40 Mbps' | 'Custom'
  customBitrate: number
  frameRate: 24 | 30 | 60
  audioSettings: {
    fadeIn: number
    fadeOut: number
    normalize: boolean
    crossfade: boolean
  }
  videoFade?: boolean
  videoFadeDuration?: number
}

export interface RenderProgress {
  percent: number
  step: string
  elapsed: string
  remaining: string
  speed: string
  fps: string
}

let activeRenderProcess: any = null
let activeRenderPid: number | null = null
let isPaused = false

// Helper to format duration in HH:MM:SS
function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Check if file has audio stream using ffprobe
async function hasAudioStream(filePath: string): Promise<boolean> {
  const { ffprobePath } = getPaths()
  return new Promise((resolve) => {
    const proc = spawn(ffprobePath, [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    let out = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.on('close', (code) => {
      resolve(code === 0 && out.trim() === 'audio')
    })
    proc.on('error', () => resolve(false))
  })
}

// Get video duration using ffprobe
async function getVideoDuration(filePath: string): Promise<number> {
  const { ffprobePath } = getPaths()
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    let out = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.on('close', (code) => {
      if (code === 0) {
        const d = parseFloat(out.trim())
        if (!isNaN(d)) {
          resolve(d)
          return
        }
      }
      reject(new Error(`Failed to get duration of ${filePath}`))
    })
    proc.on('error', (err) => reject(err))
  })
}

// Suspend a process on Windows using C# wrapper via PowerShell
async function suspendWindowsProcess(pid: number): Promise<void> {
  const script = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class ProcessHelper {
    [DllImport("ntdll.dll")]
    public static extern uint NtSuspendProcess(IntPtr processHandle);
}
'@
Add-Type -TypeDefinition $code
$proc = [System.Diagnostics.Process]::GetProcessById(${pid})
[ProcessHelper]::NtSuspendProcess($proc.Handle)
`
  await execPromise(`powershell -Command "${script.replace(/\n/g, ' ')}"`)
}

// Resume a process on Windows using C# wrapper via PowerShell
async function resumeWindowsProcess(pid: number): Promise<void> {
  const script = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class ProcessHelper {
    [DllImport("ntdll.dll")]
    public static extern uint NtResumeProcess(IntPtr processHandle);
}
'@
Add-Type -TypeDefinition $code
$proc = [System.Diagnostics.Process]::GetProcessById(${pid})
[ProcessHelper]::NtResumeProcess($proc.Handle)
`
  await execPromise(`powershell -Command "${script.replace(/\n/g, ' ')}"`)
}

export function pauseRender(): boolean {
  if (activeRenderPid && !isPaused) {
    try {
      if (process.platform === 'win32') {
        suspendWindowsProcess(activeRenderPid)
      } else {
        process.kill(activeRenderPid, 'SIGSTOP')
      }
      isPaused = true
      return true
    } catch (e) {
      console.error('Failed to suspend render process:', e)
    }
  }
  return false
}

export function resumeRender(): boolean {
  if (activeRenderPid && isPaused) {
    try {
      if (process.platform === 'win32') {
        resumeWindowsProcess(activeRenderPid)
      } else {
        process.kill(activeRenderPid, 'SIGCONT')
      }
      isPaused = false
      return true
    } catch (e) {
      console.error('Failed to resume render process:', e)
    }
  }
  return false
}

export function cancelRender(): void {
  if (activeRenderProcess) {
    try {
      // Resume if paused first so it can receive termination
      if (isPaused && activeRenderPid) {
        if (process.platform === 'win32') {
          resumeWindowsProcess(activeRenderPid)
        } else {
          process.kill(activeRenderPid, 'SIGCONT')
        }
      }
      activeRenderProcess.kill('SIGKILL')
    } catch (e) {
      console.error('Failed to kill render process:', e)
    }
    activeRenderProcess = null
    activeRenderPid = null
    isPaused = false
  }
}

export async function runRenderJob(
  options: RenderOptions,
  onProgress: (progress: RenderProgress) => void
): Promise<void> {
  isPaused = false

  // Create workspace directories
  const outDir = options.outputPath
  const tempDir = path.join(outDir, 'Temp')
  const logDir = path.join(outDir, 'Logs')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

  const logFilePath = path.join(logDir, 'render_log.txt')
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' })

  const logMsg = (msg: string) => {
    const time = new Date().toISOString()
    if (!logStream.destroyed && logStream.writable) {
      logStream.write(`[${time}] ${msg}\n`)
    }
    console.log(msg)
  }

  logMsg(`Starting VP Merger Render Job`)
  logMsg(`Resolution: ${options.resolution}, FrameRate: ${options.frameRate}`)
  logMsg(`Preset: ${options.preset}, Bitrate Option: ${options.bitrate}`)

  const { ffmpegPath } = getPaths()
  if (!ffmpegPath) {
    throw new Error('FFmpeg path not configured. Please download/install FFmpeg.')
  }

  // 1. Scan Songs Directory
  logMsg(`Scanning songs folder: ${options.songsDir}`)
  onProgress({
    percent: 0,
    step: 'Scanning songs folder...',
    elapsed: '00:00:00',
    remaining: '--:--:--',
    speed: '0.00x',
    fps: '0'
  })

  const songs = await scanSongsDirectory(options.songsDir)
  if (songs.length === 0) {
    throw new Error('No supported audio files found in songs folder')
  }

  logMsg(`Detected ${songs.length} songs`)

  // 2. Process and Merge Audio
  const mergedAudioPath = path.join(tempDir, 'merged_audio.wav')
  const mergedAudioDuration = await processAndMergeAudio(
    songs,
    tempDir,
    mergedAudioPath,
    options.audioSettings,
    (stepMsg, percent) => {
      onProgress({
        percent: Math.round(percent * 0.2), // Maps 0-100% of audio merge to 0-20% of final progress
        step: stepMsg,
        elapsed: '00:00:00',
        remaining: '--:--:--',
        speed: '0.00x',
        fps: '0'
      })
    }
  )

  logMsg(`Merged audio track duration: ${mergedAudioDuration.toFixed(2)} seconds`)

  // 3. Probe Video Tracks
  logMsg(`Analyzing videos: Intro, Main, Outro`)
  onProgress({
    percent: 21,
    step: 'Analyzing video tracks...',
    elapsed: '00:00:00',
    remaining: '--:--:--',
    speed: '0.00x',
    fps: '0'
  })

  // Verify and probe main video
  if (!fs.existsSync(options.mainPath)) {
    throw new Error(`Main background video not found: ${options.mainPath}`)
  }
  const dMain = await getVideoDuration(options.mainPath)
  const hasMainAudio = await hasAudioStream(options.mainPath)
  logMsg(`Main video: ${options.mainPath} (${dMain.toFixed(2)}s, Audio: ${hasMainAudio})`)

  // Intro video
  const hasIntro = options.introPath && fs.existsSync(options.introPath)
  let dIntro = 0
  let hasIntroAudio = false
  if (hasIntro) {
    dIntro = await getVideoDuration(options.introPath)
    hasIntroAudio = await hasAudioStream(options.introPath)
    logMsg(`Intro video: ${options.introPath} (${dIntro.toFixed(2)}s, Audio: ${hasIntroAudio})`)
  }

  // Outro video
  const hasOutro = options.outroPath && fs.existsSync(options.outroPath)
  let dOutro = 0
  let hasOutroAudio = false
  if (hasOutro) {
    dOutro = await getVideoDuration(options.outroPath)
    hasOutroAudio = await hasAudioStream(options.outroPath)
    logMsg(`Outro video: ${options.outroPath} (${dOutro.toFixed(2)}s, Audio: ${hasOutroAudio})`)
  }

  const finalVideoDuration = dIntro + mergedAudioDuration + dOutro
  logMsg(`Expected final video duration: ${finalVideoDuration.toFixed(2)}s (${formatDuration(finalVideoDuration)})`)

  // Calculate loops for main background
  const loopCount = Math.ceil(mergedAudioDuration / dMain)
  logMsg(`Main loop count: ${loopCount}`)

  // 4. Determine Hardware/GPU Acceleration
  logMsg(`Detecting GPU capabilities...`)
  const gpu = await detectGPUEncoders()
  logMsg(`GPU selection: ${gpu.selected} (available: ${gpu.available.join(', ') || 'none'})`)

  // 5. Build FFmpeg command arguments
  const args: string[] = []

  // Define Target Width and Height
  let width = 1920
  let height = 1080
  if (options.resolution === '2K') {
    width = 2560
    height = 1440
  } else if (options.resolution === '4K') {
    width = 3840
    height = 2160
  }

  // Target FPS
  const targetFPS = options.frameRate

  // Target Bitrate
  let bitrateStr = '12M'
  if (options.bitrate === '10 Mbps') bitrateStr = '10M'
  else if (options.bitrate === '20 Mbps') bitrateStr = '20M'
  else if (options.bitrate === '40 Mbps') bitrateStr = '40M'
  else if (options.bitrate === 'Custom' && options.customBitrate) bitrateStr = `${options.customBitrate}M`
  else {
    // Auto presets
    if (options.resolution === '2K') bitrateStr = '20M'
    else if (options.resolution === '4K') bitrateStr = '45M'
  }

  // Map Preset
  let presetArg = 'medium'
  const enc = gpu.selected
  if (enc === 'libx264') {
    if (options.preset === 'Fast') presetArg = 'ultrafast'
    else if (options.preset === 'Balanced') presetArg = 'medium'
    else if (options.preset === 'High Quality') presetArg = 'slow'
    else if (options.preset === 'Maximum Quality') presetArg = 'veryslow'
  } else if (enc === 'h264_nvenc') {
    if (options.preset === 'Fast') presetArg = 'p1'
    else if (options.preset === 'Balanced') presetArg = 'p4'
    else if (options.preset === 'High Quality') presetArg = 'p6'
    else if (options.preset === 'Maximum Quality') presetArg = 'p7'
  } else if (enc === 'h264_amf') {
    if (options.preset === 'Fast') presetArg = 'speed'
    else if (options.preset === 'Balanced') presetArg = 'balanced'
    else {
      presetArg = 'quality'
    }
  } else if (enc === 'h264_qsv') {
    if (options.preset === 'Fast') presetArg = 'veryfast'
    else if (options.preset === 'Balanced') presetArg = 'medium'
    else if (options.preset === 'High Quality') presetArg = 'slow'
    else if (options.preset === 'Maximum Quality') presetArg = 'veryslow'
  }

  // INPUTS setup
  // We track inputs by pushing them to inputs list and keeping indices
  const inputPaths: { path: string; isLoop?: boolean; loopVal?: number }[] = []

  let nextIdx = 0

  let introIdx = -1
  if (hasIntro) {
    introIdx = nextIdx++
    inputPaths.push({ path: options.introPath })
  }

  const mainIdx = nextIdx++
  inputPaths.push({ path: options.mainPath, isLoop: true, loopVal: loopCount - 1 })

  let outroIdx = -1
  if (hasOutro) {
    outroIdx = nextIdx++
    inputPaths.push({ path: options.outroPath })
  }

  const audioIdx = nextIdx++
  inputPaths.push({ path: mergedAudioPath })

  // If intro/outro needs generated silence
  let silenceIdx = -1
  const needsSilence = (hasIntro && !hasIntroAudio) || (hasOutro && !hasOutroAudio)
  if (needsSilence) {
    silenceIdx = nextIdx++
  }

  // Compile inputs list into ffmpeg args
  for (let i = 0; i < inputPaths.length; i++) {
    const inp = inputPaths[i]
    if (inp.isLoop && inp.loopVal && inp.loopVal > 0) {
      args.push('-stream_loop', inp.loopVal.toString())
    }
    args.push('-i', inp.path)
  }

  if (needsSilence) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo')
  }

  // FILTERGRAPH Construction
  let filterComplex = ''
  let concatCount = 0

  const useFade = options.videoFade ?? true
  const fadeDuration = options.videoFadeDuration ?? 1

  // 1. Intro segment preprocessing
  if (hasIntro) {
    let introFilters = `fps=${targetFPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
    if (useFade) {
      const actualFd = Math.min(fadeDuration, dIntro / 2)
      if (actualFd > 0) {
        introFilters += `,fade=t=out:st=${dIntro - actualFd}:d=${actualFd}`
      }
    }
    filterComplex += `[${introIdx}:v]${introFilters}[v_intro]; `
    if (hasIntroAudio) {
      filterComplex += `[${introIdx}:a]aresample=44100[a_intro]; `
    } else {
      filterComplex += `[${silenceIdx}:a]atrim=duration=${dIntro},asetpts=PTS-STARTPTS,aresample=44100[a_intro]; `
    }
    concatCount++
  }

  // 2. Main background segment preprocessing
  // Trim loop to mergedAudioDuration, scale/pad
  let mainFilters = `trim=duration=${mergedAudioDuration},setpts=PTS-STARTPTS,fps=${targetFPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
  if (useFade) {
    const actualFd = Math.min(fadeDuration, mergedAudioDuration / 2)
    if (actualFd > 0) {
      mainFilters += `,fade=t=in:st=0:d=${actualFd},fade=t=out:st=${mergedAudioDuration - actualFd}:d=${actualFd}`
    }
  }
  filterComplex += `[${mainIdx}:v]${mainFilters}[v_main]; `
  filterComplex += `[${audioIdx}:a]aresample=44100[a_main]; `
  concatCount++

  // 3. Outro segment preprocessing
  if (hasOutro) {
    let outroFilters = `fps=${targetFPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
    if (useFade) {
      const actualFd = Math.min(fadeDuration, dOutro / 2)
      if (actualFd > 0) {
        outroFilters += `,fade=t=in:st=0:d=${actualFd},fade=t=out:st=${dOutro - actualFd}:d=${actualFd}`
      }
    }
    filterComplex += `[${outroIdx}:v]${outroFilters}[v_outro]; `
    if (hasOutroAudio) {
      filterComplex += `[${outroIdx}:a]aresample=44100[a_outro]; `
    } else {
      filterComplex += `[${silenceIdx}:a]atrim=duration=${dOutro},asetpts=PTS-STARTPTS,aresample=44100[a_outro]; `
    }
    concatCount++
  }

  // 4. Concatenation
  let concatInputs = ''
  if (hasIntro) concatInputs += '[v_intro][a_intro]'
  concatInputs += '[v_main][a_main]'
  if (hasOutro) concatInputs += '[v_outro][a_outro]'

  filterComplex += `${concatInputs}concat=n=${concatCount}:v=1:a=1[outv][outa]`

  args.push('-filter_complex', filterComplex)
  args.push('-map', '[outv]', '-map', '[outa]')

  // Encoder & presets mapping
  args.push('-c:v', enc)
  if (enc === 'libx264') {
    args.push('-preset', presetArg, '-pix_fmt', 'yuv420p', '-b:v', bitrateStr)
  } else if (enc === 'h264_nvenc') {
    args.push('-preset', presetArg, '-pix_fmt', 'yuv420p', '-b:v', bitrateStr)
  } else if (enc === 'h264_amf') {
    args.push('-preset', presetArg, '-pix_fmt', 'yuv420p', '-b:v', bitrateStr)
  } else if (enc === 'h264_qsv') {
    args.push('-preset', presetArg, '-pix_fmt', 'yuv420p', '-b:v', bitrateStr)
  } else if (enc === 'h264_videotoolbox') {
    args.push('-pix_fmt', 'yuv420p', '-b:v', bitrateStr)
    if (options.preset === 'Fast') {
      args.push('-realtime', '1')
    }
  }

  // Audio codec
  args.push('-c:a', 'aac', '-b:a', '256k', '-ar', '44100')

  // Final export setup & output target
  const outputFileName = `Final Video_${Date.now()}.mp4`
  const finalOutputPath = path.join(outDir, outputFileName)
  args.push('-threads', '0')
  args.push('-y', '-progress', '-', finalOutputPath)

  logMsg(`Executing FFmpeg command: ${ffmpegPath} ${args.join(' ')}`)

  // Run FFmpeg render
  const renderStartTime = Date.now()
  const proc = spawn(ffmpegPath, args)
  activeRenderProcess = proc
  activeRenderPid = proc.pid || null

  // Listen to stderr for logs
  proc.stderr.on('data', (d) => {
    if (!logStream.destroyed && logStream.writable) {
      logStream.write(d)
    }
    const { BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows()[0]?.webContents.send('render-log', d.toString())
  })

  // Parse progress output from stdout (since we mapped -progress -)
  let buffer = ''
  proc.stdout.on('data', (d) => {
    buffer += d.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    let outTimeUs = 0
    let fps = '0'
    let speed = '1.0x'

    for (const line of lines) {
      const parts = line.split('=')
      if (parts.length === 2) {
        const key = parts[0].trim()
        const value = parts[1].trim()

        if (key === 'out_time_us') {
          outTimeUs = parseInt(value, 10)
        } else if (key === 'fps') {
          fps = value
        } else if (key === 'speed') {
          speed = value
        }
      }
    }

    if (outTimeUs > 0) {
      const curSeconds = outTimeUs / 1000000
      let percent = Math.round((curSeconds / finalVideoDuration) * 80) + 20 // Scales video assembly from 20% to 100%
      if (percent > 100) percent = 100

      const elapsedMs = Date.now() - renderStartTime
      const elapsedStr = formatDuration(elapsedMs / 1000)

      // Calculate ETA
      let speedFloat = parseFloat(speed.replace('x', ''))
      if (isNaN(speedFloat) || speedFloat <= 0) speedFloat = 1.0

      const remainingSecs = Math.max(0, (finalVideoDuration - curSeconds) / speedFloat)
      const remainingStr = formatDuration(remainingSecs)

      onProgress({
        percent,
        step: `Assembling Final Video...`,
        elapsed: elapsedStr,
        remaining: remainingStr,
        speed: speed,
        fps: fps
      })
    }
  })

  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      activeRenderProcess = null
      activeRenderPid = null
      isPaused = false

      if (code === 0) {
        logMsg(`Final video generated successfully: ${finalOutputPath}`)
        onProgress({
          percent: 100,
          step: 'Render completed successfully!',
          elapsed: formatDuration((Date.now() - renderStartTime) / 1000),
          remaining: '00:00:00',
          speed: '--',
          fps: '--'
        })

        // Clean up temp folder audio files
        try {
          fs.unlinkSync(mergedAudioPath)
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch (e) {
          // Ignore
        }

        logStream.end()
        resolve()
      } else {
        logMsg(`FFmpeg process failed with exit code ${code}`)
        logStream.end()
        reject(new Error(`Rendering process failed. Check Logs/render_log.txt for details.`))
      }
    })

    proc.on('error', (err) => {
      activeRenderProcess = null
      activeRenderPid = null
      isPaused = false
      logMsg(`FFmpeg execution failed with error: ${err.message}`)
      logStream.end()
      reject(err)
    })
  })
}
