/**
 * 采购订单录入页（独立页面）
 *
 * - 直接录入采购订单，不经过采购申请审批流程
 * - 全局信息：采购经办人（搜索下拉）、服务部门（自动带出）、订单总计
 * - 供应商分组卡片：收货方式、预计收货日期、快递单号（条件显示）
 * - 明细通过弹窗编辑（分类 → 资产品牌 → 资产名称 → 参数），统一采购申请风格
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
  fetchAllParamTypes, fetchParamValuesByType,
  fetchSuppliersDropdown, fetchSupplierContacts, syncSupplierContact,
  type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
  type AssetModel, type AssetCategory, type AssetBrand,
  type ParamType, type ParamField,
  type SupplierDropdownItem, type SupplierContactItem,
} from '../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'

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
  const [paramTypes, setParamTypes] = useState<ParamType[]>([])
  const [paramValuesMap, setParamValuesMap] = useState<Record<string, string[]>>({})

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
  // 從參數庫 API 加載參數模板（biz_eam_param_type 表）
  const paramTemplate: ParamField[] = useMemo(() => {
    if (!selectedModel) return []
    return paramTypes
      .filter((p) => p.categoryCode === selectedModel.categoryCode && p.status === 'enabled')
      .sort((a, b) => a.sort - b.sort)
      .map((p) => ({
        key: p.code,
        label: p.name,
        type: p.valueType === 'number' ? 'number' : p.valueType === 'select' ? 'select' : 'text',
        unit: p.unit || undefined,
        options: p.valueType === 'select' ? (paramValuesMap[p.code] || []) : undefined,
      }))
  }, [paramTypes, selectedModel, paramValuesMap])

  // 加載參數庫數據（弹窗打開時）
  useEffect(() => {
    if (!open) return
    let alive = true
    fetchAllParamTypes().then((list) => {
      if (alive) setParamTypes(list)
    }).catch(() => {})
    return () => { alive = false }
  }, [open])

  // select 類型參數的 code 列表（穩定字符串）：paramTemplate 的 useMemo 依賴 paramValuesMap，
  // 若直接以 paramTemplate 為依賴，本 effect 內 setParamValuesMap 會使 paramTemplate 產生新引用 →
  // effect 再次觸發 → 無限循環請求。改為依賴值穩定的 code 字符串可斷環。
  const selectParamKeys = useMemo(
    () => paramTemplate.filter((p) => p.type === 'select').map((p) => p.key).join(','),
    [paramTemplate],
  )

  // 為 select 類型參數加載可選值
  useEffect(() => {
    const keys = selectParamKeys ? selectParamKeys.split(',') : []
    if (keys.length === 0) return
    let alive = true
    Promise.all(
      keys.map((key) =>
        fetchParamValuesByType(key)
          .then((vals) => ({ key, values: vals.filter((v) => v.status === 'enabled').sort((a, b) => a.sort - b.sort).map((v) => v.value) }))
          .catch(() => ({ key, values: [] })),
      ),
    ).then((results) => {
      if (!alive) return
      const map: Record<string, string[]> = {}
      results.forEach((r) => { map[r.key] = r.values })
      setParamValuesMap(map)
    })
    return () => { alive = false }
  }, [selectParamKeys])

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
      setParamValuesMap({})
    }
  }, [open, editing, form, categories, models])

  const handleCategoryChange = (categoryId: number) => {
    const cat = categories.find((c) => c.id === categoryId)
    setSelectedCategoryCode(cat?.code)
    setSelectedBrandId(undefined)
    setSelectedModel(undefined)
    form.setFieldsValue({ brandId: undefined, modelId: undefined, params: {} })
  }

  const handleBrandChange = (brandId: number) => {
    setSelectedBrandId(brandId)
    setSelectedModel(undefined)
    form.setFieldsValue({ modelId: undefined })
  }

  const handleModelChange = (modelId: number) => {
    const m = models.find((x) => x.id === modelId)
    setSelectedModel(m)
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
        modelName: model ? `${model.brandZh} ${model.name}`.trim() : undefined,
      })
    } catch { /* antd validates */ }
  }

  return (
    <Modal
      title={editing ? t('asset.editAssetTitle') : t('asset.addAssetTitle')}
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
            <Form.Item label={t('asset.colCategory')} name="categoryId" rules={[{ required: true, message: t('asset.warnSelectCategory') }]}>
              <TreeSelect treeData={categoryTree} placeholder={t('asset.phSelectCategory')} allowClear treeDefaultExpandAll
                showSearch treeNodeFilterProp="title" onChange={handleCategoryChange} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('asset.colBrand')} name="brandId" rules={[{ required: true, message: t('asset.warnSelectAssetBrand') }]}>
              <Select placeholder={selectedCategoryCode ? t('asset.phSelectBrand') : t('asset.phSelectCategoryFirst')} showSearch optionFilterProp="label"
                disabled={!selectedCategoryCode} onChange={handleBrandChange}
                options={filteredBrands.map((b) => ({ label: b.brandZh, value: b.id }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('asset.colAssetName')} name="modelId" rules={[{ required: true, message: t('asset.warnSelectAssetName') }]}>
              <Select placeholder={selectedBrandId ? t('asset.phSelectAsset') : t('asset.phSelectBrandFirst')} showSearch optionFilterProp="label"
                disabled={!selectedBrandId} onChange={handleModelChange}
                options={filteredModels.map((m) => ({
                  label: m.name, value: m.id,
                }))} />
            </Form.Item>
          </Col>
        </Row>

        {/* 參數信息 */}
        {selectedModel && paramTemplate.length > 0 && (
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 10 }}>{t('asset.paramInfoTitle')}</div>
            <Row gutter={12}>
              {paramTemplate.map((p) => (
                <Col span={8} key={p.key}>
                  <Form.Item label={<span style={{ fontSize: 13 }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>}
                    name={['params', p.key]} style={{ marginBottom: 8 }}>
                    {p.type === 'select' ? (
                      <Select placeholder={t('asset.phParamSelect', { name: p.label })} allowClear
                        options={p.options?.map((o) => ({ label: o, value: o })) || []} />
                    ) : (
                      <Input placeholder={t('asset.phParamInput', { name: p.label })} allowClear />
                    )}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </div>
        )}

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('asset.purchaseType')} name="purchaseType" rules={[{ required: true, message: t('asset.warnSelectPurchaseType') }]}>
              <Select placeholder={t('asset.phSelect')} options={[
                { label: t('asset.purchaseTypePurchase'), value: 'purchase' }, { label: t('asset.purchaseTypeLease'), value: 'lease' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('asset.colQty')} name="qty" rules={[{ required: true, message: t('asset.warnInputQty') }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('asset.confirmedPrice')} name="confirmedPrice">
              <InputNumber style={{ width: '100%' }} min={0} precision={2}
                addonBefore="MOP" placeholder={t('asset.phConfirmedPrice')} />
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
  supplierId?: number
  contact?: string
  contactPhone?: string
  orderDate?: Dayjs
  trackingNo?: string
  deliveryMethod?: DeliveryMethod
  expectedReceiveDate?: Dayjs
}

interface GlobalFormValues {
  purchaser: string
  department: string
  brand: number | undefined
  remark: string
}

export default function OrderAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<GlobalFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const watchedBrand = Form.useWatch('brand', form)
  const { numericOptions, codeHint, labelMap } = useCompanyBrand()

  /* ----- 基礎数据 ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])
  const [models, setModels] = useState<AssetModel[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // 員工搜索
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)

  // 供应商下拉列表
  const [supplierOptions, setSupplierOptions] = useState<SupplierDropdownItem[]>([])
  const [supplierLoading, setSupplierLoading] = useState(false)
  // 每个分组的联系人（key=groupId）
  const [groupContacts, setGroupContacts] = useState<Record<string, SupplierContactItem[]>>({})
  // 跟踪自动带入的联系人（key=groupId，值为自动带入时的联系人姓名）
  const [autoFilledContact, setAutoFilledContact] = useState<Record<string, string>>({})

  // 供应商分组
  const [supplierGroups, setSupplierGroups] = useState<PurchaseOrderSupplierGroup[]>([
    { id: `sg_${Date.now()}`, supplier: '', items: [] },
  ])

  // 加載供應商下拉列表
  useEffect(() => {
    fetchSuppliersDropdown().then(setSupplierOptions).catch(() => {})
  }, [])

  // 参数编码 → 参数名称映射
  const [paramNameMap, setParamNameMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    fetchAllParamTypes().then((list) => {
      const map = new Map<string, string>()
      list.forEach((p: ParamType) => { map.set(p.code, p.name) })
      setParamNameMap(map)
    }).catch(() => {})
  }, [])

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

  const handleSupplierSearch = (keyword: string) => {
    setSupplierLoading(true)
    fetchSuppliersDropdown(keyword || undefined)
      .then(setSupplierOptions)
      .catch(() => {})
      .finally(() => setSupplierLoading(false))
  }

  /** 選擇供應商後自動帶入聯繫人 */
  const handleSupplierChange = async (groupId: string, supplierId: number) => {
    const opt = supplierOptions.find((s) => s.id === supplierId)
    if (!opt) return
    // 更新供应商名称
    updateGroup(groupId, { supplier: opt.name, supplierId: opt.id })
    // 拉取联系人
    try {
      const contacts = await fetchSupplierContacts(supplierId)
      setGroupContacts((prev) => ({ ...prev, [groupId]: contacts }))
      if (contacts.length > 0) {
        const first = contacts[0]
        updateGroup(groupId, {
          contact: first.contactName,
          contactPhone: first.contactPhone,
        })
        setAutoFilledContact((prev) => ({ ...prev, [groupId]: first.contactName }))
      } else {
        updateGroup(groupId, { contact: '', contactPhone: '' })
        setAutoFilledContact((prev) => {
          const next = { ...prev }
          delete next[groupId]
          return next
        })
      }
    } catch {
      setGroupContacts((prev) => ({ ...prev, [groupId]: [] }))
    }
  }

  /** 選擇聯繫人後自動帶出電話 */
  const handleContactChange = (groupId: string, contactName: string) => {
    const contacts = groupContacts[groupId] || []
    const matched = contacts.find((c) => c.contactName === contactName)
    updateGroup(groupId, {
      contact: contactName,
      contactPhone: matched?.contactPhone || '',
    })
    // 通过下拉选择的联系人视为自动带入
    if (matched) {
      setAutoFilledContact((prev) => ({ ...prev, [groupId]: contactName }))
    }
  }

  /** 手動輸入聯繫人姓名（清除自动带入标记） */
  const handleContactManualInput = (groupId: string, value: string) => {
    updateGroup(groupId, { contact: value })
    setAutoFilledContact((prev) => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })
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
      title: t('asset.deleteConfirmTitle'),
      content: t('asset.warnDeleteGroup'),
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
      if (patch.supplierId !== undefined) next.supplierId = patch.supplierId
      if (patch.contact !== undefined) next.contact = patch.contact
      if (patch.contactPhone !== undefined) next.contactPhone = patch.contactPhone
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
    { title: t('asset.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 100, ellipsis: true },
    { title: t('asset.colBrand'), dataIndex: 'brandName', key: 'brandName', width: 100, ellipsis: true },
    { title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 160, ellipsis: true },
    {
      title: t('asset.paramInfoTitle'), key: 'params', width: 200,
      render: (_: unknown, r: PurchaseOrderItem) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        const entries = Object.entries(r.params).filter(([, v]) => v && v !== 'undefined')
        if (entries.length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        return <span style={{ fontSize: 12, color: '#595959' }}>{entries.map(([k, v]) => `${paramNameMap.get(k) || k}: ${v}`).join(', ')}</span>
      },
    },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
    {
      title: t('asset.purchaseType'), key: 'purchaseType', width: 80,
      render: (_: unknown, r: PurchaseOrderItem) => r.purchaseType
        ? <Tag color={r.purchaseType === 'purchase' ? 'blue' : 'green'}>{r.purchaseType === 'purchase' ? t('asset.purchaseTypePurchase') : t('asset.purchaseTypeLease')}</Tag>
        : '-',
    },
    {
      title: t('asset.confirmedPrice'), key: 'confirmedPrice', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <span style={{ color: r.confirmedPrice ? '#262626' : '#bfbfbf', fontSize: 12 }}>
          {r.confirmedPrice ? `MOP ${r.confirmedPrice.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
      },
    },
    {
      title: t('asset.colAction'), key: 'action', width: 100, align: 'center', fixed: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleOpenEditModal(groupId, r)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleRemoveItem(groupId, r.key!)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ], [paramNameMap, t])

  /* ----- 提交 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!selectedEmp) { message.warning(t('asset.warnSelectPurchaser')); return }
      const emptyGroups = supplierGroups.filter((g) => !g.supplier.trim())
      if (emptyGroups.length > 0) { message.warning(t('asset.warnFillGroupNames')); return }
      const emptyItems = supplierGroups.filter((g) => g.items.length === 0)
      if (emptyItems.length > 0) { message.warning(t('asset.warnEmptyGroupItems')); return }
      setSubmitting(true)

      await createPurchaseOrder({
        reqId: 0,
        supplier: supplierGroups[0]?.supplier || '',
        amount: grandTotal,
        deliveryDate: '',
        // 統一提交姓名（下拉選的是工號，與「開始採購」及自動建單口徑一致）
        purchaser: selectedEmp?.name || v.purchaser || undefined,
        department: selectedEmp?.department || undefined,
        brand: v.brand,
        remark: v.remark?.trim() || undefined,
        items: [],
        supplierGroups: supplierGroups.map((g) => ({
          ...g,
          supplier: g.supplier.trim(),
          contact: g.contact?.trim() || undefined,
          contactPhone: g.contactPhone?.trim() || undefined,
          orderDate: g.orderDate || undefined,
          trackingNo: g.trackingNo?.trim() || undefined,
        })),
      })

      // 同步手動錄入的聯繫人到供應商管理
      const syncPromises: Promise<void>[] = []
      for (const g of supplierGroups) {
        if (!g.supplierId) continue
        const contactName = g.contact?.trim()
        const contactPhone = g.contactPhone?.trim()
        if (!contactName || !contactPhone) continue
        // 如果是手动输入的（非自动带入），则同步到供应商联系人
        if (autoFilledContact[g.id] !== contactName) {
          syncPromises.push(syncSupplierContact(g.supplierId, contactName, contactPhone).catch(() => {}))
        }
      }
      await Promise.all(syncPromises)

      message.success(t('asset.poCreateSuccess'))
      navigate('/purchase-order')
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => navigate('/purchase-order')

  /** 根據收貨方式判斷字段顯示 */
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{t('asset.addPoTitle')}</h2>
          <span style={{ fontSize: 11, color: '#8c8c8c', background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>{t('asset.directOrderBadge')}</span>
        </div>
      </div>

      <Form<GlobalFormValues> form={form} layout="vertical">

        {/* ====== 订单信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.orderInfoTitle')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label={t('asset.colPurchaser')} name="purchaser" rules={[{ required: true, message: t('asset.warnSelectPurchaser') }]}>
                <Select
                  showSearch
                  placeholder={t('asset.phSearchEmp')}
                  loading={empLoading}
                  filterOption={false}
                  onSearch={handleEmpSearch}
                  onChange={handleEmpChange}
                  notFoundContent={empLoading ? <Spin size="small" /> : t('common.noData')}
                  options={employees.map((e) => ({
                    value: e.empId,
                    label: `${e.name}（${e.empId}）${e.department ? ` · ${e.department}` : ''}`,
                  }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.serviceDept')} name="department">
                <Input disabled placeholder={t('asset.phDeptAutoFill')} style={{ color: '#262626' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderTotal')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {grandTotal.toLocaleString()}</div>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label={t('asset.orderBrand')} name="brand" rules={[{ required: true, message: t('asset.warnSelectOrderBrand') }]}>
                <Select placeholder={t('asset.phSelectCompanyBrand')} options={numericOptions} />
              </Form.Item>
              {watchedBrand && codeHint[watchedBrand] && (
                <div style={{ fontSize: 12, color: '#E8720C', marginTop: -18, marginBottom: 8 }}>
                  {t('asset.brandCodeHint', { brand: labelMap[watchedBrand], code: codeHint[watchedBrand] })}
                </div>
              )}
            </Col>
            <Col span={16}>
              <Form.Item label={t('asset.orderReasonLabel')} name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={300} showCount style={{ resize: 'none' }} />
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
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('asset.purchaseMaterials')}</span>
                <Tag color="blue" style={{ fontSize: 11 }}>
                  {t('asset.groupSubtotalTag', { amount: groupSubtotal(group).toLocaleString() })}
                </Tag>
              </div>
              {supplierGroups.length > 1 && (
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveGroup(group.id)}>
                  {t('asset.deleteGroupBtn')}
                </Button>
              )}
            </div>

            {/* 供应商信息 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Form.Item label={t('asset.labelSupplierName')} required>
                  <Select
                    showSearch
                    placeholder={t('asset.phSearchSupplier')}
                    value={group.supplierId || undefined}
                    onChange={(v: number) => handleSupplierChange(group.id, v)}
                    onSearch={handleSupplierSearch}
                    filterOption={false}
                    loading={supplierLoading}
                    notFoundContent={supplierLoading ? <Spin size="small" /> : t('common.noData')}
                    allowClear
                    options={supplierOptions.map((s) => ({
                      value: s.id,
                      label: `${s.name}（${s.code}）`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={t('asset.labelContactName')}>
                  {(groupContacts[group.id] || []).length > 1 ? (
                    <Select
                      value={group.contact || undefined}
                      onChange={(v: string) => handleContactChange(group.id, v)}
                      placeholder={t('asset.phSelectContact')}
                      allowClear
                      options={(groupContacts[group.id] || [])
                        .filter((c) => c.status !== 'disabled')
                        .map((c) => ({ value: c.contactName, label: c.contactName }))}
                    />
                  ) : (
                    <Input
                      value={group.contact}
                      onChange={(e) => handleContactManualInput(group.id, e.target.value)}
                      placeholder={(groupContacts[group.id] || []).length === 0 && group.supplierId ? t('asset.noSupplierContact') : t('asset.phInputContactName')}
                      allowClear
                    />
                  )}
                  {group.contact && group.supplierId && autoFilledContact[group.id] !== group.contact && (
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4, whiteSpace: 'nowrap' }}>
                      {t('asset.contactSyncHint')}
                    </div>
                  )}
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={t('asset.labelContactPhone')}>
                  <Input value={group.contactPhone} onChange={(e) => updateGroup(group.id, { contactPhone: e.target.value })}
                    placeholder={t('asset.phInputContactPhone')} allowClear />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={t('asset.labelOrderDate')}>
                  <DatePicker value={group.orderDate ? dayjs(group.orderDate) : undefined}
                    onChange={(d) => updateGroup(group.id, { orderDate: d || undefined })}
                    style={{ width: '100%' }} placeholder={t('asset.phSelectOrderDate')} />
                </Form.Item>
              </Col>
            </Row>

            {/* 收貨方式 + 條件字段（並排展示） */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Form.Item label={t('asset.labelDeliveryMethod')} required>
                  <Select value={group.deliveryMethod}
                    onChange={(v: DeliveryMethod) => updateGroup(group.id, { deliveryMethod: v })}
                    placeholder={t('asset.phSelectDeliveryMethod')} allowClear
                    options={[
                      { label: t('asset.deliverySelfPickup'), value: 'self_pickup' },
                      { label: t('asset.deliverySupplier'), value: 'supplier_delivery' },
                      { label: t('asset.deliveryExpress'), value: 'express' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                {showReceiveDate(group.deliveryMethod) && (
                  <Form.Item label={t('asset.labelExpectedDate')}>
                    <DatePicker
                      value={group.expectedReceiveDate ? dayjs(group.expectedReceiveDate) : undefined}
                      onChange={(d) => updateGroup(group.id, { expectedReceiveDate: d || undefined })}
                      style={{ width: '100%' }} placeholder={t('asset.phSelectExpectedDate')}
                    />
                  </Form.Item>
                )}
              </Col>
              <Col span={8}>
                {showTrackingNo(group.deliveryMethod) && (
                  <Form.Item label={t('asset.labelTrackingNo')}>
                    <Input value={group.trackingNo}
                      onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                      placeholder={t('asset.phInputTrackingNo')} allowClear />
                  </Form.Item>
                )}
              </Col>
            </Row>

            {/* 明细表格 */}
            <Table<PurchaseOrderItem>
              columns={itemColumns(group.id)}
              dataSource={group.items}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 1100 }}
              locale={{ emptyText: t('asset.emptyTextWithHint') }}
              style={{ marginBottom: 12 }}
            />
            <Button type="dashed" icon={<PlusOutlined />} onClick={() => handleOpenAddModal(group.id)}>
              {t('asset.addAssetBtn')}
            </Button>
          </div>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup} style={{ width: '100%', marginBottom: 16, height: 40 }}>
          + {t('asset.addSupplierGroup')}
        </Button>
      </Form>

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={handleCancel}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('asset.saveOrderBtn')}
          </Button>
        </Space>
      </div>

      {/* ====== 明細編輯彈窗 ====== */}
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
