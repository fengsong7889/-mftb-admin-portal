/**
 * 行政侧会议纪要检索（會議治理 › 會議紀要）。
 *
 * 与「我的會議」的区别：那页回答"我的会"，这页回答"公司有哪些纪要、哪件事还没办完"。
 * 因此搜索区按 关键字/时间/记录人/待办状态 筛选，统计卡片跟随搜索条件（§E.8：统计在搜索区下方）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Input, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined, SolutionOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import DetailPageHeader from '../../components/DetailPageHeader'
import StatCards from '../../components/StatCards'
import { fetchMinutesAdminPage, type MinutesAdminRow } from '../../api/meetingMinutes'
import { minutesStatusMeta } from '../MeetingManagement/meetingMeta'

export default function MeetingMinutesAdmin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<MinutesAdminRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ pendingItems: 0, overdueItems: 0, sentMinutes: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [filters, setFilters] = useState<{ keyword?: string; recorderKeyword?: string; itemState?: string }>({})
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const result = await fetchMinutesAdminPage({
        keyword: filters.keyword,
        recorderKeyword: filters.recorderKeyword,
        itemState: filters.itemState,
        startDate: range?.[0]?.format('YYYY-MM-DD'),
        endDate: range?.[1]?.format('YYYY-MM-DD'),
        page,
        size,
      })
      setRows(result.list ?? [])
      setTotal(result.total ?? 0)
      setStats({
        pendingItems: result.pendingItems ?? 0,
        overdueItems: result.overdueItems ?? 0,
        sentMinutes: result.sentMinutes ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe2', { defaultValue: '會議詳情加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, range, t])

  useEffect(() => { void load() }, [load])

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

  return (
    <div className="content-area">
      <DetailPageHeader title={t('meeting.minutes.adminTitle', { defaultValue: '會議紀要' })} onBack={() => navigate(-1)} />

      {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('meeting.loadFailed', { defaultValue: '加載失敗' })} description={error} />}

      <div className="search-section">
        <Space wrap size={12}>
          <Input allowClear style={{ width: 260 }} prefix={<SearchOutlined />}
            placeholder={t('meeting.minutes.adminKeywordPlaceholder', { defaultValue: '紀要單號 / 會議單號 / 主題 / 結論' })}
            onChange={event => { setPage(1); setFilters(previous => ({ ...previous, keyword: event.target.value })) }} />
          <Input allowClear style={{ width: 190 }}
            placeholder={t('meeting.minutes.recorderPlaceholder', { defaultValue: '記錄人姓名或工號' })}
            onChange={event => { setPage(1); setFilters(previous => ({ ...previous, recorderKeyword: event.target.value })) }} />
          <DatePicker.RangePicker
            onChange={value => { setPage(1); setRange(value as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) }} />
          <Space.Compact>
            <Button type={filters.itemState === undefined ? 'primary' : 'default'} size="small"
              onClick={() => { setPage(1); setFilters(previous => ({ ...previous, itemState: undefined })) }}>{t('meeting.all2', { defaultValue: '全部' })}</Button>
            <Button type={filters.itemState === 'pending' ? 'primary' : 'default'} size="small"
              onClick={() => { setPage(1); setFilters(previous => ({ ...previous, itemState: 'pending' })) }}>{t('meeting.minutes.pending', { defaultValue: '待處理' })}</Button>
            <Button type={filters.itemState === 'overdue' ? 'primary' : 'default'} size="small" danger={filters.itemState === 'overdue'}
              onClick={() => { setPage(1); setFilters(previous => ({ ...previous, itemState: 'overdue' })) }}>{t('meeting.minutes.overdue', { defaultValue: '已逾期' })}</Button>
          </Space.Compact>
        </Space>
      </div>

      {/* 统计卡片：必须在搜索区下方，且口径跟随筛选条件 */}
      <div style={{ margin: '16px 0' }}>
        <StatCards
          animationKey={`${filters.keyword ?? ''}|${filters.recorderKeyword ?? ''}|${filters.itemState ?? ''}|${range?.[0]?.valueOf() ?? ''}`}
          columns={3}
          items={[
            { key: 'sent', icon: <SolutionOutlined />, value: stats.sentMinutes, label: t('meeting.minutes.statSent', { defaultValue: '已發送紀要' }), color: 'info' },
            { key: 'pending', icon: <SolutionOutlined />, value: stats.pendingItems, label: t('meeting.minutes.statPending', { defaultValue: '待辦事項' }), color: 'brand' },
            { key: 'overdue', icon: <SolutionOutlined />, value: stats.overdueItems, label: t('meeting.minutes.statOverdue', { defaultValue: '逾期事項' }), color: 'danger' },
          ]}
        />
      </div>

      <div className="action-section">
        <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('meeting.refreshList', { defaultValue: '重新整理' })}</Button>
      </div>

      <Table<MinutesAdminRow>
        rowKey="minutesId"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showTotal: value => t('meeting.totalRecords', { count: value, defaultValue: `共 ${value} 條` }),
          onChange: (nextPage, nextSize) => { setPage(nextPage); setSize(nextSize) },
        }}
        locale={{ emptyText: t('meeting.minutes.noMinutes', { defaultValue: '暫無符合條件的紀要' }) }}
      />
    </div>
  )
}
