import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Empty, Form, Input, Select, Space, Table, Tag, type TableColumnsType } from 'antd'
import { DatabaseOutlined, EditOutlined, ExportOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import StatCards from '@/components/StatCards'
import { CHANNELS, KINDS, REGIONS, STATUS, options, type Pane, type PrototypeRecord, type RecordPane } from './prototypeData'

const LOCKED_COLUMNS = [{ key: 'id', locked: 'head' as const }, { key: 'action', locked: 'tail' as const }]
export function StatusTag({ status }: { status: string }) {
  const color = status === STATUS.DRAFT ? 'default' : status === STATUS.REVIEW ? 'orange' : status === STATUS.PAUSED ? 'red' : 'blue'
  return <Tag color={color}>{status} · 示例</Tag>
}

/** 共用表格只负责显示，不在原型中接入任何管理或计费接口。 */
export function SampleTable<T extends { id: string }>({ pageKey, rows, columns, actions }: {
  pageKey: string; rows: T[]; columns: TableColumnsType<T>; actions?: ReactNode
}) {
  const { t } = useTranslation()
  const [pagination, setPagination] = useState({ page: 1, size: 10 })
  const meta = useMemo(() => columns.map(c => ({ key: String(c.key), title: String(c.title) })), [columns])
  const { configComponent, applyConfig } = useColumnConfig(`search-u1-${pageKey}`, meta, LOCKED_COLUMNS)
  const current = Math.min(pagination.page, Math.max(1, Math.ceil(rows.length / pagination.size)))
  return <>
    <div className="action-section">
      <div className="action-section-left"><Tag>{t('searchV2.list.onlyPrototypeTag')}</Tag></div>
      <div className="action-section-right">{actions}{configComponent}</div>
    </div>
    <Table<T> size="middle" rowKey="id" dataSource={rows} columns={applyConfig(columns) as TableColumnsType<T>}
      scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('searchV2.list.noSampleData')} /> }}
      pagination={{ current, pageSize: pagination.size, total: rows.length, showSizeChanger: true, showQuickJumper: true,
        pageSizeOptions: [10, 20, 50], showTotal: count => `共 ${count} 條示例`,
        onChange: (page, size) => setPagination({ page: size === pagination.size ? page : 1, size }) }} />
  </>
}

export function ScopeFilters({ onChange, keywordLabel }: {
  onChange: (filters: { keyword: string; channel: string; region: string }) => void; keywordLabel?: string
}) {
  const { t } = useTranslation()
  const [form] = Form.useForm<{ keyword: string; channel: string; region: string }>()
  const name = keywordLabel ?? t('searchV2.list.labelName')
  const initial = { keyword: '', channel: '全部場景', region: '全城' }
  return <div className="search-section">
    <Form form={form} layout="vertical" initialValues={initial} onFinish={onChange} className="sv2__filters">
      <Form.Item name="keyword" label={name}><Input allowClear maxLength={80} placeholder={`搜尋${name}`} /></Form.Item>
      <Form.Item name="channel" label={t('searchV2.list.labelScene')}><Select options={options(CHANNELS)} /></Form.Item>
      <Form.Item name="region" label={t('searchV2.list.labelRegion')}><Select options={options(REGIONS)} /></Form.Item>
      <div className="search-actions"><Button type="primary" aria-label={t('searchV2.list.btnQuery')} icon={<SearchOutlined />} htmlType="submit">{t('searchV2.list.btnQuery')}</Button>
        <Button aria-label={t('searchV2.list.btnReset')} icon={<ReloadOutlined />} onClick={() => { form.resetFields(); onChange(initial) }}>{t('searchV2.list.btnReset')}</Button></div>
    </Form>
  </div>
}

