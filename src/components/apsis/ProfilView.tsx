'use client'

import { useState } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi } from '@/lib/apsis/client'
import { FASE_BY_JENJANG, JENJANG_OPTIONS, KELAS_BY_FASE } from '@/lib/apsis/constants'
import { useToast } from '@/hooks/use-toast'
import { PageTitle, SectionCard, FieldLabel } from '@/components/apsis/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowRight, GraduationCap, Loader2, School, BookOpen } from 'lucide-react'

export default function ProfilView() {
  const profile = useApsisStore((s) => s.profile)
  const setProfile = useApsisStore((s) => s.setProfile)
  const setView = useApsisStore((s) => s.setView)
  const { toast } = useToast()

  const [teacherName, setTeacherName] = useState(profile?.teacherName ?? '')
  const [schoolName, setSchoolName] = useState(profile?.schoolName ?? '')
  const [level, setLevel] = useState(profile?.level ?? '')
  const [phase, setPhase] = useState(profile?.phase ?? '')
  const [grade, setGrade] = useState(profile?.grade ?? '')
  const [subject, setSubject] = useState(profile?.subject ?? '')
  const [topic, setTopic] = useState(profile?.topic ?? '')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const faseOptions = level ? FASE_BY_JENJANG[level] ?? [] : []
  const kelasOptions = phase ? KELAS_BY_FASE[phase] ?? [] : []

  function validate(): boolean {
    const missing: string[] = []
    if (!teacherName.trim()) missing.push('Nama Guru / Penyusun')
    if (!schoolName.trim()) missing.push('Nama Satuan Pendidikan')
    if (!level) missing.push('Jenjang Pendidikan')
    if (!phase) missing.push('Fase Pembelajaran')
    if (!grade) missing.push('Tingkat/Kelas')
    if (!subject.trim()) missing.push('Mata Pelajaran')
    if (!topic.trim()) missing.push('Topik / Lingkungan Capaian')
    setErrors(missing)
    return missing.length === 0
  }

  async function handleSave() {
    if (!validate()) {
      toast({
        title: 'Lengkapi identitas terlebih dahulu',
        description: 'Semua field wajib diisi sebelum melanjutkan.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const payload = {
        teacherName: teacherName.trim(),
        schoolName: schoolName.trim(),
        level,
        phase,
        grade,
        subject: subject.trim(),
        topic: topic.trim(),
      }
      const { profile: saved } = profile
        ? await apsisApi.updateProfile(profile.id, payload)
        : await apsisApi.saveProfile(payload)
      setProfile(saved)
      toast({ title: 'Profil ujian tersimpan', description: `Selamat mengajar, ${saved.teacherName}!` })
      setView('konfigurasi')
    } catch (err) {
      toast({
        title: 'Gagal menyimpan profil',
        description: err instanceof Error ? err.message : 'Coba lagi.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle
        title="Profil Ujian & Sasaran Pembelajaran"
        description="Isi identitas penyusun dan sasaran peserta didik. Data ini dipakai untuk menyusun naskah, kisi-kisi, dan kartu soal."
      />

      <SectionCard title="Profil Dasar Ujian" note="Semua field wajib diisi">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel required>Nama Guru / Penyusun</FieldLabel>
            <div className="relative">
              <GraduationCap
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="pl-9"
                placeholder="cth: Andika"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                aria-label="Nama Guru / Penyusun"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel required>Nama Satuan Pendidikan</FieldLabel>
            <div className="relative">
              <School
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="pl-9"
                placeholder="cth: SD 1 Depok"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                aria-label="Nama Satuan Pendidikan"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Hierarki Kurikulum & Sasaran Peserta Didik">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <FieldLabel required>1. Jenjang Pendidikan</FieldLabel>
              <Select
                value={level}
                onValueChange={(v) => {
                  setLevel(v)
                  setPhase('')
                  setGrade('')
                }}
              >
                <SelectTrigger aria-label="Jenjang Pendidikan">
                  <SelectValue placeholder="Pilih jenjang" />
                </SelectTrigger>
                <SelectContent>
                  {JENJANG_OPTIONS.map((j) => (
                    <SelectItem key={j} value={j}>
                      {j}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>2. Fase Pembelajaran</FieldLabel>
              <Select
                value={phase}
                onValueChange={(v) => {
                  setPhase(v)
                  setGrade('')
                }}
                disabled={!level}
              >
                <SelectTrigger aria-label="Fase Pembelajaran">
                  <SelectValue placeholder={level ? 'Pilih fase' : 'Pilih jenjang dulu'} />
                </SelectTrigger>
                <SelectContent>
                  {faseOptions.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>3. Tingkat/Kelas</FieldLabel>
              <Select value={grade} onValueChange={setGrade} disabled={!phase}>
                <SelectTrigger aria-label="Tingkat/Kelas">
                  <SelectValue placeholder={phase ? 'Pilih kelas' : 'Pilih fase dulu'} />
                </SelectTrigger>
                <SelectContent>
                  {kelasOptions.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel required>Mata Pelajaran</FieldLabel>
              <div className="relative">
                <BookOpen
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="pl-9"
                  placeholder="cth: Matematika"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  aria-label="Mata Pelajaran"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel required>Topik / Lingkup Capaian Pembelajaran</FieldLabel>
              <Textarea
                placeholder="cth: Penjumlahan bilangan cacah sampai 20"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                aria-label="Topik / Lingkup Capaian Pembelajaran"
                className="min-h-[42px]"
              />
            </div>
          </div>

          {errors.length > 0 ? (
            <p className="rounded-lg border border-destructive/40 bg-red-50 px-3 py-2 text-xs font-semibold text-destructive dark:bg-red-950/40">
              Wajib diisi: {errors.join(', ')}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2 bg-navy px-6 text-white hover:bg-navy/90 dark:bg-navy dark:hover:bg-navy/90"
          size="lg"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden />
          )}
          Lanjut ke Konfigurasi Teknis
        </Button>
      </div>
    </div>
  )
}
