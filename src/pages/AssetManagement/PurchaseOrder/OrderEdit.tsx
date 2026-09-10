/**
 * 採購執行編輯頁（多供應商分組版）
 *
 * - 全局信息：採購經辦人、執行狀態、備註
 * - 供應商分組卡片：每個供應商獨立管理聯絡人、下單日期、快遞單號及明細成交價
 * - 支持新增/刪除供應商分組
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

interface Props {
  id: number
  onBack: () => void
  onSaved: () => void
}

const EXEC_STATUS_OPTIONS: { value: ExecStatus; label: string; color: string }[] = [
  { value: 'pending', label: '待處理', color: 'default' },
  { value: 'purchasing', label: '採購中', color: 'processing' },
  { value: 'completed', label: '採購完成', color: 'success' },
]

interface GlobalFormValues {
  purchaser: string
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

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const o = await fetchPurchaseOrderDetail(id)
      setOrder(o)
      form.setFieldsValue({
        purchaser: o.purchaser || '',
        execStatus: o.execStatus,
        remark: o.remark || '',
      })
      // 初始化供應商分組：優先使用 supplierGroups，否則從頂層數據構建單一分組
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
      content: '確定刪除此供應商分組及其所有明細？',
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        setSupplierGroups((prev) => prev.filter((g) => g.id !== groupId))
      },
    })
  }

  const updateGroup = (groupId: string, patch: Partial<PurchaseOrderSupplierGroup>) => {
    setSupplierGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)))
  }

  const updateGroupItem = (groupId: string, modelId: number, patch: Partial<PurchaseOrderItem>) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return {
        ...g,
        items: g.items.map((it) => (it.modelId === modelId ? { ...it, ...patch } : it)),
      }
    }))
  }

  /** 計算分組小計 */
  const groupSubtotal = (group: PurchaseOrderSupplierGroup) =>
    group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)

  /** 計算總計 */
  const grandTotal = supplierGroups.reduce((s, g) => s + groupSubtotal(g), 0)

  /* ----- 明細表格列 ----- */
  const itemColumns = useCallback((groupId: string): TableColumnsType<PurchaseOrderItem> => [
    { title: '品牌型號', dataIndex: 'modelName', key: 'modelName', ellipsis: true },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
    {
      title: '參考單價', dataIndex: 'price', key: 'price', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#8c8c8c' }}>MOP {v.toLocaleString()}</span>,
    },
    {
      title: '成交單價', key: 'confirmedPrice', width: 160,
      render: (_: unknown, r: PurchaseOrderItem) => (
        <InputNumber
          value={r.confirmedPrice}
          onChange={(v) => updateGroupItem(groupId, r.modelId, { confirmedPrice: v ?? undefined })}
          style={{ width: '100%' }}
          min={0}
          precision={2}
          placeholder="成交價"
          addonBefore="MOP"
        />
      ),
    },
    {
      title: '小計', key: 'subtotal', width: 130, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
      },
    },
  ], [])

  /* ----- 提交 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      // 校驗每個供應商分組都有名稱
      const emptyGroups = supplierGroups.filter((g) => !g.supplier.trim())
      if (emptyGroups.length > 0) {
        message.warning('請填寫所有供應商分組的名稱')
        return
      }
      setSubmitting(true)

      await updatePurchaseOrderExec(id, {
        purchaser: v.purchaser.trim() || undefined,
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
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {t('asset.editExecTitle')}
          </h2>
          <Tag color="orange" style={{ marginLeft: 4 }}>{order.poNo}</Tag>
        </div>
      </div>

      <Form<GlobalFormValues> form={form} layout="vertical">
        {/* ====== 全局信息 ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionExecInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colPurchaser')} name="purchaser"
                rules={[{ required: true, message: t('asset.purchaserRequired') }]}>
                <Input placeholder={t('asset.purchaserRequired')} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.execStatus')} name="execStatus"
                rules={[{ required: true, message: '請選擇執行狀態' }]}>
                <Select
                  options={EXEC_STATUS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: <Tag color={o.color}>{o.label}</Tag>,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={1} placeholder={t('asset.remarkPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ====== 供應商分組 ====== */}
        {supplierGroups.map((group, gi) => {
          const subtotal = groupSubtotal(group)
          return (
            <div key={group.id} style={{
              border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
              padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              {/* 分組標題行 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag color="blue" style={{ fontSize: 13, fontWeight: 600 }}>供應商 {gi + 1}</Tag>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{group.supplier || '未命名供應商'}</span>
                  <Tag color="green">MOP {subtotal.toLocaleString()}</Tag>
                </div>
                {supplierGroups.length > 1 && (
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => handleRemoveGroup(group.id)}>
                    刪除此供應商
                  </Button>
                )}
              </div>

              {/* 分組信息行 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Form.Item label="供應商名稱" required
                    style={{ marginBottom: 0 }}>
                    <Input
                      value={group.supplier}
                      onChange={(e) => updateGroup(group.id, { supplier: e.target.value })}
                      placeholder="請輸入供應商名稱"
                      allowClear
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="聯絡人" style={{ marginBottom: 0 }}>
                    <Input
                      value={group.contact}
                      onChange={(e) => updateGroup(group.id, { contact: e.target.value })}
                      placeholder="聯絡人及電話"
                      allowClear
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="下單日期" style={{ marginBottom: 0 }}>
                    <DatePicker
                      value={group.orderDate ? dayjs(group.orderDate) : null}
                      onChange={(d: Dayjs | null) => updateGroup(group.id, { orderDate: d?.format('YYYY-MM-DD') || '' })}
                      style={{ width: '100%' }}
                      placeholder="選擇下單日期"
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="快遞單號" style={{ marginBottom: 0 }}>
                    <Input
                      value={group.trackingNo}
                      onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                      placeholder="快遞/物流單號"
                      allowClear
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* 明細表格 */}
              {group.items.length > 0 ? (
                <Table<PurchaseOrderItem>
                  columns={itemColumns(group.id)}
                  dataSource={group.items}
                  rowKey="modelId"
                  size="middle"
                  pagination={false}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#bfbfbf', padding: '24px 0', fontSize: 13 }}>
                  此供應商暫無明細
                </div>
              )}
            </div>
          )
        })}

        {/* 添加供應商按鈕 */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup}
            style={{ minWidth: 160 }}>
            添加供應商
          </Button>
        </div>
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
          <Tag color="orange" style={{ fontSize: 14, marginLeft: 8 }}>
            總計：MOP {grandTotal.toLocaleString()}
          </Tag>
        </Space>
      </div>
    </Spin>
  )
}
