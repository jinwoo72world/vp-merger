# VP Merger 🎬🎶

A premium, hardware-accelerated desktop application designed to easily merge multiple audio tracks, configure crossfades/fades/normalization, and stitch them to a looped background video. Built on **Electron**, **React**, and **TypeScript**, with **FFmpeg** powering the core rendering pipeline.

---

## Key Features

*   **Audio-First Merging Optimization:** Merges and processes all background songs (fades, normalization) into a single high-fidelity track *first* before encoding the video, leading to a much faster rendering process.
*   **Hardware Acceleration (GPU):** Automatically detects and utilizes native GPU encoders:
    *   `h264_nvenc` (NVIDIA)
    *   `h264_amf` (AMD)
    *   `h264_qsv` (Intel)
    *   Falls back to multi-threaded CPU (`libx264`) if no GPU is available.
*   **Resolution and Framerate Presets:** Renders video outputs in **1080p**, **2K**, or **4K** at **24**, **30**, or **60 FPS**.
*   **Real-time progress dashboard:** Monitor elapsed/remaining time, encoding speed, frame rate, and real-time FFmpeg logs via an in-app interactive terminal.
*   **Batch Queue:** Queue up multiple rendering jobs to process sequentially.
*   **Cross-platform CI/CD:** Ready for automated builds on Windows and macOS.

---

## Tech Stack & Tools

1.  **Frontend/UI:** React 19, TypeScript, Vanilla CSS (with modern glassmorphism aesthetic).
2.  **App Wrapper:** Electron 39.
3.  **Build Toolchain:** Vite, Electron-Vite, and Rollup.
4.  **Media Engine:** FFmpeg & FFprobe (automatically downloaded in-app if not present on your system).
5.  **Icons & Graphics:** Lucide React.
6.  **CI/CD Pipeline:** GitHub Actions.

---

## Installation & Running Locally

### Prerequisites
Make sure you have [Node.js (v18 or v20+)](https://nodejs.org/) installed.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Mode
```bash
npm run dev
```

---

## Building Executables Locally

### For Windows (Local)
To compile the installer locally on your Windows machine:
```bash
npm run build:win
```
This cleans the build cache and creates a setup executable at:
📂 `dist/vp-merger-1.0.0-setup.exe` (approx. 96 MB)

### For macOS (Via GitHub Actions)
Apple requires macOS system libraries to package macOS apps (`.dmg` or `.app` bundles). Because local compilation is restricted to matching hosts, the project includes an automated **GitHub Actions CI/CD Pipeline**.

To generate the macOS builds:
1. Push your code changes to GitHub.
2. The Action will automatically run two compile jobs (`macos-latest` and `windows-latest`).
3. You can download the completed **macOS DMG/Zip** and **Windows EXE** directly from the run artifacts in the **Actions** tab on your GitHub repository!

---

## Tips for Maximum Video Generation Speed (especially on lower systems/8GB RAM)

If you need to generate high-resolution videos (like 4K) fast on lower-end systems, use these settings in the app dashboard:
1.  **Select GPU Encoding:** Ensure the application detects your NVIDIA/AMD/Intel graphics card (displayed in the hardware monitor widget).
2.  **Use the "Fast" Preset:** This maps the rendering pipeline to the fastest encoding settings (`ultrafast` on CPU, `p1` on NVIDIA GPU).
3.  **Disable "Normalize" and "Crossfade":** This allows the audio processor to merge songs instantly using stream-copying without transcoding.
4.  **Reduce Resolution/FPS:** Select `1080p` and `30 FPS` instead of `4K` and `60 FPS` to decrease the pixel processing workload by ~8x.
