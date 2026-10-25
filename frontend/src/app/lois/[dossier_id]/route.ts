import { NextResponse } from 'next/server'
import { anDossierUrl } from '@/lib/an'

/**
 * Stand-in for the bill page until #370 builds it (#619).
 *
 * The API already hands out `<site>/lois/<dossier_uid>` as `lois_url`, and the
 * iPhone app reads that field as "this bill has a page", so it cannot be
 * nulled. Until the page exists, the URL sends readers to the bill's official
 * AN dossier page. A temporary redirect (307), never a 308: the URL is about
 * to become a real page, and a cached permanent redirect would outlive it.
 * #370 deletes this handler when it adds `page.tsx` here.
 */

/** Every `lois_url` the API emits names a legislature-17 dossier. */
const BILL_UID = /^DLR5L17N\d{1,9}$/

export function GET(_request: Request, { params }: { params: Promise<{ dossier_id: string }> }) {
  return params.then(({ dossier_id }) => {
    const target = BILL_UID.test(dossier_id) ? anDossierUrl(dossier_id) : null
    if (!target) return new NextResponse('Not found', { status: 404 })
    return NextResponse.redirect(target, 307)
  })
}
