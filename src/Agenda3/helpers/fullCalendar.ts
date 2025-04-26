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
    const { estimatedTime = DEFAULT_ESTIMATED_TIME, timeLogs = [], status, actualTime, googleCalendarId } = task
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

    // Determine if the event is editable
    // - Non-editable if it's a recurring past task or has rrule or no start date
    // - Google Calendar events are editable if they have a Google Calendar ID
    const isEditable = !(task.recurringPast || task.rrule || !task.start) || !!googleCalendarId;

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
        editable: isEditable,
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

export const transformGoogleEventToCalendarEvent = (task: AgendaTaskWithStartOrDeadline & { 
  bgColor?: string; 
  borderColor?: string; 
  color?: string;
  isGCalEvent?: boolean;
  extendedProps?: any;
}): CalendarEvent => {
  const { id, title, showTitle, start, end, allDay, project, filters } = task;
  const bgColor = task.bgColor;
  const borderColor = task.borderColor;

  // Assuming start and end are Date objects or can be converted to Date
  return {
    id,
    title: showTitle || title || 'Untitled Event',
    allDay: allDay || false,
    start: start ? start.toDate() : new Date(), // Fallback to current date if start is missing
    end: end ? end.toDate() : (start ? start.add(30, 'minutes').toDate() : new Date()), // Default to 30 min duration
    extendedProps: task, // Pass the entire task as extendedProps for access in event handlers
    editable: true, // Make Google Calendar events editable
    color: bgColor || project?.properties?.['agenda-color'] || '#4285F4', // Use Google Calendar colors
    textColor: task.color || '#FFFFFF',
  };
}
