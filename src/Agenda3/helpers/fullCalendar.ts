import { DEFAULT_ESTIMATED_TIME } from '@/constants/agenda'
import type { CalendarEvent } from '@/types/fullcalendar'
import type { AgendaTaskWithDeadline, AgendaTaskWithStart, AgendaTaskWithStartOrDeadline } from '@/types/task'
import { padZero } from '@/util/util'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export const transformAgendaTaskToCalendarEvent = (
  task: AgendaTaskWithStartOrDeadline,
  options: { showFirstEventInCycleOnly?: boolean; showTimeLog?: boolean; groupType: 'filter' | 'page' } = {
    groupType: 'page',
  },
): CalendarEvent[] => {
  if (!task) {
    console.error('[Calendar Debug] Invalid task:', task);
    return [];
  }

  try {
    const { showFirstEventInCycleOnly = false, showTimeLog = false, groupType } = options
    const { estimatedTime = DEFAULT_ESTIMATED_TIME, timeLogs = [], status, actualTime } = task
    const rrule: CalendarEvent['rrule'] =
      showFirstEventInCycleOnly && task.rrule
        ? {
            ...task.rrule,
            count: 1,
          }
        : task.rrule

    if (showTimeLog && status === 'done' && timeLogs.length) {
      return timeLogs.map((log, index) => ({
        id: task.id + '_' + index,
        title: task.title,
        allDay: false,
        start: log.start.toDate(),
        end: log.end.toDate(),
        extendedProps: task,
        editable: false,
        color: groupType === 'page' ? task.project?.bgColor : task.filters?.[0]?.color,
      }))
    }

    let spanTime: number
    let start: Date
    let end: Date
    let allDay: boolean
    if (task.start) {
      const _task = task as AgendaTaskWithStart
      allDay = _task.allDay
      spanTime = status === 'done' && actualTime && showTimeLog ? actualTime : estimatedTime
      start = _task.start.toDate()
      end = _task.end ? _task.end.add(1, 'day').toDate() : _task.start.add(spanTime, 'minute').toDate()
    } else {
      const _task = task as AgendaTaskWithDeadline
      allDay = _task.deadline?.allDay || false
      spanTime = DEFAULT_ESTIMATED_TIME
      start = _task.deadline?.value?.toDate() || new Date()
      end = _task.deadline?.allDay
        ? _task.deadline.value.add(1, 'day').toDate()
        : _task.deadline?.value.add(spanTime, 'minute').toDate() || new Date(Date.now() + spanTime * 60000)
    }

    return [
      {
        id: task.id,
        title: task.title || 'Untitled Task',
        allDay,
        start,
        end,
        extendedProps: task,
        rrule,
        duration: allDay ? undefined : { minute: spanTime },
        editable: !(task.recurringPast || task.rrule || !task.start),
        color: groupType === 'page' ? task.project?.bgColor : task.filters?.[0]?.color,
      },
    ]
  } catch (error) {
    console.error('[Calendar Debug] Error transforming agenda task:', error, task);
    return [];
  }
}

export const transformAgendaTimeLogsToCalendarEvents = (task: AgendaTaskWithStart): CalendarEvent[] => {
  const { title, id, timeLogs = [] } = task
  return timeLogs.map((log, index) => {
    return {
      id: `${id}_${index}`,
      allDay: false,
      title,
      start: log.start.toDate(),
      end: log.end.toDate(),
      extendedProps: task,
    }
  })
}

export const minutesToHHmm = (minutes?: number): string => {
  if (!minutes) return '00:00'
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${padZero(hour)}:${padZero(minute)}`
}

export const secondsToHHmmss = (seconds: number): string => {
  const hour = Math.floor(seconds / 3600)
  const minute = Math.floor((seconds % 3600) / 60)
  const second = Math.floor(seconds % 60)
  return `${padZero(hour)}:${padZero(minute)}:${padZero(second)}`
}

export const transformGoogleEventToCalendarEvent = (googleEvent: any): any => {
  if (!googleEvent) {
    console.error('[GoogleCalendar Debug] Invalid Google event (null)')
    return null
  }

  if (!googleEvent.start || !googleEvent.end) {
    console.error('[GoogleCalendar Debug] Event missing start or end:', googleEvent)
    const now = new Date()
    const hour = 60 * 60 * 1000
    return {
      id: googleEvent.id || `google_${Date.now()}`,
      title: googleEvent.summary?.trim() || 'Untitled Event',
      start: now,
      end: new Date(now.getTime() + hour),
      allDay: false,
      className: 'google-calendar-event error-event',
      editable: true,
      color: '#FF0000',
      extendedProps: {
        googleEvent: true,
        error: true,
        title: googleEvent.summary?.trim() || 'Untitled Event',
        id: googleEvent.id || `google_${Date.now()}`,
      },
    }
  }

  try {
    const eventTitle = googleEvent.summary?.trim() || 'Untitled Event'

    const isAllDay = !!googleEvent.start.date
    let startDateTime: Date, endDateTime: Date

    if (isAllDay) {
      try {
        startDateTime = new Date(googleEvent.start.date)
        const endDate = new Date(googleEvent.end.date)
        endDate.setDate(endDate.getDate() - 1)
        endDateTime = endDate
      } catch (e) {
        console.error('[GoogleCalendar Debug] Error parsing all-day dates:', e)
        startDateTime = new Date()
        endDateTime = new Date()
        endDateTime.setDate(startDateTime.getDate() + 1)
      }
    } else {
      const parseDateTime = (dateTimeStr: string): Date => {
        try {
          return dayjs.tz(dateTimeStr, googleEvent.start.timeZone || 'UTC').toDate()
        } catch (e) {
          console.error('[GoogleCalendar Debug] Date parse error:', e)
          return new Date()
        }
      }

      startDateTime = parseDateTime(googleEvent.start.dateTime)
      endDateTime = parseDateTime(googleEvent.end.dateTime)
    }

    return {
      id: googleEvent.id || `google_${Date.now()}`,
      title: eventTitle,
      start: startDateTime,
      end: endDateTime,
      allDay: isAllDay,
      className: 'google-calendar-event',
      editable: true,
      rrule: null,
      color: googleEvent.colorId ? `var(--google-calendar-color-${googleEvent.colorId})` : '#4285F4',
      textColor: '#FFFFFF',
      borderColor: googleEvent.colorId ? `var(--google-calendar-color-${googleEvent.colorId})` : '#4285F4',
      extendedProps: {
        id: googleEvent.id || `google_${Date.now()}`,
        googleEvent: true,
        title: eventTitle,
        description: googleEvent.description || '',
        location: googleEvent.location || '',
        originalStart: startDateTime,
        originalEnd: endDateTime,
        status: 'todo',
        showTitle: true,
        project: {
          bgColor: googleEvent.colorId ? `var(--google-calendar-color-${googleEvent.colorId})` : '#4285F4',
          title: 'Google Calendar',
        },
        rrule: null,
        recurringPast: false,
      },
    }
  } catch (error) {
    console.error('[GoogleCalendar Debug] Error transforming Google event:', error)
    return {
      id: googleEvent.id || `google_${Date.now()}`,
      title: googleEvent.summary?.trim() || 'Error: Could not parse event',
      start: new Date(),
      end: new Date(Date.now() + 3600000),
      allDay: false,
      className: 'google-calendar-event error-event',
      editable: true,
      color: '#FF0000',
      extendedProps: {
        googleEvent: true,
        error: true,
        title: googleEvent.summary?.trim() || 'Error: Could not parse event',
      },
    }
  }
}
