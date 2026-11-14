// POST /api/exam/generate — generate semua soal untuk profil (bisa 60-180 detik)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateQuestionsForStructure,
  parseStructureRow,
  parseQuestionRow,
} from '@/lib/apsis/generation'
import type { ExamProfileData, QuestionData } from '@/lib/apsis/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const profileId = String(body?.profileId ?? '').trim()
    if (!profileId) {
      return NextResponse.json({ error: 'profileId wajib diisi' }, { status: 400 })
    }

    const profileRow = await db.examProfile.findUnique({ where: { id: profileId } })
    if (!profileRow) {
      return NextResponse.json({ error: 'Profil ujian tidak ditemukan' }, { status: 400 })
    }

    const structureRows = await db.structure.findMany({
      where: { profileId },
      orderBy: { createdAt: 'asc' },
    })
    if (structureRows.length === 0) {
      return NextResponse.json({ error: 'Belum ada struktur soal pada profil ini' }, { status: 400 })
    }

    const profile: ExamProfileData = { ...profileRow }
    const structures = structureRows.map(parseStructureRow)
    const structureIds = structures.map((s) => s.id)

    // Hapus soal lama milik struktur-struktur ini
    await db.question.deleteMany({ where: { structureId: { in: structureIds } } })
    console.log(`[exam/generate] mulai generate untuk ${structures.length} struktur (soal lama dihapus)`)

    const allQuestions: QuestionData[] = []
    let startNumber = 1

    for (const structure of structures) {
      console.log(`[exam/generate] memproses ${structure.label} (${structure.questionType}, ${structure.total} soal)...`)
      const newQuestions = await generateQuestionsForStructure(profile, structure, startNumber)

      for (const nq of newQuestions) {
        const created = await db.question.create({
          data: {
            structureId: structure.id,
            number: nq.number,
            type: nq.type,
            difficulty: nq.difficulty,
            cognitiveLevel: nq.cognitiveLevel,
            content: nq.content,
            options: JSON.stringify(nq.options),
            answer: nq.answer,
            indicator: nq.indicator,
            material: nq.material,
            source: nq.source,
            scoreWeight: nq.scoreWeight,
            imagePrompt: nq.imagePrompt,
            imagePath: nq.imagePath,
          },
        })
        allQuestions.push(parseQuestionRow(created))
      }

      startNumber += newQuestions.length
      console.log(`[exam/generate] ${structure.label} selesai: ${newQuestions.length} soal (total: ${allQuestions.length})`)
    }

    allQuestions.sort((a, b) => a.number - b.number)
    console.log(`[exam/generate] SELESAI — ${allQuestions.length} soal dibuat`)

    return NextResponse.json({ questions: allQuestions })
  } catch (err) {
    console.error('[POST /api/exam/generate] error:', err)
    return NextResponse.json({ error: 'Gagal generate soal ujian' }, { status: 500 })
  }
}
