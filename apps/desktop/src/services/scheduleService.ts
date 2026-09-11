import { trpc } from '../lib/trpc'

export interface ScheduleEvent {
  id: string
  title: string
  start: string
  end: string
  startTime: string
  endTime: string
  allDay: boolean
  description: string
  color: string
  priority: 'important' | 'normal' | 'low'
  createdAt: string
  updatedAt: string
}

export interface CreateEventInput {
  title: string
  start: string
  end?: string
  startTime?: string
  endTime?: string
  allDay?: boolean
  description?: string
  color?: string
  priority?: 'important' | 'normal' | 'low'
}

export const scheduleService = {
  async list(): Promise<ScheduleEvent[]> {
    return await trpc.schedule.list.query()
  },

  async byRange(start: string, end: string): Promise<ScheduleEvent[]> {
    return await trpc.schedule.byRange.query({ start, end })
  },

  async create(input: CreateEventInput): Promise<{ id: string }> {
    return await trpc.schedule.create.mutate(input)
  },

  async update(id: string, patch: Partial<CreateEventInput>): Promise<{ ok: boolean }> {
    return await trpc.schedule.update.mutate({ id, ...patch })
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    return await trpc.schedule.remove.mutate({ id })
  },
}
