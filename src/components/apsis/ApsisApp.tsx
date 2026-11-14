'use client'

import { useEffect, useRef } from 'react'
import { useApsisStore } from '@/lib/store'
import { apsisApi } from '@/lib/apsis/client'
import { useToast } from '@/hooks/use-toast'
import LandingPage from '@/components/apsis/LandingPage'
import { AppShell } from '@/components/apsis/AppShell'
import ProfilView from '@/components/apsis/ProfilView'
import KonfigurasiView from '@/components/apsis/KonfigurasiView'
import NaskahView from '@/components/apsis/NaskahView'
import CttView from '@/components/apsis/CttView'
import KktpView from '@/components/apsis/KktpView'
import KuisView from '@/components/apsis/KuisView'
import TkaView from '@/components/apsis/TkaView'

export default function ApsisApp() {
  const view = useApsisStore((s) => s.view)
  const setView = useApsisStore((s) => s.setView)
  const setProfile = useApsisStore((s) => s.setProfile)
  const setStructures = useApsisStore((s) => s.setStructures)
  const setQuestions = useApsisStore((s) => s.setQuestions)
  const questionsLoaded = useApsisStore((s) => s.questionsLoaded)
  const setQuestionsLoaded = useApsisStore((s) => s.setQuestionsLoaded)
  const setAnalysisConfig = useApsisStore((s) => s.setAnalysisConfig)
  const setAnalysisStudents = useApsisStore((s) => s.setAnalysisStudents)
  const analysisLoaded = useApsisStore((s) => s.analysisLoaded)
  const setAnalysisLoaded = useApsisStore((s) => s.setAnalysisLoaded)
  const setTkaSimulation = useApsisStore((s) => s.setTkaSimulation)
  const tkaLoaded = useApsisStore((s) => s.tkaLoaded)
  const setTkaLoaded = useApsisStore((s) => s.setTkaLoaded)
  const { toast } = useToast()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    apsisApi
      .getExam()
      .then((data) => {
        setProfile(data.profile)
        setStructures(data.structures)
        setQuestions(data.questions)
      })
      .catch(() => {
        toast({ title: 'Gagal memuat data ujian', variant: 'destructive' })
      })
      .finally(() => setQuestionsLoaded(true))

    apsisApi
      .getAnalysis()
      .then((data) => {
        setAnalysisConfig(data.config)
        setAnalysisStudents(data.students)
      })
      .catch(() => {
        toast({ title: 'Gagal memuat data analisis', variant: 'destructive' })
      })
      .finally(() => setAnalysisLoaded(true))

    apsisApi
      .getTka()
      .then((data) => setTkaSimulation(data.simulation))
      .catch(() => undefined)
      .finally(() => setTkaLoaded(true))
  }, [
    setProfile,
    setStructures,
    setQuestions,
    setQuestionsLoaded,
    setAnalysisConfig,
    setAnalysisStudents,
    setAnalysisLoaded,
    setTkaSimulation,
    setTkaLoaded,
    toast,
  ])

  if (view === 'landing') {
    return <LandingPage onEnter={() => setView('profil')} />
  }

  return (
    <AppShell>
      {view === 'profil' ? <ProfilView /> : null}
      {view === 'konfigurasi' ? <KonfigurasiView /> : null}
      {view === 'naskah' ? <NaskahView /> : null}
      {view === 'ctt' ? <CttView /> : null}
      {view === 'kktp' ? <KktpView /> : null}
      {view === 'kuis' ? <KuisView /> : null}
      {view === 'tka' ? <TkaView /> : null}
      {!questionsLoaded || !analysisLoaded ? (
        <p className="sr-only">Memuat data…</p>
      ) : null}
    </AppShell>
  )
}
