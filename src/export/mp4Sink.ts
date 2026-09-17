import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import type { FrameSink } from './FrameSink'
import { SecureContextRequiredError, VideoEncoderUnsupportedError, isSecureContext } from './secureContext'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Probes the browser's actually-supported H.264 encoder configuration, from
// most to least preferred codec/acceleration combination.
async function pickVideoConfig(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const codecs = ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.4D4033', 'avc1.42E033']
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference', 'prefer-software'] as const) {
    for (const codec of codecs) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        avc: { format: 'avc' },
        hardwareAcceleration,
      }
      try {
        const result = await VideoEncoder.isConfigSupported(config)
        if (result.supported) return config
      } catch {
        // try the next candidate
      }
    }
  }
  return null
}

export async function createMp4Sink(width: number, height: number, fps: number, quality: number): Promise<FrameSink> {
  const bitrate = Math.min(120e6, Math.round(width * height * fps * quality))
  const config = await pickVideoConfig(width, height, fps, bitrate)
  if (!config) {
    throw isSecureContext() ? new VideoEncoderUnsupportedError() : new SecureContextRequiredError()
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
  })

  let encodeError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e
    },
  })
  encoder.configure(config)

  return {
    async add(canvas, index) {
      if (encodeError) throw encodeError
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((index * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      })
      encoder.encode(frame, { keyFrame: index % fps === 0 })
      frame.close()
      while (encoder.encodeQueueSize > 6) await sleep(5)
    },
    async finish(onProgress) {
      onProgress?.('Video wird abgeschlossen …')
      await encoder.flush()
      if (encodeError) throw encodeError as Error
      muxer.finalize()
      encoder.close()
      return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' }
    },
    abort() {
      try {
        if (encoder.state !== 'closed') encoder.close()
      } catch {
        // already closed
      }
    },
  }
}
