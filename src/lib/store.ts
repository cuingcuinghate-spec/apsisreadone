'use client'

import { create } from 'zustand'
import type {
  AnalysisStudentData,
  AnalysisConfigData,
  ExamProfileData,
  QuestionData,
  StructureData,
  TkaSimulationData,
} from '@/lib/apsis/types'

export type ApsisView =
  | 'landing'
  | 'profil'
  | 'konfigurasi'
  | 'naskah'
  | 'ctt'
  | 'kktp'
  | 'kuis'
  | 'tka'

interface GenerationStatus {
  active: boolean
  label: string
  batch: number
  totalBatches: number
}

interface ApsisState {
  view: ApsisView
  sidebarOpen: boolean
  profile: ExamProfileData | null
  structures: StructureData[]
  questions: QuestionData[]
  questionsLoaded: boolean
  generating: GenerationStatus

  analysisConfig: AnalysisConfigData | null
  analysisStudents: AnalysisStudentData[]
  analysisLoaded: boolean
  cttTab: 'input' | 'hasil'

  tkaSimulation: TkaSimulationData | null
  tkaLoaded: boolean

  setView: (v: ApsisView) => void
  setSidebarOpen: (b: boolean) => void
  setProfile: (p: ExamProfileData | null) => void
  setStructures: (s: StructureData[]) => void
  setQuestions: (q: QuestionData[]) => void
  setQuestionsLoaded: (b: boolean) => void
  setGenerating: (g: GenerationStatus) => void

  setAnalysisConfig: (c: AnalysisConfigData | null) => void
  setAnalysisStudents: (s: AnalysisStudentData[]) => void
  setAnalysisLoaded: (b: boolean) => void
  setCttTab: (t: 'input' | 'hasil') => void

  setTkaSimulation: (t: TkaSimulationData | null) => void
  setTkaLoaded: (b: boolean) => void
}

export const useApsisStore = create<ApsisState>((set) => ({
  view: 'landing',
  sidebarOpen: false,
  profile: null,
  structures: [],
  questions: [],
  questionsLoaded: false,
  generating: { active: false, label: '', batch: 0, totalBatches: 0 },

  analysisConfig: null,
  analysisStudents: [],
  analysisLoaded: false,
  cttTab: 'input',

  tkaSimulation: null,
  tkaLoaded: false,

  setView: (v) => set({ view: v, sidebarOpen: false }),
  setSidebarOpen: (b) => set({ sidebarOpen: b }),
  setProfile: (p) => set({ profile: p }),
  setStructures: (s) => set({ structures: s }),
  setQuestions: (q) => set({ questions: q }),
  setQuestionsLoaded: (b) => set({ questionsLoaded: b }),
  setGenerating: (g) => set({ generating: g }),

  setAnalysisConfig: (c) => set({ analysisConfig: c }),
  setAnalysisStudents: (s) => set({ analysisStudents: s }),
  setAnalysisLoaded: (b) => set({ analysisLoaded: b }),
  setCttTab: (t) => set({ cttTab: t }),

  setTkaSimulation: (t) => set({ tkaSimulation: t }),
  setTkaLoaded: (b) => set({ tkaLoaded: b }),
}))
