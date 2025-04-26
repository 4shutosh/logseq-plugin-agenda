import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import interactionPlugin, { type EventReceiveArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { Button, message, Modal } from 'antd'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MdSchedule } from 'react-icons/md'

// import useTheme from '@/hooks/useTheme'
import { useTheme } from '@/Agenda3/components/ThemeProvider'
import { genDurationString } from '@/Agenda3/helpers/block'
import { transformAgendaTaskToCalendarEvent, transformGoogleEventToCalendarEvent } from '@/Agenda3/helpers/fullCalendar'
import { track } from '@/Agenda3/helpers/umami'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import useGoogleCalendar from '@/Agenda3/hooks/useGoogleCalendar'
import { recentTasksAtom, googleCalendarTasks } from '@/Agenda3/models/entities/tasks'
import { settingsAtom } from '@/Agenda3/models/settings'
import { DEFAULT_ESTIMATED_TIME } from '@/constants/agenda'
import type { CalendarEvent } from '@/types/fullcalendar'
import { cn } from '@/util/util'
import { updateGoogleEvent, deleteEvent, createEvent } from '@/services/googleCalendar'
import type { EventApi, EventDropArg } from '@fullcalendar/core'
import type { AgendaTaskWithStart, AgendaTaskWithStartOrDeadline } from '@/types/task'

import TaskModal from '../modals/TaskModal'
import { type CreateTaskForm } from '../modals/TaskModal/useCreate'
import TheCalendarEvent from './TheCalendarEvent'
import s from './timebox.module.less'

