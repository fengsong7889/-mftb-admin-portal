/**
 * 採購執行編輯頁（多供應商分組版）
 *
 * - 全局信息：採購經辦人（搜索下拉）、服務部門（自動帶出）、執行狀態、備註
 * - 供應商分組卡片：收貨方式、預計收貨日期、快遞單號（條件顯示）
 * - 明細表格列與錄入頁對齊：分類、品牌、資產名稱、參數、數量、採購形式、參考單價、成交單價、小計
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, InputNumber, DatePicker, Row, Col, Table, Tag, Space, Spin, Select, message, Modal,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchPurchaseOrderDetail, updatePurchaseOrderExec,
  type PurchaseOrder, type ExecStatus, type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
} from '../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'

interface Props {
  id: number
  onBack: () => void
  onSaved: () => void
}

const EXEC_STATUS_OPTIONS: { value: ExecStatus; label: string; color: string }[] = [
  { value: 'pending', label: '待處理', color: 'default' },
  { value: 'purchasing', label: '採購中', color: 'processing' },
  { value: 'completed', label: '已完成', color: 'success' },
]

type DeliveryMethod = 'self_pickup' | 'supplier_delivery' | 'express'

interface GlobalFormValues {
  purchaser: string
  department: string
  execStatus: ExecStatus
  remark: string
}

export default function OrderEdit({ id, onBack, onSaved }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<GlobalFormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [supplierGroups, setSupplierGroups] = useState<PurchaseOrderSupplierGroup[]>([])

  // 員工搜索
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const o = await fetchPurchaseOrderDetail(id)
      setOrder(o)
      form.setFieldsValue({
        purchaser: o.purchaser || '',
        department: o.department || '',
        execStatus: o.execStatus,
        remark: o.remark || '',
      })
      // 初始化供應商分組
      if (o.supplierGroups && o.supplierGroups.length > 0) {
        setSupplierGroups(o.supplierGroups)
      } else {
        setSupplierGroups([{
          id: 'sg_default',
          supplier: o.supplier || '',
          contact: o.contact || '',
          orderDate: o.orderDate || '',
          trackingNo: o.trackingNo || '',
          items: o.items.map((it) => ({ ...it })),
        }])
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, form, t])

  useEffect(() => { loadData() }, [loadData])

  // 員工搜索
  const handleEmpSearch = useCallback((keyword: string) => {
    setEmpLoading(true)
    fetchEmployees({ page: 1, size: 30, keyword: keyword || undefined, employmentStatus: 'active' })
      .then((res) => setEmployees(res.records || []))
      .catch(() => {})
      .finally(() => setEmpLoading(false))
  }, [])

  useEffect(() => { handleEmpSearch('') }, [handleEmpSearch])

  const handleEmpChange = (empId: string) => {
    const emp = employees.find((e) => e.empId === empId)
    setSelectedEmp(emp || null)
    form.setFieldsValue({ department: emp?.department || '' })
  }

  /* ----- 供應商分組操作 ----- */
  const handleAddGroup = () => {
    setSupplierGroups((prev) => [
      ...prev,
      { id: `sg_${Date.now()}`, supplier: '', items: [] },
    ])
  }

  const handleRemoveGroup = (groupId: string) => {
    Modal.confirm({
      title: '確認刪除',
      content: '確定刪除此分組及其所有明細？',
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => setSupplierGroups((prev) => prev.filter((g) => g.id !== groupId)),
    })
  }

  const updateGroup = (groupId: string, patch: Partial<PurchaseOrderSupplierGroup>) => {
    setSupplierGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)))
  }

  const updateGroupItem = (groupId: string, rowKey: string, patch: Partial<PurchaseOrderItem>) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return { ...g, items: g.items.map((it) => (it.key === rowKey ? { ...it, ...patch } : it)) }
    }))
  }

  const groupSubtotal = (group: PurchaseOrderSupplierGroup) =>
    group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)

  const grandTotal = supplierGroups.reduce((s, g) => s + groupSubtotal(g), 0)

  /** 根據收貨方式判斷字段顯示 */
  const showReceiveDate = (dm?: DeliveryMethod) => dm === 'supplier_delivery' || dm === 'express'
  const showTrackingNo = (dm?: DeliveryMethod) => dm === 'express'

  /* ----- 明細表格列（與 OrderAdd 對齊） ----- */
  const itemColumns = useCallback((groupId: string): TableColumnsType<PurchaseOrderItem> => [
    { title: '分類', dataIndex: 'categoryName', key: 'categoryName', width: 100, ellipsis: true,
      render: (v: string | undefined) => v || '-' },
    { title: '品牌', dataIndex: 'brandName', key: 'brandName', width: 100, ellipsis: true,
      render: (v: string | undefined) => v || '-' },
    { title: '資產名稱', dataIndex: 'modelName', key: 'modelName', width: 160, ellipsis: true },
    {
      title: '參數', key: 'params', width: 130, ellipsis: true,
      render: (_: unknown, r: PurchaseOrderItem) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        const entries = Object.entries(r.params).filter(([, v]) => v)
        if (entries.length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        return <span style={{ fontSize: 12, color: '#595959' }}>{entries.map(([k, v]) => `${k}:${v}`).join(' / ')}</span>
      },
    },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
    {
      title: '採購形式', key: 'purchaseType', width: 80,
      render: (_: unknown, r: PurchaseOrderItem) => r.purchaseType
        ? <Tag color={r.purchaseType === 'purchase' ? 'blue' : 'green'}>{r.purchaseType === 'purchase' ? '購買' : '租賃'}</Tag>
        : '-',
    },
    {
      title: '參考單價', key: 'price', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>{r.price ? `MOP ${r.price.toLocaleString()}` : '-'}</span>
      ),
    },
    {
      title: '成交單價', key: 'confirmedPrice', width: 130,
      render: (_: unknown, r: PurchaseOrderItem) => (
        <InputNumber
          value={r.confirmedPrice}
          onChange={(v) => updateGroupItem(groupId, r.key!, { confirmedPrice: v ?? undefined })}
          style={{ width: '100%' }}
          min={0}
          precision={2}
          placeholder="成交價"
          addonBefore="MOP"
          size="small"
        />
      ),
    },
    {
      title: '小計', key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP ${(cp * r.qty).toLocaleString()}</span>
      },
    },
  ], [])

  /* ----- 提交 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const emptyGroups = supplierGroups.filter((g) => !g.supplier.trim())
      if (emptyGroups.length > 0) { message.warning('請填寫所有分組的名稱'); return }
      setSubmitting(true)

      await updatePurchaseOrderExec(id, {
        purchaser: v.purchaser.trim() || undefined,
        department: v.department?.trim() || undefined,
        execStatus: v.execStatus,
        remark: v.remark?.trim() || undefined,
        supplierGroups: supplierGroups.map((g) => ({
          ...g,
          supplier: g.supplier.trim(),
          contact: g.contact?.trim() || undefined,
          orderDate: g.orderDate || undefined,
          trackingNo: g.trackingNo?.trim() || undefined,
        })),
      })

      message.success(t('asset.saveExecSuccess'))
      onSaved()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !order) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 頁面頭部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>編輯採購訂單</h2>
          <Tag color="orange" style={{ marginLeft: 4 }}>{order.poNo}</Tag>
        </div>
      </div>

      <Form<GlobalFormValues> form={form} layout="vertical">
        {/* ====== 訂單信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>訂單信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label="採購經辦人" name="purchaser" rules={[{ required: true, message: '請選擇採購經辦人' }]}>
                <Select
                  showSearch
                  placeholder="輸入姓名/工號搜索"
                  loading={empLoading}
                  filterOption={false}
                  onSearch={handleEmpSearch}
                  onChange={handleEmpChange}
                  notFoundContent={empLoading ? <Spin size="small" /> : '暫無數據'}
                  options={employees.map((e) => ({
                    value: e.empId,
                    label: `${e.name}（${e.empId}）${e.department ? ` · ${e.department}` : ''}`,
                  }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="服務部門" name="department">
                <Input disabled placeholder="選擇經辦人後自動帶出" style={{ color: '#262626' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.execStatus')} name="execStatus" rules={[{ required: true, message: '請選擇執行狀態' }]}>
                <Select disabled options={EXEC_STATUS_OPTIONS.map((o) => ({
                  value: o.value,
                  label: <Tag color={o.color}>{o.label}</Tag>,
                }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={16}>
              <Form.Item label="採購事由" name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={300} showCount style={{ resize: 'none' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>訂單總計</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {grandTotal.toLocaleString()}</div>
            </Col>
          </Row>
        </div>

        {/* ====== 採購物資分組 ====== */}
        {supplierGroups.map((group, gi) => {
          const subtotal = groupSubtotal(group)
          const dm = group.deliveryMethod as DeliveryMethod | undefined
          return (
            <div key={group.id} style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {/* 分組標題 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                  }}>{gi + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>採購物資</span>
                  <Tag color="blue" style={{ fontSize: 11 }}>小計：MOP {subtotal.toLocaleString()}</Tag>
                </div>
                {supplierGroups.length > 1 && (
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveGroup(group.id)}>
                    刪除此分組
                  </Button>
                )}
              </div>

              {/* 供應商信息 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Form.Item label="供應商名稱" required style={{ marginBottom: 0 }}>
                    <Input value={group.supplier} onChange={(e) => updateGroup(group.id, { supplier: e.target.value })}
                      placeholder="請輸入供應商名稱" allowClear />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="供應商聯絡人" style={{ marginBottom: 0 }}>
                    <Input value={group.contact} onChange={(e) => updateGroup(group.id, { contact: e.target.value })}
                      placeholder="請輸入供應商聯絡人" allowClear />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="下單日期" style={{ marginBottom: 0 }}>
                    <DatePicker value={group.orderDate ? dayjs(group.orderDate) : null}
                      onChange={(d: Dayjs | null) => updateGroup(group.id, { orderDate: d?.format('YYYY-MM-DD') || '' })}
                      style={{ width: '100%' }} placeholder="請選擇下單日期" />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="收貨方式" required style={{ marginBottom: 0 }}>
                    <Select value={group.deliveryMethod}
                      onChange={(v: DeliveryMethod) => updateGroup(group.id, { deliveryMethod: v })}
                      placeholder="請選擇收貨方式" allowClear
                      options={[
                        { label: '自取', value: 'self_pickup' },
                        { label: '供應商送貨上門', value: 'supplier_delivery' },
                        { label: '快遞發貨', value: 'express' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* 條件字段 */}
              {(showReceiveDate(dm) || showTrackingNo(dm)) && (
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {showReceiveDate(dm) && (
                    <Col span={6}>
                      <Form.Item label="預計收貨日期" style={{ marginBottom: 0 }}>
                        <DatePicker
                          value={group.expectedReceiveDate ? dayjs(group.expectedReceiveDate) : null}
                          onChange={(d: Dayjs | null) => updateGroup(group.id, { expectedReceiveDate: d?.format('YYYY-MM-DD') || '' })}
                          style={{ width: '100%' }} placeholder="請選擇預計收貨日期"
                        />
                      </Form.Item>
                    </Col>
                  )}
                  {showTrackingNo(dm) && (
                    <Col span={6}>
                      <Form.Item label="快遞單號" style={{ marginBottom: 0 }}>
                        <Input value={group.trackingNo}
                          onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                          placeholder="請輸入快遞單號" allowClear style={{ fontFamily: 'monospace' }} />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}

              {/* 明細表格 */}
              {group.items.length > 0 ? (
                <Table<PurchaseOrderItem>
                  columns={itemColumns(group.id)}
                  dataSource={group.items}
                  rowKey={(r) => r.key || r.modelId?.toString() || Math.random().toString()}
                  size="small"
                  pagination={false}
                  scroll={{ x: 1100 }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#bfbfbf', padding: '24px 0', fontSize: 13 }}>
                  暫無明細
                </div>
              )}
            </div>
          )
        })}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup} style={{ width: '100%', marginBottom: 16, height: 40 }}>
          + 新增供應商分組
        </Button>
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
