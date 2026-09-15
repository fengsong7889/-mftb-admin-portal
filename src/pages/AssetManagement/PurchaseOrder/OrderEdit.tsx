/**
 * 采购执行编辑页（多供应商分组版）
 *
 * - 全局信息：采购经办人（搜索下拉）、服务部门（自动带出）、执行状态、备注
 * - 供应商分组卡片：收货方式、预计收货日期、快递单号（条件显示）
 * - 明细表格列与录入页对齐：分类、品牌、资产名称、参数、数量、采购形式、成交单价、小计
 * - 支持物资拆分/移动/编辑操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button, Form, Input, InputNumber, DatePicker, Row, Col, Table, Tag, Space, Spin, Select, message, Modal,
  Checkbox, Dropdown, Tooltip, TreeSelect,
} from 'antd'
import type { TableColumnsType, MenuProps } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined, PlusOutlined, DeleteOutlined,
  SplitCellsOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchPurchaseOrderDetail, updatePurchaseOrderExec, fetchAllParamTypes,
  fetchCategoryList, fetchBrandList, fetchModelList, fetchParamValuesByType,
  type PurchaseOrder, type ExecStatus, type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
  type ParamType, type AssetCategory, type AssetBrand, type AssetModel,
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

interface Props {
  id: number
  onBack: () => void
  onSaved: () => void
}

const EXEC_STATUS_OPTIONS: { value: ExecStatus; label: string; color: string }[] = [
  { value: 'pending', label: '待处理', color: 'default' },
  { value: 'purchasing', label: '采购中', color: 'processing' },
  { value: 'completed', label: '已完成', color: 'success' },
]

type DeliveryMethod = 'self_pickup' | 'supplier_delivery' | 'express'

interface GlobalFormValues {
  purchaser: string
  department: string
  execStatus: ExecStatus
  remark: string
}

/* ==================== 明细编辑弹窗 ==================== */

