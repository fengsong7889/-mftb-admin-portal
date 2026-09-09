/**
 * 損壞賠付列表
 *
 * - 展示所有賠付記錄（單號/資產/損失類型/責任人/金額/狀態）
 * - 支持按狀態、關鍵詞搜索
 * - 點擊行進入賠付詳情（定責/賠付操作）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchCompensationList, type CompensationRecord } from '../../../api/eam'

const STATUS_META: Record<CompensationRecord['status'], { key: string; color: string }> = {
  pending:   { key: 'asset.compPending',   color: 'warning' },
  confirmed: { key: 'asset.compConfirmed', color: 'processing' },
  paid:      { key: 'asset.compPaid',      color: 'success' },
}

const DAMAGE_META: Record<CompensationRecord['damageType'], { key: string; color: string }> = {
  damage: { key: 'asset.damageDamage', color: 'error' },
  loss:   { key: 'asset.damageLoss',   color: 'volcano' },
}

const CAUSE_META: Record<CompensationRecord['causeType'], { key: string }> = {
  human:       { key: 'asset.causeHuman' },
  natural:     { key: 'asset.causeNatural' },
  third_party: { key: 'asset.causeThirdParty' },
  quality:     { key: 'asset.causeQuality' },
}

const COMP_TYPE_META: Record<CompensationRecord['compType'], { key: string }> = {
  repair_cost:  { key: 'asset.compTypeRepair' },
  replace_price: { key: 'asset.compTypeReplace' },
  depreciated:  { key: 'asset.compTypeDepreciated' },
}

interface Props {
  onViewDetail: (id: number) => void
  onViewAsset: (assetNo: string) => void
}

export default function CompensationList({ onViewDetail, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<CompensationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ keyword?: string; status?: string }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchCompensationList({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({ keyword: v.keyword || undefined, status: v.status || undefined })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.compPending'), value: 'pending' },
    { label: t('asset.compConfirmed'), value: 'confirmed' },
    { label: t('asset.compPaid'), value: 'paid' },
  ]

  const columns: TableColumnsType<CompensationRecord> = [
    {
      title: t('asset.colCompNo'), dataIndex: 'compNo', key: 'compNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={(e) => { e.stopPropagation(); onViewAsset(v) }}
        >
          {v}
        </Button>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 180, ellipsis: true },
    {
      title: t('asset.colDamageType'), dataIndex: 'damageType', key: 'damageType', width: 100,
      render: (v: CompensationRecord['damageType']) => <Tag color={DAMAGE_META[v].color}>{t(DAMAGE_META[v].key)}</Tag>,
    },
    {
      title: t('asset.colCauseType'), dataIndex: 'causeType', key: 'causeType', width: 120,
      render: (v: CompensationRecord['causeType']) => <Tag>{t(CAUSE_META[v].key)}</Tag>,
    },
    { title: t('asset.colResponsiblePerson'), dataIndex: 'responsiblePerson', key: 'responsiblePerson', width: 130,
      render: (v: string) => v || '-',
    },
    { title: t('asset.colResponsibleDept'), dataIndex: 'responsibleDept', key: 'responsibleDept', width: 110,
      render: (v: string) => v || '-',
    },
    {
      title: t('asset.colCompType'), dataIndex: 'compType', key: 'compType', width: 120,
      render: (v: CompensationRecord['compType']) => v ? t(COMP_TYPE_META[v].key) : '-',
    },
    {
      title: t('asset.colCompAmount'), dataIndex: 'compAmount', key: 'compAmount', width: 130, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (s: CompensationRecord['status']) => <Tag color={STATUS_META[s].color}>{t(STATUS_META[s].key)}</Tag>,
    },
    { title: t('asset.colPaidDate'), dataIndex: 'paidDate', key: 'paidDate', width: 120,
      render: (v: string | undefined) => v || '-',
    },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 110 },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={statusOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 表格 ====== */}
      <Table<CompensationRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1700 }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.id),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
