import type { ReportStore, StoredReport } from '../packages/app/server/utils/report.ts'
import type { ReportInput } from '../packages/app/shared/utils/report.ts'
import { describe, expect, it } from 'vitest'
import { receiveReport } from '../packages/app/server/utils/report.ts'

function memoryStore() {
  const counters = new Map<string, number>()
  const reports = new Map<string, StoredReport>()
  const store: ReportStore = {
    incr: async (key) => {
      counters.set(key, (counters.get(key) ?? 0) + 1)
      return counters.get(key)!
    },
    expire: async () => 1,
    set: async (key, value) => {
      reports.set(key, value)
      return 'OK'
    },
  }
  return { store, reports }
}

const report: ReportInput = {
  words: [
    { word: ' 市場 ', expected: 'いちば', shown: 'しじょう', context: '' },
    { word: '今日', expected: 'きょう' },
  ],
  environment: { type: 'website', url: 'https://example.jp/news', app: '', os: 'macOS' },
  family: 'Furifont Sans',
  version: '0.1.2',
  locale: 'ja',
  note: '',
  name: ' Ren ',
  nickname: '',
}

function post(body: object, address = '203.0.113.7'): Request {
  return new Request('https://furifont.antfu.me/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': address, 'user-agent': 'Test/1.0' },
    body: JSON.stringify(body),
  })
}

describe('receiveReport', () => {
  it('stores every word of a report and the name to credit under a dated key, without blank fields', async () => {
    const { store, reports } = memoryStore()
    const response = await receiveReport(post(report), store, new Date('2026-10-15T12:00:00Z'))

    expect(response.status).toBe(201)
    const { id } = await response.json()
    expect([...reports.keys()]).toEqual([`report:2026-10-15T12:00:00.000Z:${id}`])
    expect([...reports.values()][0]).toEqual({
      words: [
        { word: '市場', expected: 'いちば', shown: 'しじょう', context: undefined },
        { word: '今日', expected: 'きょう', shown: undefined, context: undefined },
      ],
      environment: { type: 'website', url: 'https://example.jp/news', app: undefined, os: 'macOS' },
      family: 'Furifont Sans',
      version: '0.1.2',
      locale: 'ja',
      note: undefined,
      name: 'Ren',
      createdAt: '2026-10-15T12:00:00.000Z',
      userAgent: 'Test/1.0',
    })
  })

  it.each([
    ['no words', { ...report, words: [] }],
    ['a word without its reading', { ...report, words: [{ word: '市場', expected: ' ' }] }],
    ['an unknown environment', { ...report, environment: { type: 'tv' } }],
    ['a filled honeypot', { ...report, nickname: 'bot' }],
  ])('rejects %s', async (_, body) => {
    const { store, reports } = memoryStore()
    const response = await receiveReport(post(body), store)

    expect(response.status).toBe(400)
    expect(reports.size).toBe(0)
  })

  it('limits how many reports one address sends', async () => {
    const { store, reports } = memoryStore()
    const statuses = []
    for (let i = 0; i < 101; i++)
      statuses.push((await receiveReport(post(report), store)).status)

    expect(statuses.slice(0, 100).every(status => status === 201)).toBe(true)
    expect(statuses[100]).toBe(429)
    expect((await receiveReport(post(report, '198.51.100.1'), store)).status).toBe(201)
    expect(reports.size).toBe(101)
  })
})