type FullCalendarEventInfo = {
  event: EventApi
  oldEvent: CalendarEvent
  relatedEvents: unknown[]
  revert: () => void
  newResource: unknown
  oldResource: unknown
  delta: unknown
  view: unknown
  el: HTMLElement
  jsEvent: MouseEvent
}
const FULL_CALENDAR_24HOUR_FORMAT = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
} as const
const TimeBox = ({ onChangeType }: { onChangeType?: () => void }) => {
  const { t } = useTranslation()
  const { currentTheme: theme } = useTheme()
  const settings = useAtom(settingsAtom)[0]
  const groupType = settings.selectedFilters?.length ? 'filter' : 'page'
  const calendarRef = useRef<FullCalendar>(null)
  const { updateEntity, addNewEntity } = useAgendaEntities()
  const [recentTasks] = useAtom(recentTasksAtom)
  const [googleEvents, setGoogleEvents] = useAtom(googleCalendarTasks)
  const { syncGoogleEvents } = useGoogleCalendar()
  const now = dayjs()
  
  // Transform Logseq tasks to calendar events
  const logseqCalendarEvents = recentTasks
    // TODO: 补充 deadline 任务的处理后移除次过滤器
    .filter((task) => task.start)
    .map((task) =>
      transformAgendaTaskToCalendarEvent(task, {
        showFirstEventInCycleOnly: settings.viewOptions?.showFirstEventInCycleOnly,
        showTimeLog: settings.viewOptions?.showTimeLog,
        groupType,
      }),
    )
    .flat()
    
  // Transform Google Calendar events to calendar events
  const googleCalendarEvents = googleEvents
    .map((task) => transformGoogleEventToCalendarEvent(task))
    .flat()
  
  // Combine both types of events
  const calendarEvents = [...logseqCalendarEvents, ...googleCalendarEvents]
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const [createTaskModal, setCreateTaskModal] = useState<
    | { open: false }
    | {
        open: true
        initialData: Partial<CreateTaskForm>
      }
  >({
    open: false,
  })

  const [editTaskModal, setEditTaskModal] = useState<{
    open: boolean
    task?: AgendaTaskWithStartOrDeadline
    isGoogleEvent?: boolean
  }>({
    open: false,
  })

  // Check if Google Calendar is enabled in settings
  const googleCalendarEnabled = settings.googleCalendar?.enabled || false

  const onEventClick = (info: unknown) => {
    const _info = info as FullCalendarEventInfo
    const eventData = _info.event.extendedProps
    const isGoogleEvent = _info.event.id.startsWith('gcal_')
    
    setEditTaskModal({
      open: true,
      task: eventData,
      isGoogleEvent
    })
    
    track('Time Box: Click Event')
  }

  const onEventScheduleUpdate = (info: unknown) => {
    const calendarApi = calendarRef.current?.getApi()
    const _info = info as EventDropArg | EventResizeDoneArg
    const { start, end, id: blockUUID, extendedProps } = _info.event
    const task = extendedProps || {};
    const startDay = dayjs(start)
    const span = dayjs(end).diff(start, 'minute')
    
    // Check if this is a Google Calendar event
    const isGoogleEvent = blockUUID.startsWith('gcal_') || task?.googleCalendarId;
    
    if (isGoogleEvent) {
      // Handle Google Calendar event update
      try {
        // Determine the Google Calendar event ID
        let googleEventId;
        
        if (task.googleCalendarId) {
          // Use the googleCalendarId property from the task
          googleEventId = task.googleCalendarId;
        } else if (blockUUID.startsWith('gcal_')) {
          // Extract from blockUUID for backward compatibility
          googleEventId = blockUUID.replace('gcal_', '');
        } else {
          console.error('[GoogleCalendar] Cannot determine Google Calendar event ID');
          _info.revert();
          return;
        }
        
        const isAllDay = task?.allDay || false;
        
        // Extract the colorId from the original event to preserve the color
        let colorId;
        // The original Google Calendar event's colorId should be stored on the task object itself (extendedProps)
        // during the conversion process. Access it directly.
        colorId = task?.colorId;
        
        console.log('[GoogleCalendar] Using colorId for update:', colorId);
        
        // Update event in Google Calendar
        updateGoogleEvent(googleEventId, task.title || 'Untitled Event',
           start ?? new Date(), end ?? new Date(Date.now() + 30 * 60000), isAllDay, colorId)
          .then(() => {
            console.log('[GoogleCalendar] Event updated successfully in Google Calendar API. Updating local state.');

            // Update the local Jotai state
            setGoogleEvents(prevEvents =>
              prevEvents.map(event => {
                // Identify the correct event
                let eventIdToCheck = googleEventId;
                if (blockUUID.startsWith('gcal_')) {
                  eventIdToCheck = blockUUID;
                }

                if (event.id === eventIdToCheck) {
                  return {
                    ...event,
                    start: dayjs(start), // Convert back to Dayjs
                    end: dayjs(end), // Convert back to Dayjs
                    allDay: isAllDay,
                  };
                }
                return event;
              })
            );

            // Also update the event directly in FullCalendar's state
            // Ensure start/end are Date objects for FullCalendar API
            const startDate = start instanceof Date ? start : dayjs(start).toDate();
            const endDate = end instanceof Date ? end : dayjs(end).toDate();
            _info.event.setStart(startDate);
            _info.event.setEnd(endDate);
            _info.event.setAllDay(isAllDay);
            console.log('[GoogleCalendar] Local state and FullCalendar event updated in TimeBox.');
          })
          .catch((error) => {
            console.error('[GoogleCalendar] Error updating event:', error);
            _info.revert();
          });
      } catch (error) {
        console.error('[GoogleCalendar] Error updating event:', error);
        _info.revert();
      }
      return;
    }
    
    // Handle Logseq task update
    const estimatedTime = task.estimatedTime || span !== DEFAULT_ESTIMATED_TIME ? span : undefined;
    try {
      updateEntity({
        type: 'task-date',
        id: blockUUID,
        data: {
          start: startDay,
          estimatedTime,
          allDay: false,
        },
      });
      const event = calendarApi?.getEventById(blockUUID);
      if (event) {
        event.setProp('extendedProps', {
          ...event.extendedProps,
          start: startDay,
          allDay: false,
          estimatedTime,
        });
      }
    } catch (error) {
      logseq.UI.showMsg('resize failed');
      _info.revert();
      console.error('[Agenda3] timebox resize failed', error);
    }
  };

  const onClickNav = (action: 'prev' | 'next' | 'today') => {
    const calendarApi = calendarRef.current?.getApi()
    if (action === 'today') {
      calendarApi?.today()
    } else if (action === 'prev') {
      calendarApi?.prev()
    } else if (action === 'next') {
      calendarApi?.next()
    }
    track('TimeBox: Click Nav Button', { action })
  }

  // Handle Google Calendar event deletion
  const handleGoogleEventDelete = async (eventId: string) => {
    try {
      // First check if the task has a googleCalendarId property
      const task = editTaskModal.task;
      let googleEventId;
      
      if (task && task.googleCalendarId) {
        // Use the googleCalendarId from the task
        googleEventId = task.googleCalendarId;
      } else if (eventId.startsWith('gcal_')) {
        // Fall back to extracting from event ID for backward compatibility
        googleEventId = eventId.replace('gcal_', '');
      } else {
        // Use the event ID directly
        googleEventId = eventId;
      }
      
      const success = await deleteEvent(googleEventId);
      if (success) {
        message.success('Event deleted from Google Calendar');
        // Close modal
        setEditTaskModal({ open: false });
        
        // Refresh Google Calendar events
        if (syncGoogleEvents) {
          syncGoogleEvents();
        }
      } else {
        message.error('Failed to delete event from Google Calendar');
      }
    } catch (error) {
      console.error('[GoogleCalendar] Error deleting event:', error);
      message.error('Error deleting event from Google Calendar');
    }
  }

  // Handle creating Google Calendar events
  const handleCreateGoogleEvent = async (title: string, start: Date, end: Date, isAllDay: boolean) => {
    try {
      const result = await createEvent(title, start, end, isAllDay);
      if (result) {
        message.success('Event created in Google Calendar');
        
        // Create a Logseq task with the Google Calendar ID
        await addNewEntity({
          type: 'task',
          data: {
            title,
            start: dayjs(start),
            end: dayjs(end),
            allDay: isAllDay,
            googleCalendarId: result.id // Store the Google Calendar ID
          }
        });
        
        // Refresh Google Calendar events
        syncGoogleEvents();
      } else {
        message.error('Failed to create event in Google Calendar');
      }
    } catch (error) {
      console.error('[GoogleCalendar] Error creating event:', error);
      message.error('Error creating event in Google Calendar');
    }
  }

  return (
    <div
      className={cn(
        'group/root flex h-full w-[290px] flex-col border-l bg-gray-50 pl-2 shadow-md dark:bg-zinc-900',
        s.fullCalendarTimeBox,
      )}
      style={{
        // @ts-expect-error define fullcalendar css variables
        '--fc-border-color': theme === 'dark' ? '#444' : '#ebebeb',
        '--fc-highlight-color': theme === 'dark' ? 'rgba(188,232,241,.1)' : 'rgba(188,232,241,.3)',
        '--fc-page-bg-color': theme === 'dark' ? '#444' : '#fff',
      }}
    >
      <div className="group flex h-[44px] items-center justify-between">
        <div className="flex cursor-default items-center gap-1.5 px-2 py-1">
          <MdSchedule className="text-lg" /> Time Box
        </div>
        <div className="mr-4 flex opacity-0 transition-opacity group-hover/root:opacity-100">
          <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => onClickNav('prev')} />
          <Button size="small" type="text" onClick={() => onClickNav('today')}>
            {t('Today')}
          </Button>
          <Button size="small" type="text" icon={<RightOutlined />} onClick={() => onClickNav('next')} />
        </div>
      </div>
      <FullCalendar
        droppable
        editable
        selectable
        ref={calendarRef}
        events={calendarEvents}
        headerToolbar={false}
        initialView="timeGridOneDay"
        defaultTimedEventDuration="00:30"
        plugins={[timeGridPlugin, interactionPlugin, rrulePlugin]}
        eventTimeFormat={FULL_CALENDAR_24HOUR_FORMAT}
        slotLabelFormat={FULL_CALENDAR_24HOUR_FORMAT}
        // drag external kanban element to calendar
        eventReceive={(info) => {
          onEventScheduleUpdate(info)
          track('Time Box: Receive Event')
        }}
        // resize duration
        eventResize={(info) => {
          onEventScheduleUpdate(info)
          track('Time Box: Resize Event')
        }}
        // drag move
        eventDrop={(info) => {
          onEventScheduleUpdate(info)
          track('Time Box: Move Event')
        }}
        // click
        eventClick={onEventClick}
        select={(info) => {
          setCreateTaskModal({
            open: true,
            initialData: {
              startDateVal: dayjs(info.start),
              startTime: dayjs(info.start).format('HH:mm'),
              estimatedTime: genDurationString(dayjs(info.end).diff(info.start, 'minute')),
            },
          })
          track('Time Box: Select Event')
        }}
        eventContent={(info) => <TheCalendarEvent info={info} />}
        views={{
          timeGridOneDay: {
            type: 'timeGrid',
            duration: { days: 1 },
            allDaySlot: false,
            nowIndicator: true,
            slotDuration: '00:15:00',
            slotLabelInterval: '01:00',
            scrollTime: now.subtract(1, 'hour').format('HH:mm:ss'),
            dayHeaderContent: (date) => {
              const day = dayjs(date.date)
              const isToday = day.isSame(now, 'day')
              return (
                <div className="flex gap-1 text-gray-500 dark:text-gray-300">
                  {day.format('ddd')}
                  <span
                    className={cn('h-6 w-6 rounded ', {
                      'bg-blue-400 text-white dark:bg-blue-600 dark:text-gray-100': isToday,
                    })}
                  >
                    {day.format('DD')}
                  </span>
                </div>
              )
            },
          },
        }}
      />
      {createTaskModal.open ? (
        googleCalendarEnabled ? (
          <TaskModal.Create
            open={createTaskModal.open}
            initialData={createTaskModal.initialData}
            onClose={() => setCreateTaskModal({ open: false })}
            googleCalendarEnabled={googleCalendarEnabled}
            onCreateGoogleEvent={handleCreateGoogleEvent}
          />
        ) : (
          <TaskModal
            open={createTaskModal.open}
            onOk={() => {
              setCreateTaskModal({ open: false })
            }}
            onCancel={() => setCreateTaskModal({ open: false })}
            info={{ type: 'create', initialData: createTaskModal.initialData }}
          />
        )
      ) : null}
      
      {editTaskModal.open && (
        editTaskModal.isGoogleEvent ? (
          <TaskModal.Edit
            open={editTaskModal.open}
            googleEvent={editTaskModal.task}
            onClose={() => setEditTaskModal({ open: false })}
            onGoogleEventDelete={handleGoogleEventDelete}
          />
        ) : (
          <TaskModal
            open={editTaskModal.open}
            info={{
              type: 'edit',
              initialTaskData: editTaskModal.task as AgendaTaskWithStart,
            }}
            onCancel={() => setEditTaskModal({ open: false })}
          />
        )
      )}
    </div>
  )
}

export default TimeBox
