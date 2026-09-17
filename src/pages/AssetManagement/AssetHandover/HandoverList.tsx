/**
 * 交接記錄列表
 *
 * - 展示離職/調崗批量交接記錄（交出人 → 接收人、資產數量、交接原因）
 * - 搜索區 Grid 三列精確查詢（交接單號/原使用人/目標使用人/交接時間/交接原因/經辦人）
 * - 列配置按鈕（useColumnConfig）控制列顯隱與順序，偏好存 localStorage
 * - 展開行查看本次交接的資產明細（編號 + 名稱）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { fetchHandoverList, cancelHandover, type HandoverRecord, type HandoverListParams } from '../../../api/eam'
import { fetchAssetList, type AssetItem } from '../../../api/asset'
import { fetchEmployees } from '../../../api/employee'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { REASON_META, type HandoverReason } from './handoverMeta'

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
  onViewDetail?: (id: number) => void
}

export default function HandoverList({ onAdd, onViewAsset, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<HandoverRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<HandoverListParams>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  /** 員工下拉選項（原使用人/目標使用人/經辦人，值為姓名，與後端存儲一致） */
  const [empOptions, setEmpOptions] = useState<{ value: string; label: string }[]>([])
  /** 資產 ID → 資產信息映射（用於展開行顯示交接明細） */
  const [assetMap, setAssetMap] = useState<Record<number, AssetItem>>({})

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

  // 一次性載入資產映射，避免展開行時逐條請求
  useEffect(() => {
    let alive = true
    fetchAssetList({ page: 1, size: 9999 })
      .then((res) => {
        if (!alive) return
        const map: Record<number, AssetItem> = {}
        ;(res.records || []).forEach((a) => { map[a.id] = a })
        setAssetMap(map)
      })
      .catch(() => { /* 展開行明細為輔助信息，失敗不阻塞列表 */ })
    return () => { alive = false }
  }, [])

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

  const handleSearch = () => {
    const v = form.getFieldsValue() as {
      handoverNo?: string
      fromUserName?: string
      toUserName?: string
      handoverDateRange?: [Dayjs, Dayjs] | null
      reason?: HandoverReason
      operatorName?: string
    }
    const range = v.handoverDateRange
    setFilters({
      handoverNo: v.handoverNo?.trim() || undefined,
      fromUserName: v.fromUserName || undefined,
      toUserName: v.toUserName || undefined,
      handoverDateStart: range?.[0]?.format('YYYY-MM-DD'),
      handoverDateEnd: range?.[1]?.format('YYYY-MM-DD'),
      reason: v.reason,
      operatorName: v.operatorName,
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
      { title: t('asset.colFromUser'), dataIndex: 'fromUserName' },
      { title: t('asset.colDepartment') + '(交出)', dataIndex: 'fromDepartment' },
      { title: t('asset.colToUser'), dataIndex: 'toUserName' },
      { title: t('asset.colDepartment') + '(接收)', dataIndex: 'toDepartment' },
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
          <div className="confirm-info-row"><span>交出人：</span><b>{record.fromUserName}</b></div>
          <div className="confirm-info-row"><span>接收人：</span><b>{record.toUserName}</b></div>
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
    { key: 'fromUser', title: t('asset.colFromUser') },
    { key: 'toUser', title: t('asset.colToUser') },
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
    {
      title: t('asset.colFromUser'), key: 'fromUser', width: 180,
      render: (_: unknown, r) => (
        <Space size={4}>
          <span>{r.fromUserName}</span>
          <span style={{ color: '#bfbfbf' }}>/</span>
          <span style={{ color: '#8c8c8c' }}>{r.fromDepartment}</span>
        </Space>
      ),
    },
    {
      title: t('asset.colToUser'), key: 'toUser', width: 180,
      render: (_: unknown, r) => (
        <Space size={4}>
          <Tag color="blue">{r.toUserName}</Tag>
          <span style={{ color: '#8c8c8c' }}>{r.toDepartment}</span>
        </Space>
      ),
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
        <Form
          form={form}
          layout="inline"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px 12px', alignItems: 'start' }}
        >
          <Form.Item label={t('asset.colHandoverNo')} name="handoverNo">
            <Input placeholder={t('asset.phHandoverNo')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colFromUser')} name="fromUserName">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={empOptions}
            />
          </Form.Item>
          <Form.Item label={t('asset.colToUser')} name="toUserName">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())}
              options={empOptions}
            />
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
        scroll={{ x: 1640 }}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.sectionAssetInfo')}</div>
              <Space size={6} wrap>
                {record.assetIds.map((id) => {
                  const asset = assetMap[id]
                  return (
                    <Tag
                      key={id}
                      color="geekblue"
                      style={{ cursor: asset ? 'pointer' : 'default', fontFamily: 'monospace' }}
                      onClick={() => { if (asset) onViewAsset(asset.assetNo) }}
                    >
                      {asset ? `${asset.assetNo} ${asset.assetName}` : `#${id}`}
                    </Tag>
                  )
                })}
              </Space>
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
