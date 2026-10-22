import QRCode from 'qrcode'
import { canonicalUrl } from '@/lib/site'
import { PhoneAppSectionClient } from './PhoneAppSectionClient'

/** Where every install entry point leads (#595). */
export const APPLICATION_URL = canonicalUrl('/application')

/**
 * The standard 4-module quiet zone scanners expect, at 4 pixels per module.
 * The SVG renderer ignores `scale`, so the width is computed from the real
 * module count: a whole number of pixels per module keeps crisp-edged
 * rendering even.
 */
export const QR_MARGIN = 4
export const QR_PIXELS_PER_MODULE = 4

export function qrOptions(url: string) {
  const modules = QRCode.create(url).modules.size
  return {
    type: 'svg' as const,
    margin: QR_MARGIN,
    width: (modules + 2 * QR_MARGIN) * QR_PIXELS_PER_MODULE,
    color: { dark: '#0D1F3C', light: '#FFFFFF' },
  }
}

/**
 * "MonÉlu sur votre téléphone", above the footer (#596, epic #593).
 *
 * The QR code is drawn here, on the server, as an inline SVG of
 * APPLICATION_URL, so it follows a domain move and never calls a third-party
 * service. Everything that depends on the device is decided in the browser by
 * the client half; the server HTML is the same for every visitor.
 */
export async function PhoneAppSection() {
  const qrSvg = await QRCode.toString(APPLICATION_URL, qrOptions(APPLICATION_URL))
  return <PhoneAppSectionClient qrSvg={qrSvg} />
}
