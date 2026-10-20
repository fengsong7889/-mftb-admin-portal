import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, DatePicker, Form, Select, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { fetchUsageSummary, fetchUsageRecords } from '../../api/llmUsage'
import { tablePagination } from '../../utils/tableDisplay'
import type { UsageRecord, UsageSummary } from '../../api/llmUsage'

const { RangePicker } = DatePicker

/** 幣種符號（金額按幣種分列展示：百煉 CNY、DeepSeek USD） */
const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$' }
const currencySymbol = (currency: string) => CURRENCY_SYMBOL[currency] ?? (currency ? `${currency} ` : '')

/** 引擎模式 → i18n key 與狀態色 */
const MODE_META: Record<string, { labelKey: string; color: string }> = {
  'auto': { labelKey: 'aiEnergyDetail.modeAuto', color: 'success' },
  'primary': { labelKey: 'aiEnergyDetail.modePrimary', color: 'processing' },
  'off-peak': { labelKey: 'aiEnergyDetail.modeOffPeak', color: 'warning' },
}

/** 路由通道 → 展示文案（产品名，保持原样） */
const CHANNEL_LABEL: Record<string, string> = { primary: 'QW（百煉）', 'off-peak': 'DS（DeepSeek）' }

/** V0 §B.5：计量可信度标签（VERIFIED=服务端实取，ESTIMATED=无单价但取到 tokens，UNKNOWN=历史自报） */
const VERIFICATION_META: Record<string, { labelKey: string; color: string }> = {
  VERIFIED: { labelKey: 'aiEnergyDetail.verified', color: 'green' },
  ESTIMATED: { labelKey: 'aiEnergyDetail.estimated', color: 'blue' },
  UNKNOWN: { labelKey: 'aiEnergyDetail.unknown', color: 'default' },
}

/** 格式化時間（後端 LocalDateTime 序列化為時間戳/字串均可解析） */
const formatTime = (value: string | number | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '--')

/** 使用員工展示：姓名（工号），賬號無對應員工時回退登錄名 */
const employeeLabel = (row: { username: string; name?: string | null; empId?: string | null }) =>
  row.name ? `${row.name}（${row.empId || row.username}）` : row.username

