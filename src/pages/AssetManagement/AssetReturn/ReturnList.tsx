/**
 * 歸還記錄列表
 *
 * - 展示領用/借用資產的歸還登記（單號/資產/歸還人/歸還日期/資產狀況）
 * - 狀況為「損壞/遺失」且未關聯賠付單時，提供「賠付登記」入口（聯動損壞賠付）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchReturnList, type ReturnRecord } from '../../../api/eam'

type ReturnCondition = ReturnRecord['condition']

const CONDITION_META: Record<ReturnCondition, { key: string; color: string }> = {
  normal:  { key: 'asset.conditionNormal',  color: 'success' },
  damaged: { key: 'asset.conditionDamaged', color: 'error' },
  lost:    { key: 'asset.conditionLost',    color: 'volcano' },
}

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
  onViewComp: (compId: number) => void
  onCreateComp: (record: ReturnRecord) => void
}

export default function ReturnList({ onAdd, onViewAsset, onViewComp, onCreateComp }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<ReturnRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{ keyword?: string; status?: string }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // status 復用為歸還狀況過濾（api 層按 condition 匹配）
      const res = await fetchReturnList({ ...filters, page, size })
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
    setFilters({ keyword: v.keyword || undefined, status: v.condition || undefined })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const conditionOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.conditionNormal'), value: 'normal' },
    { label: t('asset.conditionDamaged'), value: 'damaged' },
    { label: t('asset.conditionLost'), value: 'lost' },
  ]

  const columns: TableColumnsType<ReturnRecord> = [
    {
      title: t('asset.colReturnNo'), dataIndex: 'returnNo', key: 'returnNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={() => onViewAsset(v)}
        >
          {v}
        </Button>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: t('asset.colReturnUser'), dataIndex: 'returnUser', key: 'returnUser', width: 110 },
    { title: t('asset.colReturnDate'), dataIndex: 'returnDate', key: 'returnDate', width: 120 },
    {
      title: t('asset.colCondition'), dataIndex: 'condition', key: 'condition', width: 100,
      render: (v: ReturnCondition) => <Tag color={CONDITION_META[v].color}>{t(CONDITION_META[v].key)}</Tag>,
    },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 110 },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 150, fixed: 'right',
      render: (_: unknown, record) => {
        if (record.compensationId) {
          return (
            <Button type="link" size="small" onClick={() => onViewComp(record.compensationId!)}>
              {t('asset.compensationTitle')}
            </Button>
          )
        }
        if (record.condition !== 'normal') {
          return (
            <Button type="link" size="small" danger onClick={() => onCreateComp(record)}>
              {t('asset.btnNewComp')}
            </Button>
          )
        }
        return <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colCondition')} name="condition">
            <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={conditionOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            {t('asset.btnNewReturn')}
          </Button>
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ReturnRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1400 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
