import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, Terminal as TerminalIcon } from 'lucide-react'
import { QueueJob } from '../../../shared/types'

interface ProgressPanelProps {
  activeJob: QueueJob
  onCancel: () => void
  onPause: () => void
  onResume: () => void
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  activeJob,
  onCancel,
  onPause,
  onResume
}) => {
  const [logs, setLogs] = useState<string[]>([])
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Listen for raw FFmpeg logs from the main process
  useEffect(() => {
    // Reset logs if a new job starts
    if (activeJob.progress.percent === 0) {
      setLogs([])
    }

    const cleanup = window.api.onRenderLog((line) => {
      setLogs((prev) => {
        const next = [...prev, line]
        // Cap logs at 300 lines to prevent DOM performance issues
        if (next.length > 300) {
          next.shift()
        }
        return next
      })
    })

    return () => {
      cleanup()
    }
  }, [activeJob.id])

  // Auto scroll terminal to the bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollTop = terminalEndRef.current.scrollHeight
    }
  }, [logs])

  const { percent, step, elapsed, remaining, speed, fps } = activeJob.progress
  const isPaused = activeJob.status === 'paused'

  return (
    <div className="glass-panel progress-panel">
      <div className="progress-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontWeight: '600', fontSize: '16px' }}>{activeJob.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{step}</span>
        </div>
        <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--primary)' }}>
          {percent}%
        </span>
      </div>

      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${percent}%` }}></div>
      </div>

      <div className="stats-grid">
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(24, 24, 27, 0.4)' }}>
          <div className="info-label">Elapsed Time</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>{elapsed}</div>
        </div>
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(24, 24, 27, 0.4)' }}>
          <div className="info-label">Remaining Time</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>{remaining}</div>
        </div>
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(24, 24, 27, 0.4)' }}>
          <div className="info-label">Encoding Speed</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>{speed}</div>
        </div>
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(24, 24, 27, 0.4)' }}>
          <div className="info-label">Frame Rate</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>{fps} fps</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '20px', alignItems: 'center' }}>
        {isPaused ? (
          <button className="btn" onClick={onResume}>
            <Play size={16} /> Resume Render
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={onPause}>
            <Pause size={16} /> Pause Render
          </button>
        )}
        <button className="btn btn-danger" onClick={onCancel}>
          <Square size={16} /> Cancel Render
        </button>
      </div>

      <div style={{ marginTop: '24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
            color: 'var(--text-muted)',
            fontSize: '13px'
          }}
        >
          <TerminalIcon size={14} />
          <span>Real-time Render Log</span>
        </div>
        <div className="log-terminal" ref={terminalEndRef}>
          {logs.length === 0 ? (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Waiting for FFmpeg logs...
            </span>
          ) : (
            logs.join('')
          )}
        </div>
      </div>
    </div>
  )
}
