import { useEffect, useState, useCallback } from 'react'
import FullCalendar, { type PluginInput } from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Modal, Input, Select, Button, Message, Typography } from '@arco-design/web-react'
import { scheduleService, type ScheduleEvent } from '../../services/scheduleService'

const { Text } = Typography
const { TextArea } = Input

const PRIORITY_COLORS = {
  important: '#f5222d',
  normal: '#60a5fa',
  low: '#94a3b8',
}

export default function SchedulePage() {
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    start: '',
    end: '',
    startTime: '09:00',
    endTime: '10:00',
    allDay: true,
    description: '',
    priority: 'normal' as 'important' | 'normal' | 'low',
  })

  const loadEvents = useCallback(async () => {
    try {
      const list = await scheduleService.list()
      setEvents(list)
    } catch {
      Message.error('加载日程失败')
    }
  }, [])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const openCreate = (info?: { start: Date; allDay?: boolean }) => {
    setEditingEvent(null)
    const d = info?.start ?? new Date()
    const ymd = d.toISOString().slice(0, 10)
    setForm({
      title: '',
      start: ymd,
      end: ymd,
      startTime: '09:00',
      endTime: '10:00',
      allDay: info?.allDay ?? true,
      description: '',
      priority: 'normal',
    })
    setModalOpen(true)
  }

  const openEdit = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId)
    if (!ev) return
    setEditingEvent(eventId)
    setForm({
      title: ev.title,
      start: ev.start,
      end: ev.end,
      startTime: ev.startTime || '09:00',
      endTime: ev.endTime || '10:00',
      allDay: ev.allDay,
      description: ev.description,
      priority: ev.priority,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Message.warning('请输入标题')
      return
    }
    try {
      if (editingEvent) {
        await scheduleService.update(editingEvent, form)
        Message.success('已更新')
      } else {
        await scheduleService.create(form)
        Message.success('已创建')
      }
      setModalOpen(false)
      void loadEvents()
    } catch {
      Message.error('操作失败')
    }
  }

  const handleDelete = async () => {
    if (!editingEvent) return
    await scheduleService.remove(editingEvent)
    Message.success('已删除')
    setModalOpen(false)
    void loadEvents()
  }

  const calendarEvents = events.map((ev) => {
    const priorityColor = PRIORITY_COLORS[ev.priority] ?? PRIORITY_COLORS.normal
    if (ev.allDay) {
      return {
        id: ev.id,
        title: ev.title,
        start: ev.start,
        end: ev.end,
        allDay: true,
        color: priorityColor,
        extendedProps: { description: ev.description, priority: ev.priority },
      }
    }
    return {
      id: ev.id,
      title: ev.title,
      start: `${ev.start}T${ev.startTime}`,
      end: `${ev.end}T${ev.endTime}`,
      allDay: false,
      color: priorityColor,
      extendedProps: { description: ev.description, priority: ev.priority },
    }
  })

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold m-0">日程</h2>
        <Button type="primary" size="small" onClick={() => openCreate()}>
          新建事件
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <FullCalendar
          plugins={[dayGridPlugin as unknown as PluginInput, timeGridPlugin as unknown as PluginInput, interactionPlugin as unknown as PluginInput]}
          initialView="dayGridMonth"
          locale="zh-cn"
          firstDay={1}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          height="100%"
          events={calendarEvents}
          dateClick={(info) => openCreate({ start: info.date, allDay: info.allDay })}
          eventClick={(info) => openEdit(info.event.id)}
          editable
          selectable
          dayMaxEvents={3}
          noEventsText="暂无日程"
        />
      </div>

      <Modal
        title={editingEvent ? '编辑事件' : '新建事件'}
        visible={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={editingEvent ? '保存' : '创建'}
        cancelText="取消"
        style={{ width: 480 }}
        footer={
          <div className="flex justify-between">
            {editingEvent ? (
              <Button status="danger" onClick={handleDelete}>
                删除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button onClick={() => setModalOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleSubmit}>
                {editingEvent ? '保存' : '创建'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <Text bold>标题</Text>
            <Input
              placeholder="事件标题"
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Text bold>开始日期</Text>
              <Input
                type="date"
                value={form.start}
                onChange={(v) => setForm({ ...form, start: v })}
              />
            </div>
            <div className="flex-1">
              <Text bold>结束日期</Text>
              <Input
                type="date"
                value={form.end}
                onChange={(v) => setForm({ ...form, end: v })}
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              />
              <Text>全天事件</Text>
            </label>
          </div>
          {!form.allDay && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Text bold>开始时间</Text>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(v) => setForm({ ...form, startTime: v })}
                />
              </div>
              <div className="flex-1">
                <Text bold>结束时间</Text>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(v) => setForm({ ...form, endTime: v })}
                />
              </div>
            </div>
          )}
          <div>
            <Text bold>优先级</Text>
            <Select
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={[
                { label: '🔴 重要', value: 'important' },
                { label: '🔵 普通', value: 'normal' },
                { label: '⚪ 低', value: 'low' },
              ]}
            />
          </div>
          <div>
            <Text bold>备注</Text>
            <TextArea
              placeholder="可选备注"
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
