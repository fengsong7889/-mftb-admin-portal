/**
 * 行政侧会议纪要检索（會議治理 › 會議紀要）。
 *
 * 与「我的會議」的区别：那页回答"我的会"，这页回答"公司有哪些纪要、哪件事还没办完"。
 * 因此搜索区按 关键字/时间/记录人/待办状态 筛选，统计卡片跟随搜索条件（§E.8：统计在搜索区下方）。
 * 本页是菜单列表页（非详情/表单页），按 §E.7 不渲染顶部返回栏与页面标题。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { FileTextOutlined, ReloadOutlined, SearchOutlined, SolutionOutlined } from '@ant-design/icons'
import useMinutesNavigation from '../MeetingManagement/MeetingMinutes/useMinutesNavigation'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import MeetingStatCards from '../MeetingManagement/MeetingStatCards'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { fetchMinutesAdminPage, type MinutesAdminRow } from '@/api/meetingMinutes'
import { minutesStatusMeta } from '../MeetingManagement/meetingMeta'

/** 搜索区表单值：与 §E.1 的查询条件一一对应 */
interface SearchValues {
  keyword?: string
  recorderKeyword?: string
  itemState?: string
  range?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
}

export default function MeetingMinutesAdmin() {
  const { t } = useTranslation()
  const { open: navigate } = useMinutesNavigation()
  const [form] = Form.useForm<SearchValues>()
  const [rows, setRows] = useState<MinutesAdminRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ pendingItems: 0, overdueItems: 0, sentMinutes: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  /** 已提交的筛选口径快照：统计卡片据此重挂并重新触发计数动画（§E.8） */
  const [applied, setApplied] = useState<SearchValues>({})

  const requestId = useRef(0)
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(undefined)
    const values = form.getFieldsValue()
    try {
      const result = await fetchMinutesAdminPage({
        keyword: values.keyword?.trim() || undefined,
        recorderKeyword: values.recorderKeyword?.trim() || undefined,
        itemState: values.itemState,
        startDate: values.range?.[0]?.format('YYYY-MM-DD'),
        endDate: values.range?.[1]?.format('YYYY-MM-DD'),
        page,
        size,
      })
      if (currentRequest !== requestId.current) return
      setRows(result.list ?? [])
      setTotal(result.total ?? 0)
      setStats({
        pendingItems: result.pendingItems ?? 0,
        overdueItems: result.overdueItems ?? 0,
        sentMinutes: result.sentMinutes ?? 0,
      })
      setApplied(values)
    } catch (e) {
      if (currentRequest !== requestId.current) return
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe2', { defaultValue: '會議詳情加載失敗' }))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [form, page, size, t])

  useEffect(() => { void load() }, [load])

  /** 查询：条件变更后回到第 1 页，避免停留在过滤后不存在的页码 */
  const search = () => { setPage(1); void load() }

  const reset = () => { form.resetFields(); setPage(1); void load() }

  const statsKey = [
    applied.keyword ?? '', applied.recorderKeyword ?? '', applied.itemState ?? '',
    applied.range?.[0]?.valueOf() ?? '', applied.range?.[1]?.valueOf() ?? '',
  ].join('|')

  const columns: TableColumnsType<MinutesAdminRow> = [
    { title: t('meeting.minutes.minutesNo', { defaultValue: '紀要單號' }), dataIndex: 'minutesNo', key: 'minutesNo', width: 150 },
    {
      title: t('meeting.minutes.meetingTitle', { defaultValue: '會議主題' }), key: 'title',
      render: (_, row) => (
        <div>
          <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }}
            onClick={() => navigate(`/meeting-minutes?id=${row.minutesId}`)}>{row.meetingTitle}</Button>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{row.meetingTimeText} · {row.roomText}</div>
        </div>
      ),
    },
    {
      title: t('meeting.minutes.recorderColumn', { defaultValue: '記錄人' }), key: 'recorder', width: 150,
      render: (_, row) => `${row.recorderName ?? '-'}${row.recorderEmpNo ? `（${row.recorderEmpNo}）` : ''}`,
    },
    {
      title: t('meeting.status', { defaultValue: '狀態' }), key: 'status', width: 110,
      render: (_, row) => {
        const meta = row.status ? minutesStatusMeta()[row.status] : undefined
        return meta ? <Tag color={meta.color}>{meta.label}</Tag> : '-'
      },
    },
    {
      title: t('meeting.minutes.itemState', { defaultValue: '待辦' }), key: 'items', width: 170,
      render: (_, row) => (
        <Space size={4} wrap>
          {row.itemTotal ? <span style={{ fontSize: 12 }}>{t('meeting.minutes.itemTotal', { count: row.itemTotal, defaultValue: `共 ${row.itemTotal} 項` })}</span> : <span>-</span>}
          {row.itemPending ? <Tag color="processing">{t('meeting.minutes.itemPendingCount', { count: row.itemPending, defaultValue: `待辦 ${row.itemPending}` })}</Tag> : null}
          {row.itemOverdue ? <Tag color="red">{t('meeting.minutes.itemOverdueCount', { count: row.itemOverdue, defaultValue: `逾期 ${row.itemOverdue}` })}</Tag> : null}
        </Space>
      ),
    },
    { title: t('meeting.minutes.formalVersion', { defaultValue: '正式版本' }), key: 'revision', width: 130,
      render: (_, row) => row.publishedRevisionNo ? <Tag color="blue">V{row.publishedRevisionNo}</Tag> : t('meeting.minutes.unpublished', { defaultValue: '未發布' }) },
    { title: t('meeting.minutes.publishedAt', { defaultValue: '發布時間' }), dataIndex: 'publishedAt', key: 'publishedAt', width: 160, render: (value?: string) => value || '-' },
    {
      title: t('meeting.minutes.sendCount', { defaultValue: '發送次數' }), dataIndex: 'sendCount', key: 'sendCount', width: 110,
      render: (value: number, row) => (
        <div>
          <span>{value ?? 0}</span>
          {row.lastSendAt && <div style={{ fontSize: 12, color: '#8C8C8C' }}>{row.lastSendAt}</div>}
        </div>
      ),
    },
    {
      title: t('meeting.action', { defaultValue: '操作' }), key: 'action', width: 120,
      render: (_, row) => <Button type="link" size="small" onClick={() => navigate(`/meeting-minutes?id=${row.minutesId}`)}>
        {t('meeting.minutes.viewMinutesShort', { defaultValue: '查看紀要' })}
      </Button>,
    },
  ]

  const { configComponent, applyConfig } = useColumnConfig('meeting-minutes-list',
    columns.map(column => ({ key: String(column.key), title: String(column.title) })),
    [{ key: 'minutesNo', visible: true, locked: 'head' }, { key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('meeting.loadFailed', { defaultValue: '加載失敗' })} description={error} />}

      {/* 搜索区（§E.1）：4 列 grid 由 .search-section 统一接管，控件一律 width:100% */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('meeting.keyword', { defaultValue: '關鍵字' })} name="keyword">
            <Input allowClear style={{ width: '100%' }} prefix={<SearchOutlined />}
              placeholder={t('meeting.minutes.adminKeywordPlaceholder', { defaultValue: '紀要單號 / 會議單號 / 主題 / 結論' })}
              onPressEnter={search} />
          </Form.Item>
          <Form.Item label={t('meeting.minutes.recorderColumn', { defaultValue: '記錄人' })} name="recorderKeyword">
            <Input allowClear style={{ width: '100%' }}
              placeholder={t('meeting.minutes.recorderPlaceholder', { defaultValue: '記錄人姓名或工號' })}
              onPressEnter={search} />
          </Form.Item>
          <Form.Item label={t('meeting.minutes.publishedAt', { defaultValue: '發布時間' })} name="range">
            <DatePicker.RangePicker style={{ width: '100%' }} allowClear />
          </Form.Item>
          <Form.Item label={t('meeting.minutes.itemState', { defaultValue: '待辦' })} name="itemState">
            <Select allowClear style={{ width: '100%' }} placeholder={t('meeting.all2', { defaultValue: '全部' })}
              options={[
                { value: 'pending', label: t('meeting.minutes.pending', { defaultValue: '待處理' }) },
                { value: 'overdue', label: t('meeting.minutes.overdue', { defaultValue: '已逾期' }) },
              ]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={search}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：必须在搜索区下方（§E.8），key 为口径快照，条件一变重跑计数动画 */}
      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <FileTextOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats.sentMinutes, label: t('meeting.minutes.statSent', { defaultValue: '已發送紀要' }) },
        { icon: <SolutionOutlined />, color: '#E8720C', bg: '#FFF7E6', value: stats.pendingItems, label: t('meeting.minutes.statPending', { defaultValue: '待辦事項' }) },
        { icon: <SolutionOutlined />, color: '#FF4D4F', bg: '#FFF1F0', value: stats.overdueItems, label: t('meeting.minutes.statOverdue', { defaultValue: '逾期事項' }) },
      ]} />

      <div className="action-section">
        <div className="action-section-left"><Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('meeting.refreshList', { defaultValue: '重新整理' })}</Button></div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      <Table<MinutesAdminRow>
        rowKey="minutesId"
        size="small"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: value => t('meeting.totalRecords', { count: value, defaultValue: `共 ${value} 條` }),
          onChange: (nextPage, nextSize) => { setPage(nextSize !== size ? 1 : nextPage); setSize(nextSize) }
        }}
        locale={{ emptyText: t('meeting.minutes.noMinutes', { defaultValue: '暫無符合條件的紀要' }) }}
      />
    </div>
  )
}
