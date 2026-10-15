import type { ReportStore } from '../../../../api/report.ts'
import { receiveReport } from '../../../../api/report.ts'

/** `nuxt dev` only: prints each report rather than storing it, with no rate limit. */
const store: ReportStore = {
  incr: async () => 1,
  expire: async () => 1,
  set: async (key, report) => {
    // eslint-disable-next-line no-console
    console.info(key, JSON.stringify(report, null, 2))
    return 'OK'
  },
}

export default defineEventHandler(event => receiveReport(toWebRequest(event), store))
