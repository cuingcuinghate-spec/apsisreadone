// POST /api/tka/generate — generate simulasi TKA (mode: standar=30, latihan=10, drill=5)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateTkaQuestions, parseTkaSimulationRow } from '@/lib/apsis/generation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODE_COUNTS: Record<string, number> = {
  standar: 30,
  latihan: 10,
  drill: 5,
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const level = String(body?.level ?? '').trim()
    const subtest = String(body?.subtest ?? '').trim()
    const mode = String(body?.mode ?? '').trim()

    if (!level || !subtest) {
      return NextResponse.json({ error: 'level dan subtest wajib diisi' }, { status: 400 })
    }
    if (!MODE_COUNTS[mode]) {
      return NextResponse.json(
        { error: `mode tidak valid. Gunakan salah satu dari: ${Object.keys(MODE_COUNTS).join(', ')}` },
        { status: 400 }
      )
    }

    const count = MODE_COUNTS[mode]
    console.log(`[tka/generate] mulai: ${level} / ${subtest} / ${mode} (${count} soal)`)

    const questions = await generateTkaQuestions(level, subtest, count)

    const created = await db.tkaSimulation.create({
      data: {
        level,
        subtest,
        mode,
        totalQuestions: questions.length,
        data: JSON.stringify(questions),
      },
    })

    console.log(`[tka/generate] SELESAI — ${questions.length} soal TKA dibuat`)
    return NextResponse.json({ simulation: parseTkaSimulationRow(created) })
  } catch (err) {
    console.error('[POST /api/tka/generate] error:', err)
    return NextResponse.json({ error: 'Gagal generate simulasi TKA' }, { status: 500 })
  }
}
