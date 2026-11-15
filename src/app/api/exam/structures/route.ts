// POST /api/exam/structures — tambah struktur (bagian) soal untuk profil
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseStructureRow } from '@/lib/apsis/generation'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
    }

    const profileId = String(body.profileId ?? '').trim()
    const s = body.structure
    if (!profileId || !s || typeof s !== 'object') {
      return NextResponse.json({ error: 'profileId dan structure wajib diisi' }, { status: 400 })
    }

    const profile = await db.examProfile.findUnique({ where: { id: profileId } })
    if (!profile) {
      return NextResponse.json({ error: 'Profil ujian tidak ditemukan' }, { status: 404 })
    }

    const questionType = String(s.questionType ?? '').trim()
    const optionCount = Number(s.optionCount)
    const easyCount = Number(s.easyCount)
    const mediumCount = Number(s.mediumCount)
    const hardCount = Number(s.hardCount)
    const total = Number(s.total)
    const cognitiveLevels = Array.isArray(s.cognitiveLevels) ? s.cognitiveLevels.map(String) : []
    const customInstruction =
      s.customInstruction === null || s.customInstruction === undefined
        ? null
        : String(s.customInstruction).trim() || null

    if (!questionType) {
      return NextResponse.json({ error: 'questionType wajib diisi' }, { status: 400 })
    }
    if (!Number.isFinite(optionCount) || optionCount < 2) {
      return NextResponse.json({ error: 'optionCount minimal 2' }, { status: 400 })
    }
    if (!Number.isFinite(total) || total < 1) {
      return NextResponse.json({ error: 'total minimal 1' }, { status: 400 })
    }
    if (
      ![easyCount, mediumCount, hardCount].every((n) => Number.isFinite(n) && n >= 0)
    ) {
      return NextResponse.json(
        { error: 'easyCount, mediumCount, hardCount harus angka >= 0' },
        { status: 400 }
      )
    }

    const existingCount = await db.structure.count({ where: { profileId } })
    const label = `BAGIAN ${existingCount + 1}`

    const created = await db.structure.create({
      data: {
        profileId,
        label,
        questionType,
        optionCount: Math.round(optionCount),
        includeImages: Boolean(s.includeImages),
        easyCount: Math.round(easyCount),
        mediumCount: Math.round(mediumCount),
        hardCount: Math.round(hardCount),
        total: Math.round(total),
        cognitiveLevels: JSON.stringify(cognitiveLevels),
        customInstruction,
      },
    })

    return NextResponse.json({ structure: parseStructureRow(created) })
  } catch (err) {
    console.error('[POST /api/exam/structures] error:', err)
    return NextResponse.json({ error: 'Gagal membuat struktur soal' }, { status: 500 })
  }
}
