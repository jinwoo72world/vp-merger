import * as si from 'systeminformation'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execPromise = promisify(exec)

export async function getSystemMetrics() {
  try {
    // Current CPU load
    const load = await si.currentLoad()
    const cpuLoad = Math.round(load.currentLoad)

    // Current RAM usage
    const mem = await si.mem()
    const ramLoad = Math.round((mem.active / mem.total) * 100)

    // Current GPU load (via nvidia-smi for NVIDIA GPUs on Windows)
    let gpuLoad = 0
    try {
      const g = await si.graphics()
      const hasNvidia = g.controllers.some((c) => c.vendor.toLowerCase().includes('nvidia'))
      if (hasNvidia) {
        const { stdout } = await execPromise(
          'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits'
        )
        const val = parseInt(stdout.trim(), 10)
        if (!isNaN(val)) {
          gpuLoad = val
        }
      }
    } catch (e) {
      // Failed to get GPU load, fallback to 0
    }

    return {
      cpu: cpuLoad,
      ram: ramLoad,
      gpu: gpuLoad
    }
  } catch (err) {
    // Graceful fallback using built-in OS module if systeminformation fails
    const free = os.freemem()
    const total = os.totalmem()
    const ramLoad = Math.round(((total - free) / total) * 100)
    return {
      cpu: 0,
      ram: ramLoad,
      gpu: 0
    }
  }
}
