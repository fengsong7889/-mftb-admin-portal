/**
 * 待調撥資產（在用資產列表）
 *
 * 調撥操作入口：行操作「調撥」跳轉現有獨立頁 /asset-transfer?id=
 * 僅「在用」資產可調撥（閒置資產請走領用/借用流程）
 */
import { useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Form, Input, Select, Table, Tag, Space, TreeSelect, Tooltip, Empty, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchTransferCandidates, type AssetItem, type AssetListQuery, type TransferOptions } from '../../../api/asset'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { buildTransferTree, positiveId, updateQuery, HOLD_TYPE, TRANSFER_MENU } from '../AssetTransfer/transferUtils'
import { exportToCSV } from '../../../utils/exportCSV'
import AssetParameters from '../../../components/AssetParameters'
import BrandTag from '../../../components/BrandTag'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import { useAssetParameterCatalog } from '../../../hooks/useAssetParameterCatalog'

type CandidateQuery = Pick<AssetListQuery, 'assetNo' | 'assetName' | 'categoryId' | 'brandId' | 'departmentId' | 'userName' | 'holdType' | 'companyBrand' | 'page' | 'size'>

interface Props {
  options?: TransferOptions
  onTransfer: (assetId: number) => void
  onDetail: (assetId: number) => void
}

