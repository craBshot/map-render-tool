export class SecureContextRequiredError extends Error {
  constructor() {
    super(
      'Videoexport braucht HTTPS. Die Seite läuft über unverschlüsseltes HTTP, daher sperrt der Browser den Encoder. Seite per HTTPS aufrufen oder Bildsequenz wählen.',
    )
    this.name = 'SecureContextRequiredError'
  }
}

export class VideoEncoderUnsupportedError extends Error {
  constructor() {
    super('Dein Browser kann hier kein H.264-Video erzeugen. Bitte Bildsequenz wählen.')
    this.name = 'VideoEncoderUnsupportedError'
  }
}

export function isSecureContext(): boolean {
  return window.isSecureContext
}
