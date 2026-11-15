// ============ PUT & DELETE /api/analysis/students/[id] ============

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getAnalysisData,
  normalizeStudentAnswers,
} from '@/lib/apsis/analysis-server'

const LETTER_ALPHABET = ['A', 'B', 'C', 'D', 'E']

function parseId(raw: string): number | null {
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 ? value : null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: 'ID siswa tidak valid' }, { status: 400 })
  }

  const existing = await db.analysisStudent.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { config } = await getAnalysisData()

  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim() : existing.name

  let answers: unknown[] | null = null
  if (Array.isArray(body.answers)) {
    // Validasi huruf: 'A'..optionCount atau '-', invalid di-clamp ke '-'
    answers = body.answers.map((entry) => {
      const letter = String(entry ?? '').trim().toUpperCase()
      const optionIndex = LETTER_ALPHABET.indexOf(letter)
      return letter === '-' || (optionIndex >= 0 && optionIndex < config.optionCount) ? letter : '-'
    })
  }

  const finalAnswers = normalizeStudentAnswers(
    answers ?? (JSON.parse(existing.answers) as unknown[]),
    config.totalQuestions,
  )

  const updated = await db.analysisStudent.update({
    where: { id },
    data: { name, answers: JSON.stringify(finalAnswers) },
  })

  return NextResponse.json({
    student: { id: updated.id, name: updated.name, answers: finalAnswers },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = parseId(rawId)
  if (id === null) {
    return NextResponse.json({ error: 'ID siswa tidak valid' }, { status: 400 })
  }

  const existing = await db.analysisStudent.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 })
  }

  await db.analysisStudent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
