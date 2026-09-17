/** Strategy interface shared by the mp4 and image-sequence export paths. */
export interface FrameSink {
  /** changed=false means this frame is visually identical to the previous one — sinks may dedupe. */
  add(canvas: HTMLCanvasElement, index: number, changed: boolean): Promise<void>
  finish(onProgress?: (message: string) => void): Promise<{ blob: Blob; ext: string }>
  abort(): void
}
