import qrcode from 'qrcode-generator'

/**
 * An otpauth:// URI as an inline SVG, drawn with no network access and no
 * remote service - the secret in that URI must never leave this server except
 * inside the page that is shown to its owner.
 *
 * Encoder: `qrcode-generator` (MIT, pure JS, no dependencies). Only the
 * module matrix is taken from it; the SVG is built here so the markup is fully
 * controlled. Error correction M; the quiet zone is the standard four modules.
 */
export function renderQrSvg(text: string, options: { label?: string } = {}): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()

  const count = qr.getModuleCount()
  const quiet = 4
  const size = count + quiet * 2

  let path = ''
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`
    }
  }

  const label = (options.label ?? 'QR code for your authenticator app').replace(/[<>&"]/g, '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    '</svg>'
  )
}
