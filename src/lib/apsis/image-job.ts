// Alur sisi klien untuk pekerjaan ilustrasi AI (background job + polling).
// Pemakaian: await runImageJobFlow(q.id, { prompt, onPhase })
import { apsisApi } from './client'
import type { QuestionData } from './types'

export type ImageJobPhase = 'composing' | 'rendering'

const POLL_INTERVAL_MS = 2000
const FIRST_POLL_DELAY_MS = 1800
const MAX_WAIT_MS = 300_000 // 5 menit
const START_GRACE_MS = 15_000 // batas menunggu job terlihat mulai

export async function runImageJobFlow(
  questionId: string,
  opts: { prompt?: string; onPhase?: (phase: ImageJobPhase) => void } = {}
): Promise<QuestionData> {
  const startedAt = Date.now()
  try {
    await apsisApi.startImageJob(questionId, opts.prompt)
  } catch {
    // Gagal memulai (mis. 202 gagal sesaat) — tetap coba polling; GET juga
    // memiliki auto-resume untuk job basi.
  }
  opts.onPhase?.('composing')

  let sawWorkingPhase = false
  await sleep(FIRST_POLL_DELAY_MS)

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    let res: { status: string; error: string | null; question: QuestionData }
    try {
      res = await apsisApi.pollImageJob(questionId)
    } catch {
      // Gangguan jaringan sesaat — coba lagi pada iterasi berikutnya
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    if (res.status === 'composing' || res.status === 'rendering') {
      sawWorkingPhase = true
      if (res.status === 'rendering') opts.onPhase?.('rendering')
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    if (res.status === 'done') {
      if (sawWorkingPhase) return res.question
      // Status 'done' basi (sebelum job ini mulai) — tunggu job benar-benar jalan
      if (Date.now() - startedAt > START_GRACE_MS) {
        throw new Error('Pekerjaan ilustrasi tidak berjalan. Coba lagi.')
      }
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    if (res.status === 'error') {
      if (sawWorkingPhase) throw new Error(res.error || 'Gagal membuat gambar ilustrasi.')
      if (Date.now() - startedAt > START_GRACE_MS) {
        throw new Error('Pekerjaan ilustrasi tidak berjalan. Coba lagi.')
      }
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    // status 'idle' — job belum tampak; tunggu dalam batas grace period
    if (Date.now() - startedAt > START_GRACE_MS) {
      throw new Error('Pekerjaan ilustrasi tidak berjalan. Coba lagi.')
    }
    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('Waktu tunggu habis (5 menit). Coba lagi.')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
