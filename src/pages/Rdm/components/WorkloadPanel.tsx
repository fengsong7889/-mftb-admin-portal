/**
 * WorkloadPanel —— 资源负载与个人工作日历（阶段 5）
 *
 * 回答两个真实问题：
 * 1. 「这个人这几天到底排了多少活」——把任务计划工时摊到工作日，超过当天可用容量即过载；
 *    只看总工时看不出问题，过载总是集中在少数几天。
 * 2. 「为什么这几天没排我的活」——请假日显式画出来，避免被当成闲置。
 *
 * 权限口径：无全量数据范围的人只会拿到自己的负载（服务端收敛），
 * 负载数据不能变成互相打探绩效的入口。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Input, InputNumber, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { CalendarOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  fetchCalendar,
  fetchWorkload,
  saveCalendar,
  type RdmCalendarItem,
  type RdmWorkload,
  type RdmWorkloadPerson,
} from '../../../api/rdm'

const { RangePicker } = DatePicker

/** 快捷区间：默认两周，够看清当前迭代的挤压点 */
const RANGE_PRESETS = [
  { label: '本週', days: 7 },
  { label: '兩週', days: 14 },
  { label: '本月', days: 30 },
]

/** 日历类型选项（与后端 RdmWorkCalendar.TYPE_* 对应） */
const DAY_TYPE_OPTIONS = [
  { value: 'leave', label: '休假（当天不排活）' },
  { value: 'overtime', label: '加班日（周末可用）' },
  { value: 'custom', label: '自定义容量' },
]

/** 日历编辑行 */
interface CalendarDraft {
  day: dayjs.Dayjs | null
  dayType: string
  availableHours: number | null
  reason: string
}

