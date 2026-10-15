import type { ReportStore } from '../utils/report.ts'
import process from 'node:process'
import { Redis } from '@upstash/redis'
import { receiveReport } from '../utils/report.ts'

/** Without a database, `nuxt dev` prints each report rather than storing it, with no rate limit. */
const printed: ReportStore = {
  incr: async () => 1,
  expire: async () => 1,
  set: async (key, report) => {
    // eslint-disable-next-line no-console
    console.info(key, JSON.stringify(report, null, 2))
    return 'OK'
  },
}

/** Upstash for Redis from the Vercel Marketplace sets KV_REST_API_URL and KV_REST_API_TOKEN; `UPSTASH_REDIS_REST_*` work too (see CONTRIBUTING.md). */
const ownStore = Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)

export default defineEventHandler((event) => {
  return receiveReport(toWebRequest(event), ownStore ? Redis.fromEnv() : printed)
})