interface EditItemRow {
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

interface ParamField {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  unit?: string
  options?: string[]
}

interface ItemEditModalProps {
  open: boolean
  editing: EditItemRow | null
  categories: AssetCategory[]
  brands: AssetBrand[]
  models: AssetModel[]
  onOk: (row: EditItemRow) => void
  onCancel: () => void
}

function ItemEditModal({ open, editing, categories, brands, models, onOk, onCancel }: ItemEditModalProps) {
  const [form] = Form.useForm<EditItemRow>()
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

  useEffect(() => {
    if (!open) return
    let alive = true
    fetchAllParamTypes().then((list) => {
      if (alive) setParamTypes(list)
    }).catch(() => {})
    return () => { alive = false }
  }, [open])

  useEffect(() => {
    const selectParams = paramTemplate.filter((p) => p.type === 'select')
    if (selectParams.length === 0) return
    const alive = true
    Promise.all(
      selectParams.map((p) =>
        fetchParamValuesByType(p.key)
          .then((vals) => ({ key: p.key, values: vals.filter((v) => v.status === 'enabled').sort((a, b) => a.sort - b.sort).map((v) => v.value) }))
          .catch(() => ({ key: p.key, values: [] })),
      ),
    ).then((results) => {
      if (!alive) return
      const map: Record<string, string[]> = {}
      results.forEach((r) => { map[r.key] = r.values })
      setParamValuesMap(map)
    })
  }, [paramTemplate])

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
        price: editing?.price ?? 0,
        categoryName: cat?.name,
        categoryCode: cat?.code,
        brandName: brand?.brandZh,
        modelName: model ? `${model.brandZh} ${model.name}`.trim() : undefined,
      })
    } catch { /* antd validates */ }
  }

  return (
    <Modal
      title="編輯物資明細"
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
            <Form.Item label="資產分類" name="categoryId" rules={[{ required: true, message: '請選擇資產分類' }]}>
              <TreeSelect treeData={categoryTree} placeholder="請選擇分類" allowClear treeDefaultExpandAll
                showSearch treeNodeFilterProp="title" onChange={handleCategoryChange} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="品牌" name="brandId" rules={[{ required: true, message: '請選擇品牌' }]}>
              <Select placeholder={selectedCategoryCode ? '請選擇品牌' : '請先選擇分類'} showSearch optionFilterProp="label"
                disabled={!selectedCategoryCode} onChange={handleBrandChange}
                options={filteredBrands.map((b) => ({ label: b.brandZh, value: b.id }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="資產名稱" name="modelId" rules={[{ required: true, message: '請選擇資產名稱' }]}>
              <Select placeholder={selectedBrandId ? '請選擇資產' : '請先選擇品牌'} showSearch optionFilterProp="label"
                disabled={!selectedBrandId} onChange={handleModelChange}
                options={filteredModels.map((m) => ({ label: m.name, value: m.id }))} />
            </Form.Item>
          </Col>
        </Row>
        {selectedModel && paramTemplate.length > 0 && (
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 10 }}>參數信息</div>
            <Row gutter={12}>
              {paramTemplate.map((p) => (
                <Col span={8} key={p.key}>
                  <Form.Item label={<span style={{ fontSize: 13 }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>}
                    name={['params', p.key]} style={{ marginBottom: 8 }}>
                    {p.type === 'select' ? (
                      <Select placeholder={`請選擇${p.label}`} allowClear
                        options={p.options?.map((o) => ({ label: o, value: o })) || []} />
                    ) : (
                      <Input placeholder={`請輸入${p.label}`} allowClear />
                    )}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </div>
        )}
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="採購形式" name="purchaseType" rules={[{ required: true, message: '請選擇採購形式' }]}>
              <Select placeholder="請選擇" options={[
                { label: '購買', value: 'purchase' }, { label: '租賃', value: 'lease' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="數量" name="qty" rules={[{ required: true, message: '請輸入數量' }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="成交單價" name="confirmedPrice">
              <InputNumber style={{ width: '100%' }} min={0} precision={2}
                addonBefore="MOP" placeholder="可選，實際成交價" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

/**
 * 采购订单执行信息编辑页
 *
 * @param props id=订单 ID；onBack=返回列表；onSaved=保存成功回调
 */
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
  const [paramNameMap, setParamNameMap] = useState<Map<string, string>>(new Map())

  // 物资拆分/移动状态
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set())
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [splitModalGroupId, setSplitModalGroupId] = useState('')

  // 物资编辑状态
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<EditItemRow | null>(null)
  const [editingItemGroupId, setEditingItemGroupId] = useState('')
  const [editCategories, setEditCategories] = useState<AssetCategory[]>([])
  const [editBrands, setEditBrands] = useState<AssetBrand[]>([])
  const [editModels, setEditModels] = useState<AssetModel[]>([])

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
      // 初始化供应商分组
      if (o.supplierGroups && o.supplierGroups.length > 0) {
        setSupplierGroups(o.supplierGroups)
      } else {
        setSupplierGroups([{
          id: 'sg_default',
          supplier: o.supplier || '',
          contact: o.contact || '',
          contactPhone: o.contactPhone || '',
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

  const updateGroup = (groupId: string, patch: Partial<PurchaseOrderSupplierGroup>) => {
    setSupplierGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)))
  }

  const updateGroupItem = (groupId: string, rowKey: string, patch: Partial<PurchaseOrderItem>) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return { ...g, items: g.items.map((it) => (it.key === rowKey ? { ...it, ...patch } : it)) }
    }))
  }

  /* ----- 物资拆分/移动 ----- */
  const handleToggleSelect = (rowKey: string) => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) { next.delete(rowKey) } else { next.add(rowKey) }
      return next
    })
  }

  const handleSelectAll = (groupId: string, checked: boolean) => {
    const group = supplierGroups.find((g) => g.id === groupId)
    if (!group) return
    const keys = group.items.map((it) => it.key).filter(Boolean) as string[]
    setSelectedItemKeys((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => { if (checked) next.add(k); else next.delete(k) })
      return next
    })
  }

  const handleOpenSplitModal = (groupId: string) => {
    setSplitModalGroupId(groupId)
    setSplitModalOpen(true)
  }

  const handleConfirmSplit = () => {
    const keysToMove = Array.from(selectedItemKeys)
    if (keysToMove.length === 0) { message.warning('请先选择要拆分的物资'); return }

    setSupplierGroups((prev) => {
      const srcGroup = prev.find((g) => g.id === splitModalGroupId)
      if (!srcGroup) return prev
      const movingItems = srcGroup.items.filter((it) => keysToMove.includes(it.key!))
      const newGroup: PurchaseOrderSupplierGroup = {
        id: `sg_${Date.now()}`,
        supplier: '',
        items: movingItems,
      }
      return [
        ...prev.filter((g) => g.id !== splitModalGroupId),
        { ...srcGroup, items: srcGroup.items.filter((it) => !keysToMove.includes(it.key!)) },
        newGroup,
      ]
    })
    setSelectedItemKeys(new Set())
    setSplitModalOpen(false)
    message.success('拆分成功，请在新分组中填写供应商信息')
  }

  const handleMoveItemToGroup = (groupId: string, rowKey: string, targetGroupId: string) => {
    setSupplierGroups((prev) => {
      let movingItem: PurchaseOrderItem | undefined
      const withoutItem = prev.map((g) => {
        if (g.id !== groupId) return g
        movingItem = g.items.find((it) => it.key === rowKey)
        return { ...g, items: g.items.filter((it) => it.key !== rowKey) }
      })
      if (!movingItem) return prev
      return withoutItem.map((g) => {
        if (g.id !== targetGroupId) return g
        return { ...g, items: [...g.items, movingItem!] }
      })
    })
    message.success('移动成功')
  }

  const groupSubtotal = (group: PurchaseOrderSupplierGroup) =>
    group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)

  const grandTotal = supplierGroups.reduce((s, g) => s + groupSubtotal(g), 0)

  /** 根据收货方式判断字段显示 */
  const showReceiveDate = (dm?: DeliveryMethod) => dm === 'supplier_delivery' || dm === 'express'
  const showTrackingNo = (dm?: DeliveryMethod) => dm === 'express'

  // 參數編碼 → 參數名稱映射
  useEffect(() => {
    fetchAllParamTypes().then((list) => {
      const map = new Map<string, string>()
      list.forEach((p: ParamType) => { map.set(p.code, p.name) })
      setParamNameMap(map)
    }).catch(() => {})
  }, [])

  // 加载基础数据用于编辑弹窗
  const loadEditBaseData = useCallback(async () => {
    try {
      const [cats, brands, modelsRes] = await Promise.all([
        fetchCategoryList(),
        fetchBrandList(),
        fetchModelList({ page: 1, size: 500 }),
      ])
      setEditCategories(cats)
      setEditBrands(brands)
      setEditModels(modelsRes.records || [])
    } catch { /* 静默失败，弹窗内会再加载 */ }
  }, [])

  // 参数名称映射加载
  useEffect(() => {
    fetchAllParamTypes().then((list) => {
      const map = new Map<string, string>()
      list.forEach((p) => map.set(p.code, p.name))
      setParamNameMap(map)
    }).catch(() => {})
  }, [])

  /* ----- 明细表格列（与 OrderAdd 对齐） ----- */
  const isReceived = order?.status === 'received'

  // 打开编辑弹窗
  const handleOpenEdit = async (groupId: string, item: PurchaseOrderItem) => {
    if (isReceived) {
      message.warning('訂單已全部驗收入庫，物資明細不可編輯')
      return
    }
    setEditingItemGroupId(groupId)
    setEditingItem({
      key: item.key || '',
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
    if (editCategories.length === 0) await loadEditBaseData()
    setEditModalOpen(true)
  }

  // 编辑确认回调
  const handleEditOk = (row: EditItemRow) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== editingItemGroupId) return g
      return {
        ...g,
        items: g.items.map((it) => {
          if (it.key !== row.key) return it
          return {
            ...it,
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
          }
        }),
      }
    }))
    setEditModalOpen(false)
    setEditingItem(null)
  }

  /* ----- 物资删除 ----- */
  const handleRemoveItem = (groupId: string, rowKey: string) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return { ...g, items: g.items.filter((it) => (it.key || it.modelId?.toString()) !== rowKey) }
    }))
    setSelectedItemKeys((prev) => { const next = new Set(prev); next.delete(rowKey); return next })
  }

  const itemColumns = (groupId: string): TableColumnsType<PurchaseOrderItem> => {
    const group = supplierGroups.find((g) => g.id === groupId)
    const allKeys = (group?.items || []).map((it) => it.key).filter(Boolean) as string[]
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedItemKeys.has(k))
    return [
    {
      title: <Checkbox checked={allSelected} indeterminate={allKeys.some((k) => selectedItemKeys.has(k)) && !allSelected}
        onChange={(e) => handleSelectAll(groupId, e.target.checked)} />,
      key: 'selection', width: 40, align: 'center',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <Checkbox checked={r.key ? selectedItemKeys.has(r.key) : false}
          onChange={() => r.key && handleToggleSelect(r.key)} />
      ),
    },
    {
      title: '分類', dataIndex: 'categoryName', key: 'categoryName', width: 80, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '品牌', dataIndex: 'brandName', key: 'brandName', width: 80, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '資產名稱', dataIndex: 'modelName', key: 'modelName', width: 140, ellipsis: true,
    },
    // 新增：参数信息列
    {
      title: '參數信息', key: 'params', width: 180,
      render: (_: unknown, r: PurchaseOrderItem) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(r.params).map(([k, v]) => {
              if (!v) return null
              const label = paramNameMap.get(k) || k
              return (
                <Tag key={k} style={{ fontSize: 11, margin: 0, lineHeight: '20px' }}>
                  {label}：{v}
                </Tag>
              )
            })}
          </div>
        )
      },
    },
    {
      title: '數量', dataIndex: 'qty', key: 'qty', width: 60, align: 'right',
    },
    {
      title: '採購形式', dataIndex: 'purchaseType', key: 'purchaseType', width: 80,
      render: (v: string | undefined) => {
        if (v === 'purchase') return <Tag color="blue">購買</Tag>
        if (v === 'lease') return <Tag color="green">租賃</Tag>
        return '-'
      },
    },
    {
      title: '單價', key: 'price', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span>MOP {cp.toLocaleString()}</span>
      },
    },
    {
      title: '小計', key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
      },
    },
    // 操作列：增加编辑按钮，移动按钮增加智能提示
    {
      title: '操作', key: 'actions', width: 150, fixed: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const rowKey = r.key || r.modelId?.toString() || ''
        const otherGroups = supplierGroups.filter((g) => g.id !== groupId)
        const onlyOneGroup = supplierGroups.length <= 1

        const moveMenuItems: MenuProps['items'] = otherGroups.map((g, idx) => ({
          key: g.id,
          label: `分組 ${idx + 1}${g.supplier ? ` - ${g.supplier}` : ''}（${g.items.length} 項）`,
        }))

        const handleMove = (info: { key: string }) => {
          const targetGroup = supplierGroups.find((g) => g.id === info.key)
          if (!targetGroup || !rowKey) return
          setSupplierGroups((prev) => {
            const src = prev.find((g) => g.id === groupId)
            const item = src?.items.find((it) => it.key === rowKey)
            if (!item) return prev
            return prev.map((g) => {
              if (g.id === groupId) return { ...g, items: g.items.filter((it) => it.key !== rowKey) }
              if (g.id === info.key) return { ...g, items: [...g.items, item] }
              return g
            })
          })
          setSelectedItemKeys((prev) => { const next = new Set(prev); next.delete(rowKey); return next })
          message.success(`已移動到${targetGroup.supplier || '目標分組'}`)
        }

        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            {/* 编辑按钮：验收完成后禁用 */}
            <Button
              type="link"
              size="small"
              disabled={isReceived}
              onClick={() => handleOpenEdit(groupId, r)}
            >
              編輯
            </Button>
            {/* 移动按钮：单分组时禁用 */}
            {onlyOneGroup ? (
              <Tooltip title="當前只有一個分組，無需移動">
                <Button type="link" size="small" disabled>移動</Button>
              </Tooltip>
            ) : (
              <Dropdown menu={{ items: moveMenuItems, onClick: handleMove }} trigger={['click']}>
                <Button type="link" size="small">移動</Button>
              </Dropdown>
            )}
            <Button type="link" size="small" danger onClick={() => handleRemoveItem(groupId, rowKey)}>
              刪除
            </Button>
          </Space>
        )
      },
    },
  ]
  }
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const emptyGroups = supplierGroups.filter((g) => !g.supplier.trim())
      if (emptyGroups.length > 0) { message.warning('请填寫所有分组的名称'); return }
      setSubmitting(true)

      // 統一提交姓名（下拉選的是工號，與「開始採購」及自動建單口徑一致）
      const purchaserName = employees.find((e) => e.empId === v.purchaser)?.name || v.purchaser.trim() || undefined

      await updatePurchaseOrderExec(id, {
        purchaser: purchaserName,
        department: v.department?.trim() || undefined,
        execStatus: v.execStatus,
        remark: v.remark?.trim() || undefined,
        supplierGroups: supplierGroups.map((g) => ({
          ...g,
          supplier: g.supplier.trim(),
          contact: g.contact?.trim() || undefined,
          contactPhone: g.contactPhone?.trim() || undefined,
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
    <>
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
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>编辑采购订单</h2>
          <Tag color="orange" style={{ marginLeft: 4 }}>{order.poNo}</Tag>
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
              <Form.Item label={t('asset.execStatus')} name="execStatus" rules={[{ required: true, message: '请选择执行状态' }]}>
                <Select
                  disabled={order.status === 'received'}
                  options={EXEC_STATUS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: <Tag color={o.color}>{o.label}</Tag>,
                  }))}
                />
              </Form.Item>
              {order.status === 'received' && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: -18, marginBottom: 8 }}>訂單已全部驗收入庫，狀態不可變更</div>
              )}
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={16}>
              <Form.Item label="采购事由" name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={300} showCount style={{ resize: 'none' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>订单总计</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {grandTotal.toLocaleString()}</div>
            </Col>
          </Row>
        </div>

        {/* ====== 采购物资分组 ====== */}
        {supplierGroups.map((group, gi) => {
          const subtotal = groupSubtotal(group)
          const dm = group.deliveryMethod as DeliveryMethod | undefined
          return (
            <div key={group.id} style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {/* 分组标题 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                  }}>{gi + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>采购物资</span>
                  <Tag color="blue" style={{ fontSize: 11 }}>小计：MOP {subtotal.toLocaleString()}</Tag>
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
                  <Form.Item label="供应商名称" required style={{ marginBottom: 0 }}>
                    <Input value={group.supplier} onChange={(e) => updateGroup(group.id, { supplier: e.target.value })}
                      placeholder="请输入供应商名称" allowClear />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="供应商联络人姓名" style={{ marginBottom: 0 }}>
                    <Input value={group.contact} onChange={(e) => updateGroup(group.id, { contact: e.target.value })}
                      placeholder="请输入供应商联络人姓名" allowClear />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="供应商联络人电话" style={{ marginBottom: 0 }}>
                    <Input value={group.contactPhone} onChange={(e) => updateGroup(group.id, { contactPhone: e.target.value })}
                      placeholder="请输入供应商联络人电话" allowClear />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="下单日期" style={{ marginBottom: 0 }}>
                    <DatePicker value={group.orderDate ? dayjs(group.orderDate) : null}
                      onChange={(d: Dayjs | null) => updateGroup(group.id, { orderDate: d?.format('YYYY-MM-DD') || '' })}
                      style={{ width: '100%' }} placeholder="请选择下单日期" />
                  </Form.Item>
                </Col>
              </Row>

              {/* 收货方式 + 条件字段（并排展示） */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Form.Item label="收货方式" required style={{ marginBottom: 0 }}>
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
                <Col span={8}>
                  {showReceiveDate(dm) && (
                    <Form.Item label="预计收货日期" style={{ marginBottom: 0 }}>
                      <DatePicker
                        value={group.expectedReceiveDate ? dayjs(group.expectedReceiveDate) : null}
                        onChange={(d: Dayjs | null) => updateGroup(group.id, { expectedReceiveDate: d?.format('YYYY-MM-DD') || '' })}
                        style={{ width: '100%' }} placeholder="请选择预计收货日期"
                      />
                    </Form.Item>
                  )}
                </Col>
                <Col span={8}>
                  {showTrackingNo(dm) && (
                    <Form.Item label="快递单号" style={{ marginBottom: 0 }}>
                      <Input value={group.trackingNo}
                        onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                        placeholder="请输入快递单号" allowClear style={{ fontFamily: 'monospace' }} />
                    </Form.Item>
                  )}
                </Col>
              </Row>

              {/* 选中工具栏 */}
              {selectedItemKeys.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: 12, background: '#e6f7ff', borderRadius: 6, border: '1px solid #91d5ff' }}>
                  <span style={{ fontSize: 13, color: '#1890ff' }}>
                    已选择 <b>{selectedItemKeys.size}</b> 项物资
                  </span>
                  <Space size={8}>
                    <Button size="small" type="primary" icon={<SplitCellsOutlined />}
                      onClick={() => handleOpenSplitModal(group.id)}>
                      拆分到新分组
                    </Button>
                    <Button size="small" onClick={() => setSelectedItemKeys(new Set())}>
                      取消选择
                    </Button>
                  </Space>
                </div>
              )}

              {/* 明细表格 */}
              {group.items.length > 0 ? (
                <Table<PurchaseOrderItem>
                  columns={itemColumns(group.id)}
                  dataSource={group.items}
                  rowKey={(r) => r.key || r.modelId?.toString() || Math.random().toString()}
                  size="small"
                  pagination={false}
                  scroll={{ x: 1200 }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#bfbfbf', padding: '24px 0', fontSize: 13 }}>
                  暂无明细
                </div>
              )}
            </div>
          )
        })}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup} style={{ width: '100%', marginBottom: 16, height: 40 }}>
          + 新增供应商分组
        </Button>
      </Form>

      {/* ====== 拆分到新分组弹窗 ====== */}
      <Modal
        title="拆分物资到新分组"
        open={splitModalOpen}
        onOk={handleConfirmSplit}
        onCancel={() => setSplitModalOpen(false)}
        okText="确认拆分"
        cancelText="取消"
        width={560}
        centered
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
          确认后，选中的 <b>{selectedItemKeys.size}</b> 项物资将拆分到新的供应商分组，您可以在新分组中填写供应商信息。
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
          <Table<PurchaseOrderItem>
            columns={[
              { title: '分类', dataIndex: 'categoryName', key: 'categoryName', width: 80, ellipsis: true, render: (v: string | undefined) => v || '-' },
              { title: '品牌', dataIndex: 'brandName', key: 'brandName', width: 80, ellipsis: true, render: (v: string | undefined) => v || '-' },
              { title: '资产名称', dataIndex: 'modelName', key: 'modelName', width: 140, ellipsis: true },
              { title: '数量', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
              {
                title: '小计', key: 'subtotal', width: 100, align: 'right',
                render: (_: unknown, r: PurchaseOrderItem) => {
                  const cp = r.confirmedPrice || r.price
                  return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
                },
              },
            ]}
            dataSource={(supplierGroups.find((g) => g.id === splitModalGroupId)?.items || []).filter((it) => it.key && selectedItemKeys.has(it.key))}
            rowKey="key"
            pagination={false}
            size="small"
          />
        </div>
      </Modal>

      {/* ====== 明細編輯彈窗 ====== */}
      <ItemEditModal
        open={editModalOpen}
        editing={editingItem}
        categories={editCategories}
        brands={editBrands}
        models={editModels}
        onOk={handleEditOk}
        onCancel={() => { setEditModalOpen(false); setEditingItem(null) }}
      />

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      </div>
    </>
  )
}
