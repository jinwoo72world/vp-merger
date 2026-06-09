import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { getPaths } from './ffmpegManager'

export interface SongInfo {
  path: string
  name: string
  duration: number
}

// Helper to wait for a process to finish
function waitProcess(proc: any): Promise<void> {
  return new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Process exited with code ${code}`))
      }
    })
    proc.on('error', (err) => {
      reject(err)
    })
  })
}

// Probe a single audio file for duration
export function getAudioDuration(songPath: string): Promise<number> {
  const { ffprobePath } = getPaths()
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      songPath
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
      reject(new Error(`Failed to get duration of ${songPath}`))
    })
    proc.on('error', (err) => reject(err))
  })
}

// Scan songs directory and return sorted SongInfo array
export async function scanSongsDirectory(dirPath: string): Promise<SongInfo[]> {
  if (!fs.existsSync(dirPath)) {
    throw new Error('Songs directory does not exist')
  }

  const files = await fs.promises.readdir(dirPath)
  const supportedExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.aac']

  const audioFiles = files
    .filter((f) => supportedExtensions.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const songs: SongInfo[] = []
  for (const file of audioFiles) {
    const fullPath = path.join(dirPath, file)
    try {
      const duration = await getAudioDuration(fullPath)
      songs.push({
        path: fullPath,
        name: file,
        duration
      })
    } catch (e) {
      console.error(`Skipping invalid audio file: ${file}`, e)
    }
  }

  return songs
}

// Process single song: apply fade-in, fade-out, normalization, output as WAV
async function processSong(
  song: SongInfo,
  destPath: string,
  fadeIn: number,
  fadeOut: number,
  normalize: boolean
): Promise<void> {
  const { ffmpegPath } = getPaths()

  // Adjust fade durations dynamically if song is too short
  const songFadeIn = Math.min(fadeIn, song.duration / 2)
  const songFadeOut = Math.min(fadeOut, song.duration / 2)

  // Construct audio filters
  const filters: string[] = []
  if (songFadeIn > 0) {
    filters.push(`afade=t=in:ss=0:d=${songFadeIn}`)
  }
  if (songFadeOut > 0) {
    const fadeOutStart = Math.max(0, song.duration - songFadeOut)
    filters.push(`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${songFadeOut}`)
  }
  if (normalize) {
    // dynaudnorm is highly responsive and performs real-time peak/loudness normalization
    filters.push('dynaudnorm=f=150:g=15')
  }

  const args: string[] = ['-y', '-i', song.path]
  if (filters.length > 0) {
    args.push('-af', filters.join(','))
  }
  args.push(destPath)

  const proc = spawn(ffmpegPath, args)
  await waitProcess(proc)
}

// Recursive/chunked crossfade merger
async function mergeWithCrossfade(files: string[], dest: string, crossfadeDur: number): Promise<void> {
  const { ffmpegPath } = getPaths()

  if (files.length === 1) {
    const proc = spawn(ffmpegPath, ['-y', '-i', files[0], '-c', 'copy', dest])
    await waitProcess(proc)
    return
  }

  // If we have <= 10 files, we can merge them in a single FFmpeg run safely
  if (files.length <= 10) {
    await mergeDirect(files, dest, crossfadeDur)
    return
  }

  // Otherwise, split into chunks of 8 to keep command length small
  const chunkSize = 8
  const chunks: string[][] = []
  for (let i = 0; i < files.length; i += chunkSize) {
    chunks.push(files.slice(i, i + chunkSize))
  }

  const tempFolder = path.dirname(dest)
  const chunkOutputs: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunkOut = path.join(tempFolder, `chunk_merge_${i}.wav`)
    await mergeWithCrossfade(chunks[i], chunkOut, crossfadeDur)
    chunkOutputs.push(chunkOut)
  }

  // Finally, merge the chunk outputs
  await mergeWithCrossfade(chunkOutputs, dest, crossfadeDur)

  // Cleanup chunk outputs
  for (const chunkOut of chunkOutputs) {
    try {
      fs.unlinkSync(chunkOut)
    } catch (e) {
      // Ignore
    }
  }
}

// Merges up to 10 files in a single FFmpeg command using acrossfade filtergraph
async function mergeDirect(files: string[], dest: string, crossfadeDur: number): Promise<void> {
  const { ffmpegPath } = getPaths()
  const args: string[] = []

  for (const file of files) {
    args.push('-i', file)
  }

  let filter = ''
  for (let i = 0; i < files.length - 1; i++) {
    const in1 = i === 0 ? '[0:a]' : `[a${i}]`
    const in2 = `[${i + 1}:a]`
    const out = `[a${i + 1}]`
    filter += `${in1}${in2}acrossfade=d=${crossfadeDur}:c1=tri:c2=tri${out};`
  }
  filter = filter.slice(0, -1)
  const lastLabel = `[a${files.length - 1}]`

  args.push('-filter_complex', filter, '-map', lastLabel, '-y', dest)

  const proc = spawn(ffmpegPath, args)
  await waitProcess(proc)
}

// Master Audio Processor entry point
export async function processAndMergeAudio(
  songs: SongInfo[],
  tempDir: string,
  destPath: string,
  settings: {
    fadeIn: number
    fadeOut: number
    normalize: boolean
    crossfade: boolean
  },
  onProgress: (step: string, percent: number) => void
): Promise<number> {
  if (songs.length === 0) {
    throw new Error('No songs provided to process')
  }

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  // 1. Process individual songs to temp WAV files
  const tempWavs: string[] = []
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]
    const tempWav = path.join(tempDir, `song_${i}.wav`)
    
    const displayIndex = i + 1
    onProgress(`Processing audio track ${displayIndex}/${songs.length}: ${song.name}`, Math.round((i / songs.length) * 80))
    
    await processSong(song, tempWav, settings.fadeIn, settings.fadeOut, settings.normalize)
    tempWavs.push(tempWav)
  }

  // 2. Merge processed WAV files
  onProgress('Merging audio tracks...', 85)

  if (settings.crossfade) {
    // Crossfade (5 seconds default or custom)
    await mergeWithCrossfade(tempWavs, destPath, 5)
  } else {
    // Concat Demuxer (No Crossfade, very fast)
    const concatListPath = path.join(tempDir, 'concat_list.txt')
    const fileListContent = tempWavs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    await fs.promises.writeFile(concatListPath, fileListContent, 'utf-8')

    const { ffmpegPath } = getPaths()
    const proc = spawn(ffmpegPath, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      destPath
    ])
    await waitProcess(proc)

    try {
      fs.unlinkSync(concatListPath)
    } catch (e) {
      // Ignore
    }
  }

  onProgress('Audio tracks merged successfully', 100)

  // Clean up individual processed WAVs
  for (const wav of tempWavs) {
    try {
      fs.unlinkSync(wav)
    } catch (e) {
      // Ignore
    }
  }

  // Get total duration of the merged audio track
  const finalDuration = await getAudioDuration(destPath)
  return finalDuration
}
