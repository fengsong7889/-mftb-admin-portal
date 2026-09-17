/**
 * 維修記錄全局列表
 *
 * - 展示所有資產的維修記錄（單號/資產/故障/維修方/費用/狀態）
 * - 支持按狀態、關鍵詞搜索
 * - 點擊資產編號跳轉資產詳情，點擊行跳轉維修詳情
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { fetchRepairList, type AssetRepairRecord } from '../../../api/asset'

interface Props {
  onViewAsset: (assetNo: string) => void
  onViewDetail: (assetId: number) => void
}

export default function RepairList({ onViewAsset, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetRepairRecord[]>([])
  const [filters, setFilters] = useState<{ keyword?: string; status?: 'repairing' | 'done' }>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRepairList({ status: filters.status })
      let list = res
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase()
        list = list.filter(
          (r) =>
            r.assetNo.toLowerCase().includes(kw) ||
            r.assetName.toLowerCase().includes(kw) ||
            r.faultDesc.toLowerCase().includes(kw) ||
            r.repairBy.toLowerCase().includes(kw) ||
            r.applicant.toLowerCase().includes(kw),
        )
      }
      setDataSource(list)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword || undefined,
      status: v.status || undefined,
    })
  }
  const handleReset = () => { form.resetFields(); setFilters({}) }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.statusRepairing'), value: 'repairing' },
    { label: t('asset.statusRepaired'), value: 'done' },
  ]

  const allColumns: TableColumnsType<AssetRepairRecord> = [
    {
      key: 'assetNo', title: t('asset.colAssetNo'), dataIndex: 'assetNo', width: 140, fixed: 'left',
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={(e) => { e.stopPropagation(); onViewAsset(v) }}
        >
          {v}
        </Button>
      ),
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 180, ellipsis: true },
    { key: 'repairDate', title: t('asset.colRepairDate'), dataIndex: 'repairDate', width: 120 },
    { key: 'faultDesc', title: t('asset.colFaultDesc'), dataIndex: 'faultDesc', width: 200, ellipsis: true },
    { key: 'repairContent', title: t('asset.colRepairContent'), dataIndex: 'repairContent', width: 200, ellipsis: true },
    { key: 'repairBy', title: t('asset.colRepairBy'), dataIndex: 'repairBy', width: 140 },
    {
      key: 'cost', title: t('asset.colCost'), dataIndex: 'cost', width: 120, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 100,
      render: (s: 'repairing' | 'done') => s === 'repairing'
        ? <Tag color="processing">{t('asset.statusRepairing')}</Tag>
        : <Tag color="success">{t('asset.statusRepaired')}</Tag>,
    },
    {
      key: 'finishDate', title: t('asset.colFinishDate'), dataIndex: 'finishDate', width: 120,
      render: (v: string | null) => v || '-',
    },
    { key: 'applicant', title: t('asset.colApplicant'), dataIndex: 'applicant', width: 110 },
    {
      key: 'causeType', title: t('asset.colCauseType'), dataIndex: 'causeType', width: 120,
      render: (v: string) => v ? <Tag>{t(`asset.cause${v.charAt(0).toUpperCase() + v.slice(1)}`)}</Tag> : '-',
    },
    {
      key: 'action', title: t('common.colAction'), width: 100, fixed: 'right',
      render: (_: unknown, r: AssetRepairRecord) => (
        <Button type="link" onClick={() => onViewDetail(r.assetId)}>{t('common.detail')}</Button>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'repairDate', title: t('asset.colRepairDate') },
    { key: 'faultDesc', title: t('asset.colFaultDesc') },
    { key: 'repairContent', title: t('asset.colRepairContent') },
    { key: 'repairBy', title: t('asset.colRepairBy') },
    { key: 'cost', title: t('asset.colCost') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'finishDate', title: t('asset.colFinishDate') },
    { key: 'applicant', title: t('asset.colApplicant') },
    { key: 'causeType', title: t('asset.colCauseType') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-repair', columnMeta, [
    { key: 'assetNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  /* ----- 行选择 ----- */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

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

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Space>
            <Button icon={<ExportOutlined />} disabled={selectedRowKeys.length === 0}>
              {t('common.export')}
            </Button>
          </Space>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<AssetRepairRecord>
        columns={applyConfig(allColumns) as TableColumnsType<AssetRepairRecord>}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1700 }}
        rowSelection={rowSelection}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.assetId),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
      />
    </>
  )
}
