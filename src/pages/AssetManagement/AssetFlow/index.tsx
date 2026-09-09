/**
 * 變更歷史（物資管理 - 台賬流轉）
 *
 * 只讀展示全部資產的流轉流水，支持按資產編號 / 操作類型 / 操作時間過濾
 * 展開行顯示本條變更的前後對比（使用人 / 部門 / 存放位置）
 *
 * 數據來源：api/asset.ts fetchAssetLogs（領用、借用、調撥、交接、維修、賠付、報廢等
 *          所有業務操作都會寫入同一條流水，形成完整生命週期軌跡）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Select, Table, Tag, message, Space, DatePicker } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchAssetLogs, type AssetLog, type AssetOpType, type AssetLogQuery } from '../../../api/asset'
import { OP_META, OP_TYPE_LIST } from '../opMeta'

type Filters = Omit<AssetLogQuery, 'page' | 'size'>

export default function AssetFlow() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<Filters>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchAssetLogs({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      message.error(t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  /* ----- 搜索 / 重置 ----- */
  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      assetNo: v.assetNo || undefined,
      keyword: v.keyword || undefined,
      opType: v.opType || 'all',
      dateRange: v.operateTime
        ? [v.operateTime[0]?.format('YYYY-MM-DD'), v.operateTime[1]?.format('YYYY-MM-DD')]
        : undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const renderOpTag = (op: AssetOpType) => {
    const m = OP_META[op]
    return m ? <Tag color={m.color}>{t(m.key)}</Tag> : <Tag>{op}</Tag>
  }

  const opTypeOptions = useMemo(() => [
    { label: t('common.all'), value: '' },
    ...OP_TYPE_LIST.map((op) => ({ label: t(OP_META[op].key), value: op })),
  ], [t])

  const columns: TableColumnsType<AssetLog> = [
    { title: t('asset.colOperateTime'), dataIndex: 'operateTime', key: 'operateTime', width: 170, fixed: 'left' },
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace', fontWeight: 600 }}
          onClick={() => navigate(`/asset-list?assetNo=${encodeURIComponent(v)}`)}
        >
          {v}
        </Button>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 180, ellipsis: true },
    {
      title: t('asset.colOpType'), dataIndex: 'opType', key: 'opType', width: 110,
      render: (v: AssetOpType) => renderOpTag(v),
    },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 120 },
    { title: t('asset.colDescription'), dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: t('asset.colFlowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 160,
      render: (v: string | undefined) => v || '-',
    },
  ]

  /** 前後對比項：僅在流水帶有變更前後值時展示 */
  const renderChange = (record: AssetLog) => {
    const rows: { label: string; from?: string; to?: string }[] = [
      { label: t('asset.colUserName'), from: record.fromUser, to: record.toUser },
      { label: t('asset.colDepartment'), from: record.fromDepartment, to: record.toDepartment },
      { label: t('asset.colLocationName'), from: record.fromLocation, to: record.toLocation },
    ].filter((r) => r.from || r.to)

    if (!rows.length) return <span style={{ color: '#8c8c8c' }}>-</span>

    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {rows.map((r) => (
          <Space key={r.label} size={6}>
            <span style={{ color: '#8c8c8c', minWidth: 72, display: 'inline-block' }}>{r.label}</span>
            <Tag>{r.from || '-'}</Tag>
            <span style={{ color: '#bfbfbf' }}>→</span>
            <Tag color="blue">{r.to || '-'}</Tag>
          </Space>
        ))}
      </Space>
    )
  }

  return (
    <div className="content-area">
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchAssetNo')} name="assetNo">
            <Input placeholder={t('asset.searchAssetNoPh')} allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label={t('asset.colOpType')} name="opType">
            <Select placeholder={t('common.all')} allowClear options={opTypeOptions} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label={t('asset.colOperateTime')} name="operateTime">
            <DatePicker.RangePicker style={{ width: 240 }} />
          </Form.Item>
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 200 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區（只讀頁，無新增入口） ====== */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right" />
      </div>

      {/* ====== 流水表格（展開行顯示變更前後對比） ====== */}
      <Table<AssetLog>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1400 }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '4px 0' }}>{renderChange(record)}</div>
          ),
          rowExpandable: (record) => !!(
            record.fromUser || record.toUser
            || record.fromDepartment || record.toDepartment
            || record.fromLocation || record.toLocation
          ),
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </div>
  )
}