export function RecordList({ pane, records, onNavigate }: {
  pane: RecordPane; records: PrototypeRecord[]; onNavigate: (pane: Pane, view?: string, id?: string) => void
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState({ keyword: '', channel: '全部場景', region: '全城' })
  const [kind, setKind] = useState('全部類型')
  const rows = records.filter(r => r.pane === pane && (kind === '全部類型' || r.kind === kind)
    && (filters.channel === '全部場景' || r.channel === filters.channel)
    && (filters.region === '全城' || r.region === filters.region)
    && `${r.name} ${r.id} ${Object.values(r.values).join(' ')}`.toLowerCase().includes(filters.keyword.trim().toLowerCase()))
  const columns: TableColumnsType<PrototypeRecord> = [
    { key: 'id', title: t('searchV2.list.colId'), dataIndex: 'id', width: 130 },
    { key: 'name', title: t('searchV2.list.colName'), dataIndex: 'name', width: 215 },
    { key: 'kind', title: t('searchV2.list.colType'), dataIndex: 'kind', width: 150, render: (value: string) => <Tag>{value}</Tag> },
    { key: 'channel', title: t('searchV2.list.colScene'), dataIndex: 'channel', width: 120 },
    { key: 'region', title: t('searchV2.list.colRegion'), dataIndex: 'region', width: 85 },
    { key: 'summary', title: pane === 'ads' ? t('searchV2.list.colSummaryAds') : t('searchV2.list.colSummaryRule'), width: 240, render: (_, r) => summary(r) },
    { key: 'status', title: t('searchV2.list.colFlowStatus'), dataIndex: 'status', width: 165, render: (value: string) => <StatusTag status={value} /> },
    { key: 'action', title: t('searchV2.list.colAction'), width: 135, render: (_, r) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" onClick={() => onNavigate(pane, 'detail', r.id)}>{t('searchV2.list.actDetail')}</Button>
      <Button type="link" size="small" onClick={() => onNavigate(pane, 'edit', r.id)}>{t('searchV2.list.actEdit')}</Button>
    </Space> },
  ]
  return <>
    <ScopeFilters onChange={setFilters} />
    <div className="sv2__type-filter"><Select aria-label="示例類型" value={kind} options={options(['全部類型', ...KINDS[pane]])} onChange={setKind} />
      <span>{t('searchV2.list.switchNote')}</span></div>
    <div className="sv2__stats"><StatCards animationKey={JSON.stringify({ ...filters, kind })} items={[
      { key: 'all', icon: <DatabaseOutlined />, label: t('searchV2.list.statAll'), value: rows.length, color: 'info' },
      { key: 'draft', icon: <EditOutlined />, label: t('searchV2.list.statDraft'), value: rows.filter(r => r.status === STATUS.DRAFT).length, color: 'brand' },
      { key: 'review', icon: <EyeOutlined />, label: t('searchV2.list.statReview'), value: rows.filter(r => r.status === STATUS.REVIEW).length, color: 'system' },
      { key: 'online', icon: <SearchOutlined />, label: t('searchV2.list.statOnline'), value: t('searchV2.list.onlineNotConnected'), color: 'success' },
    ]} /></div>
    <SampleTable pageKey={pane} rows={rows} columns={columns} actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => onNavigate(pane, 'add')}>{t('searchV2.list.btnAddSample')}</Button>} />
    <div className="sv2__footnote"><ExportOutlined /> {t('searchV2.list.footnote')}</div>
  </>
}

function summary(row: PrototypeRecord): string {
  const v = row.values
  if (row.pane === 'lexicon') return `${v.source} → ${v.target}`
  if (row.pane === 'interventions') return `${v.terms} · ${row.kind === '精確准入' ? '僅精確意圖' : `乘數 ${v.factor ?? '—'}`} · ${v.days} 天`
  if (row.pane === 'scenarios') return `R ${v.relevance}% / Q ${v.quality}% / D ${v.distance}% / H ${v.heat}%`
  if (row.pane === 'ads') return row.kind === '搜索投流包' ? `${v.quota} 次 · ${v.daily} 次／日` : `${v.start} ～ ${v.end}`
  if (row.pane === 'releases') return `${v.version} → 回退 ${v.rollback}`
  return `${v.text} → 搜索「${v.target}」`
}
