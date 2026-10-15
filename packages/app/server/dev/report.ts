import type { ReportStore } from '../../../../api/report.ts'
import process from 'node:process'
import { POST, receiveReport } from '../../../../api/report.ts'

/** Without a database of your own, `nuxt dev` prints each report rather than storing it, with no rate limit. */
const printed: ReportStore = {
  incr: async () => 1,
  expire: async () => 1,
  set: async (key, report) => {
    // eslint-disable-next-line no-console
    console.info(key, JSON.stringify(report, null, 2))
    return 'OK'
  },
}

/** The same variables the Vercel Function reads, from `packages/app/.env`: see CONTRIBUTING.md. */
const ownStore = Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)

export default defineEventHandler((event) => {
  const request = toWebRequest(event)
  return ownStore ? POST(request) : receiveReport(request, printed)
})
