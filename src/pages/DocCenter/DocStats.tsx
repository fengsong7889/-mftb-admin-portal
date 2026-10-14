/**
 * 閱讀統計（doc-stats 菜單）：期間窗口內按文檔聚合的閱讀口徑看板。
 *
 * 純唯讀；口徑 = doc_view_log（詳情頁打開寫入 + 頁面離開上報時長）；
 * 統計卡跟隨搜索條件（§E.8），已刪除文檔不進統計。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Form, Select, Space, Table, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, EyeOutlined, TeamOutlined, FileTextOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { fetchDocSpaces, fetchDocViewStats, type DocSpace, type DocViewStatRow, type DocViewStats } from '@/api/docCenter'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import MeetingStatCards, { type StatItem } from '@/pages/MeetingManagement/MeetingStatCards'
import '@/styles/components.css'

interface FilterValues {
  days: number
  spaceId?: number
}

/** 窗口档位：7/30/90 天覆盖周/月/季度复盘动线 */
const DAY_OPTIONS = [7, 30, 90]

export default function DocStats() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [form] = Form.useForm<FilterValues>()
  const [spaces, setSpaces] = useState<DocSpace[]>([])
  const [data, setData] = useState<DocViewStats | null>(null)
  const [loading, setLoading] = useState(false)

  const buildQuery = useCallback(() => {
    const v = form.getFieldsValue()
    return { days: v.days ?? 30, spaceId: v.spaceId ?? null }
  }, [form])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const q = buildQuery()
      setData(await fetchDocViewStats(q.days, q.spaceId))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [buildQuery, t])

  useEffect(() => {
    fetchDocSpaces().then(setSpaces).catch(() => setSpaces([]))
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleReset = () => {
    form.resetFields()
    setTimeout(loadData, 0)
  }

  const durationText = (s: number) => t('doc.durationText', { m: Math.floor(s / 60), s: s % 60 })

  /* ===== 列定義 ===== */
  const allColumnMeta = useMemo(() => ([
    { key: 'title', title: t('doc.colTitle') },
    { key: 'spaceName', title: t('doc.colSpace') },
    { key: 'viewCount', title: t('doc.colViews') },
    { key: 'readerCount', title: t('doc.colReaders') },
    { key: 'avgDurationSec', title: t('doc.colAvgDwell') },
    { key: 'lastViewedAt', title: t('doc.colLastRead') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('doc-stats', allColumnMeta)

  const rawColumns: TableColumnsType<DocViewStatRow> = [
    {
      title: t('doc.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true, width: 320,
      render: (v: string, r) => (
        <a onClick={() => navigate(`/doc-center/detail?id=${r.nodeId}`)}>{v}</a>
      ),
    },
    { title: t('doc.colSpace'), dataIndex: 'spaceName', key: 'spaceName', width: 120 },
    {
      title: t('doc.colViews'), dataIndex: 'viewCount', key: 'viewCount', width: 110, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600, color: '#E8720C' }}>{v}</span>,
    },
    { title: t('doc.colReaders'), dataIndex: 'readerCount', key: 'readerCount', width: 110, align: 'right' },
    {
      title: t('doc.colAvgDwell'), dataIndex: 'avgDurationSec', key: 'avgDurationSec', width: 130, align: 'right',
      render: (v: number | null) => (v == null ? '-' : durationText(v)),
    },
    { title: t('doc.colLastRead'), dataIndex: 'lastViewedAt', key: 'lastViewedAt', width: 170 },
  ]

  const columns = applyConfig(rawColumns)
  // 口径快照：条件变更时重新触发统计卡计数动画
  const statsKey = JSON.stringify(buildQuery())

  const statItems: StatItem[] = [
    { icon: <EyeOutlined />, color: '#1890FF', bg: '#E6F7FF', value: data?.totalViews ?? 0, label: t('doc.statViews'), hint: t('doc.statViewsHint') },
    { icon: <TeamOutlined />, color: '#52C41A', bg: '#F6FFED', value: data?.totalReaders ?? 0, label: t('doc.statReaders'), hint: t('doc.statReadersHint') },
    { icon: <FileTextOutlined />, color: '#E8720C', bg: '#FFF7E6', value: data?.docCount ?? 0, label: t('doc.statDocs'), hint: t('doc.statDocsHint') },
    {
      icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF',
      value: data?.avgDurationSec != null ? durationText(data.avgDurationSec) : '—',
      label: t('doc.statAvgDwell'), hint: t('doc.statAvgDwellHint'),
    },
  ]

  const pagination = {
    showSizeChanger: true, showQuickJumper: true, pageSize: 20,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (n: number) => t('doc.total', { n }),
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 搜索區（統計卡必須在其下方） */}
      <div className="search-section">
        <Form form={form} layout="inline" initialValues={{ days: 30 }}>
          <Form.Item label={t('doc.statsRange')} name="days">
            <Select
              style={{ width: 140 }}
              options={DAY_OPTIONS.map(d => ({ value: d, label: t(`doc.days${d}`) }))}
            />
          </Form.Item>
          <Form.Item label={t('doc.colSpace')} name="spaceId">
            <Select
              placeholder={t('doc.all')} allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
              options={spaces.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>{t('doc.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('doc.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 統計卡（§E.8 位於搜索區之後；§B.7 加載占位 + 計數動畫） */}
      <div key={statsKey}>
        <MeetingStatCards loading={loading} items={statItems} />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Space>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('doc.statsHint')}</span>
          </Space>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      <Table<DocViewStatRow>
        rowKey="nodeId"
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={loading}
        scroll={{ x: 960 }}
        pagination={pagination}
        size="middle"
      />
    </div>
  )
}
