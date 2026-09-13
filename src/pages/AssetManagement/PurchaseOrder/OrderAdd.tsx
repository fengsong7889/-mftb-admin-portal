/**
 * 采购订单录入页（独立页面）
 *
 * - 直接录入采购订单，不经过采购申请审批流程
 * - 全局信息：采购经办人（搜索下拉）、服务部门（自动带出）、订单总计
 * - 供应商分组卡片：收货方式、预计收货日期、快递单号（条件显示）
 * - 明细通过弹窗编辑（分类 → 品牌 → 资产名称 → 参数），统一采购申请风格
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Form, Input, InputNumber, DatePicker, Row, Col, Table, Space, Spin, message,
  Modal, Tag, Select, TreeSelect,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  createPurchaseOrder, fetchModelList, fetchCategoryList, fetchBrandList,
  type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
  type AssetModel, type AssetCategory, type AssetBrand,
} from '../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'

/* ==================== 分类树（TreeSelect） ==================== */

interface CategoryTreeNode {
  value: number
  title: string
  code: string
  children?: CategoryTreeNode[]
}

function buildCategoryTree(list: AssetCategory[]): CategoryTreeNode[] {
  const nodeMap = new Map<number, CategoryTreeNode>()
  list.forEach((c) => {
    nodeMap.set(c.id, { value: c.id, title: c.name, code: c.code, children: [] })
  })
  const roots: CategoryTreeNode[] = []
  list.forEach((c) => {
    const node = nodeMap.get(c.id)!
    if (c.parentId && nodeMap.has(c.parentId)) {
      nodeMap.get(c.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/* ==================== 明细编辑弹窗 ==================== */

interface ItemRow {
  key: string
  categoryId?: number
  categoryName?: string
  categoryCode?: string
  brandId?: number
  brandName?: string
  modelId?: number
  modelName?: string
  params?: Record<string, string>
  purchaseType?: 'purchase' | 'lease'
  qty: number
  price: number
  confirmedPrice?: number
}

interface ItemEditModalProps {
  open: boolean
  editing: ItemRow | null
  categories: AssetCategory[]
  brands: AssetBrand[]
  models: AssetModel[]
  onOk: (row: ItemRow) => void
  onCancel: () => void
}

function ItemEditModal({ open, editing, categories, brands, models, onOk, onCancel }: ItemEditModalProps) {
  const [form] = Form.useForm<ItemRow>()
  const { t } = useTranslation()

  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string | undefined>()
  const [selectedBrandId, setSelectedBrandId] = useState<number | undefined>()
  const [selectedModel, setSelectedModel] = useState<AssetModel | undefined>()

  const categoryTree = useMemo(
    () => buildCategoryTree(categories.filter((c) => c.status === 'enabled')),
    [categories],
  )
  const filteredBrands = useMemo(
    () => selectedCategoryCode ? brands.filter((b) => b.categoryCode === selectedCategoryCode) : [],
    [brands, selectedCategoryCode],
  )
  const filteredModels = useMemo(
    () => models.filter((m) => {
      if (!selectedCategoryCode) return false
      const codeMatch = m.categoryCode === selectedCategoryCode || m.categoryCode.startsWith(`${selectedCategoryCode}-`)
      const brandMatch = selectedBrandId ? m.brandId === selectedBrandId : true
      return codeMatch && brandMatch
    }),
    [models, selectedCategoryCode, selectedBrandId],
  )
  const paramTemplate = useMemo(() => {
    if (!selectedCategoryCode) return []
    const cat = categories.find((c) => c.code === selectedCategoryCode)
    return cat?.paramTemplate || []
  }, [categories, selectedCategoryCode])

  useEffect(() => {
    if (open && editing) {
      form.setFieldsValue(editing)
      const cat = editing.categoryName ? categories.find((c) => c.id === editing.categoryId) : undefined
      setSelectedCategoryCode(cat?.code)
      setSelectedBrandId(editing.brandId)
      setSelectedModel(editing.modelId ? models.find((m) => m.id === editing.modelId) : undefined)
    } else if (open) {
      form.resetFields()
      form.setFieldsValue({ qty: 1, price: 0 })
      setSelectedCategoryCode(undefined)
      setSelectedBrandId(undefined)
      setSelectedModel(undefined)
    }
  }, [open, editing, form, categories, models])

  const handleCategoryChange = (categoryId: number) => {
    const cat = categories.find((c) => c.id === categoryId)
    setSelectedCategoryCode(cat?.code)
    setSelectedBrandId(undefined)
    setSelectedModel(undefined)
    form.setFieldsValue({ brandId: undefined, modelId: undefined, price: 0, params: {} })
  }

  const handleBrandChange = (brandId: number) => {
    setSelectedBrandId(brandId)
    setSelectedModel(undefined)
    form.setFieldsValue({ modelId: undefined, price: 0 })
  }

  const handleModelChange = (modelId: number) => {
    const m = models.find((x) => x.id === modelId)
    setSelectedModel(m)
    if (m) form.setFieldsValue({ price: m.refPrice || 0 })
  }

  const handleOk = async () => {
    try {
      const v = await form.validateFields()
      const cat = categories.find((c) => c.id === v.categoryId)
      const brand = brands.find((b) => b.id === v.brandId)
      const model = models.find((m) => m.id === v.modelId)
      onOk({
        ...v,
        key: editing?.key || `item_${Date.now()}`,
        categoryName: cat?.name,
        categoryCode: cat?.code,
        brandName: brand?.brandZh,
        modelName: model ? `${model.brandZh} ${model.modelNo || ''} ${model.name}`.trim() : undefined,
      })
    } catch { /* antd validates */ }
  }

  return (
    <Modal
      title={editing ? '编辑资产' : '添加资产'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      width={680}
      centered
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="资产分類" name="categoryId" rules={[{ required: true, message: '请选择资产分類' }]}>
              <TreeSelect treeData={categoryTree} placeholder="请选择分類" allowClear treeDefaultExpandAll
                showSearch treeNodeFilterProp="title" onChange={handleCategoryChange} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="品牌" name="brandId" rules={[{ required: true, message: '请选择品牌' }]}>
              <Select placeholder={selectedCategoryCode ? '请选择品牌' : '请先选择分類'} showSearch optionFilterProp="label"
                disabled={!selectedCategoryCode} onChange={handleBrandChange}
                options={filteredBrands.map((b) => ({ label: b.brandZh, value: b.id }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="资产名称" name="modelId" rules={[{ required: true, message: '请选择资产名称' }]}>
              <Select placeholder={selectedBrandId ? '请选择资产' : '请先选择品牌'} showSearch optionFilterProp="label"
                disabled={!selectedBrandId} onChange={handleModelChange}
                options={filteredModels.map((m) => ({
                  label: m.name, value: m.id,
                }))} />
            </Form.Item>
          </Col>
        </Row>

        {/* 参数信息 */}
        {selectedModel && paramTemplate.length > 0 && (
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 10 }}>参数信息</div>
            <Row gutter={12}>
              {paramTemplate.map((p) => (
                <Col span={8} key={p.key}>
                  <Form.Item label={<span style={{ fontSize: 12 }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>}
                    name={['params', p.key]} style={{ marginBottom: 8 }}>
                    {p.type === 'select' ? (
                      <Select placeholder={`请选择${p.label}`} allowClear size="small"
                        options={p.options?.map((o) => ({ label: o, value: o })) || []} />
                    ) : (
                      <Input placeholder={`请输入${p.label}`} allowClear size="small" />
                    )}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </div>
        )}

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="采购形式" name="purchaseType" rules={[{ required: true, message: '请选择采购形式' }]}>
              <Select placeholder="请选择" options={[
                { label: '购买', value: 'purchase' }, { label: '租赁', value: 'lease' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="数量" name="qty" rules={[{ required: true, message: '请输入数量' }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="参考单价" name="price">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled={!selectedModel}
                formatter={(v) => v ? `MOP ${Number(v).toLocaleString()}` : ''} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="成交单价" name="confirmedPrice">
              <InputNumber style={{ width: '100%' }} min={0} precision={2}
                addonBefore="MOP" placeholder="可选，實際成交价" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

/* ==================== 類型 ==================== */

type DeliveryMethod = 'self_pickup' | 'supplier_delivery' | 'express'

interface SupplierGroupForm {
  supplier: string
  contact?: string
  orderDate?: Dayjs
  trackingNo?: string
  deliveryMethod?: DeliveryMethod
  expectedReceiveDate?: Dayjs
}

interface GlobalFormValues {
  purchaser: string
  department: string
  remark: string
}

export default function OrderAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<GlobalFormValues>()
  const [submitting, setSubmitting] = useState(false)

  /* ----- 基礎数据 ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])
  const [models, setModels] = useState<AssetModel[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // 員工搜索
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)

  // 供应商分组
  const [supplierGroups, setSupplierGroups] = useState<PurchaseOrderSupplierGroup[]>([
    { id: `sg_${Date.now()}`, supplier: '', items: [] },
  ])

  // 明细彈窗
  const [modalOpen, setModalOpen] = useState(false)
  const [modalGroupId, setModalGroupId] = useState('')
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  // 加載基礎数据
  useEffect(() => {
    setDataLoading(true)
    const safeFetch = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback)
    Promise.allSettled([
      safeFetch(fetchModelList({ size: 9999 }), { records: [], total: 0 }),
      safeFetch(fetchCategoryList(), []),
      safeFetch(fetchBrandList(), []),
    ]).then(([r1, r2, r3]) => {
      if (r1.status === 'fulfilled') setModels(r1.value.records || [])
      if (r2.status === 'fulfilled') setCategories(r2.value)
      if (r3.status === 'fulfilled') setBrands(r3.value)
    }).finally(() => setDataLoading(false))
  }, [])

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

  /* ----- 供应商分组操作 ----- */
  const handleAddGroup = () => {
    setSupplierGroups((prev) => [
      ...prev,
      { id: `sg_${Date.now()}`, supplier: '', items: [] },
    ])
  }

  const handleRemoveGroup = (groupId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定删除此分组及其所有明细？',
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => setSupplierGroups((prev) => prev.filter((g) => g.id !== groupId)),
    })
  }

  const updateGroup = (groupId: string, patch: Partial<SupplierGroupForm>) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      const next = { ...g }
      if (patch.supplier !== undefined) next.supplier = patch.supplier
      if (patch.contact !== undefined) next.contact = patch.contact
      if (patch.orderDate !== undefined) next.orderDate = patch.orderDate ? patch.orderDate.format('YYYY-MM-DD') : undefined
      if (patch.trackingNo !== undefined) next.trackingNo = patch.trackingNo
      if (patch.deliveryMethod !== undefined) next.deliveryMethod = patch.deliveryMethod
      if (patch.expectedReceiveDate !== undefined) {
        next.expectedReceiveDate = patch.expectedReceiveDate ? patch.expectedReceiveDate.format('YYYY-MM-DD') : undefined
      }
      return next
    }))
  }

  /* ----- 明细彈窗操作 ----- */
  const handleOpenAddModal = (groupId: string) => {
    setModalGroupId(groupId)
    setEditingItem(null)
    setModalOpen(true)
  }

  const handleOpenEditModal = (groupId: string, item: PurchaseOrderItem) => {
    setModalGroupId(groupId)
    setEditingItem({
      key: item.key || `item_${Date.now()}`,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      categoryCode: item.categoryCode,
      brandId: item.brandId,
      brandName: item.brandName,
      modelId: item.modelId,
      modelName: item.modelName,
      params: item.params,
      purchaseType: item.purchaseType,
      qty: item.qty,
      price: item.price,
      confirmedPrice: item.confirmedPrice,
    })
    setModalOpen(true)
  }

  const handleModalOk = (row: ItemRow) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== modalGroupId) return g
      const existIdx = g.items.findIndex((it) => it.key === row.key)
      const poItem: PurchaseOrderItem = {
        key: row.key,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categoryCode: row.categoryCode,
        brandId: row.brandId,
        brandName: row.brandName,
        modelId: row.modelId,
        modelName: row.modelName,
        params: row.params,
        purchaseType: row.purchaseType,
        qty: row.qty,
        price: row.price,
        confirmedPrice: row.confirmedPrice,
        receivedQty: 0,
      }
      if (existIdx >= 0) {
        const items = [...g.items]
        items[existIdx] = poItem
        return { ...g, items }
      }
      return { ...g, items: [...g.items, poItem] }
    }))
    setModalOpen(false)
  }

  const handleRemoveItem = (groupId: string, rowKey: string) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return { ...g, items: g.items.filter((it) => it.key !== rowKey) }
    }))
  }

  /** 计算分组小计 */
  const groupSubtotal = (group: PurchaseOrderSupplierGroup) =>
    group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)

  /** 计算总计 */
  const grandTotal = supplierGroups.reduce((s, g) => s + groupSubtotal(g), 0)

  /* ----- 明细展示表格列 ----- */
  const itemColumns = useCallback((groupId: string): TableColumnsType<PurchaseOrderItem> => [
    { title: '分類', dataIndex: 'categoryName', key: 'categoryName', width: 100, ellipsis: true },
    { title: '品牌', dataIndex: 'brandName', key: 'brandName', width: 100, ellipsis: true },
    { title: '资产名称', dataIndex: 'modelName', key: 'modelName', width: 160, ellipsis: true },
    {
      title: '参数', key: 'params', width: 140, ellipsis: true,
      render: (_: unknown, r: PurchaseOrderItem) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        const entries = Object.entries(r.params).filter(([, v]) => v)
        if (entries.length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        return <span style={{ fontSize: 12, color: '#595959' }}>{entries.map(([k, v]) => `${k}:${v}`).join(' / ')}</span>
      },
    },
    { title: '数量', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
    {
      title: '采购形式', key: 'purchaseType', width: 80,
      render: (_: unknown, r: PurchaseOrderItem) => r.purchaseType
        ? <Tag color={r.purchaseType === 'purchase' ? 'blue' : 'green'}>{r.purchaseType === 'purchase' ? '购买' : '租赁'}</Tag>
        : '-',
    },
    {
      title: '参考单价', key: 'price', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>{r.price ? `MOP ${r.price.toLocaleString()}` : '-'}</span>
      ),
    },
    {
      title: '成交单价', key: 'confirmedPrice', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <span style={{ color: r.confirmedPrice ? '#262626' : '#bfbfbf', fontSize: 12 }}>
          {r.confirmedPrice ? `MOP ${r.confirmedPrice.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: '小计', key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
      },
    },
    {
      title: '操作', key: 'action', width: 100, align: 'center', fixed: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleOpenEditModal(groupId, r)}>编辑</Button>
          <Button type="link" size="small" danger onClick={() => handleRemoveItem(groupId, r.key!)}>删除</Button>
        </Space>
      ),
    },
  ], [])

  /* ----- 提交 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!selectedEmp) { message.warning('请选择采购经办人'); return }
      const emptyGroups = supplierGroups.filter((g) => !g.supplier.trim())
      if (emptyGroups.length > 0) { message.warning('请填寫所有分组的名称'); return }
      const emptyItems = supplierGroups.filter((g) => g.items.length === 0)
      if (emptyItems.length > 0) { message.warning('请為每個分组添加至少一条明细'); return }
      setSubmitting(true)

      await createPurchaseOrder({
        reqId: 0,
        supplier: supplierGroups[0]?.supplier || '',
        amount: grandTotal,
        deliveryDate: '',
        purchaser: v.purchaser || undefined,
        department: selectedEmp?.department || undefined,
        remark: v.remark?.trim() || undefined,
        items: [],
        supplierGroups: supplierGroups.map((g) => ({
          ...g,
          supplier: g.supplier.trim(),
          contact: g.contact?.trim() || undefined,
          orderDate: g.orderDate || undefined,
          trackingNo: g.trackingNo?.trim() || undefined,
        })),
      })

      message.success('采购订单創建成功')
      navigate('/purchase-order')
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => navigate('/purchase-order')

  /** 根据收货方式判断字段显示 */
  const showReceiveDate = (dm?: DeliveryMethod) => dm === 'supplier_delivery' || dm === 'express'
  const showTrackingNo = (dm?: DeliveryMethod) => dm === 'express'

  return (
    <Spin spinning={dataLoading}>
      {/* ====== 页面头部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleCancel}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>录入采购订单</h2>
          <span style={{ fontSize: 11, color: '#8c8c8c', background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>直接下单</span>
        </div>
      </div>

      <Form<GlobalFormValues> form={form} layout="vertical">

        {/* ====== 订单信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>订单信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label="采购经办人" name="purchaser" rules={[{ required: true, message: '请选择采购经办人' }]}>
                <Select
                  showSearch
                  placeholder="输入姓名/工号搜索"
                  loading={empLoading}
                  filterOption={false}
                  onSearch={handleEmpSearch}
                  onChange={handleEmpChange}
                  notFoundContent={empLoading ? <Spin size="small" /> : '暂无数据'}
                  options={employees.map((e) => ({
                    value: e.empId,
                    label: `${e.name}（${e.empId}）${e.department ? ` · ${e.department}` : ''}`,
                  }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="服务部门" name="department">
                <Input disabled placeholder="选择经办人后自动带出" style={{ color: '#262626' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>订单总计</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {grandTotal.toLocaleString()}</div>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item label="采购事由" name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder="请输入备注信息" maxLength={300} showCount style={{ resize: 'none' }} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ====== 采购物资分组 ====== */}
        {supplierGroups.map((group, gIdx) => (
          <div key={group.id} style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                }}>{gIdx + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>采购物资</span>
                <Tag color="blue" style={{ fontSize: 11 }}>
                  小计：MOP {groupSubtotal(group).toLocaleString()}
                </Tag>
              </div>
              {supplierGroups.length > 1 && (
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveGroup(group.id)}>
                  删除此分组
                </Button>
              )}
            </div>

            {/* 供应商信息 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Form.Item label="供应商名称" required>
                  <Input value={group.supplier} onChange={(e) => updateGroup(group.id, { supplier: e.target.value })}
                    placeholder="请输入供应商名称" allowClear />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="供应商联络人">
                  <Input value={group.contact} onChange={(e) => updateGroup(group.id, { contact: e.target.value })}
                    placeholder="请输入供应商联络人" allowClear />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="下单日期">
                  <DatePicker value={group.orderDate ? dayjs(group.orderDate) : undefined}
                    onChange={(d) => updateGroup(group.id, { orderDate: d || undefined })}
                    style={{ width: '100%' }} placeholder="请选择下单日期" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="收货方式" required>
                  <Select value={group.deliveryMethod}
                    onChange={(v: DeliveryMethod) => updateGroup(group.id, { deliveryMethod: v })}
                    placeholder="请选择收货方式" allowClear
                    options={[
                      { label: '自取', value: 'self_pickup' },
                      { label: '供应商送货上门', value: 'supplier_delivery' },
                      { label: '快递发货', value: 'express' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 条件字段：预计收货日期 + 快递单号 */}
            {(showReceiveDate(group.deliveryMethod) || showTrackingNo(group.deliveryMethod)) && (
              <Row gutter={16} style={{ marginBottom: 16 }}>
                {showReceiveDate(group.deliveryMethod) && (
                  <Col span={6}>
                    <Form.Item label="预计收货日期">
                      <DatePicker
                        value={group.expectedReceiveDate ? dayjs(group.expectedReceiveDate) : undefined}
                        onChange={(d) => updateGroup(group.id, { expectedReceiveDate: d || undefined })}
                        style={{ width: '100%' }} placeholder="请选择预计收货日期"
                      />
                    </Form.Item>
                  </Col>
                )}
                {showTrackingNo(group.deliveryMethod) && (
                  <Col span={6}>
                    <Form.Item label="快递单号">
                      <Input value={group.trackingNo}
                        onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                        placeholder="请输入快递单号" allowClear />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            )}

            {/* 明细表格 */}
            <Table<PurchaseOrderItem>
              columns={itemColumns(group.id)}
              dataSource={group.items}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 1100 }}
              locale={{ emptyText: '暂无明细，请点擊下方按鈕添加' }}
              style={{ marginBottom: 12 }}
            />
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => handleOpenAddModal(group.id)}>
              添加资产
            </Button>
          </div>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup} style={{ width: '100%', marginBottom: 16, height: 40 }}>
          + 新增供应商分组
        </Button>
      </Form>

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            保存订单
          </Button>
        </Space>
      </div>

      {/* ====== 明细编辑彈窗 ====== */}
      <ItemEditModal
        open={modalOpen}
        editing={editingItem}
        categories={categories}
        brands={brands}
        models={models}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
      />
    </Spin>
  )
}