export default function WorkloadPanel() {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(), dayjs().add(13, 'day')])
  const [data, setData] = useState<RdmWorkload | null>(null)
  const [loading, setLoading] = useState(false)
  const [calendar, setCalendar] = useState<RdmCalendarItem[]>([])
  const [drafts, setDrafts] = useState<CalendarDraft[]>([])
  /** 待删除的已有例外日（点保存才真的提交，避免误删就写库） */
  const [removedDays, setRemovedDays] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [next, mine] = await Promise.all([
        fetchWorkload({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') }).catch(() => null),
        fetchCalendar().catch(() => []),
      ])
      setData(next)
      setCalendar(mine)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { void load() }, [load])

  const dayCount = useMemo(() => data?.people[0]?.days.length ?? 0, [data])

  const addDraft = () => setDrafts(prev => [...prev, { day: null, dayType: 'leave', availableHours: null, reason: '' }])

  const updateDraft = (index: number, patch: Partial<CalendarDraft>) =>
    setDrafts(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  /** 移除已有例外 = 先隐藏行 + 落一条待保存的变更（保存时统一提 removeDays） */
  const removeExisting = (item: RdmCalendarItem) => {
    setCalendar(prev => prev.filter(c => c.id !== item.id))
    setRemovedDays(prev => [...new Set([...prev, item.day])])
  }

  const handleSave = async () => {
    if (drafts.some(d => !d.day)) {
      message.warning('請為每一日曆例外選擇日期')
      return
    }
    if (drafts.some(d => d.dayType === 'leave' && !d.reason.trim())) {
      message.warning('登記休假必須寫明原因，排程要能解釋為什麼這天沒排活')
      return
    }
    setSaving(true)
    try {
      const saved = await saveCalendar({
        // 不传 userId：服务端默认取当前登录人，并且会拒非管理岗代他人维护日历
        days: drafts.map(d => ({
          day: (d.day as dayjs.Dayjs).format('YYYY-MM-DD'),
          dayType: d.dayType,
          availableHours: d.dayType === 'leave' ? 0 : (d.availableHours ?? undefined),
          reason: d.reason.trim() || undefined,
        })),
        removeDays: removedDays.length ? removedDays : undefined,
      })
      setCalendar(saved)
      setDrafts([])
      setRemovedDays([])
      message.success('日曆已更新，排程與負載會按新的可用工時計算')
      await load()
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '保存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const columns: TableColumnsType<RdmWorkloadPerson> = useMemo(() => [
    {
      title: '成員',
      dataIndex: 'userName',
      key: 'userName',
      width: 150,
      fixed: 'left',
      render: (_: string, r) => (
        <div>
          <div style={{ fontWeight: 500, color: '#262626' }}>{r.userName ?? `#${r.userId}`}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.empNo ?? '-'} · {r.reqCount ?? 0} 個需求</div>
        </div>
      ),
    },
    {
      title: '利用率',
      dataIndex: 'utilization',
      key: 'utilization',
      width: 120,
      render: (_: number | undefined, r) => {
        const value = r.utilization ?? 0
        const color = value > 100 ? '#FF4D4F' : value > 85 ? '#FA8C16' : '#52C41A'
        return (
          <Space size={4}>
            <span style={{ color, fontWeight: 600 }}>{value}%</span>
            {(r.overloadedDays ?? 0) > 0 && (
              <Tooltip title={`有 ${r.overloadedDays} 天的计划工时超过当天可用容量`}>
                <Tag color="error" style={{ margin: 0 }}>過載 {r.overloadedDays} 天</Tag>
              </Tooltip>
            )}
          </Space>
        )
      },
    },
    {
      title: '可用 / 計劃 / 實際（人時）',
      key: 'hours',
      width: 190,
      render: (_, r) => `${r.totalCapacity ?? 0} / ${r.totalPlanned ?? 0} / ${r.totalActual ?? 0}`,
    },
    {
      title: `逐日負載（${dayCount} 天）`,
      key: 'days',
      render: (_, r) => (
        <Space size={2} wrap>
          {r.days.map(day => (
            <Tooltip
              key={day.day}
              title={`${day.day}｜容量 ${day.capacity ?? 0}h／計劃 ${day.planned ?? 0}h／已填 ${day.actual ?? 0}h${day.leave ? '｜休假' : ''}${day.weekend ? '｜週末' : ''}`}
            >
              <span
                className="rdm-load-cell"
                style={{
                  background: day.leave
                    ? '#F5F5F5'
                    : day.overloaded
                      ? '#FF4D4F'
                      : (day.planned ?? 0) > 0
                        ? '#E8720C'
                        : day.weekend
                          ? '#FAFAFA'
                          : '#FFFFFF',
                  borderColor: day.weekend ? '#E8EAED' : 'transparent',
                  opacity: (day.planned ?? 0) > 0 && !day.overloaded ? 0.35 + Math.min(0.6, (day.planned ?? 0) / 16) : 1,
                }}
              />
            </Tooltip>
          ))}
        </Space>
      ),
    },
  ], [dayCount])

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap>
        <RangePicker value={range} onChange={v => v && v[0] && v[1] && setRange([v[0], v[1]])} allowClear={false} />
        {RANGE_PRESETS.map(p => (
          <Button key={p.label} size="small" onClick={() => setRange([dayjs(), dayjs().add(p.days - 1, 'day')])}>
            {p.label}
          </Button>
        ))}
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
      </Space>

      {data?.selfOnly && (
        <Alert
          type="info"
          showIcon
          message="你看到的是本人的負載"
          description="跨成員的資源負載需要全量數據範圍；這道收斂在服務端完成，避免負載頁變成互相打探績效的入口。"
        />
      )}

      <Table<RdmWorkloadPerson>
        className="nowrap-table"
        rowKey="userId"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data?.people ?? []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '所选区间内没有已排期的任务（未填计划起止的任务不会出现在这里）' }}
      />

      {/* 个人工作日历：排程与负载的输入，只记例外日 */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><CalendarOutlined /></span>
          我的工作日历
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            默認為週一至週五 8 小時，這裡只登記例外；請假會直接把關鍵路徑往後推
          </span>
        </div>

        {calendar.length === 0 && drafts.length === 0 && (
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>尚未登記例外日。</div>
        )}

        {calendar.map(item => (
          <div key={`${item.day}-${item.id}`} className="rdm-delivery-row">
            <Tag color={item.dayType === 'leave' ? 'default' : 'processing'} style={{ margin: 0 }}>
              {DAY_TYPE_OPTIONS.find(o => o.value === item.dayType)?.label ?? item.dayType}
            </Tag>
            <span className="rdm-delivery-row-main">
              <b style={{ fontWeight: 500 }}>{item.day}</b>
              <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                可用 {item.availableHours ?? '-'} 小時{item.reason ? ` · ${item.reason}` : ''}
              </span>
            </span>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => removeExisting(item)}>移除</Button>
            <span className="action-split">|</span>
            <Tooltip title="移除後該日恢復默認容量，需重新保存才生效">
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>待保存</span>
            </Tooltip>
          </div>
        ))}

        {drafts.map((draft, index) => (
          <Space key={`draft-${index}`} wrap style={{ marginBottom: 8 }}>
            <DatePicker
              value={draft.day}
              disabledDate={d => d.isBefore(dayjs().startOf('day').subtract(30, 'day'))}
              onChange={d => updateDraft(index, { day: d })}
            />
            <Select
              style={{ width: 200 }}
              value={draft.dayType}
              options={DAY_TYPE_OPTIONS}
              onChange={v => updateDraft(index, { dayType: v, availableHours: v === 'leave' ? 0 : draft.availableHours })}
            />
            {draft.dayType !== 'leave' && (
              <InputNumber
                style={{ width: 130 }}
                min={0}
                max={16}
                addonAfter="小時"
                value={draft.availableHours ?? 8}
                onChange={v => updateDraft(index, { availableHours: typeof v === 'number' ? v : null })}
              />
            )}
            <Input
              style={{ width: 240 }}
              placeholder={draft.dayType === 'leave' ? '原因（必填），例：年假' : '說明（選填）'}
              value={draft.reason}
              onChange={e => updateDraft(index, { reason: e.target.value })}
            />
            <Button type="link" size="small" danger onClick={() => setDrafts(prev => prev.filter((_, i) => i !== index))}>取消</Button>
          </Space>
        ))}

        <Space style={{ marginTop: 8 }}>
          <Button icon={<PlusOutlined />} onClick={addDraft}>添加例外日</Button>
          <Button type="primary" loading={saving} disabled={drafts.length === 0 && removedDays.length === 0} onClick={() => void handleSave()}>
            保存日曆
          </Button>
        </Space>
      </div>
    </Space>
  )
}
