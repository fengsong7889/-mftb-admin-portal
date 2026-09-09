/**
 * 維修記錄全局列表
 *
 * - 展示所有資產的維修記錄（單號/資產/故障/維修方/費用/狀態）
 * - 支持按狀態、關鍵詞搜索
 * - 點擊資產編號跳轉資產詳情，點擊行跳轉維修詳情
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
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

  const columns: TableColumnsType<AssetRepairRecord> = [
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
    { title: t('asset.colRepairDate'), dataIndex: 'repairDate', key: 'repairDate', width: 120 },
    { title: t('asset.colFaultDesc'), dataIndex: 'faultDesc', key: 'faultDesc', width: 200, ellipsis: true },
    { title: t('asset.colRepairContent'), dataIndex: 'repairContent', key: 'repairContent', width: 200, ellipsis: true },
    { title: t('asset.colRepairBy'), dataIndex: 'repairBy', key: 'repairBy', width: 140 },
    {
      title: t('asset.colCost'), dataIndex: 'cost', key: 'cost', width: 120, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (s: 'repairing' | 'done') => s === 'repairing'
        ? <Tag color="processing">{t('asset.statusRepairing')}</Tag>
        : <Tag color="success">{t('asset.statusRepaired')}</Tag>,
    },
    {
      title: t('asset.colFinishDate'), dataIndex: 'finishDate', key: 'finishDate', width: 120,
      render: (v: string | null) => v || '-',
    },
    { title: t('asset.colApplicant'), dataIndex: 'applicant', key: 'applicant', width: 110 },
    {
      title: t('asset.colCauseType'), dataIndex: 'causeType', key: 'causeType', width: 120,
      render: (v: string) => v ? <Tag>{t(`asset.cause${v.charAt(0).toUpperCase() + v.slice(1)}`)}</Tag> : '-',
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
      <Table<AssetRepairRecord>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1600 }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.assetId),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
      />
    </>
  )
}
