/**
 * 調撥記錄（只讀）
 *
 * 數據來源：後端調撥單 /eam/transfers（由資產調撥頁登記寫入，作廢單據 status='cancelled'）
 * 支持 10 項搜索條件：調撥單號 / 調撥日期 / 資產編號 / 資產名稱 / 原使用人 / 調入使用人 / 原歸屬部門 / 調入部門 / 狀態 / 經辦人
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, DatePicker } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { fetchTransferList, type TransferRecord } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

interface Props {
  onViewAsset: (assetNo: string) => void
  onViewDetail: (id: number) => void
}

/** 格式化使用人展示：姓名(工号) */
function formatUser(name: string | null | undefined, empId: string | null | undefined): string {
  if (!name) return '-'
  return empId ? `${name}(${empId})` : name
}

export default function TransferLogTab({ onViewAsset, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<TransferRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [filters, setFilters] = useState<Record<string, string | undefined>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchTransferList({ ...filters, page, size })
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
    setFilters({
      transferNo: v.transferNo?.trim() || undefined,
      assetNo: v.assetNo?.trim() || undefined,
      assetName: v.assetName?.trim() || undefined,
      fromUserName: v.fromUserName?.trim() || undefined,
      toUserName: v.toUserName?.trim() || undefined,
      fromDepartment: v.fromDepartment || undefined,
      toDepartment: v.toDepartment || undefined,
      status: v.status || undefined,
      operatorName: v.operatorName?.trim() || undefined,
      startDate: v.transferDate?.[0]?.format('YYYY-MM-DD'),
      endDate: v.transferDate?.[1]?.format('YYYY-MM-DD'),
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  /* ----- 表格列定義 ----- */
  const allColumns: TableColumnsType<TransferRecord> = [
    {
      key: 'transferNo', title: t('asset.colTransferNo'), dataIndex: 'transferNo', width: 170, fixed: 'left',
      render: (v: string, r) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace', fontWeight: 600 }}
          onClick={() => onViewDetail(r.id)}
        >
          {v}
        </Button>
      ),
    },
    { key: 'transferDate', title: t('asset.colTransferDate'), dataIndex: 'transferDate', width: 110 },
    {
      key: 'assetNo', title: t('asset.colAssetNo'), dataIndex: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace', fontWeight: 600 }}
          onClick={() => onViewAsset(v)}
        >
          {v}
        </Button>
      ),
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 190, ellipsis: true },
    {
      key: 'fromUserName', title: t('asset.colFromUser'), width: 150,
      render: (_: unknown, r) => formatUser(r.fromUserName, r.fromUserEmpId),
    },
    {
      key: 'toUserName', title: t('asset.colTransferToUser'), width: 150,
      render: (_: unknown, r) => formatUser(r.toUserName, r.toUserEmpId),
    },
    { key: 'fromDepartment', title: t('asset.colFromDept'), dataIndex: 'fromDepartment', width: 120, ellipsis: true },
    { key: 'toDepartment', title: t('asset.colToDept'), dataIndex: 'toDepartment', width: 120, ellipsis: true },
    { key: 'reason', title: t('asset.colTransferReason'), dataIndex: 'reason', ellipsis: true },
    {
      key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 100,
      render: (v: TransferRecord['status']) => v === 'cancelled'
        ? <Tag color="default">{t('asset.transferCancelled')}</Tag>
        : <Tag color="success">{t('asset.transferDone')}</Tag>,
    },
    { key: 'operatorName', title: t('asset.colOperator'), dataIndex: 'operatorName', width: 120 },
    {
      key: 'action', title: t('common.colAction'), width: 80, fixed: 'right',
      render: (_: unknown, r) => (
        <Button type="link" size="small" onClick={() => onViewDetail(r.id)}>{t('common.detail')}</Button>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'transferNo', title: t('asset.colTransferNo') },
    { key: 'transferDate', title: t('asset.colTransferDate') },
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'fromUserName', title: t('asset.colFromUser') },
    { key: 'toUserName', title: t('asset.colTransferToUser') },
    { key: 'fromDepartment', title: t('asset.colFromDept') },
    { key: 'toDepartment', title: t('asset.colToDept') },
    { key: 'reason', title: t('asset.colTransferReason') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'operatorName', title: t('asset.colOperator') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-transfer', columnMeta, [
    { key: 'transferNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  /* ----- 行選擇 ----- */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  const deptOptions = EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))
  const statusOptions = [
    { label: t('asset.transferDone'), value: 'done' },
    { label: t('asset.transferCancelled'), value: 'cancelled' },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchTransferNo')} name="transferNo">
            <Input placeholder={t('asset.searchTransferNoPh')} allowClear style={{ width: 170 }} />
          </Form.Item>
          <Form.Item label={t('asset.colTransferDate')} name="transferDate">
            <DatePicker.RangePicker style={{ width: 240 }} />
          </Form.Item>
          <Form.Item label={t('asset.colAssetNo')} name="assetNo">
            <Input placeholder={t('asset.searchAssetNoPh')} allowClear style={{ width: 150 }} />
          </Form.Item>
          <Form.Item label={t('asset.colAssetName')} name="assetName">
            <Input placeholder={t('asset.searchAssetNamePh')} allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label={t('asset.searchFromUserName')} name="fromUserName">
            <Input placeholder={t('asset.userNamePh')} allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label={t('asset.searchToUserName')} name="toUserName">
            <Input placeholder={t('asset.userNamePh')} allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label={t('asset.searchFromDept')} name="fromDepartment">
            <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={deptOptions} />
          </Form.Item>
          <Form.Item label={t('asset.searchToDept')} name="toDepartment">
            <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={deptOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: 120 }} options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('asset.searchOperator')} name="operatorName">
            <Input placeholder={t('asset.searchOperatorPh')} allowClear style={{ width: 140 }} />
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
      <Table<TransferRecord>
        columns={applyConfig(allColumns) as TableColumnsType<TransferRecord>}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1800 }}
        rowSelection={rowSelection}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onChange={handleTableChange}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
      />
    </>
  )
}
