// POST /api/questions/[id]/image — generate ilustrasi soal via AI; DELETE — hapus ilustrasi
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getZAI, buildImageAutoPrompt, parseQuestionRow } from '@/lib/apsis/generation'
import type { ExamProfileData } from '@/lib/apsis/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const question = parseQuestionRow(row)

    let body: any = null
    try {
      body = await request.json()
    } catch {
      body = null
    }
    const customPrompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
    const prompt = customPrompt || buildImageAutoPrompt(question, profile)

    const zai = await getZAI()
    const res = await zai.images.generations.create({ prompt, size: '1024x1024' })
    const b64 = res?.data?.[0]?.base64
    if (!b64) {
      throw new Error('Image generation returned no data')
    }

    const buffer = Buffer.from(b64, 'base64')
    const dir = path.join(process.cwd(), 'public', 'generated')
    await fs.mkdir(dir, { recursive: true })
    const filename = `${row.id}-${Date.now()}.png`
    const filePath = path.join(dir, filename)
    await fs.writeFile(filePath, buffer)

    // Hapus file gambar lama jika ada
    if (row.imagePath) {
      try {
        await fs.rm(path.join(process.cwd(), 'public', row.imagePath))
      } catch {
        // abaikan jika file lama sudah tidak ada
      }
    }

    const updated = await db.question.update({
      where: { id },
      data: { imagePrompt: prompt, imagePath: `/generated/${filename}` },
    })

    return NextResponse.json({ question: parseQuestionRow(updated) })
  } catch (err: any) {
    console.error('[POST /api/questions/[id]/image] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const row = await db.question.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Soal tidak ditemukan' }, { status: 404 })
    }

    if (row.imagePath) {
      try {
        await fs.rm(path.join(process.cwd(), 'public', row.imagePath))
      } catch {
        // abaikan jika file sudah tidak ada
      }
    }

    const updated = await db.question.update({
      where: { id },
      data: { imagePrompt: null, imagePath: null },
    })

    return NextResponse.json({ question: parseQuestionRow(updated) })
  } catch (err: any) {
    console.error('[DELETE /api/questions/[id]/image] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
