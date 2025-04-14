import type { EventContentArg } from '@fullcalendar/core'
import dayjs from 'dayjs'
import type { CSSProperties } from 'react'
import { CgSandClock } from 'react-icons/cg'
import { IoIosCheckmarkCircle } from 'react-icons/io'
import { useEffect } from 'react'

import { getDaysBetween } from '@/Agenda3/helpers/util'
import { cn } from '@/util/util'

const TheCalendarEvent = ({ info }: { info: EventContentArg }) => {
  const { event } = info;
  
  // Debug events
  useEffect(() => {
    if (event?.extendedProps?.googleEvent) {
      console.log('[Calendar] Rendering Google event:', {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay
      });
    }
  }, [event]);
  
  // Handle Google Calendar event
  if (event?.extendedProps?.googleEvent) {
    // Make sure Google events stand out
    return (
      <div className="google-event p-1 h-full" style={{ 
        backgroundColor: event.backgroundColor || '#4285F4',
        color: '#FFFFFF'
      }}>
        <div className="text-sm font-medium">{event.title}</div>
        {!event.allDay && event.start && event.end && (
          <div className="text-xs">
            {dayjs(event.start).format('HH:mm')} - {dayjs(event.end).format('HH:mm')}
          </div>
        )}
      </div>
    );
  }

  // Process Logseq task
  const taskData = event.extendedProps
  
  // Check for undefined taskData to prevent errors
  if (!taskData) {
    return <div className="p-1">{event.title || 'Unknown event'}</div>;
  }
  
  const showTitle = taskData?.id ? taskData.showTitle : event.title
  const isShowTimeText = event.allDay === false && event.end && dayjs(event.end).diff(event.start, 'minute') > 50
  const isSmallHeight = event.allDay === false && event.end && dayjs(event.end).diff(event.start, 'minute') <= 20
  const isDone = taskData?.status === 'done'
  // 是否有截止时间
  const isHasDeadline = taskData?.deadline
  // 距离截止时间还剩多少天, 正数正常显示，负数显示为0
  const daysToDeadline = isHasDeadline ? getDaysBetween(dayjs(), dayjs(taskData?.deadline?.value)) : 0
  // 是否显示距离截止时间剩余天数
  const isShowDeadline = isHasDeadline && !isDone
  let element: React.ReactNode | null = null
  
  try {
    switch (info.view.type) {
      case 'dayGridMonth':
      case 'dayGridWeek':
        element = (
          <div
            className={cn('relative flex w-full cursor-pointer items-center gap-1 px-0.5', {
              'line-through opacity-60': isDone,
              'font-semibold': !isDone,
            })}
            title={showTitle}
          >
            {event.allDay ? null : (
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: event.backgroundColor }} />
            )}
            <span className="flex-1 truncate">{showTitle}</span>
            {isDone ? (
              <IoIosCheckmarkCircle
                className={cn('absolute right-0', event.allDay ? 'text-white' : 'text-green-500')}
              />
            ) : null}
            {isShowDeadline ? (
              <DeadlineNumber
                daysToDeadline={daysToDeadline}
                className={cn({ 'text-zinc-100': !event.allDay })}
                style={event.allDay ? {} : { backgroundColor: event.backgroundColor }}
              />
            ) : null}
          </div>
        )
        break
      case 'timeGridWeek':
        element = (
          <div className={cn('relative h-full cursor-pointer', { 'opacity-70': isDone, 'pr-6': isShowDeadline })}>
            <div
              className={cn('truncate', {
                'line-through': isDone,
                'font-semibold': !isDone,
                'text-[10px]': isSmallHeight,
              })}
            >
              {showTitle}
            </div>
            {isShowTimeText ? <div className="text-xs text-gray-200">{info.timeText}</div> : null}
            {isDone ? <IoIosCheckmarkCircle className="absolute right-0 top-0.5" /> : null}
            {isShowDeadline ? (
              <DeadlineNumber daysToDeadline={daysToDeadline} className="absolute right-0 top-0.5" />
            ) : null}
          </div>
        )
        break
      default:
        element = <div className="p-1">{showTitle || event.title}</div>
    }
  } catch (error) {
    console.error("[Calendar] Error rendering event:", error, taskData);
    element = <div className="p-1">{event.title || 'Error rendering event'}</div>;
  }
  
  return element
}

function DeadlineNumber({
  daysToDeadline,
  className,
  style,
}: {
  daysToDeadline: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={cn('flex items-center rounded bg-white/30 px-0.5 text-xs font-normal', className)} style={style}>
      <CgSandClock className="text-xs" />
      <span className="italic">{daysToDeadline}</span>
    </div>
  )
}

export default TheCalendarEvent
