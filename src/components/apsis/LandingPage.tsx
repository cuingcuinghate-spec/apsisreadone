'use client'

import { motion, type Variants } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  FileText,
  GraduationCap,
  MonitorPlay,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

/* ====== Data fitur ====== */

interface Feature {
  icon: LucideIcon
  title: string
  description: string
  badge: string
  badgeClassName: string
}

const FEATURES: Feature[] = [
  {
    icon: FileText,
    title: 'Pembuat Soal & Kartu Soal',
    description:
      'Susun naskah ujian, kisi-kisi, kunci jawaban, dan kartu soal resmi otomatis dengan AI.',
    badge: 'FITUR UTAMA',
    badgeClassName: 'bg-secondary text-primary',
  },
  {
    icon: BarChart3,
    title: 'Analisis Soal & Analisis Nilai',
    description:
      'Analisis butir soal (CTT), analisis nilai (KKTP), dan rekomendasi remedial siswa otomatis.',
    badge: 'FITUR UTAMA',
    badgeClassName: 'bg-secondary text-primary',
  },
  {
    icon: MonitorPlay,
    title: 'Simulasi CAT TKA 2026',
    description:
      'Simulasi Tes Kemampuan Akademik standar Kemendikdasmen 2026 dengan stimulus HOTS.',
    badge: 'FITUR BONUS',
    badgeClassName: 'bg-amber-100 text-amber-700',
  },
]

/* ====== Varian animasi (framer-motion) ====== */

const heroContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
}

const cardContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: 'easeOut' },
  },
}

/* ====== Komponen utama ====== */

export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="bg-app-gradient flex min-h-screen flex-col">
      {/* ====== Header / Logo ====== */}
      <header className="flex justify-center px-4 pt-8">
        <motion.div
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <div className="bg-primary flex size-11 items-center justify-center rounded-xl shadow-sm">
            <GraduationCap className="text-primary-foreground size-6" aria-hidden="true" />
          </div>
          <span className="text-primary text-2xl font-extrabold tracking-wide">APSIS</span>
          <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">
            V1.0
          </span>
        </motion.div>
      </header>

      {/* ====== Hero + Fitur ====== */}
      <main className="flex flex-1 flex-col px-4 pb-12">
        <motion.section
          className="mx-auto flex w-full max-w-2xl flex-col items-center text-center"
          variants={heroContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            variants={fadeUp}
            className="mt-10 text-3xl font-extrabold md:text-4xl"
          >
            Selamat Datang di <span className="text-primary">APSIS</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="text-apsis-green mt-3 text-lg font-semibold"
          >
            Aplikasi Pembuat Soal dan Analisis
          </motion.p>

          <motion.p
            variants={fadeUp}
            className="text-muted-foreground mt-4 text-sm leading-relaxed md:text-base"
          >
            Platform cerdas terintegrasi untuk membantu guru menyusun naskah soal
            ujian, kisi-kisi, kunci jawaban, kartu soal, analisis butir soal (CTT),
            analisis nilai (KKTP), kuis interaktif kelas, hingga simulasi TKA 2026
            — semuanya otomatis dalam hitungan menit.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              type="button"
              size="lg"
              onClick={onEnter}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-xl font-semibold shadow-md sm:w-auto"
            >
              Masuk ke Aplikasi
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onEnter}
              className="text-primary hover:bg-secondary/60 w-full rounded-xl text-base underline underline-offset-4 sm:w-auto"
            >
              Daftar Akun Baru
            </Button>
          </motion.div>
        </motion.section>

        {/* ====== Kartu fitur ====== */}
        <motion.section
          className="mx-auto mt-10 flex w-full max-w-2xl flex-col gap-4"
          variants={cardContainer}
          initial="hidden"
          animate="visible"
          aria-label="Fitur unggulan APSIS"
        >
          {FEATURES.map((feature) => (
            <motion.div key={feature.title} variants={fadeUp} className="w-full">
              <Card className="hover:shadow-md flex-row items-center gap-4 px-5 py-5 transition-shadow">
                <div className="bg-secondary flex size-12 shrink-0 items-center justify-center rounded-lg">
                  <feature.icon className="text-primary size-6" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <h3 className="text-base font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                <div className="shrink-0 self-start">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider whitespace-nowrap ${feature.badgeClassName}`}
                  >
                    {feature.badge}
                  </span>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.section>
      </main>

      {/* ====== Footer (sticky ke bawah viewport) ====== */}
      <footer className="border-border/60 mt-auto border-t py-4 text-center">
        <p className="text-muted-foreground px-4 text-xs uppercase tracking-wide">
          © 2026 APSIS. Hak Cipta Dilindungi Undang-Undang. | Version 1.0 (Stable)
        </p>
      </footer>
    </div>
  )
}
