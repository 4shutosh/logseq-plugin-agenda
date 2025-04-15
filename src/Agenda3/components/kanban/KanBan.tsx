// In the KanBan component, update the focus mode rendering to maintain column width
import dayjs from 'dayjs'
import { useAtom, useAtomValue } from 'jotai'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { DATE_FORMATTER_FOR_KEY, separateTasksInDay, transformTasksToKanbanTasks } from '@/Agenda3/helpers/task'
import { appAtom } from '@/Agenda3/models/app'
import { recentTasksAtom } from '@/Agenda3/models/entities/tasks'
import { settingsAtom } from '@/Agenda3/models/settings'
import { getRecentDaysRange } from '@/constants/agenda'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { genDays, cn } from '@/util/util'

import Column, { type ColumnHandle } from './Column'

const getRecentDays = () => {
  const [startDay, endDay] = getRecentDaysRange()
  return genDays(startDay, endDay)
}

export type KanBanHandle = {
  scrollToToday: () => void
}

const KanBan = (props, ref) => {
  const kanBanContainerRef = useRef<HTMLDivElement>(null)
  const columnRefs = useRef<Record<string, ColumnHandle | null>>({})

  const settings = useAtomValue(settingsAtom)
  const [app] = useAtom(appAtom)

  const recentTasks = useAtomValue(recentTasksAtom)
  const tasks = transformTasksToKanbanTasks(recentTasks, {
    showFirstEventInCycleOnly: settings.viewOptions?.showFirstEventInCycleOnly,
  })
  const tasksInDay = separateTasksInDay(tasks)
  const days = getRecentDays()

  const today = dayjs()
  const todayDateStr = today.format('MM-DD ddd')
  const todayKey = today.format(DATE_FORMATTER_FOR_KEY)
  const todayTasks = tasksInDay.get(todayKey) || []

  const scrollToToday = () => {
    columnRefs.current[todayDateStr]?.scrollIntoView()
    kanBanContainerRef.current?.scrollBy({ left: -30, behavior: 'smooth' })
  }

  // scroll to today
  useEffect(() => {
    if (!app.focusMode) {
      scrollToToday()
    }
  }, [app.focusMode])

  useImperativeHandle(ref, () => ({
    scrollToToday,
  }))

  // Render focus mode view with only today's column but maintain consistent width
  if (app.focusMode) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <div className="flex h-full overflow-visible">
          {/* Add empty placeholder columns for visual spacing */}
          <div className="invisible h-full min-w-72"></div>
          <div className="invisible h-full min-w-72"></div>
          {/* Today's column with same width as normal columns */}
          <Column
            key={todayDateStr}
            ref={(el) => (columnRefs.current[todayDateStr] = el)}
            day={today}
            tasks={todayTasks}
            allKanbanItems={tasks}
            rootClassName="min-w-72"
          />
          {/* Add empty placeholder columns for visual spacing */}
          <div className="invisible h-full min-w-72"></div>
          <div className="invisible h-full min-w-72"></div>
        </div>
      </div>
    )
  }

  // Regular Kanban view with all columns
  return (
    <div className="flex h-full flex-1 gap-8 overflow-auto" ref={kanBanContainerRef}>
      {/* ========= Single Day List ========= */}
      {days.map((day) => {
        const dateStr = day.format('MM-DD ddd')
        const columnTasks = tasksInDay.get(day.format(DATE_FORMATTER_FOR_KEY)) || []
        return (
          <Column
            key={dateStr}
            ref={(el) => (columnRefs.current[dateStr] = el)}
            day={day}
            tasks={columnTasks}
            allKanbanItems={tasks}
          />
        )
      })}
    </div>
  )
}

export type KanBanItem = AgendaTaskWithStartOrDeadline & {
  filtered?: boolean
}

export default forwardRef<KanBanHandle>(KanBan)

// No changes needed to the Column component - it already has min-w-72 class
// which ensures all columns have the same width
