/**
 * 交接記錄列表
 *
 * - 展示離職/調崗批量交接記錄（交出人 → 接收人、資產數量、交接原因）
 * - 搜索區 Grid 三列精確查詢（交接單號/原使用人/目標使用人/交接時間/交接原因/經辦人）
 * - 列配置按鈕（useColumnConfig）控制列顯隱與順序，偏好存 localStorage
 * - 展開行查看本次交接的資產明細（編號 + 名稱）
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker, TreeSelect, Alert } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { fetchHandoverList, fetchHandoverDetail, cancelHandover, type HandoverRecord, type HandoverListParams, type HandoverItem } from '../../../api/eam'
import { fetchAssetList, type AssetItem } from '../../../api/asset'
import AssetParameters from '../../../components/AssetParameters'
import { useAssetParameterCatalog } from '../../../hooks/useAssetParameterCatalog'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { fetchEmployees } from '../../../api/employee'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { buildDeptTree } from '../AssetClaim/claimViewTypes'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { REASON_META, type HandoverReason } from './handoverMeta'

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
  onViewDetail?: (id: number) => void
}

interface SearchValues {
  handoverNo?: string
  assetKeyword?: string
  fromUserName?: string
  fromDepartmentId?: number
  toUserName?: string
  toDepartmentId?: number
  handoverDateRange?: [Dayjs, Dayjs] | null
  reason?: HandoverReason
  operatorName?: string
  receiverType?: string
}

function HandoverAssets({ id, onViewAsset }: { id: number; onViewAsset: (assetNo: string) => void }) {
  const { t } = useTranslation()
  const catalog = useAssetParameterCatalog()
  const fetcher = useCallback(() => fetchHandoverDetail(id), [id])
  const { data, loading, error, refresh } = useTransferData(fetcher)
  return <>
    <TransferError error={error} retry={refresh} />
    <p className="asset-parameters__hint">{t('asset.handoverSnapshotHint')} {t('asset.currentParamsHint')}</p>
    <Table<HandoverItem> rowKey="assetId" size="small" scroll={{ x: 1260 }} pagination={false} loading={loading} dataSource={data?.items || []} columns={[
      { key: 'assetNo', title: t('asset.colAssetNo'), render: (_, item) => <Button type="link" onClick={() => onViewAsset(item.assetNo)}>{item.assetNo}</Button> },
      { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { key: 'params', title: t('asset.paramInfoTitle'), width: 240, render: (_, item) => <AssetParameters asset={item} compact catalog={catalog} /> },
      { key: 'fromUser', title: t('asset.handoverFromUser'), dataIndex: 'fromUser', width: 160, render: (v?: string) => v || '—' },
      { key: 'fromDept', title: t('asset.handoverFromDept'), dataIndex: 'fromDept', width: 160, render: (v?: string) => v || '—' },
      { key: 'toUser', title: t('asset.handoverToUser'), dataIndex: 'toUser', width: 160, render: (v?: string) => v || '—' },
      { key: 'toDept', title: t('asset.handoverToDept'), dataIndex: 'toDept', width: 160, render: (v?: string) => v || '—' },
    ]} />
  </>
}

export default function HandoverList({ onAdd, onViewAsset, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchValues>()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<HandoverRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<HandoverListParams>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  /** 員工下拉選項（原使用人/目標使用人/經辦人，值為姓名，與後端存儲一致） */
  const [empOptions, setEmpOptions] = useState<{ value: string; label: string }[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [departmentsFailed, setDepartmentsFailed] = useState(false)
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])

  useEffect(() => {
    let alive = true
    fetchDepartments().then(data => { if (alive) setDepartments(data) })
      .catch(() => { if (alive) setDepartmentsFailed(true) })
    return () => { alive = false }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchHandoverList({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  // 員工下拉選項一次性載入（在职狀態）
  useEffect(() => {
    let alive = true
    fetchEmployees({ page: 1, size: 999, employmentStatus: 'active' })
      .then((res) => {
        if (!alive) return
        setEmpOptions((res.records || []).map((e) => ({
          value: e.name,
          label: `${e.name}（${e.empId}）${e.department ? ' - ' + e.department : ''}`,
        })))
      })
      .catch(() => { /* 選項加載失敗不阻塞列表 */ })
    return () => { alive = false }
  }, [])

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

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const range = v.handoverDateRange
    setFilters({
      handoverNo: v.handoverNo?.trim() || undefined,
      assetKeyword: v.assetKeyword || undefined,
      fromUserName: v.fromUserName?.trim() || undefined,
      fromDepartment: departments.find(d => d.id === v.fromDepartmentId)?.name,
      toUserName: v.toUserName?.trim() || undefined,
      toDepartment: departments.find(d => d.id === v.toDepartmentId)?.name,
      handoverDateStart: range?.[0]?.format('YYYY-MM-DD'),
      handoverDateEnd: range?.[1]?.format('YYYY-MM-DD'),
      reason: v.reason,
      operatorName: v.operatorName,
      receiverType: v.receiverType || undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  /* ----- 导出 ----- */
  const handleExport = () => {
    const cols = [
      { title: t('asset.colHandoverNo'), dataIndex: 'handoverNo' },
      { title: t('asset.handoverFromUser'), dataIndex: 'fromUserName' },
      { title: t('asset.handoverFromDept'), dataIndex: 'fromDepartment' },
      { title: t('asset.handoverToUser'), dataIndex: 'toUserName' },
      { title: t('asset.handoverToDept'), dataIndex: 'toDepartment' },
      { title: t('asset.receiverType'), dataIndex: 'receiverType' },
      { title: t('asset.colHandoverDate'), dataIndex: 'handoverDate' },
      { title: t('asset.colAssetCount'), dataIndex: 'assetCount' },
      { title: t('asset.colHandoverReason'), dataIndex: 'reason' },
      { title: t('asset.colOperator'), dataIndex: 'operatorName' },
      { title: t('asset.colRemark'), dataIndex: 'remark' },
    ]
    exportToCSV(`${t('asset.colHandoverNo')}_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  /* ----- 取消交接 ----- */
  const handleCancel = (record: HandoverRecord) => {
    if (record.status === 'cancelled') { message.warning('該交接已取消'); return }
    Modal.confirm({
      title: '確認取消交接？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>交接單號：</span><b>{record.handoverNo}</b></div>
          <div className="confirm-info-row"><span>{t('asset.handoverFromUser')}：</span><b>{record.fromUserName}</b></div>
          <div className="confirm-info-row"><span>{t('asset.receiverType')}：</span><b>{t((record.receiverType || 'employee') === 'department' ? 'asset.receiverTypeDepartment' : 'asset.receiverTypeEmployee')}</b></div>
          {(record.receiverType || 'employee') !== 'department' && <div className="confirm-info-row"><span>{t('asset.handoverToUser')}：</span><b>{record.toUserName}</b></div>}
          <div className="confirm-info-row"><span>資產數量：</span><b>{record.assetCount}</b></div>
        </div>
      ),
      okText: '確認取消',
      cancelText: '返回',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await cancelHandover(record.id, '管理員撤銷交接')
          message.success('交接已取消')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '取消失敗')
        }
      },
    })
  }

  // 列配置元數據（顯隱/順序由用戶偏好控制）
  const columnMeta = useMemo(() => [
    { key: 'handoverNo', title: t('asset.colHandoverNo') },
    { key: 'fromUser', title: t('asset.handoverFromUser') },
    { key: 'fromDept', title: t('asset.handoverFromDept') },
    { key: 'toUser', title: t('asset.handoverToUser') },
    { key: 'toDept', title: t('asset.handoverToDept') },
    { key: 'receiverType', title: t('asset.receiverType') },
    { key: 'handoverDate', title: t('asset.colHandoverDate') },
    { key: 'assetCount', title: t('asset.colAssetCount') },
    { key: 'reason', title: t('asset.colHandoverReason') },
    { key: 'operator', title: t('asset.colOperator') },
    { key: 'createdAt', title: t('asset.colCreatedAt') },
    { key: 'remark', title: t('asset.colRemark') },
    { key: 'action', title: t('asset.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-handover-list', columnMeta, [
    { key: 'handoverNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<HandoverRecord> = [
    {
      title: t('asset.colHandoverNo'), dataIndex: 'handoverNo', key: 'handoverNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { title: t('asset.handoverFromUser'), key: 'fromUser', dataIndex: 'fromUserName', width: 160, render: (v?: string) => v || '—' },
    { title: t('asset.handoverFromDept'), key: 'fromDept', dataIndex: 'fromDepartment', width: 160, render: (v?: string) => v || '—' },
    { title: t('asset.handoverToUser'), key: 'toUser', dataIndex: 'toUserName', width: 160, render: (v?: string) => v || '—' },
    { title: t('asset.handoverToDept'), key: 'toDept', dataIndex: 'toDepartment', width: 160, render: (v?: string) => v || '—' },
    {
      title: t('asset.receiverType'), key: 'receiverType', dataIndex: 'receiverType', width: 100,
      render: (v?: string) => {
        const type = v || 'employee'
        return <Tag color={type === 'department' ? 'purple' : 'blue'}>{t(type === 'department' ? 'asset.receiverTypeDepartment' : 'asset.receiverTypeEmployee')}</Tag>
      },
    },
    { title: t('asset.colHandoverDate'), dataIndex: 'handoverDate', key: 'handoverDate', width: 120 },
    {
      title: t('asset.colAssetCount'), dataIndex: 'assetCount', key: 'assetCount', width: 100, align: 'right',
      render: (v: number) => <Tag color="geekblue">{v}</Tag>,
    },
    {
      title: t('asset.colHandoverReason'), dataIndex: 'reason', key: 'reason', width: 110,
      render: (v: HandoverReason) => <Tag color={REASON_META[v].color}>{t(REASON_META[v].key)}</Tag>,
    },
    { title: t('asset.colOperator'), dataIndex: 'operatorName', key: 'operator', width: 110 },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colAction'), key: 'action', width: 140, fixed: 'right',
      render: (_: unknown, record: HandoverRecord) => {
        const isCancelled = record.status === 'cancelled'
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button type="link" size="small"
              onClick={() => onViewDetail?.(record.id)}
              style={{ padding: '0 4px' }}
            >{t('common.detail')}</Button>
            {!isCancelled && (
              <>
                <span className="action-split" />
                <Button type="link" size="small" danger icon={<DeleteOutlined />}
                  onClick={() => handleCancel(record)}
                  style={{ padding: '0 4px' }}
                >{t('common.cancel')}</Button>
              </>
            )}
          </span>
        )
      },
    },
  ]

  return (
    <>
      {/* ====== 搜索區（Grid 三列精確查詢） ====== */}
      <div className="search-section">
        {departmentsFailed && <Alert type="warning" showIcon message={t('asset.handoverDepartmentsFailed')} style={{ marginBottom: 16 }} />}
        <Form<SearchValues>
          form={form}
          layout="inline"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 12px', alignItems: 'start' }}
        >
          <Form.Item label={t('asset.colHandoverNo')} name="handoverNo">
            <Input placeholder={t('asset.phHandoverNo')} allowClear />
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
          <Form.Item label={t('asset.handoverFromUser')} name="fromUserName">
            <Input placeholder={t('asset.handoverFromUserPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.handoverFromDept')} name="fromDepartmentId">
            <TreeSelect treeData={deptTree} treeDefaultExpandAll treeNodeFilterProp="title" showSearch allowClear
              disabled={departmentsFailed} placeholder={t('common.all')} />
          </Form.Item>
          <Form.Item label={t('asset.handoverToUser')} name="toUserName">
            <Input placeholder={t('asset.handoverToUserPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.handoverToDept')} name="toDepartmentId">
            <TreeSelect treeData={deptTree} treeDefaultExpandAll treeNodeFilterProp="title" showSearch allowClear
              disabled={departmentsFailed} placeholder={t('common.all')} />
          </Form.Item>
          <Form.Item label={t('asset.colHandoverDate')} name="handoverDateRange">
            <DatePicker.RangePicker style={{ width: '100%' }} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colHandoverReason')} name="reason">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={(Object.keys(REASON_META) as HandoverReason[]).map((k) => ({ label: t(REASON_META[k].key), value: k }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.colOperator')} name="operatorName">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={empOptions}
            />
          </Form.Item>
          <Form.Item label={t('asset.receiverType')} name="receiverType">
            <Select
              placeholder={t('common.all')}
              allowClear
              options={[
                { label: t('asset.receiverTypeEmployee'), value: 'employee' },
                { label: t('asset.receiverTypeDepartment'), value: 'department' },
              ]}
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

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={loading || !dataSource.length} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
              {t('asset.btnNewHandover')}
            </Button>
            {configComponent}
          </Space>
        </div>
      </div>

      {/* ====== 表格（展開行顯示交接資產明細） ====== */}
      <Table<HandoverRecord>
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1880 }}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.sectionAssetInfo')}</div>
              <HandoverAssets id={record.id} onViewAsset={onViewAsset} />
            </div>
          ),
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
