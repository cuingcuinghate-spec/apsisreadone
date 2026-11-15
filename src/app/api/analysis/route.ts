// ============ GET & PATCH /api/analysis ============

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEMO_CONFIG_ID } from '@/lib/apsis/constants'
import {
  defaultTopics,
  getAnalysisData,
  normalizeKeyAnswers,
  normalizeStudentAnswers,
} from '@/lib/apsis/analysis-server'

export async function GET() {
  const data = await getAnalysisData()
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const current = await getAnalysisData()
  const cfg = current.config

  // Validasi input
  const errors: string[] = []
  let totalQuestions = cfg.totalQuestions
  if (body.totalQuestions !== undefined) {
    const value = Number(body.totalQuestions)
    if (!Number.isInteger(value) || value < 5 || value > 20) {
      errors.push('totalQuestions harus bilangan bulat 5..20')
    } else {
      totalQuestions = value
    }
  }

  let kkm = cfg.kkm
  if (body.kkm !== undefined) {
    const value = Number(body.kkm)
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      errors.push('kkm harus bilangan bulat 0..100')
    } else {
      kkm = value
    }
  }

  let optionCount = cfg.optionCount
  if (body.optionCount !== undefined) {
    const value = Number(body.optionCount)
    if (!Number.isInteger(value) || value < 3 || value > 5) {
      errors.push('optionCount harus bilangan bulat 3..5')
    } else {
      optionCount = value
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }

  // Kunci jawaban: resize (pad 'A')
  const keyAnswers = Array.isArray(body.keyAnswers)
    ? normalizeKeyAnswers(body.keyAnswers, totalQuestions)
    : normalizeKeyAnswers(cfg.keyAnswers, totalQuestions)

  // Jika jumlah soal berubah, regenerasi topik default (dua bagian)
  const topics = totalQuestions !== cfg.totalQuestions ? defaultTopics(totalQuestions) : cfg.topics

  await db.analysisConfig.upsert({
    where: { id: DEMO_CONFIG_ID },
    update: {
      totalQuestions,
      optionCount,
      kkm,
      keyAnswers: JSON.stringify(keyAnswers),
      topics: JSON.stringify(topics),
    },
    create: {
      id: DEMO_CONFIG_ID,
      totalQuestions,
      optionCount,
      kkm,
      keyAnswers: JSON.stringify(keyAnswers),
      topics: JSON.stringify(topics),
    },
  })

  // Resize jawaban seluruh siswa (pad '-')
  await Promise.all(
    current.students.map((student) =>
      db.analysisStudent.update({
        where: { id: student.id },
        data: { answers: JSON.stringify(normalizeStudentAnswers(student.answers, totalQuestions)) },
      }),
    ),
  )

  const data = await getAnalysisData()
  return NextResponse.json(data)
}
