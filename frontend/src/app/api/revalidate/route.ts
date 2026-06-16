import { revalidatePath } from 'next/cache'
import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

function secretsMatch(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 })
}

export async function POST(req: NextRequest) {
  const provided = req.headers.get('x-revalidate-secret') ?? ''
  const expected = process.env.REVALIDATE_SECRET ?? ''
  if (!expected || !secretsMatch(provided, expected))
    return new Response('Unauthorized', { status: 401 })

  revalidatePath('/')
  revalidatePath('/votes')
  revalidatePath('/deputes')
  revalidatePath('/deputes/[id]', 'page')
  revalidatePath('/votes/[id]', 'page')

  return Response.json({ revalidated: true, at: new Date().toISOString() })
}
