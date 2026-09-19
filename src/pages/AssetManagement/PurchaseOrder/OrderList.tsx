/**
 * 採購執行列表
 *
 * - Tab 統計：全部 / 待處理 / 採購中 / 採購完成
 * - 操作：詳情 / 編輯（回填供應商、價格、快遞單號等）/ 狀態推進（開始採購 / 完成採購）
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Select, Table, Modal, message, Space, Tabs, DatePicker, Tag } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import dayjs from 'dayjs'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

import {
  fetchPurchaseOrderList, deletePurchaseOrder,
  updatePurchaseOrderExec,
  type PurchaseOrder, type ExecStatus,
} from '../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import BrandTag from '../../../components/BrandTag'

const EXEC_STATUS_LIST: ExecStatus[] = ['pending', 'purchasing', 'completed']

const EXEC_META: Record<ExecStatus, { key: string; color: string }> = {
  pending:    { key: 'asset.execPending',    color: 'default' },
  purchasing: { key: 'asset.execPurchasing', color: 'processing' },
  completed:  { key: 'asset.execCompleted',  color: 'success' },
}

const INBOUND_META: Record<PurchaseOrder['status'], { key: string; color: string }> = {
  pending:  { key: 'asset.poPending',  color: 'processing' },
  partial:  { key: 'asset.poPartial',  color: 'warning' },
  received: { key: 'asset.poReceived', color: 'success' },
}

interface Props {
  onDetail: (id: number) => void
  onEdit: (id: number) => void
  onInbound: (poId: number) => void
}

export default function OrderList({ onDetail, onEdit, onInbound }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<PurchaseOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [activeTab, setActiveTab] = useState<ExecStatus | 'all'>('all')
  const [filters, setFilters] = useState<{
    poNo?: string; processNo?: string; supplier?: string; purchaser?: string;
    execStatus?: string; createdAtStart?: string; createdAtEnd?: string;
    updatedAtStart?: string; updatedAtEnd?: string;
  }>({})
  const [stats, setStats] = useState<Record<ExecStatus | 'all', number>>({
    all: 0, pending: 0, purchasing: 0, completed: 0,
  })

  // 員工姓名 → 部門 映射（用於列表展示服務部門）
  const [empDeptMap, setEmpDeptMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetchEmployees({ page: 1, size: 999, employmentStatus: 'active' })
      .then((res) => {
        const map = new Map<string, string>()
        ;(res.records || []).forEach((e) => {
          if (e.department) {
            map.set(e.name, e.department)
            map.set(e.empId, e.department)
          }
        })
        setEmpDeptMap(map)
      })
      .catch(() => {})
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Tab 統計：按狀態並行查 count（size=1 僅取 total），規避後端分頁上限並保證統計不被狀態篩選污染
      const baseFilters = { ...filters, execStatus: undefined }
      const [allRes, pendingRes, purchasingRes, completedRes] = await Promise.all([
        fetchPurchaseOrderList({ page: 1, size: 1, ...baseFilters }),
        fetchPurchaseOrderList({ page: 1, size: 1, ...baseFilters, execStatus: 'pending' }),
        fetchPurchaseOrderList({ page: 1, size: 1, ...baseFilters, execStatus: 'purchasing' }),
        fetchPurchaseOrderList({ page: 1, size: 1, ...baseFilters, execStatus: 'completed' }),
      ])
      setStats({
        all: allRes.total,
        pending: pendingRes.total,
        purchasing: purchasingRes.total,
        completed: completedRes.total,
      })

      // 選中具體狀態 Tab 時優先生效；「全部」Tab 下應用搜索表單的狀態篩選
      const execStatusFilter = activeTab !== 'all' ? activeTab : filters.execStatus
      const res = await fetchPurchaseOrderList({ page, size, ...filters, execStatus: execStatusFilter })
      setDataSource(res.records || [])
      setTotal(res.total || 0)

    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [activeTab, filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const [createdAtStart, createdAtEnd] = v.createdAtRange || []
    const [updatedAtStart, updatedAtEnd] = v.updatedAtRange || []
    setFilters({
      poNo: v.poNo || undefined,
      processNo: v.processNo || undefined,
      supplier: v.supplier || undefined,
      purchaser: v.purchaser || undefined,
      execStatus: v.execStatus || undefined,
      createdAtStart: createdAtStart?.format('YYYY-MM-DD') || undefined,
      createdAtEnd: createdAtEnd?.format('YYYY-MM-DD') || undefined,
      updatedAtStart: updatedAtStart?.format('YYYY-MM-DD') || undefined,
      updatedAtEnd: updatedAtEnd?.format('YYYY-MM-DD') || undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTabChange = (key: string) => { setActiveTab(key as ExecStatus | 'all'); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const handleDelete = (record: PurchaseOrder) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: record.poNo,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deletePurchaseOrder(record.id)
          message.success(t('common.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('common.deleteFailed'))
        }
      },
    })
  }

  /* ----- 開始採購彈窗 ----- */
  const [purchaserModalVisible, setPurchaserModalVisible] = useState(false)
  const [purchaserModalRecord, setPurchaserModalRecord] = useState<PurchaseOrder | null>(null)
  const [purchaserModalConfirmLoading, setPurchaserModalConfirmLoading] = useState(false)
  const [empOptions, setEmpOptions] = useState<{ value: string; label: string }[]>([])
  const [empSearchLoading, setEmpSearchLoading] = useState(false)
  const [selectedPurchaser, setSelectedPurchaser] = useState<string>('')
  const empSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 搜索員工（debounce 300ms） */
  const handleEmpSearch = useCallback((keyword: string) => {
    if (empSearchTimer.current) clearTimeout(empSearchTimer.current)
    if (!keyword) {
      setEmpOptions([])
      return
    }
    setEmpSearchLoading(true)
    empSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetchEmployees({ page: 1, size: 20, keyword })
        setEmpOptions(
          (res.records || []).map((e: EmployeeItem) => ({
            value: e.name,
            label: `${e.name}（${e.empId}）${e.department ? ' - ' + e.department : ''}`,
          })),
        )
      } catch {
        setEmpOptions([])
      } finally {
        setEmpSearchLoading(false)
      }
    }, 300)
  }, [])

  const handleStartPurchase = (record: PurchaseOrder) => {
    setPurchaserModalRecord(record)
    setSelectedPurchaser(user?.name || '')
    setPurchaserModalVisible(true)
  }

  const handlePurchaserModalOk = async () => {
    if (!selectedPurchaser || !purchaserModalRecord) {
      message.warning('請選擇採購經辦人')
      return
    }
    setPurchaserModalConfirmLoading(true)
    try {
      await updatePurchaseOrderExec(purchaserModalRecord.id, {
        execStatus: 'purchasing',
        purchaser: selectedPurchaser,
      })
      message.success(t('asset.startPurchaseSuccess'))
      setPurchaserModalVisible(false)
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setPurchaserModalConfirmLoading(false)
    }
  }

  const handleCompletePurchase = (record: PurchaseOrder) => {
    Modal.confirm({
      title: t('common.confirm'),
      content: t('asset.confirmCompletePurchase'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updatePurchaseOrderExec(record.id, { execStatus: 'completed' })
        message.success(t('asset.completePurchaseSuccess'))
        loadData()
      },
    })
  }

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'poNo', title: t('asset.colPoNo') },
    { key: 'brand', title: t('asset.orderBrand') },
    { key: 'reqId', title: t('asset.colReqNo') },
    { key: 'supplier', title: t('asset.colSupplier') },
    { key: 'confirmedAmount', title: t('asset.colConfirmedAmount') },
    { key: 'trackingNo', title: t('asset.colTrackingNo') },
    { key: 'purchaser', title: t('asset.colPurchaser') },
    { key: 'department', title: '服務部門' },
    { key: 'execStatus', title: t('asset.execStatus') },
    { key: 'inboundStatus', title: '入庫狀態' },
    { key: 'inboundProgress', title: t('asset.inboundTitle') },
    { key: 'createdAt', title: t('asset.colCreatedAt') },
    { key: 'updatedBy', title: t('asset.colUpdatedBy') },
    { key: 'updatedAt', title: t('asset.colUpdatedAt') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('purchase-order', columnMeta)

  const allColumns: TableColumnsType<PurchaseOrder> = [
    {
      title: t('asset.colPoNo'), dataIndex: 'poNo', key: 'poNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.orderBrand'), dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: number | undefined) => v ? <BrandTag value={v} /> : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('asset.colReqNo'), dataIndex: 'reqId', key: 'reqId', width: 130,
      render: (v: number, r: PurchaseOrder) => (v > 0 ? (r.reqNo || '-') : '-'),
    },
    { title: t('asset.colSupplier'), dataIndex: 'supplier', key: 'supplier', width: 160, ellipsis: true },
    {
      title: t('asset.colConfirmedAmount'), dataIndex: 'confirmedAmount', key: 'confirmedAmount', width: 130, align: 'right',
      render: (v: number | undefined, r: PurchaseOrder) => {
        const amt = v ?? r.amount
        return <span style={{ fontWeight: v ? 600 : 400, color: v ? '#52c41a' : undefined }}>MOP {amt.toLocaleString()}</span>
      },
    },
    { title: t('asset.colTrackingNo'), dataIndex: 'trackingNo', key: 'trackingNo', width: 140,
      render: (v: string | undefined) => v ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    { title: t('asset.colPurchaser'), dataIndex: 'purchaser', key: 'purchaser', width: 110,
      render: (v: string | undefined) => v || <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: '服務部門', key: 'department', width: 120,
      render: (_: unknown, r: PurchaseOrder) => {
        const dept = r.department || empDeptMap.get(r.purchaser || '') || ''
        return dept ? (
          <span style={{ whiteSpace: 'nowrap' }}>{dept}</span>
        ) : <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('asset.execStatus'), dataIndex: 'execStatus', key: 'execStatus', width: 100,
      render: (v: ExecStatus) => <Tag color={EXEC_META[v].color}>{t(EXEC_META[v].key)}</Tag>,
    },
    {
      title: '入庫狀態', dataIndex: 'status', key: 'inboundStatus', width: 100,
      render: (v: PurchaseOrder['status']) => {
        const meta = INBOUND_META[v] || INBOUND_META.pending
        return <Tag color={meta.color}>{t(meta.key)}</Tag>
      },
    },
    {
      title: t('asset.inboundTitle'), key: 'inboundProgress', width: 220,
      render: (_: unknown, r: PurchaseOrder) => {
        if (r.execStatus !== 'completed') return <span style={{ color: '#bfbfbf', fontSize: 12 }}>—</span>
        // 列表接口不返回明細，優先用後端 totalQty/acceptedQty 計算
        const totalQty = r.totalQty ?? (r.items || []).reduce((s, it) => s + it.qty, 0)
        const accepted = r.acceptedQty ?? (r.items || []).reduce((s, it) => s + it.receivedQty, 0)
        const pending = totalQty - accepted - (r.returnQty || 0) - (r.exchangeQty || 0) - (r.concessionQty || 0)
        const returnQty = r.returnQty || 0
        const exchangeQty = r.exchangeQty || 0
        const concessionQty = r.concessionQty || 0
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <Tag color="success" style={{ margin: 0, fontSize: 11 }}>{t('asset.acceptedReceipt')} {accepted}</Tag>
            {pending > 0 && <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('asset.pendingReceipt')} {pending}</Tag>}
            {returnQty > 0 && <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('asset.returnQty')} {returnQty}</Tag>}
            {exchangeQty > 0 && <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>{t('asset.exchangeQty')} {exchangeQty}</Tag>}
            {concessionQty > 0 && <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>{t('asset.concessionReceipt')} {concessionQty}</Tag>}
          </div>
        )
      },
    },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string | undefined) => v || <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    { title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 240, fixed: 'right',
      render: (_: unknown, record: PurchaseOrder) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>
            {t('common.detail')}
          </Button>
          {/* 狀態推進：待處理 →「開始採購」(採購中) →「完成採購」(已完成，可驗收) */}
          {record.execStatus === 'pending' && record.status !== 'received' && (
            <Button type="link" size="small" onClick={() => handleStartPurchase(record)}>
              {t('asset.btnStartPurchase')}
            </Button>
          )}
          {record.execStatus === 'purchasing' && record.status !== 'received' && (
            <Button type="link" size="small" onClick={() => handleCompletePurchase(record)}>
              {t('asset.btnCompletePurchase')}
            </Button>
          )}
          {record.execStatus !== 'completed' && record.status !== 'received' && (
            <Button type="link" size="small" onClick={() => onEdit(record.id)}>
              編輯
            </Button>
          )}
          {record.execStatus === 'completed' && record.status !== 'received' && (
            <Button type="link" size="small" onClick={() => onInbound(record.id)}>
              驗收
            </Button>
          )}
          {record.execStatus === 'pending' && (
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
              {t('common.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  const columns = useMemo(() => applyConfig(allColumns), [allColumns])

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.colPoNo')} name="poNo">
            <Input placeholder={t('asset.colPoNo')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colReqNo')} name="processNo">
            <Input placeholder={t('asset.colReqNo')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colSupplier')} name="supplier">
            <Input placeholder={t('asset.colSupplier')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colPurchaser')} name="purchaser">
            <Input placeholder={t('asset.colPurchaser')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.execStatus')} name="execStatus">
            <Select placeholder={t('common.all')} allowClear
              options={EXEC_STATUS_LIST.map((s) => ({ label: t(EXEC_META[s].key), value: s }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.createdAtRange')} name="createdAtRange">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item label={t('asset.updatedAtRange')} name="updatedAtRange">
            <DatePicker.RangePicker />
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/oa-purchase-request?from=purchase-order')}>
            {t('asset.purchaseReqTitle')}
          </Button>
          <Button icon={<ShoppingCartOutlined />} onClick={() => navigate('/purchase-order?mode=add')}>
            錄入訂單
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 執行狀態 Tab ====== */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'all',        label: `${t('asset.tabAllExec')}(${stats.all})` },
          { key: 'pending',    label: `${t('asset.execPending')}(${stats.pending})` },
          { key: 'purchasing', label: `${t('asset.execPurchasing')}(${stats.purchasing})` },
          { key: 'completed',  label: `${t('asset.execCompleted')}(${stats.completed})` },
        ]}
      />

      {/* ====== 表格 ====== */}
      <Table<PurchaseOrder>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 2410 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />

      {/* ====== 開始採購 - 選擇經辦人彈窗 ====== */}
      <Modal
        title="開始採購"
        open={purchaserModalVisible}
        onOk={handlePurchaserModalOk}
        onCancel={() => setPurchaserModalVisible(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={purchaserModalConfirmLoading}
        destroyOnHidden
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
          採購單號：<span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{purchaserModalRecord?.poNo}</span>
        </div>
        <Form layout="vertical">
          <Form.Item label="採購經辦人" required>
            <Select
              showSearch
              placeholder="請輸入員工姓名或工號搜索"
              value={selectedPurchaser || undefined}
              onChange={(v) => setSelectedPurchaser(v)}
              onSearch={handleEmpSearch}
              loading={empSearchLoading}
              filterOption={false}
              notFoundContent={empSearchLoading ? '搜索中...' : '輸入關鍵字搜索員工'}
              options={empOptions}
              style={{ width: '100%' }}
              allowClear
              onClear={() => setSelectedPurchaser('')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
