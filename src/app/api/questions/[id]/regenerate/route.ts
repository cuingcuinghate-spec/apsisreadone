// POST /api/questions/[id]/regenerate — buat ulang isi soal (nomor/tipe/dll tetap)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { regenerateQuestion, parseStructureRow, parseQuestionRow } from '@/lib/apsis/generation'
import type { ExamProfileData } from '@/lib/apsis/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const row = await db.question.findUnique({
      where: { id },
      include: { structure: { include: { profile: true } } },
    })
    if (!row) {
      return NextResponse.json({ error: 'Soal tidak ditemukan' }, { status: 404 })
    }

    const profile: ExamProfileData = { ...row.structure.profile }
    const structure = parseStructureRow(row.structure)
    const question = parseQuestionRow(row)

    const regenerated = await regenerateQuestion(profile, structure, question)

    const updated = await db.question.update({
      where: { id },
      data: {
        content: regenerated.content,
        options: JSON.stringify(regenerated.options),
        answer: regenerated.answer,
        indicator: regenerated.indicator,
        material: regenerated.material,
        source: regenerated.source,
      },
    })

    return NextResponse.json({ question: parseQuestionRow(updated) })
  } catch (err: any) {
    console.error('[POST /api/questions/[id]/regenerate] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
