import { atom } from 'jotai'

export type Language = 'en' | 'zh-CN'
export type Settings = {
  isInitialized: boolean
  general?: {
    useJournalDayAsSchedule?: boolean
    language?: Language
    startOfWeek?: number
  }
  ics?: {
    repo?: string
    token?: string
  }
  viewOptions?: {
    hideCompleted?: boolean
    showFirstEventInCycleOnly?: boolean
    showTimeLog?: boolean
  }
  googleCalendar?: {
    clientId?: string
    apiKey?: string
    clientSecret?: string
    enabled?: boolean
    syncEnabled?: boolean
    calendar?: {
      id: string
      bgColor: string
      textColor: string
      borderColor: string
      enabled: boolean
    }
  }
  filters?: Filter[]
  selectedFilters?: string[]
  experimental?: {
    objective?: boolean
  }
}
export const DEFAULT_SETTINGS = {
  isInitialized: false,
  general: { language: 'en', startOfWeek: 1 },
  viewOptions: { showTimeLog: false },
  googleCalendar: {
    clientId: '',
    apiKey: '',
    clientSecret: '',
    enabled: false,
    syncEnabled: true,
    calendar: {
      id: 'Google Calendar',
      bgColor: '#4285F4',
      textColor: '#fff',
      borderColor: '#4285F4',
      enabled: true
    }
  }
} satisfies Settings
export const settingsAtom = atom<Settings>(DEFAULT_SETTINGS)

export type Filter = {
  id: string
  name: string
  query: string
  color: string
}
