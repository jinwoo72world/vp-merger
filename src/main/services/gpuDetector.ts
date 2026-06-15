import { spawn } from 'child_process'
import { getPaths } from './ffmpegManager'

export async function detectGPUEncoders(): Promise<{
  selected: string
  available: string[]
}> {
  const { ffmpegPath } = getPaths()
  if (!ffmpegPath) {
    return { selected: 'libx264', available: [] }
  }

  const encoders = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'h264_videotoolbox']
  const available: string[] = []

  for (const encoder of encoders) {
    try {
      const works = await testEncoder(ffmpegPath, encoder)
      if (works) {
        available.push(encoder)
      }
    } catch (e) {
      // Failed, not supported
    }
  }

  let selected = 'libx264'
  if (available.includes('h264_videotoolbox')) {
    selected = 'h264_videotoolbox'
  } else if (available.includes('h264_nvenc')) {
    selected = 'h264_nvenc'
  } else if (available.includes('h264_amf')) {
    selected = 'h264_amf'
  } else if (available.includes('h264_qsv')) {
    selected = 'h264_qsv'
  }

  return { selected, available }
}

function testEncoder(ffmpegPath: string, encoder: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Run a 1-frame black image encoding to null to verify if hardware support is actually active
    const args = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=64x64',
      '-c:v',
      encoder,
      '-t',
      '1',
      '-f',
      'null',
      '-'
    ]

    const proc = spawn(ffmpegPath, args)
    let success = true

    proc.on('error', () => {
      success = false
    })

    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      // If we see specific initialization errors, mark as failed
      if (
        msg.includes('OpenCL error') ||
        msg.includes('Device not found') ||
        msg.includes('Failed to create') ||
        msg.includes('No CUDA-capable device') ||
        msg.includes('cannot load') ||
        msg.includes('Error setting child')
      ) {
        success = false
      }
    })

    proc.on('close', (code) => {
      resolve(code === 0 && success)
    })
  })
}
