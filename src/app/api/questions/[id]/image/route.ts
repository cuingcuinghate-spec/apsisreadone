// POST /api/questions/[id]/image — mulai job ilustrasi AI di background (respons instan)
// GET  /api/questions/[id]/image — polling status job (composing | rendering | done | error)
// DELETE — hapus ilustrasi
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import {
  startImageJob,
  isImageJobRunning,
  getImageJobState,
  parseQuestionRow,
} from '@/lib/apsis/generation'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const row = await db.question.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Soal tidak ditemukan' }, { status: 404 })
    }

    let body: any = null
    try {
      body = await request.json()
    } catch {
      body = null
    }
    const customPrompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''

    const state = startImageJob(id, customPrompt || null)

    return NextResponse.json(
      {
        started: state === 'started',
        status: state === 'started' ? 'composing' : (row.imageStatus ?? 'rendering'),
        question: parseQuestionRow(row),
      },
      { status: 202 }
    )
  } catch (err: any) {
    console.error('[POST /api/questions/[id]/image] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const row = await db.question.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Soal tidak ditemukan' }, { status: 404 })
    }

    // Pemulihan job basi: status masih "proses" tetapi tidak ada job berjalan
    // (mis. server pernah restart di tengah proses) → lanjutkan otomatis.
    const status = row.imageStatus ?? 'idle'
    if ((status === 'composing' || status === 'rendering') && !isImageJobRunning(id)) {
      startImageJob(id, row.imagePrompt ?? null)
    }

    const question = parseQuestionRow(row)
    return NextResponse.json({ status: question.imageStatus, error: question.imageError, question })
  } catch (err: any) {
    console.error('[GET /api/questions/[id]/image] error:', err)
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
      data: { imagePrompt: null, imagePath: null, imageStatus: 'idle', imageError: null },
    })

    return NextResponse.json({ question: parseQuestionRow(updated) })
  } catch (err: any) {
    console.error('[DELETE /api/questions/[id]/image] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
