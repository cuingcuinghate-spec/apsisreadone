// ============ POST /api/analysis/import ============

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getAnalysisData,
  normalizeStudentAnswers,
} from '@/lib/apsis/analysis-server'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const list = Array.isArray(body.students) ? body.students : null
  if (!list || list.length === 0) {
    return NextResponse.json({ error: 'Data siswa tidak valid' }, { status: 400 })
  }

  const { config } = await getAnalysisData()

  const rows = list.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Siswa ${index + 1}`
    return {
      id: index + 1,
      name,
      answers: JSON.stringify(normalizeStudentAnswers(item.answers, config.totalQuestions)),
    }
  })

  await db.$transaction([
    db.analysisStudent.deleteMany(),
    db.analysisStudent.createMany({ data: rows }),
  ])

  const studentRows = await db.analysisStudent.findMany({ orderBy: { id: 'asc' } })
  const students = studentRows.map((row) => ({
    id: row.id,
    name: row.name,
    answers: JSON.parse(row.answers) as string[],
  }))

  return NextResponse.json({ config, students })
}
