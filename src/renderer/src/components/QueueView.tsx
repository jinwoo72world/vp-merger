import React from 'react'
import { Trash2, FolderOpen, RefreshCw, XCircle, Play, Pause, AlertCircle, CheckCircle2 } from 'lucide-react'
import { QueueJob } from '../../../shared/types'

interface QueueViewProps {
  queue: QueueJob[]
  onRemoveJob: (id: string) => void
  onClearQueue: () => void
  onOpenFolder: (path: string) => void
  outputPath: string
}

export const QueueView: React.FC<QueueViewProps> = ({
  queue,
  onRemoveJob,
  onClearQueue,
  onOpenFolder,
  outputPath
}) => {
  const getStatusIcon = (status: QueueJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 size={16} color="var(--color-success)" />
      case 'failed':
        return <AlertCircle size={16} color="var(--color-error)" />
      case 'cancelled':
        return <XCircle size={16} color="var(--text-muted)" />
      case 'rendering':
        return <RefreshCw size={16} className="spin" color="var(--primary)" />
      case 'paused':
        return <Pause size={16} color="var(--color-warning)" />
      default:
        return <Play size={16} color="var(--color-info)" />
    }
  };

  const getStatusBadgeClass = (status: QueueJob['status']) => {
    switch (status) {
      case 'completed':
        return 'badge-success'
      case 'failed':
      case 'cancelled':
        return 'badge-danger'
      case 'rendering':
      case 'paused':
        return 'badge-info'
      default:
        return 'badge-secondary'
    }
  };

  return (
    <div className="glass-panel queue-panel" style={{ padding: '24px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '16px',
          marginBottom: '16px'
        }}
      >
        <div>
          <h2>Batch Queue</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {queue.length} job{queue.length !== 1 ? 's' : ''} in queue
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => onOpenFolder(outputPath)}
            disabled={!outputPath}
          >
            <FolderOpen size={16} /> Open Output Folder
          </button>
          <button
            className="btn btn-danger btn-secondary"
            onClick={onClearQueue}
            disabled={queue.length === 0}
          >
            <Trash2 size={16} /> Clear Queue
          </button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p>No render jobs in the queue.</p>
          <p style={{ fontSize: '13px', marginTop: '6px' }}>
            Go to the dashboard to configure and add a render job.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {queue.map((job) => (
            <div key={job.id} className="glass-panel queue-item">
              <div className="queue-item-info">
                <span className="queue-item-title">{job.name}</span>
                <div className="queue-item-status">
                  {getStatusIcon(job.status)}
                  <span className={`badge-info ${getStatusBadgeClass(job.status)}`}>
                    {job.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    • {job.options.resolution} • {job.options.frameRate} FPS •{' '}
                    {job.progress.percent}%
                  </span>
                </div>
                {job.error && (
                  <span style={{ fontSize: '12px', color: 'var(--color-error)', marginTop: '4px' }}>
                    Error: {job.error}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {job.status === 'rendering' && (
                  <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: '600' }}>
                    {job.progress.speed}
                  </span>
                )}
                <button
                  className="btn btn-secondary btn-danger"
                  style={{ padding: '8px' }}
                  onClick={() => onRemoveJob(job.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add spin animation utility inline if needed, but we already have standard css */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 2s linear infinite;
        }
      `}</style>
    </div>
  )
}
