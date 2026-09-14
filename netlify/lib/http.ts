import { timingSafeEqual } from 'node:crypto'

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status)
}

/**
 * The app itself has no login. Only the browser worker endpoints are protected,
 * so nobody can post fake prices or trigger notifications.
 */
export function requireWorkerKey(req: Request): Response | undefined {
  const secret = process.env.WORKER_SECRET
  if (!secret) return error('WORKER_SECRET is not configured on the server', 500)
  const given = req.headers.get('x-worker-key') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return error('Invalid worker key', 401)
  return undefined
}
