export interface RenderProgress {
  percent: number
  step: string
  elapsed: string
  remaining: string
  speed: string
  fps: string
}

export interface QueueJob {
  id: string
  name: string
  options: any
  status: 'pending' | 'rendering' | 'completed' | 'failed' | 'paused' | 'cancelled'
  progress: RenderProgress
  error?: string
}
