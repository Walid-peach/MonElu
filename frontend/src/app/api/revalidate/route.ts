import { revalidatePath } from 'next/cache'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-revalidate-secret') !== process.env.REVALIDATE_SECRET)
    return new Response('Unauthorized', { status: 401 })

  revalidatePath('/')
  revalidatePath('/votes')
  revalidatePath('/deputes')
  revalidatePath('/deputes/[id]', 'page')
  revalidatePath('/votes/[id]', 'page')

  return Response.json({ revalidated: true, at: new Date().toISOString() })
}
