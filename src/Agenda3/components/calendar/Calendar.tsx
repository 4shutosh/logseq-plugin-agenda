import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type EventReceiveArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { useTheme } from '@/Agenda3/components/ThemeProvider'
import { genDurationString } from '@/Agenda3/helpers/block'
import { transformAgendaTaskToCalendarEvent, transformGoogleEventToCalendarEvent } from '@/Agenda3/helpers/fullCalendar'
import { navToLogseqBlock } from '@/Agenda3/helpers/logseq'
import { track } from '@/Agenda3/helpers/umami'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import useGoogleCalendar from '@/Agenda3/hooks/useGoogleCalendar'
import { appAtom } from '@/Agenda3/models/app'
import { tasksWithStartOrDeadlineAtom } from '@/Agenda3/models/entities/tasks'
import { logseqAtom } from '@/Agenda3/models/logseq'
import { settingsAtom } from '@/Agenda3/models/settings'
// import useTheme from '@/hooks/useTheme'
import type { AgendaTaskWithStart } from '@/types/task'
import { cn } from '@/util/util'
import { createEvent, updateEvent, deleteEvent } from '@/services/googleCalendar'

import TaskModal from '../modals/TaskModal'
import { type CreateTaskForm } from '../modals/TaskModal/useCreate'
import { type CalendarView } from './CalendarAdvancedOperation'
import TheCalendarEvent from './TheCalendarEvent'
import WeekNumber from './WeekNumber'
import s from './calendar.module.less'

