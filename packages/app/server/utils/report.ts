import type { Report } from '../../shared/utils/report.ts'
import { Buffer } from 'node:buffer'
import * as v from 'valibot'
import { ReportSchema } from '../../shared/utils/report.ts'

/** Reports one address can send per window. */
const RATE_LIMIT = 10
const RATE_WINDOW_SECONDS = 60 * 60

/** Stored under `report:<ISO time>:<id>`, so a scan of `report:*` lists them by date. */
export interface StoredReport extends Omit<Report, 'nickname'> {
  createdAt: string
  userAgent?: string
  /** Set by `scripts/reports.ts`: no status means the report is open. */
  status?: 'done' | 'invalid'
  handledAt?: string
}

/** The commands this endpoint needs, which Upstash's client provides. */
export interface ReportStore {
  incr: (key: string) => Promise<number>
  expire: (key: string, seconds: number) => Promise<0 | 1>
  set: (key: string, value: StoredReport) => Promise<'OK' | StoredReport | null>
}

/** The page posts from the site, `furifont dev` and `nuxt dev`: nothing rides on cookies, so any origin may. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

function json(status: number, body: { id: string } | { error: string }): Response {
  return Response.json(body, { status, headers: CORS })
}

/** Rate limits by a hash of the address, so no address is stored. */
async function addressKey(request: Request): Promise<string> {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address))
  return `report-rate:${Buffer.from(digest).toString('hex')}`
}

export async function receiveReport(request: Request, store: ReportStore, now = new Date()): Promise<Response> {
  const parsed = v.safeParse(ReportSchema, await request.json().catch(() => undefined))
  if (!parsed.success)
    return json(400, { error: v.summarize(parsed.issues) })

  const rate = await addressKey(request)
  const count = await store.incr(rate)
  if (count === 1)
    await store.expire(rate, RATE_WINDOW_SECONDS)
  if (count > RATE_LIMIT)
    return json(429, { error: 'Too many reports, try again later.' })

  const { nickname: _, ...report } = parsed.output
  const id = crypto.randomUUID()
  await store.set(`report:${now.toISOString()}:${id}`, {
    ...report,
    createdAt: now.toISOString(),
    userAgent: request.headers.get('user-agent') ?? undefined,
  })
  return json(201, { id })
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS })
}
