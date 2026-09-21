/**
 * 調撥記錄（只讀）
 *
 * 數據來源：後端調撥單 /eam/transfers（由資產調撥頁登記寫入，作廢單據 status='cancelled'）
 * 支持搜索條件：調撥單號 / 調撥日期 / 資產編號名稱（遠程下拉） / 原使用人 / 調入使用人 / 原歸屬部門 / 調入部門 / 狀態 / 經辦人
 */
import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import { Button, Empty, Form, Input, Select, Table, Tag, Space, DatePicker, TreeSelect, Tooltip, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import AssetParameters from '../../../components/AssetParameters'
import { useAssetParameterCatalog } from '../../../hooks/useAssetParameterCatalog'
import { fetchTransferList, fetchAssetList, type AssetItem, type TransferRecord, type TransferQuery, type TransferOptions } from '../../../api/asset'
import { useAuth } from '../../../contexts/AuthContext'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { buildTransferTree, positiveId, updateQuery, TRANSFER_STATUS, TRANSFER_MENU } from '../AssetTransfer/transferUtils'
import { exportToCSV } from '../../../utils/exportCSV'

interface Props {
  options?: TransferOptions
  onViewAsset: (id: number) => void
  onViewDetail: (id: number) => void
  onCancel: (id: number) => void
}
type FilterValues = Omit<TransferQuery, 'page' | 'size' | 'startDate' | 'endDate' | 'assetNo'> & { transferDate?: [Dayjs, Dayjs]; assetKeyword?: string }

/** 格式化使用人展示：姓名(工号) */
function formatUser(name: string | null | undefined, empId: string | null | undefined): string {
  if (!name) return '-'
  return empId ? `${name}(${empId})` : name
}

export default function TransferLogTab({ onViewAsset, onViewDetail, onCancel, options }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const { hasPermission } = useAuth()
  const [form] = Form.useForm<FilterValues>()
  const [params, setParams] = useSearchParams()
  const query = useMemo<TransferQuery>(() => ({
    transferNo: params.get('log.transferNo') || undefined,
    // 資產編號/名稱合併下拉：選中值為精確編號，統一走 assetNo 條件
    assetNo: params.get('log.assetKeyword') || undefined,
    brandId: positiveId(params.get('log.brandId')),
    fromUserName: params.get('log.fromUserName') || undefined, toUserName: params.get('log.toUserName') || undefined,
    fromDepartmentId: positiveId(params.get('log.fromDepartmentId')), toDepartmentId: positiveId(params.get('log.toDepartmentId')),
    status: params.get('log.status') === TRANSFER_STATUS.DONE ? TRANSFER_STATUS.DONE : params.get('log.status') === TRANSFER_STATUS.CANCELLED ? TRANSFER_STATUS.CANCELLED : undefined,
    operatorName: params.get('log.operatorName') || undefined,
    startDate: params.get('log.startDate') || undefined, endDate: params.get('log.endDate') || undefined,
    page: positiveId(params.get('log.page')) || 1, size: positiveId(params.get('log.size')) || 10,
  }), [params])
  const fetcher = useCallback(() => fetchTransferList(query), [query])
  const { data, loading, error, refresh } = useTransferData(fetcher)
  const deptTree = useMemo(() => buildTransferTree(options?.departments || []), [options])

  /* ----- 資產編號/名稱下拉搜索（遠程，300ms 防抖，與歸還/維修頁統一） ----- */
  const [assetOptions, setAssetOptions] = useState<AssetItem[]>([])
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const assetSearchTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const handleAssetSearch = useCallback((keyword: string) => {
    if (assetSearchTimerRef.current) clearTimeout(assetSearchTimerRef.current)
    if (!keyword) { setAssetOptions([]); return }
    assetSearchTimerRef.current = setTimeout(async () => {
      setAssetSearchLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 50 })
        setAssetOptions(res.records.filter((a) => a.status !== 'scrapped'))
      } catch {
        setAssetOptions([])
      } finally {
        setAssetSearchLoading(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    form.setFieldsValue({ ...query, assetKeyword: query.assetNo, transferDate: query.startDate && query.endDate && dayjs(query.startDate).isValid() && dayjs(query.endDate).isValid()
      ? [dayjs(query.startDate), dayjs(query.endDate)] : undefined })
  }, [query, form])
  const handleSearch = (v: FilterValues) => {
    setParams(updateQuery(params, 'log', {
      transferNo: v.transferNo?.trim(), assetKeyword: v.assetKeyword?.trim(), brandId: v.brandId,
      fromUserName: v.fromUserName?.trim(), toUserName: v.toUserName?.trim(),
      fromDepartmentId: v.fromDepartmentId, toDepartmentId: v.toDepartmentId,
      status: v.status, operatorName: v.operatorName?.trim(),
      startDate: v.transferDate?.[0]?.format('YYYY-MM-DD'), endDate: v.transferDate?.[1]?.format('YYYY-MM-DD'), page: 1, size: query.size,
    }), { replace: true })
    refresh()
  }
  const handleReset = () => { form.resetFields(); setParams(updateQuery(params, 'log', {}), { replace: true }); refresh() }
  const handleTableChange = (p: TablePaginationConfig) => {
    setParams(updateQuery(params, 'log', { ...query, page: p.pageSize !== query.size ? 1 : p.current || 1, size: p.pageSize || 10 }), { replace: true })
  }

  /* ----- 导出 ----- */
  const handleExport = () => {
    if (!data?.records?.length) { message.warning(t('common.noDataToExport')); return }
    const cols = [
      { title: t('asset.colTransferNo'), dataIndex: 'transferNo' },
      { title: t('asset.colTransferDate'), dataIndex: 'transferDate' },
      { title: t('asset.colAssetNo'), dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { title: t('transfer.brand'), dataIndex: 'brand' },
      { title: t('asset.colFromUser'), dataIndex: 'fromUserName', render: (_: unknown, r: TransferRecord) => formatUser(r.fromUserName, r.fromUserEmpId) },
      { title: t('asset.colTransferToUser'), dataIndex: 'toUserName', render: (_: unknown, r: TransferRecord) => formatUser(r.toUserName, r.toUserEmpId) },
      { title: t('asset.colFromDept'), dataIndex: 'fromDepartment' },
      { title: t('asset.colToDept'), dataIndex: 'toDepartment' },
      { title: t('asset.colTransferReason'), dataIndex: 'reason' },
      { title: t('asset.colStatus'), dataIndex: 'status' },
      { title: t('asset.colOperator'), dataIndex: 'operatorName' },
    ]
    exportToCSV(`${t('asset.transferLogFileName')}_${new Date().toISOString().slice(0, 10)}`, cols, data.records)
    message.success(t('common.exportSuccess'))
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
      render: (v: string, record) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace', fontWeight: 600 }}
          onClick={() => onViewAsset(record.assetId)}
        >
          {v}
        </Button>
      ),
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 190, ellipsis: true },
    { key: 'params', title: t('asset.paramInfoTitle'), width: 240, render: (_, asset) => <AssetParameters asset={asset} compact catalog={paramCatalog} /> },
    { key: 'brand', title: t('transfer.brand'), dataIndex: 'brand', width: 140,
      render: (value: string | null, record) => <Tooltip title={record.brandBackfilled ? t('transfer.brandBackfilled') : undefined}>{value || '—'}{record.brandBackfilled ? ' *' : ''}</Tooltip> },
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
      render: (v: TransferRecord['status']) => v === TRANSFER_STATUS.CANCELLED
        ? <Tag color="default">{t('asset.transferCancelled')}</Tag>
        : v === TRANSFER_STATUS.DONE ? <Tag color="success">{t('asset.transferDone')}</Tag> : t('transfer.unknown'),
    },
    { key: 'operatorName', title: t('asset.colOperator'), dataIndex: 'operatorName', width: 120 },
    {
      key: 'action', title: t('common.colAction'), width: 160, fixed: 'right',
      render: (_: unknown, r) => <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => onViewDetail(r.id)}>{t('common.detail')}</Button>
        {hasPermission(`${TRANSFER_MENU}:edit`) && r.status === TRANSFER_STATUS.DONE && <Tooltip title={r.cancelBlockedReason}>
          <span><Button type="link" danger size="small" disabled={!r.cancellable} onClick={() => onCancel(r.id)}>{t('transfer.cancelTransfer')}</Button></span>
        </Tooltip>}
      </Space>,
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'transferNo', title: t('asset.colTransferNo') },
    { key: 'transferDate', title: t('asset.colTransferDate') },
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'params', title: t('asset.paramInfoTitle') },
    { key: 'brand', title: t('transfer.brand') },
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

  const statusOptions = [
    { label: t('asset.transferDone'), value: TRANSFER_STATUS.DONE },
    { label: t('asset.transferCancelled'), value: TRANSFER_STATUS.CANCELLED },
  ]

  return (
    <>
      <TransferError error={error} retry={refresh} />
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item label={t('asset.searchTransferNo')} name="transferNo">
            <Input placeholder={t('asset.searchTransferNoPh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colTransferDate')} name="transferDate">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchAssetLabel')} name="assetKeyword">
            <Select
              placeholder={t('asset.searchAssetPh')}
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleAssetSearch}
              loading={assetSearchLoading}
              notFoundContent={assetSearchLoading ? t('common.searching', '搜索中...') : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />}
              options={assetOptions.map((a) => ({
                label: `${a.assetNo} - ${a.assetName}`,
                value: a.assetNo,
              }))}
            />
          </Form.Item>
          <Form.Item label={t('transfer.brand')} name="brandId">
            <Select allowClear showSearch optionFilterProp="label" placeholder={t('common.all')} disabled={!options}
              options={options?.brands.map(brand => ({ value: brand.id, label: brand.brandZh || brand.brandEn }))} />
          </Form.Item>
          <Form.Item label={t('asset.searchFromUserName')} name="fromUserName">
            <Input placeholder={t('asset.userNamePh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchToUserName')} name="toUserName">
            <Input placeholder={t('asset.userNamePh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchFromDept')} name="fromDepartmentId">
            <TreeSelect placeholder={t('common.all')} allowClear showSearch treeNodeFilterProp="title" treeData={deptTree} disabled={!options} />
          </Form.Item>
          <Form.Item label={t('asset.searchToDept')} name="toDepartmentId">
            <TreeSelect placeholder={t('common.all')} allowClear showSearch treeNodeFilterProp="title" treeData={deptTree} disabled={!options} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: '100%' }} options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('asset.searchOperator')} name="operatorName">
            <Input placeholder={t('asset.searchOperatorPh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={loading || !!error || !data?.records?.length} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<TransferRecord>
        columns={applyConfig(allColumns) as TableColumnsType<TransferRecord>}
        dataSource={data?.records || []}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1800 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} /> }}
        onChange={handleTableChange}
        pagination={{
          current: query.page, pageSize: query.size, total: data?.total || 0,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
      />
    </>
  )
}