const FULL_CALENDAR_24HOUR_FORMAT = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
} as const
type CalendarProps = { onCalendarTitleChange: (title: string) => void }
const Calendar = ({ onCalendarTitleChange }: CalendarProps, ref) => {
  // Add error state to prevent total crashes
  const [hasError, setHasError] = useState(false);
  
  // Error handler
  const handleError = (error: any) => {
    console.error("[Calendar] Error in calendar component:", error);
    setHasError(true);
  };

  useEffect(() => {
    // Add global error handler
    const errorHandler = (event: ErrorEvent) => {
      console.error('[Calendar] Caught global error:', event.error);
      // Only handle errors from this component
      if (event.error?.toString().includes('FullCalendar') || 
          event.error?.toString().includes('Calendar')) {
        setHasError(true);
        // Prevent the error from crashing the entire app
        event.preventDefault();
      }
    };
    
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  // If we have an error, show a fallback UI
  if (hasError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-center p-4">
        <h3 className="text-xl font-semibold mb-2">Calendar Error</h3>
        <p className="mb-4">The calendar encountered an error and couldn't be displayed.</p>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => {
            setHasError(false);
            window.location.reload();
          }}
        >
          Reload Calendar
        </button>
      </div>
    );
  }

  // const [currentView, setCurrentView] = useState<CalendarView>('dayGridMonth')
  const calendarRef = useRef<FullCalendar>(null)
  const { currentTheme: theme } = useTheme()
  const app = useAtomValue(appAtom)
  const { updateEntity } = useAgendaEntities()
  const tasksWithStartOrDeadline = useAtomValue(tasksWithStartOrDeadlineAtom)
  const settings = useAtomValue(settingsAtom)
  const { currentGraph } = useAtomValue(logseqAtom)
  const { googleEvents, syncGoogleEvents, isLoading: isSyncingGoogleEvents } = useGoogleCalendar()
  const startingDay = settings.general?.startOfWeek
  const groupType = settings.selectedFilters?.length ? 'filter' : 'page'
  const showTasks = tasksWithStartOrDeadline?.filter((task) =>
    settings.viewOptions?.hideCompleted ? task.status === 'todo' : true,
  )
  
  // Check if Google Calendar is enabled
  const googleCalendarEnabled = settings.googleCalendar?.enabled === true
  
  // Convert tasks to calendar events
  const logseqEvents = showTasks
    ?.map((task) =>
      transformAgendaTaskToCalendarEvent(task, {
        showFirstEventInCycleOnly: settings.viewOptions?.showFirstEventInCycleOnly,
        showTimeLog: settings.viewOptions?.showTimeLog,
        groupType,
      }),
    )
    .flat()
    
  // Convert Google Calendar events to FullCalendar events
  const googleCalendarEvents = googleCalendarEnabled 
    ? googleEvents.map(event => {
        try {
          // Make sure we have a valid event with start and end date
          if (!event || !event.start || !event.end) {
            console.error('[GoogleCalendar Debug] Invalid event:', event)
            return null
          }
          return transformGoogleEventToCalendarEvent(event)
        } catch (err) {
          console.error('[GoogleCalendar Debug] Error transforming event:', err, event)
          return null
        }
      }).filter(Boolean) // Remove any null entries
    : []
  
  // Debug Google Calendar events
  useEffect(() => {
    console.log('[GoogleCalendar Debug] googleEvents from hook:', googleEvents.length)
    console.log('[GoogleCalendar Debug] googleCalendarEvents after transform:', googleCalendarEvents.length)
    
    if (googleCalendarEvents.length > 0) {
      console.log('[GoogleCalendar Debug] First transformed event:', googleCalendarEvents[0])
    } else if (googleEvents.length > 0) {
      console.log('[GoogleCalendar Debug] First google event from hook (not transformed):', googleEvents[0])
    }
    
    if (googleCalendarEnabled) {
      console.log('[GoogleCalendar Debug] Google Calendar is enabled')
    } else {
      console.log('[GoogleCalendar Debug] Google Calendar is disabled')
    }
  }, [googleEvents, googleCalendarEvents, googleCalendarEnabled])
  
  // Combine Logseq events with Google Calendar events
  const allEvents = [...(logseqEvents || []), ...googleCalendarEvents];
  
  // Validate calendar events to ensure they have required properties
  const calendarEvents = allEvents.filter(event => {
    if (!event) return false;
    if (!event.start || !event.end) {
      console.error('[Calendar] Filtering out event without start/end:', event);
      return false;
    }
    return true;
  });
  
  // Debug combined events
  useEffect(() => {
    console.log('[GoogleCalendar Debug] Total events:', allEvents.length);
    console.log('[GoogleCalendar Debug] Valid calendar events:', calendarEvents.length);
    console.log('[GoogleCalendar Debug] Logseq events:', logseqEvents?.length || 0);
    console.log('[GoogleCalendar Debug] Google Calendar events:', googleCalendarEvents.length);
    
    if (googleCalendarEvents.length > 0) {
      console.log('[GoogleCalendar Debug] First Google event:', googleCalendarEvents[0]);
    }
    
    if (calendarEvents.length > 0) {
      console.log('[GoogleCalendar Debug] First calendar event:', calendarEvents[0]);
    }
  }, [calendarEvents, logseqEvents, googleCalendarEvents, allEvents]);

  const [editTaskModal, setEditTaskModal] = useState<{
    open: boolean
    task?: AgendaTaskWithStart
    googleEvent?: any
  }>({
    open: false,
  })
  const [createTaskModal, setCreateTaskModal] = useState<
    | { open: false }
    | {
        open: true
        initialData: Partial<CreateTaskForm>
      }
  >({
    open: false,
  })
  
  // Sync Google Calendar events when calendar dates change
  const handleDatesSet = () => {
    if (googleCalendarEnabled && calendarRef.current) {
      const calendarApi = calendarRef.current.getApi()
      const startDate = calendarApi.view.currentStart
      const endDate = calendarApi.view.currentEnd
      
      // Convert to UTC dates to match Google Calendar API
      syncGoogleEvents()
    }
  }

  const onEventClick = (info: EventClickArg) => {
    const { extendedProps } = info.event
    
    // Check if it's a Google Calendar event
    if (extendedProps.googleEvent) {
      // Handle Google Calendar event click
      if (info.jsEvent.ctrlKey || info.jsEvent.metaKey) {
        // Open in Google Calendar
        window.open(`https://calendar.google.com/calendar/event?eid=${extendedProps.id}`, '_blank')
      } else {
        // Open edit modal for Google Calendar event
        setEditTaskModal({
          open: true,
          googleEvent: extendedProps
        })
      }
    } else {
      // Handle Logseq event click
      setEditTaskModal({
        open: true,
        task: extendedProps as AgendaTaskWithStart,
      })
    }
  }
  
  const onEventCtrlClick = (info: EventClickArg) => {
    const { extendedProps } = info.event
    
    // Check if it's a Google Calendar event
    if (extendedProps.googleEvent) {
      // Open in Google Calendar
      window.open(`https://calendar.google.com/calendar/event?eid=${extendedProps.id}`, '_blank')
    } else {
      // Navigate to Logseq block
      navToLogseqBlock(extendedProps as AgendaTaskWithStart, currentGraph)
    }
  }
  
  const onEventScheduleUpdate = (info: EventResizeDoneArg | EventReceiveArg | EventDropArg) => {
    const { start, end, id, allDay, extendedProps } = info.event
    
    // Check if it's a Google Calendar event
    if (extendedProps.googleEvent) {
      // Update Google Calendar event
      updateEvent(
        extendedProps.id,
        extendedProps.title,
        new Date(start!.toString()),
        new Date(end?.toString() || start!.toString()),
        allDay
      ).catch(() => {
        // Revert the change if update fails
        info.revert()
      })
      return
    }
    
    // Handle Logseq event updates
    const startDay = dayjs(start)
    const endDay = dayjs(end).subtract(1, 'day')
    const isMultipleDay = end && allDay ? !dayjs(end).isSame(endDay, 'day') : false
    const dateInfo = {
      start: startDay,
      estimatedTime: allDay ? extendedProps.estimatedTime : dayjs(end).diff(start, 'minute'),
      end: isMultipleDay ? endDay : undefined,
      allDay,
    }
    try {
      updateEntity({ type: 'task-date', id, data: dateInfo })
    } catch (error) {
      logseq.UI.showMsg('resize failed')
      info.revert()
      console.error('[Agenda3] calendar resize failed', error)
    }
  }
  
  const onSelect = (info: DateSelectArg) => {
    if (info.allDay) {
      const endDay = dayjs(info.end).subtract(1, 'day')
      const startDay = dayjs(info.start)
      const isMultipleDay = info.end ? !endDay.isSame(startDay, 'day') : false
      return setCreateTaskModal({
        open: true,
        initialData: {
          startDateVal: startDay,
          endDateVal: isMultipleDay ? endDay : undefined,
        },
      })
    }
    setCreateTaskModal({
      open: true,
      initialData: {
        startDateVal: dayjs(info.start),
        startTime: dayjs(info.start).format('HH:mm'),
        estimatedTime: genDurationString(dayjs(info.end).diff(info.start, 'minute')),
      },
    })
  }

  // Handle Google Calendar event creation
  const handleCreateGoogleEvent = (title: string, start: Date, end: Date, isAllDay: boolean) => {
    if (googleCalendarEnabled) {
      createEvent(title, start, end, isAllDay)
        .then(() => {
          // Refresh Google Calendar events
          syncGoogleEvents()
        })
        .catch(error => {
          console.error('Failed to create Google Calendar event:', error)
        })
    }
  }
  
  // Handle Google Calendar event deletion
  const handleDeleteGoogleEvent = (eventId: string) => {
    if (googleCalendarEnabled) {
      deleteEvent(eventId)
        .then(() => {
          // Refresh Google Calendar events
          syncGoogleEvents()
        })
        .catch(error => {
          console.error('Failed to delete Google Calendar event:', error)
        })
    }
  }

  useImperativeHandle(ref, () => {
    const calendarApi = calendarRef.current?.getApi()
    return {
      next: () => {
        calendarApi?.next()
        handleDatesSet()
      },
      prev: () => {
        calendarApi?.prev()
        handleDatesSet()
      },
      changeView: (view: CalendarView) => {
        calendarApi?.changeView(view)
        handleDatesSet()
      },
      getView: () => {
        return calendarApi?.view.type
      },
      getDate: () => {
        return calendarApi?.getDate()
      },
      navToday: () => {
        calendarApi?.today()
        handleDatesSet()
      },
      syncGoogleCalendar: () => {
        syncGoogleEvents()
      }
    }
  })

  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current?.getApi()
      setTimeout(() => {
        calendarApi.updateSize()
      }, 300) // The duration here needs to be longer than the sidebar animation duration.
    }
  }, [app.rightSidebarFolded])

  return (
    <div
      className={cn('flex h-full flex-col', s.fullCalendar)}
      style={{
        // @ts-expect-error define fullcalendar css variables
        '--fc-today-bg-color': 'transparent',
        '--fc-border-color': theme === 'dark' ? '#444' : '#e5e5e5',
        '--fc-highlight-color': theme === 'dark' ? 'rgba(188,232,241,.1)' : 'rgba(188,232,241,.3)',
        '--fc-page-bg-color': theme === 'dark' ? '#444' : '#fff',
      }}
    >
      {/* Wrap calendar in try-catch to prevent total crashes */}
      {(() => {
        try {
          return (
            <FullCalendar
              droppable
              editable
              selectable
              dayMaxEventRows // allow "more" link when too many events
              weekNumbers
              weekNumberContent={({ num, date }) => <WeekNumber weekNumber={num} date={date} />}
              defaultTimedEventDuration="00:30"
              firstDay={Number(startingDay)}
              fixedWeekCount={false}
              ref={calendarRef}
              height="100%"
              // locales={[esLocale]}
              // locale={enLocale}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, rrulePlugin]}
              headerToolbar={false}
              initialView="dayGridMonth"
              events={calendarEvents}
              eventClick={onEventClick}
              eventResize={onEventScheduleUpdate}
              eventDrop={onEventScheduleUpdate}
              eventReceive={onEventScheduleUpdate}
              datesSet={handleDatesSet}
              eventDidMount={(info) => {
                // Added these lines
                if (info.event.extendedProps?.googleEvent) {
                  info.el.classList.add('google-calendar-event')
                }
              }}
              select={onSelect}
              viewDidMount={(arg) => {
                onCalendarTitleChange(arg.view.title)
              }}
              eventClassNames={(info) => {
                const task = info.event.extendedProps
                let classNames: string[] = []
                
                // Add class for Google Calendar events
                if (task?.googleEvent) {
                  classNames.push('google-calendar-event')
                }
                
                return classNames
              }}
              eventContent={(info) => {
                // We'll let TheCalendarEvent component handle all event rendering
                try {
                  return <TheCalendarEvent info={info} />
                } catch (error) {
                  console.error("Error rendering event:", error, info);
                  return <div className="p-1 text-xs">{info.event.title || 'Event error'}</div>
                }
              }}
              eventTimeFormat={FULL_CALENDAR_24HOUR_FORMAT}
            />
          )
        } catch (error) {
          handleError(error);
          return (
            <div className="flex h-full w-full flex-col items-center justify-center text-center p-4">
              <h3 className="text-xl font-semibold mb-2">Calendar Error</h3>
              <p className="mb-4">There was a problem rendering the calendar.</p>
              <button 
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={() => {
                  setHasError(false);
                  window.location.reload();
                }}
              >
                Reload Calendar
              </button>
            </div>
          );
        }
      })()}
      <TaskModal.Edit
        open={editTaskModal.open}
        task={editTaskModal.task}
        googleEvent={editTaskModal.googleEvent}
        onClose={() => setEditTaskModal({ open: false })}
        onGoogleEventUpdate={(title, start, end, isAllDay) => {
          const googleEvent = editTaskModal.googleEvent
          if (googleEvent) {
            updateEvent(googleEvent.id, title, start, end, isAllDay)
              .then(() => {
                syncGoogleEvents()
                setEditTaskModal({ open: false })
              })
          }
        }}
        onGoogleEventDelete={(eventId) => {
          handleDeleteGoogleEvent(eventId)
          setEditTaskModal({ open: false })
        }}
      />
      <TaskModal.Create
        open={createTaskModal.open}
        initialData={createTaskModal.open ? createTaskModal.initialData : undefined}
        onClose={() => setCreateTaskModal({ open: false })}
        googleCalendarEnabled={googleCalendarEnabled}
        onCreateGoogleEvent={handleCreateGoogleEvent}
      />
    </div>
  )
}

export default forwardRef(Calendar)

export type CalendarHandle = {
  prev: () => void
  next: () => void
  getView: () => CalendarView
  getDate: () => Date
  changeView: (view: CalendarView) => void
  navToday: () => void
  syncGoogleCalendar: () => void
}
