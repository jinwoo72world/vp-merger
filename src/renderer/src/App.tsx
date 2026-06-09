import React, { useEffect, useState } from 'react'
import {
  FolderOpen,
  Film,
  Music,
  Save,
  Trash2,
  Video,
  PlusCircle,
  LayoutDashboard,
  Activity,
  Download,
  AlertTriangle,
  Cpu,
  FolderClosed,
  Database
} from 'lucide-react'
import { QueueView } from './components/QueueView'
import { ProgressPanel } from './components/ProgressPanel'
import { QueueJob } from '../../shared/types'
import logo from '../../../resources/icon.png'

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'queue'>('dashboard')

  // Form State
  const [songsDir, setSongsDir] = useState('')
  const [introPath, setIntroPath] = useState('')
  const [mainPath, setMainPath] = useState('')
  const [outroPath, setOutroPath] = useState('')
  const [outputPath, setOutputPath] = useState('')

  // Video Settings
  const [resolution, setResolution] = useState<'1080p' | '2K' | '4K'>('1080p')
  const [preset, setPreset] = useState<'Fast' | 'Balanced' | 'High Quality' | 'Maximum Quality'>('Balanced')
  const [bitrate, setBitrate] = useState<'Auto' | '10 Mbps' | '20 Mbps' | '40 Mbps' | 'Custom'>('Auto')
  const [customBitrate, setCustomBitrate] = useState(15)
  const [frameRate, setFrameRate] = useState<24 | 30 | 60>(30)
  const [videoFade, setVideoFade] = useState(true)
  const [videoFadeDuration, setVideoFadeDuration] = useState(1)

  // Audio Settings
  const [fadeIn, setFadeIn] = useState(5)
  const [fadeOut, setFadeOut] = useState(5)
  const [normalize, setNormalize] = useState(true)
  const [crossfade, setCrossfade] = useState(false)

  // System status
  const [ffmpegDetected, setFfmpegDetected] = useState(true)
  const [ffprobeDetected, setFfprobeDetected] = useState(true)
  const [isFFmpegDownloading, setIsFFmpegDownloading] = useState(false)
  const [ffmpegDownloadStatus, setFfmpegDownloadStatus] = useState({ step: '', percent: 0 })
  const [gpuInfo, setGpuInfo] = useState<{ selected: string; available: string[] }>({ selected: 'libx264', available: [] })
  const [sysMetrics, setSysMetrics] = useState({ cpu: 0, ram: 0, gpu: 0 })

  // Songs scan metrics
  const [songsCount, setSongsCount] = useState(0)
  const [songsDuration, setSongsDuration] = useState(0)
  const [isScanningSongs, setIsScanningSongs] = useState(false)

  // Batch queue state
  const [queue, setQueue] = useState<QueueJob[]>([])

  // Drag and drop border active states
  const [dragActiveField, setDragActiveField] = useState<string | null>(null)

  // Perform initial system checks
  useEffect(() => {
    checkSystemEnvironment()

    // Poll system load metrics every 2 seconds
    const metricsTimer = setInterval(async () => {
      try {
        const m = await window.api.getSystemMetrics()
        setSysMetrics(m)
      } catch (e) {
        // Ignore
      }
    }, 2000)

    // Listen to queue updates from main process
    const cleanupQueue = window.api.onQueueUpdate((updatedQueue) => {
      setQueue(updatedQueue)
    })

    return () => {
      clearInterval(metricsTimer)
      cleanupQueue()
    }
  }, [])

  // Auto scan songs whenever songsDir changes
  useEffect(() => {
    if (songsDir) {
      scanSongs()
    } else {
      setSongsCount(0)
      setSongsDuration(0)
    }
  }, [songsDir])

  const checkSystemEnvironment = async () => {
    try {
      const ff = await window.api.detectFFmpeg()
      setFfmpegDetected(ff.ffmpeg)
      setFfprobeDetected(ff.ffprobe)

      if (ff.ffmpeg) {
        const gpu = await window.api.detectGPU()
        setGpuInfo(gpu)
      }
    } catch (e) {
      console.error('System checks failed', e)
    }
  }

  const handleDownloadFFmpeg = async () => {
    setIsFFmpegDownloading(true)
    const cleanupProgress = window.api.onFFmpegDownloadProgress((prog) => {
      setFfmpegDownloadStatus(prog)
    })

    try {
      await window.api.downloadFFmpeg()
      await checkSystemEnvironment()
    } catch (err: any) {
      alert(`FFmpeg download failed: ${err.message || err}`)
    } finally {
      setIsFFmpegDownloading(false)
      cleanupProgress()
    }
  }

  const scanSongs = async () => {
    setIsScanningSongs(true)
    try {
      const list = await window.api.scanSongsDir(songsDir)
      setSongsCount(list.length)
      const duration = list.reduce((acc, song) => acc + song.duration, 0)
      setSongsDuration(duration)
    } catch (e) {
      console.error('Failed to scan songs', e)
      setSongsCount(0)
      setSongsDuration(0)
    } finally {
      setIsScanningSongs(false)
    }
  }

  // File & folder selectors
  const triggerDirectorySelect = async (setter: React.Dispatch<React.SetStateAction<string>>) => {
    const p = await window.api.selectDirectory()
    if (p) setter(p)
  }

  const triggerVideoSelect = async (setter: React.Dispatch<React.SetStateAction<string>>) => {
    const p = await window.api.selectVideo()
    if (p) setter(p)
  }

  // Project management
  const handleSaveProject = async () => {
    const project = {
      songsDir,
      introPath,
      mainPath,
      outroPath,
      outputPath,
      resolution,
      preset,
      bitrate,
      customBitrate,
      frameRate,
      audioSettings: { fadeIn, fadeOut, normalize, crossfade },
      videoFade,
      videoFadeDuration
    }
    const savedPath = await window.api.saveProject(project)
    if (savedPath) {
      alert(`Project saved successfully: ${savedPath}`)
    }
  }

  const handleLoadProject = async () => {
    const result = await window.api.loadProject()
    if (result) {
      const { data } = result
      setSongsDir(data.songsDir || '')
      setIntroPath(data.introPath || '')
      setMainPath(data.mainPath || '')
      setOutroPath(data.outroPath || '')
      setOutputPath(data.outputPath || '')
      setResolution(data.resolution || '1080p')
      setPreset(data.preset || 'Balanced')
      setBitrate(data.bitrate || 'Auto')
      setCustomBitrate(data.customBitrate || 15)
      setFrameRate(data.frameRate || 30)
      setVideoFade(data.videoFade ?? true)
      setVideoFadeDuration(data.videoFadeDuration ?? 1)
      if (data.audioSettings) {
        setFadeIn(data.audioSettings.fadeIn ?? 5)
        setFadeOut(data.audioSettings.fadeOut ?? 5)
        setNormalize(data.audioSettings.normalize ?? true)
        setCrossfade(data.audioSettings.crossfade ?? false)
      }
    }
  }

  const handleClearProject = () => {
    setSongsDir('')
    setIntroPath('')
    setMainPath('')
    setOutroPath('')
    setOutputPath('')
    setSongsCount(0)
    setSongsDuration(0)
    setVideoFade(true)
    setVideoFadeDuration(1)
  }

  // Queue manipulation
  const handleAddToQueue = async () => {
    if (!songsDir || !mainPath || !outputPath) {
      alert('Please configure Songs Folder, Main Video, and Output Folder.')
      return
    }

    const options = {
      songsDir,
      introPath,
      mainPath,
      outroPath,
      outputPath,
      resolution,
      preset,
      bitrate,
      customBitrate,
      frameRate,
      audioSettings: { fadeIn, fadeOut, normalize, crossfade },
      videoFade,
      videoFadeDuration
    }

    const jobName = `Merge Job - ${resolution} (${new Date().toLocaleTimeString()})`
    await window.api.addQueueJob(jobName, options)
    setActiveTab('queue')
  }

  // Calculations for information panel
  const getExpectedDuration = (): number => {
    // If we have no songs, we can't merge. Let's assume just intro/outro if songs are missing, but really we require songs.
    // Intro + Songs Duration + Outro.
    // Intro/outro durations aren't probed until render starts, but we can display the songs duration.
    return songsDuration
  }

  const formatDurationStr = (sec: number): string => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getEstimatedFileSize = (): string => {
    const duration = getExpectedDuration()
    if (duration === 0) return '0 MB'

    let mbps = 12
    if (bitrate === '10 Mbps') mbps = 10
    else if (bitrate === '20 Mbps') mbps = 20
    else if (bitrate === '40 Mbps') mbps = 40
    else if (bitrate === 'Custom') mbps = customBitrate
    else {
      if (resolution === '2K') mbps = 20
      else if (resolution === '4K') mbps = 45
    }

    const sizeBytes = ((mbps * 1000000) / 8) * duration
    const sizeMB = sizeBytes / (1024 * 1024)
    if (sizeMB > 1024) {
      return `${(sizeMB / 1024).toFixed(2)} GB`
    }
    return `${sizeMB.toFixed(0)} MB`
  }

  // Drag and Drop helpers
  const handleDragOver = (e: React.DragEvent, field: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActiveField(field)
  }

  const handleDragLeave = () => {
    setDragActiveField(null)
  }

  const handleDrop = (e: React.DragEvent, setter: React.Dispatch<React.SetStateAction<string>>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActiveField(null)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      setter((files[0] as any).path)
    }
  }

  // Active Job progress
  const activeJob = queue.find((j) => j.status === 'rendering' || j.status === 'paused')

  return (
    <div className="app-container">
      {/* Sidebar Section */}
      <div className="sidebar">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '32px',
              padding: '4px'
            }}
          >
            <img
              src={logo}
              alt="VP Merger Logo"
              style={{
                width: '32px',
                height: '32px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 0 8px var(--primary))'
              }}
            />
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', lineHeight: '1.1' }}>VP Merger</h1>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Desktop Edition
              </span>
            </div>
          </div>

          <div className="sidebar-nav">
            <div
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </div>
            <div
              className={`nav-item ${activeTab === 'queue' ? 'active' : ''}`}
              onClick={() => setActiveTab('queue')}
            >
              <Activity size={18} />
              <span>Batch Queue</span>
              {queue.filter((j) => j.status === 'pending').length > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'var(--primary)',
                    color: '#fff',
                    borderRadius: '10px',
                    fontSize: '10px',
                    padding: '2px 8px',
                    fontWeight: '700'
                  }}
                >
                  {queue.filter((j) => j.status === 'pending').length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* System Load Widget */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="hardware-monitors">
            <div className="hw-item">
              <Cpu size={14} color="var(--text-muted)" />
              <span>CPU {sysMetrics.cpu}%</span>
              <div className={`hw-dot ${sysMetrics.cpu > 80 ? 'danger' : sysMetrics.cpu > 50 ? 'high' : ''}`} />
            </div>
            <div className="hw-item">
              <Database size={14} color="var(--text-muted)" />
              <span>RAM {sysMetrics.ram}%</span>
              <div className={`hw-dot ${sysMetrics.ram > 85 ? 'danger' : sysMetrics.ram > 60 ? 'high' : ''}`} />
            </div>
            <div className="hw-item">
              <Activity size={14} color="var(--text-muted)" />
              <span>GPU {sysMetrics.gpu}%</span>
              <div className={`hw-dot ${sysMetrics.gpu > 80 ? 'danger' : sysMetrics.gpu > 50 ? 'high' : ''}`} />
            </div>
          </div>

          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '10px'
            }}
          >
            Encoder: {gpuInfo.selected === 'libx264' ? 'CPU (libx264)' : `GPU (${gpuInfo.selected})`}
          </div>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="main-content">
        {activeTab === 'dashboard' ? (
          <>
            {/* Dashboard Headers */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>Create Music Video</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Configure your media paths and rendering settings below
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={handleLoadProject}>
                  <FolderClosed size={16} /> Load Project
                </button>
                <button className="btn btn-secondary" onClick={handleSaveProject}>
                  <Save size={16} /> Save Project
                </button>
                <button className="btn btn-secondary btn-danger" onClick={handleClearProject}>
                  <Trash2 size={16} /> Clear Inputs
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Songs Folder Selection */}
              <div className="form-group">
                <label>Songs Folder (MP3/WAV/FLAC/M4A/AAC)</label>
                <div
                  className={`drop-zone ${dragActiveField === 'songs' ? 'drag-active' : ''}`}
                  onDragOver={(e) => handleDragOver(e, 'songs')}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, setSongsDir)}
                  onClick={() => triggerDirectorySelect(setSongsDir)}
                >
                  <Music className="drop-zone-icon" />
                  {songsDir ? (
                    <span className="file-input-text">{songsDir}</span>
                  ) : (
                    <span>Drag and drop songs folder here, or click to browse</span>
                  )}
                </div>
              </div>

              {/* Videos Row Selection */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div className="form-group">
                  <label>Intro Video (Optional)</label>
                  <div
                    className={`drop-zone ${dragActiveField === 'intro' ? 'drag-active' : ''}`}
                    onDragOver={(e) => handleDragOver(e, 'intro')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, setIntroPath)}
                    onClick={() => triggerVideoSelect(setIntroPath)}
                    style={{ padding: '16px' }}
                  >
                    <Film className="drop-zone-icon" size={24} />
                    {introPath ? (
                      <span className="file-input-text" style={{ maxWidth: '100%' }}>{introPath.split('\\').pop()}</span>
                    ) : (
                      <span style={{ fontSize: '12px' }}>Intro Video</span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Main Loop Background Video</label>
                  <div
                    className={`drop-zone ${dragActiveField === 'main' ? 'drag-active' : ''}`}
                    onDragOver={(e) => handleDragOver(e, 'main')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, setMainPath)}
                    onClick={() => triggerVideoSelect(setMainPath)}
                    style={{ padding: '16px' }}
                  >
                    <Video className="drop-zone-icon" size={24} />
                    {mainPath ? (
                      <span className="file-input-text" style={{ maxWidth: '100%' }}>{mainPath.split('\\').pop()}</span>
                    ) : (
                      <span style={{ fontSize: '12px' }}>Background Video</span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Outro Video (Optional)</label>
                  <div
                    className={`drop-zone ${dragActiveField === 'outro' ? 'drag-active' : ''}`}
                    onDragOver={(e) => handleDragOver(e, 'outro')}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, setOutroPath)}
                    onClick={() => triggerVideoSelect(setOutroPath)}
                    style={{ padding: '16px' }}
                  >
                    <Film className="drop-zone-icon" size={24} />
                    {outroPath ? (
                      <span className="file-input-text" style={{ maxWidth: '100%' }}>{outroPath.split('\\').pop()}</span>
                    ) : (
                      <span style={{ fontSize: '12px' }}>Outro Video</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Output Directory Selection */}
              <div className="form-group">
                <label>Output Folder</label>
                <div className="input-row">
                  <span className="file-input-text">{outputPath || 'No output folder selected'}</span>
                  <button className="btn btn-secondary" onClick={() => triggerDirectorySelect(setOutputPath)}>
                    <FolderOpen size={16} /> Browse
                  </button>
                </div>
              </div>
            </div>

            {/* Video & Audio Settings Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Video Settings */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3>Video Options</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Resolution</label>
                      <select
                        className="select-control"
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value as any)}
                      >
                        <option value="1080p">1080p (1920×1080)</option>
                        <option value="2K">2K (2560×1440)</option>
                        <option value="4K">4K (3840×2160)</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Frame Rate</label>
                      <select
                        className="select-control"
                        value={frameRate}
                        onChange={(e) => setFrameRate(parseInt(e.target.value, 10) as any)}
                      >
                        <option value={24}>24 FPS</option>
                        <option value={30}>30 FPS</option>
                        <option value={60}>60 FPS</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Preset</label>
                      <select
                        className="select-control"
                        value={preset}
                        onChange={(e) => setPreset(e.target.value as any)}
                      >
                        <option value="Fast">Fast</option>
                        <option value="Balanced">Balanced</option>
                        <option value="High Quality">High Quality</option>
                        <option value="Maximum Quality">Maximum Quality</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Bitrate</label>
                      <select
                        className="select-control"
                        value={bitrate}
                        onChange={(e) => setBitrate(e.target.value as any)}
                      >
                        <option value="Auto">Auto</option>
                        <option value="10 Mbps">10 Mbps</option>
                        <option value="20 Mbps">20 Mbps</option>
                        <option value="40 Mbps">40 Mbps</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  {bitrate === 'Custom' && (
                    <div className="form-group">
                      <label>Custom Bitrate (Mbps)</label>
                      <input
                        type="number"
                        className="file-input-text"
                        style={{ fontFamily: 'var(--font-sans)' }}
                        value={customBitrate}
                        onChange={(e) => setCustomBitrate(Math.max(1, parseInt(e.target.value, 10)))}
                      />
                    </div>
                  )}

                  {/* Video Transitions */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', marginTop: '4px' }}>
                    <div className="toggle-container" style={{ marginBottom: '14px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500' }}>Black Fade Transitions</span>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={videoFade}
                          onChange={(e) => setVideoFade(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>

                    {videoFade && (
                      <div className="form-group">
                        <label>Fade Duration (Seconds)</label>
                        <input
                          type="number"
                          step="0.1"
                          className="file-input-text"
                          style={{ fontFamily: 'var(--font-sans)' }}
                          value={videoFadeDuration}
                          onChange={(e) => setVideoFadeDuration(Math.max(0.1, parseFloat(e.target.value) || 0))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Audio Settings */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3>Audio Options</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '14px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Fade In (Seconds)</label>
                      <input
                        type="number"
                        className="file-input-text"
                        style={{ fontFamily: 'var(--font-sans)' }}
                        value={fadeIn}
                        onChange={(e) => setFadeIn(Math.max(0, parseInt(e.target.value, 10)))}
                      />
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Fade Out (Seconds)</label>
                      <input
                        type="number"
                        className="file-input-text"
                        style={{ fontFamily: 'var(--font-sans)' }}
                        value={fadeOut}
                        onChange={(e) => setFadeOut(Math.max(0, parseInt(e.target.value, 10)))}
                      />
                    </div>
                  </div>

                  <div className="toggle-container">
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>Normalize Audio</span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={normalize}
                        onChange={(e) => setNormalize(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="toggle-container">
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>Crossfade Songs</span>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={crossfade}
                        onChange={(e) => setCrossfade(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Panel Summary */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3>Project Information Summary</h3>
              {isScanningSongs ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Scanning audio folder contents...
                </div>
              ) : (
                <div className="info-grid">
                  <div className="glass-panel info-card">
                    <span className="info-label">Songs Found</span>
                    <span className="info-value">{songsCount}</span>
                  </div>
                  <div className="glass-panel info-card">
                    <span className="info-label">Total Audio Duration</span>
                    <span className="info-value">{formatDurationStr(songsDuration)}</span>
                  </div>
                  <div className="glass-panel info-card">
                    <span className="info-label">Est. File Size</span>
                    <span className="info-value">{getEstimatedFileSize()}</span>
                  </div>
                  <div className="glass-panel info-card">
                    <span className="info-label">Resolution Preset</span>
                    <span className="info-value">{resolution}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Render */}
            <button className="btn" style={{ padding: '16px', fontSize: '16px' }} onClick={handleAddToQueue}>
              <PlusCircle size={20} /> Add Render Job to Queue
            </button>

            {/* Active Render Progress Panel (Visible on Dashboard if Rendering) */}
            {activeJob && (
              <ProgressPanel
                activeJob={activeJob}
                onCancel={() => window.api.cancelActiveJob()}
                onPause={() => window.api.pauseActiveJob()}
                onResume={() => window.api.resumeActiveJob()}
              />
            )}
          </>
        ) : (
          <QueueView
            queue={queue}
            onRemoveJob={(id) => window.api.removeQueueJob(id)}
            onClearQueue={() => window.api.clearQueue()}
            onOpenFolder={(path) => window.api.openOutputFolder(path)}
            outputPath={outputPath}
          />
        )}
      </div>

      {/* FFmpeg Setup Wizard Modal Overlay */}
      {(!ffmpegDetected || !ffprobeDetected) && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <AlertTriangle size={48} color="var(--color-warning)" style={{ alignSelf: 'center' }} />
            <h2>FFmpeg Binaries Missing</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              VP Merger requires FFmpeg and FFprobe binaries to compile and loop video segments, normalise audio tracks, and encode H.264 streams.
            </p>

            {isFFmpegDownloading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>{ffmpegDownloadStatus.step}</span>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${ffmpegDownloadStatus.percent}%` }}></div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ffmpegDownloadStatus.percent}%</span>
              </div>
            ) : (
              <button className="btn" style={{ marginTop: '10px' }} onClick={handleDownloadFFmpeg}>
                <Download size={16} /> Download FFmpeg Automatically
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
