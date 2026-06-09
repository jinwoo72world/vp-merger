import {
  runRenderJob,
  cancelRender,
  pauseRender,
  resumeRender,
  RenderOptions,
  RenderProgress
} from './videoProcessor'

export interface QueueJob {
  id: string
  name: string
  options: RenderOptions
  status: 'pending' | 'rendering' | 'completed' | 'failed' | 'paused' | 'cancelled'
  progress: RenderProgress
  error?: string
}

let queue: QueueJob[] = []
let activeJobId: string | null = null
let isProcessing = false
let onQueueUpdateCallback: (() => void) | null = null

export function getQueue(): QueueJob[] {
  return queue
}

export function addJob(name: string, options: RenderOptions): QueueJob {
  const job: QueueJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    options,
    status: 'pending',
    progress: {
      percent: 0,
      step: 'Pending in queue',
      elapsed: '00:00:00',
      remaining: '--:--:--',
      speed: '0.00x',
      fps: '0'
    }
  }
  queue.push(job)
  notifyUpdate()
  triggerQueueProcessing()
  return job
}

export function removeJob(id: string): void {
  const idx = queue.findIndex((j) => j.id === id)
  if (idx !== -1) {
    const job = queue[idx]
    if (job.status === 'rendering' || job.status === 'paused') {
      cancelActiveJob()
    }
    queue.splice(idx, 1)
    notifyUpdate()
  }
}

export function clearQueue(): void {
  cancelActiveJob()
  queue = []
  notifyUpdate()
}

export function cancelActiveJob(): void {
  if (activeJobId) {
    const job = queue.find((j) => j.id === activeJobId)
    if (job) {
      job.status = 'cancelled'
      job.progress.step = 'Render cancelled'
    }
    cancelRender()
    activeJobId = null
    isProcessing = false
    notifyUpdate()
    triggerQueueProcessing()
  }
}

export function pauseActiveJob(): boolean {
  if (activeJobId) {
    const job = queue.find((j) => j.id === activeJobId)
    if (job && job.status === 'rendering') {
      const ok = pauseRender()
      if (ok) {
        job.status = 'paused'
        job.progress.step = 'Render paused'
        notifyUpdate()
        return true
      }
    }
  }
  return false
}

export function resumeActiveJob(): boolean {
  if (activeJobId) {
    const job = queue.find((j) => j.id === activeJobId)
    if (job && job.status === 'paused') {
      const ok = resumeRender()
      if (ok) {
        job.status = 'rendering'
        job.progress.step = 'Assembling Final Video...'
        notifyUpdate()
        return true
      }
    }
  }
  return false
}

export function setQueueUpdateCallback(cb: () => void) {
  onQueueUpdateCallback = cb
}

function notifyUpdate() {
  if (onQueueUpdateCallback) {
    onQueueUpdateCallback()
  }
}

async function triggerQueueProcessing() {
  if (isProcessing) return

  const nextJob = queue.find((j) => j.status === 'pending') as QueueJob | undefined
  if (!nextJob) {
    isProcessing = false
    return
  }

  isProcessing = true
  activeJobId = nextJob.id
  nextJob.status = 'rendering'
  notifyUpdate()

  try {
    await runRenderJob(nextJob.options, (prog) => {
      // If job status was changed externally (e.g. cancelled/paused), respect it
      if ((nextJob.status as string) === 'cancelled') return

      // Update progress
      nextJob.progress = prog
      if ((nextJob.status as string) !== 'paused' && (nextJob.status as string) !== 'cancelled') {
        nextJob.status = 'rendering'
      }
      notifyUpdate()
    })

    if ((nextJob.status as string) === 'rendering') {
      nextJob.status = 'completed'
      nextJob.progress.step = 'Completed successfully'
      nextJob.progress.percent = 100
    }
  } catch (err: any) {
    if ((nextJob.status as string) !== 'cancelled') {
      nextJob.status = 'failed'
      nextJob.error = err.message || 'Unknown render error'
      nextJob.progress.step = `Failed: ${nextJob.error}`
    }
  } finally {
    activeJobId = null
    isProcessing = false
    notifyUpdate()
    // Process next job in queue
    triggerQueueProcessing()
  }
}