export default function AiEnergyDetail() {
  const { t } = useTranslation()
  /* ── 從總覽「明細」帶入的查詢條件 ── */
  const [searchParams] = useSearchParams()

  /* ── 查詢條件（點「查詢」才生效） ── */
  const [dates, setDates] = useState<[Dayjs, Dayjs]>([
    searchParams.get('startDate') ? dayjs(searchParams.get('startDate') as string) : dayjs().startOf('month'),
    searchParams.get('endDate') ? dayjs(searchParams.get('endDate') as string) : dayjs(),
  ])
  const [username, setUsername] = useState<string | undefined>(searchParams.get('username') ?? undefined)
  const [model, setModel] = useState<string | undefined>(searchParams.get('model') ?? undefined)
  const [tick, setTick] = useState(0)

  /* ── 數據 ── */
  const [optionsSummary, setOptionsSummary] = useState<UsageSummary | null>(null)
  const [records, setRecords] = useState<UsageRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  /** 當前日期範圍（服務端查詢用） */
  const rangeParams = useCallback(() => ({
    startDate: dates[0].format('YYYY-MM-DD'),
    endDate: dates[1].format('YYYY-MM-DD'),
  }), [dates])

  /** 分頁拉取範圍內全部記錄（上限 1000 條，賬號過濾在服務端） */
  const collectRecords = useCallback(async (params: { startDate: string; endDate: string; username?: string }) => {
    const all: UsageRecord[] = []
    let current = 1
    while (all.length < 1000) {
      const batch = await fetchUsageRecords({ ...params, page: current, size: 200 })
      const rows = batch.records ?? []
      all.push(...rows)
      if (rows.length < 200 || all.length >= (batch.total ?? 0)) break
      current += 1
    }
    return all
  }, [])

  /** 加載下拉選項（僅按日期範圍）+ 明細記錄（日期 + 賬號） */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const range = rangeParams()
    Promise.all([
      fetchUsageSummary(range),
      collectRecords({ ...range, username }),
    ]).then(([summaryData, recordData]) => {
      if (cancelled) return
      setOptionsSummary(summaryData)
      setRecords(recordData)
    }).catch(() => { /* 請求層已統一提示 */ }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [tick, rangeParams, username, collectRecords])

  /** 模型過濾在客戶端（現有接口暫不支持按模型篩選） */
  const filteredRecords = useMemo(
    () => (model ? records.filter((r) => r.model === model) : records),
    [records, model],
  )

  const handleSearch = () => setTick((prev) => prev + 1)

  const handleReset = () => {
    setDates([dayjs().startOf('month'), dayjs()])
    setUsername(undefined)
    setModel(undefined)
    setTick((prev) => prev + 1)
  }

  /** 導出當前過濾後的全部明細 */
  const handleExport = async () => {
    setExporting(true)
    try {
      if (filteredRecords.length === 0) {
        message.info(t('aiEnergyDetail.noRecordsToExport'))
        return
      }
      const header = [
        t('aiEnergyDetail.colTime'), t('aiEnergyDetail.colEmployee'), t('aiEnergyDetail.colMode'),
        t('aiEnergyDetail.colChannel'), t('aiEnergyDetail.colModel'), t('aiEnergyDetail.colPromptTokens'),
        t('aiEnergyDetail.colCompletionTokens'), t('aiEnergyDetail.colCachedTokens'), t('aiEnergyDetail.colCost'),
        t('aiEnergyDetail.colCurrency'), t('aiEnergyDetail.colCredibility'),
      ].join(',')
      const lines = filteredRecords.map((r) => [
        formatTime(r.createdAt), employeeLabel(r),
        MODE_META[r.mode] ? t(MODE_META[r.mode].labelKey) : r.mode,
        CHANNEL_LABEL[r.channel] ?? r.channel, r.model,
        r.promptTokens, r.completionTokens, r.cachedTokens, r.cost, r.currency || '--',
        t(VERIFICATION_META[r.verificationStatus ?? 'ESTIMATED']?.labelKey ?? 'aiEnergyDetail.estimated'),
      ].join(','))
      const blob = new Blob([`\uFEFF${header}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${t('aiEnergyDetail.exportFileName')}_${rangeParams().startDate}_${rangeParams().endDate}.csv`
      link.click()
      URL.revokeObjectURL(url)
      message.success(t('aiEnergyDetail.exportSuccess', { count: filteredRecords.length }))
    } finally {
      setExporting(false)
    }
  }

  /* ── 明細列（平鋪，無折疊） ── */
  const detailColumns: ColumnsType<UsageRecord> = [
    { title: t('aiEnergyDetail.colTime'), dataIndex: 'createdAt', width: 170, render: formatTime },
    {
      title: t('aiEnergyDetail.colEmployee'), key: 'employee', width: 160,
      render: (_, row) => employeeLabel(row),
    },
    {
      title: t('aiEnergyDetail.colMode'), dataIndex: 'mode', width: 110,
      render: (mode: string) => {
        const meta = MODE_META[mode]
        return meta ? <Tag color={meta.color}>{t(meta.labelKey)}</Tag> : mode
      },
    },
    { title: t('aiEnergyDetail.colChannel'), dataIndex: 'channel', width: 120, render: (channel: string) => CHANNEL_LABEL[channel] ?? channel },
    { title: t('aiEnergyDetail.colModel'), dataIndex: 'model', width: 160 },
    { title: t('aiEnergyDetail.colPromptTokens'), dataIndex: 'promptTokens', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: t('aiEnergyDetail.colCompletionTokens'), dataIndex: 'completionTokens', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    {
      title: t('aiEnergyDetail.colCost'), key: 'cost', width: 130, align: 'right',
      render: (_, record) => {
        // V0 §B.5：UNKNOWN 不再伪装为 0；无单价时展示“未知”灰字
        if (record.verificationStatus === 'UNKNOWN' || !record.currency) {
          return <span style={{ color: '#8C8C8C' }}>{t('aiEnergyDetail.unknown')}</span>
        }
        return `${currencySymbol(record.currency)}${Number(record.cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
      },
    },
    {
      title: t('aiEnergyDetail.colCredibility'), key: 'verification', width: 110, align: 'center',
      render: (_, record) => {
        const status = record.verificationStatus ?? 'ESTIMATED'
        const meta = VERIFICATION_META[status] ?? VERIFICATION_META.ESTIMATED
        return <Tag color={meta.color} style={{ margin: 0 }}>{t(meta.labelKey)}</Tag>
      },
    },
  ]

  return (
    <div className="content-area">
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiEnergyDetail.dateRange')}>
            <RangePicker
              value={dates}
              allowClear={false}
              onChange={(values) => {
                if (values && values[0] && values[1]) setDates([values[0], values[1]])
              }}
            />
          </Form.Item>
          <Form.Item label={t('aiEnergyDetail.employee')}>
            <Select
              value={username}
              placeholder={t('aiEnergyDetail.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={(optionsSummary?.byUser ?? []).map((row) => ({ value: row.username, label: employeeLabel(row) }))}
              onChange={(value) => setUsername(value)}
            />
          </Form.Item>
          <Form.Item label={t('aiEnergyDetail.model')}>
            <Select
              value={model}
              placeholder={t('aiEnergyDetail.all')}
              allowClear
              showSearch
              options={(optionsSummary?.byModel ?? []).map((row) => ({ value: row.model, label: row.model }))}
              onChange={(value) => setModel(value)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能區：左側導出 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} loading={exporting} onClick={handleExport}>{t('aiEnergyDetail.export')}</Button>
        </div>
      </div>

      {/* 使用明細（平鋪列表） */}
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={detailColumns}
        dataSource={filteredRecords}
        pagination={{
          ...tablePagination(t),
          total: filteredRecords.length,
        }}
      />
    </div>
  )
}