export default function TransferableTab({ onTransfer, onDetail, options }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const { numericOptions } = useCompanyBrand()
  const { hasPermission } = useAuth()
  const [form] = Form.useForm<AssetListQuery>()
  const [params, setParams] = useSearchParams()
  const query = useMemo<CandidateQuery>(() => ({
    assetNo: params.get('assets.assetNo') || undefined,
    assetName: params.get('assets.assetName') || undefined,
    categoryId: positiveId(params.get('assets.categoryId')),
    brandId: positiveId(params.get('assets.brandId')),
    userName: params.get('assets.userName') || undefined,
    departmentId: positiveId(params.get('assets.departmentId')),
    holdType: params.get('assets.holdType') === HOLD_TYPE.OWNED ? HOLD_TYPE.OWNED : params.get('assets.holdType') === HOLD_TYPE.BORROWED ? HOLD_TYPE.BORROWED : undefined,
    companyBrand: positiveId(params.get('assets.companyBrand')) || undefined,
    page: positiveId(params.get('assets.page')) || 1,
    size: positiveId(params.get('assets.size')) || 10,
  }), [params])
  const fetcher = useCallback(() => fetchTransferCandidates(query), [query])
  const { data, loading, error, refresh } = useTransferData(fetcher)
  useEffect(() => { form.setFieldsValue(query) }, [query, form])
  const deptTree = useMemo(() => buildTransferTree(options?.departments || []), [options])
  const categoryTree = useMemo(() => buildTransferTree(options?.categories || []), [options])
  const handleSearch = (values: AssetListQuery) => {
    setParams(updateQuery(params, 'assets', {
      assetNo: values.assetNo?.trim(), assetName: values.assetName?.trim(), categoryId: values.categoryId,
      brandId: values.brandId, userName: values.userName?.trim(), departmentId: values.departmentId,
      holdType: values.holdType, companyBrand: values.companyBrand, page: 1, size: query.size,
    }), { replace: true })
    refresh()
  }
  const handleReset = () => { form.resetFields(); setParams(updateQuery(params, 'assets', {}), { replace: true }); refresh() }
  const handleTableChange = (p: TablePaginationConfig) => {
    setParams(updateQuery(params, 'assets', { ...query, page: p.pageSize !== query.size ? 1 : p.current || 1, size: p.pageSize || 10 }), { replace: true })
  }

  /* ----- 导出 ----- */
  const handleExport = () => {
    if (!data?.records?.length) { message.warning(t('common.noDataToExport')); return }
    const cols = [
      { title: t('asset.colAssetNo'), dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { title: t('asset.colCompanyBrand'), dataIndex: 'companyBrand', render: (v: number | null | undefined) => v === 1 ? '闪蜂' : v === 2 ? 'mFood' : '' },
      { title: t('asset.colAssetType'), dataIndex: 'assetType' },
      { title: t('transfer.brand'), dataIndex: 'brand' },
      { title: t('asset.colUserName'), dataIndex: 'userName' },
      { title: t('asset.colDepartment'), dataIndex: 'department' },
      { title: t('asset.colLocationName'), dataIndex: 'location' },
      { title: t('asset.colHoldType'), dataIndex: 'holdType' },
      { title: t('transfer.claimDate'), dataIndex: 'claimDate' },
    ]
    exportToCSV(`${t('asset.transferableFileName')}_${new Date().toISOString().slice(0, 10)}`, cols, data.records)
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<AssetItem> = [
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    {
      title: t('asset.colCompanyBrand'), dataIndex: 'companyBrand', key: 'companyBrand', width: 100,
      render: (v: number | null | undefined) => v ? <BrandTag value={v} /> : '-',
    },
    { title: t('asset.paramInfoTitle'), key: 'params', width: 240, render: (_, asset) => <AssetParameters asset={asset} compact catalog={paramCatalog} /> },
    { title: t('asset.colAssetType'), dataIndex: 'assetType', key: 'assetType', width: 110 },
    { title: t('transfer.brand'), dataIndex: 'brand', key: 'brand', width: 120, render: (value?: string) => value || '—' },
    { title: t('asset.colUserName'), dataIndex: 'userName', key: 'userName', width: 130 },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 110 },
    { title: t('asset.colLocationName'), dataIndex: 'location', key: 'location', width: 170, ellipsis: true },
    {
      title: t('asset.colHoldType'), dataIndex: 'holdType', key: 'holdType', width: 110,
      render: (v?: AssetItem['holdType']) => v === HOLD_TYPE.BORROWED
        ? <Tag color="orange">{t('asset.holdBorrowed')}</Tag>
        : v === HOLD_TYPE.OWNED ? <Tag color="blue">{t('asset.holdOwned')}</Tag> : t('transfer.unknown'),
    },
    { title: t('transfer.claimDate'), dataIndex: 'claimDate', key: 'claimDate', width: 120, render: (v?: string | null) => v || '—' },
    {
      title: t('common.colAction'), key: 'action', width: 150, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>
            {t('common.detail')}
          </Button>
          {hasPermission(`${TRANSFER_MENU}:edit`) && <Tooltip title={record.transferBlockedReason}>
            <span><Button type="link" size="small" disabled={!record.transferable} onClick={() => onTransfer(record.id)}>
              {t('asset.btnGoTransfer')}
            </Button></span>
          </Tooltip>}
        </Space>
      ),
    },
  ]

  const columnMeta = columns.map(column => ({ key: String(column.key), title: String(column.title) }))
  const { configComponent, applyConfig } = useColumnConfig('asset-transferable', columnMeta, [{ key: 'assetNo', locked: 'head' }, { key: 'action', locked: 'tail' }])

  return (
    <>
      <TransferError error={error} retry={refresh} />
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item label={t('asset.colAssetNo')} name="assetNo"><Input allowClear style={{ width: '100%' }} placeholder={t('asset.searchAssetNoPh')} /></Form.Item>
          <Form.Item label={t('asset.colAssetName')} name="assetName"><Input allowClear style={{ width: '100%' }} placeholder={t('asset.searchAssetNamePh')} /></Form.Item>
          <Form.Item label={t('transfer.category')} name="categoryId"><TreeSelect treeData={categoryTree} showSearch treeNodeFilterProp="title" allowClear placeholder={t('common.all')} disabled={!options} /></Form.Item>
          <Form.Item label={t('transfer.brand')} name="brandId"><Select allowClear showSearch optionFilterProp="label" placeholder={t('common.all')} disabled={!options} options={options?.brands.map(b => ({ value: b.id, label: b.brandZh || b.brandEn }))} /></Form.Item>
          <Form.Item label={t('asset.colUserName')} name="userName"><Input allowClear style={{ width: '100%' }} placeholder={t('asset.userNamePh')} /></Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="departmentId"><TreeSelect treeData={deptTree} showSearch treeNodeFilterProp="title" allowClear placeholder={t('common.all')} disabled={!options} /></Form.Item>
          <Form.Item label={t('asset.colHoldType')} name="holdType"><Select allowClear placeholder={t('common.all')} options={[
            { value: HOLD_TYPE.OWNED, label: t('asset.holdOwned') }, { value: HOLD_TYPE.BORROWED, label: t('asset.holdBorrowed') },
          ]} /></Form.Item>
          <Form.Item label={t('asset.colCompanyBrand')} name="companyBrand"><Select allowClear placeholder={t('common.all')} options={numericOptions} /></Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 表格 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={loading || !!error || !data?.records?.length} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>
      <Table<AssetItem>
        columns={applyConfig(columns) as TableColumnsType<AssetItem>}
        dataSource={data?.records || []}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1500 }}
        pagination={{
          current: query.page, pageSize: query.size, total: data?.total || 0, showSizeChanger: true, showQuickJumper: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} /> }}
      />
    </>
  )
}
