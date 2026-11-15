// GET /api/exam — profil terbaru + struktur + soal (semua sudah di-parse ke tipe data)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseStructureRow, parseQuestionRow } from '@/lib/apsis/generation'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const profileRow = await db.examProfile.findFirst({ orderBy: { createdAt: 'desc' } })
    if (!profileRow) {
      return NextResponse.json({ profile: null, structures: [], questions: [] })
    }

    const structureRows = await db.structure.findMany({
      where: { profileId: profileRow.id },
      orderBy: { createdAt: 'asc' },
    })
    const structures = structureRows.map(parseStructureRow)

    const questionRows = structures.length
      ? await db.question.findMany({
          where: { structureId: { in: structures.map((s) => s.id) } },
          orderBy: { number: 'asc' },
        })
      : []
    const questions = questionRows.map(parseQuestionRow)

    return NextResponse.json({ profile: profileRow, structures, questions })
  } catch (err) {
    console.error('[GET /api/exam] error:', err)
    return NextResponse.json({ error: 'Gagal memuat data ujian' }, { status: 500 })
  }
}
