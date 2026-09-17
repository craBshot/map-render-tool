import JSZip from 'jszip'
import type { FrameSink } from './FrameSink'

export async function createImageSequenceSink(format: 'jpeg' | 'png'): Promise<FrameSink> {
  const ext = format === 'png' ? 'png' : 'jpg'
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const zip = new JSZip()
  let lastBlob: Blob | null = null

  return {
    async add(canvas, index, changed) {
      if (changed || !lastBlob) {
        lastBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob() returned null'))), mimeType, 0.95)
        })
      }
      zip.file(`kartenzoom_${String(index + 1).padStart(5, '0')}.${ext}`, lastBlob)
    },
    async finish(onProgress) {
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) => {
        onProgress?.(`ZIP wird gepackt: ${Math.round(meta.percent)} %`)
      })
      return { blob, ext: 'zip' }
    },
    abort() {},
  }
}
