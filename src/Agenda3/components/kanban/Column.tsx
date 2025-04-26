import { ThirdPartyDraggable } from '@fullcalendar/interaction'
import { Progress } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useAtomValue } from 'jotai'
import React, { useState, useEffect, useImperativeHandle, useRef } from 'react'
import { ReactSortable } from 'react-sortablejs'

import { track } from '@/Agenda3/helpers/umami'
import useAgendaEntities from '@/Agenda3/hooks/useAgendaEntities'
import { appAtom } from '@/Agenda3/models/app'
import { DEFAULT_ESTIMATED_TIME } from '@/constants/agenda'
import type { AgendaTaskWithStartOrDeadline } from '@/types/task'
import { cn, replaceDateInfo } from '@/util/util'

import AddTaskCard from './AddTaskCard'
import ColumnTitle from './ColumnTitle'
import type { KanBanItem } from './KanBan'
import TaskCard from './taskCard/TaskCard'

export type ColumnProps = { day: Dayjs; tasks: AgendaTaskWithStartOrDeadline[]; allKanbanItems: KanBanItem[] }
const Column = ({ day, tasks, allKanbanItems }: ColumnProps, ref) => {
  const columnContainerRef = useRef<HTMLDivElement>(null)
  // bind draggable
  const hadBindDropRef = useRef(false)

  // Local state for tasks within this column, managed by ReactSortable
  const [localTasks, setLocalTasks] = useState<AgendaTaskWithStartOrDeadline[]>(tasks);

  // Sync local state when the tasks prop changes from parent
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const app = useAtomValue(appAtom)

  const today = dayjs()
  const dateStr = day.format('MM-DD ddd')

  const isToday = day.isSame(today, 'day')
  // Calculate metrics based on localTasks
  const doneTasks = localTasks.filter((task) => task.status === 'done');
  const undoneTasks = localTasks.filter((task) => task.status !== 'done');
  const estimatedTime = localTasks.reduce((acc, task) => {
    return acc + (task.estimatedTime ?? DEFAULT_ESTIMATED_TIME)
  }, 0)
  const actualTime = localTasks.reduce((acc, task) => {
    return acc + (task.actualTime ?? task.estimatedTime ?? DEFAULT_ESTIMATED_TIME)
  }, 0)

  const { updateEntity } = useAgendaEntities()

  const onAddTaskByDrag = async (sortableEvent) => {
    console.log('[faiz:] === kanban onAdd', sortableEvent)
    // setList prop should have already updated localTasks optimistically
    const id = sortableEvent?.item?.dataset?.id
    // Find original task data from allKanbanItems prop
    const taskData = allKanbanItems.find((task) => task.id === id)
    // TODO: 支持拖拽修改 deadline
    if (!taskData?.start) return logseq.UI.showMsg('Drag task without start date is not supported', 'error')
    if (!taskData || !id) return logseq.UI.showMsg('task id not found', 'error')
    let startDay = day
    // remain time info
    if (taskData.allDay === false) {
      startDay = replaceDateInfo(taskData.start, day)
    }
    try {
      // Trigger background update of Logseq block and global atom state
      await updateEntity({
        type: 'task-date',
        id,
        data: {
          start: startDay,
          allDay: taskData.allDay, // Use original allDay status
          // Preserve estimated time
          estimatedTime: taskData.estimatedTime,
        },
      });
      console.log(`[Agenda3] Task ${id} moved to ${day.format('YYYY-MM-DD')} successfully.`);
      track('KanBan: Drag Task');
    } catch (error) {
      console.error(`[Agenda3] Failed to move task ${id} to ${day.format('YYYY-MM-DD')}`, error);
      logseq.UI.showMsg('Failed to update task date', 'error');
      // Revert? The global state update might fix it, or could cause issues.
      // Consider forcing a refresh or explicitly reverting localTasks if needed.
    }
  }

  useImperativeHandle(ref, () => ({
    scrollIntoView: () => {
      columnContainerRef.current?.scrollIntoView({ block: 'nearest', inline: 'start' })
    },
    // 你可以在这里添加更多你需要暴露给父组件的方法或属性
  }))

  useEffect(() => {
    if (app.view === 'tasks' && !hadBindDropRef.current && columnContainerRef.current) {
      new ThirdPartyDraggable(columnContainerRef.current, {
        itemSelector: '.droppable-task-element',
        mirrorSelector: '.dragged-mirror-element',
      })
      hadBindDropRef.current = true
    }
    return () => {
      hadBindDropRef.current = false
    }
  }, [app.view])

  return (
    <>
      <div key={dateStr} className="mt-2 flex w-[265px] shrink-0 flex-col" id={dateStr} ref={columnContainerRef}>
        {/* ========= Title ========= */}
        <ColumnTitle day={day} />

        {/* ========= Progress ========= */}
        {isToday ? (
          <Progress
            size="small"
            status="success"
            className="!m-0"
            showInfo={false}
            percent={(doneTasks.length / localTasks.length) * 100}
          />
        ) : (
          <div className="h-[24px]"></div>
        )}

        {/* ========= Add a task Card ========= */}
        <AddTaskCard
          isGray={undoneTasks.length === 0}
          day={day}
          actualTime={actualTime}
          estimatedTime={estimatedTime}
        />

        {/* ========= Tasks List ========= */}
        <ReactSortable
          forceFallback // 该属性如果不加就无法与 fullcalendar 交互
          className={cn('flex flex-1 flex-col gap-2 overflow-y-auto', { 'pb-28': localTasks.length === 0 })}
          group="shared"
          dragClass="dragged-mirror-element"
          draggable=".droppable-task-element"
          list={localTasks}
          setList={setLocalTasks}
          onAdd={onAddTaskByDrag}
        >
          {localTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ReactSortable>
      </div>

      {/* Daily Review Modal */}
    </>
  )
}

export type ColumnHandle = {
  scrollIntoView: () => void
}
export default React.forwardRef<ColumnHandle, ColumnProps>(Column)
