import QRCode from 'qrcode'
import { SITE_URL } from '@/lib/site'
import { PhoneAppSectionClient } from './PhoneAppSectionClient'

/** Where every install entry point leads (#595). */
export const APPLICATION_URL = `${SITE_URL}/application`

/**
 * "MonÉlu sur votre téléphone", above the footer (#596, epic #593).
 *
 * The QR code is drawn here, on the server, as an inline SVG of
 * APPLICATION_URL, so it follows a domain move and never calls a third-party
 * service. Everything that depends on the device is decided in the browser by
 * the client half; the server HTML is the same for every visitor.
 */
export async function PhoneAppSection() {
  const qrSvg = await QRCode.toString(APPLICATION_URL, {
    type: 'svg',
    margin: 2,
    width: 128,
    color: { dark: '#0D1F3C', light: '#FFFFFF' },
  })
  return <PhoneAppSectionClient qrSvg={qrSvg} />
}
