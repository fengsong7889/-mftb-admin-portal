/**
 * 采购订单录入/编辑共享 Hook
 *
 * 管理供应商分组、联系人、员工搜索、基础数据加载、明细弹窗状态等共用逻辑
 */
import { useState, useCallback, useEffect } from 'react'
import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchModelList, fetchCategoryList, fetchBrandList,
  fetchAllParamTypes, fetchSuppliersDropdown, fetchSupplierContacts,
  type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
  type AssetCategory, type AssetBrand, type AssetModel,
  type ParamType, type SupplierDropdownItem, type SupplierContactItem,
} from '../../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../../api/employee'
import { type ItemRow } from './utils'

/* ==================== Hook 返回值类型 ==================== */

export interface UsePurchaseOrderFormReturn {
  /* ----- 基础数据 ----- */
  categories: AssetCategory[]
  brands: AssetBrand[]
  models: AssetModel[]
  dataLoading: boolean

  /* ----- 员工搜索 ----- */
  employees: EmployeeItem[]
  empLoading: boolean
  selectedEmp: EmployeeItem | null
  setSelectedEmp: (emp: EmployeeItem | null) => void
  handleEmpSearch: (keyword: string) => void
  handleEmpChange: (empId: string) => void

  /* ----- 供应商 ----- */
  supplierOptions: SupplierDropdownItem[]
  supplierLoading: boolean
  handleSupplierSearch: (keyword: string) => void
  handleSupplierChange: (groupId: string, supplierId: number) => Promise<void>

  /* ----- 联系人 ----- */
  groupContacts: Record<string, SupplierContactItem[]>
  setGroupContacts: React.Dispatch<React.SetStateAction<Record<string, SupplierContactItem[]>>>
  autoFilledContact: Record<string, string>
  handleContactChange: (groupId: string, contactName: string) => void
  handleContactManualInput: (groupId: string, value: string) => void

  /* ----- 供应商分组 ----- */
  supplierGroups: PurchaseOrderSupplierGroup[]
  setSupplierGroups: React.Dispatch<React.SetStateAction<PurchaseOrderSupplierGroup[]>>
  handleAddGroup: () => void
  handleRemoveGroup: (groupId: string) => void
  updateGroup: (groupId: string, patch: Partial<PurchaseOrderSupplierGroup>) => void

  /* ----- 明细弹窗 ----- */
  modalOpen: boolean
  setModalOpen: (v: boolean) => void
  editingItem: ItemRow | null
  setEditingItem: (item: ItemRow | null) => void
  modalGroupId: string
  handleOpenAddModal: (groupId: string) => void
  handleOpenEditModal: (groupId: string, item: PurchaseOrderItem) => void
  handleModalOk: (row: ItemRow) => void
  handleRemoveItem: (groupId: string, rowKey: string) => void

  /* ----- 参数名称映射 ----- */
  paramNameMap: Map<string, string>
}

/* ==================== Hook 实现 ==================== */

export function usePurchaseOrderForm(
  initialGroups?: PurchaseOrderSupplierGroup[],
): UsePurchaseOrderFormReturn {
  const { t } = useTranslation()

  /* ----- 基础数据 ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])
  const [models, setModels] = useState<AssetModel[]>([])
  const [dataLoading, setDataLoading] = useState(false)

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

  /* ----- 员工搜索 ----- */
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)

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
  }

  /* ----- 供应商 ----- */
  const [supplierOptions, setSupplierOptions] = useState<SupplierDropdownItem[]>([])
  const [supplierLoading, setSupplierLoading] = useState(false)

  useEffect(() => {
    fetchSuppliersDropdown().then(setSupplierOptions).catch(() => {})
  }, [])

  const handleSupplierSearch = (keyword: string) => {
    setSupplierLoading(true)
    fetchSuppliersDropdown(keyword || undefined)
      .then(setSupplierOptions)
      .catch(() => {})
      .finally(() => setSupplierLoading(false))
  }

  /* ----- 联系人 ----- */
  const [groupContacts, setGroupContacts] = useState<Record<string, SupplierContactItem[]>>({})
  const [autoFilledContact, setAutoFilledContact] = useState<Record<string, string>>({})

  const handleSupplierChange = async (groupId: string, supplierId: number) => {
    const opt = supplierOptions.find((s) => s.id === supplierId)
    if (!opt) return
    updateGroup(groupId, { supplier: opt.name, supplierId: opt.id })
    try {
      const contacts = await fetchSupplierContacts(supplierId)
      setGroupContacts((prev) => ({ ...prev, [groupId]: contacts }))
      if (contacts.length > 0) {
        const first = contacts[0]
        updateGroup(groupId, { contact: first.contactName, contactPhone: first.contactPhone })
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

  const handleContactChange = (groupId: string, contactName: string) => {
    const contacts = groupContacts[groupId] || []
    const matched = contacts.find((c) => c.contactName === contactName)
    updateGroup(groupId, { contact: contactName, contactPhone: matched?.contactPhone || '' })
    if (matched) {
      setAutoFilledContact((prev) => ({ ...prev, [groupId]: contactName }))
    }
  }

  const handleContactManualInput = (groupId: string, value: string) => {
    updateGroup(groupId, { contact: value })
    setAutoFilledContact((prev) => {
      const next = { ...prev }
      delete next[groupId]
      return next
    })
  }

  /* ----- 供应商分组 ----- */
  const [supplierGroups, setSupplierGroups] = useState<PurchaseOrderSupplierGroup[]>(
    initialGroups || [{ id: `sg_${Date.now()}`, supplier: '', items: [] }],
  )

  const handleAddGroup = () => {
    setSupplierGroups((prev) => [...prev, { id: `sg_${Date.now()}`, supplier: '', items: [] }])
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

  const updateGroup = (groupId: string, patch: Partial<PurchaseOrderSupplierGroup>) => {
    setSupplierGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      const next = { ...g }
      if (patch.supplier !== undefined) next.supplier = patch.supplier
      if (patch.supplierId !== undefined) next.supplierId = patch.supplierId
      if (patch.contact !== undefined) next.contact = patch.contact
      if (patch.contactPhone !== undefined) next.contactPhone = patch.contactPhone
      if (patch.orderDate !== undefined) next.orderDate = patch.orderDate
      if (patch.trackingNo !== undefined) next.trackingNo = patch.trackingNo
      if (patch.deliveryMethod !== undefined) next.deliveryMethod = patch.deliveryMethod
      if (patch.expectedReceiveDate !== undefined) next.expectedReceiveDate = patch.expectedReceiveDate
      return next
    }))
  }

  /* ----- 明细弹窗 ----- */
  const [modalOpen, setModalOpen] = useState(false)
  const [modalGroupId, setModalGroupId] = useState('')
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

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

  /* ----- 参数名称映射 ----- */
  const [paramNameMap, setParamNameMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    fetchAllParamTypes().then((list) => {
      const map = new Map<string, string>()
      list.forEach((p: ParamType) => { map.set(p.code, p.name) })
      setParamNameMap(map)
    }).catch(() => {})
  }, [])

  return {
    categories, brands, models, dataLoading,
    employees, empLoading, selectedEmp, setSelectedEmp, handleEmpSearch, handleEmpChange,
    supplierOptions, supplierLoading, handleSupplierSearch, handleSupplierChange,
    groupContacts, setGroupContacts, autoFilledContact, handleContactChange, handleContactManualInput,
    supplierGroups, setSupplierGroups, handleAddGroup, handleRemoveGroup, updateGroup,
    modalOpen, setModalOpen, editingItem, setEditingItem, modalGroupId,
    handleOpenAddModal, handleOpenEditModal, handleModalOk, handleRemoveItem,
    paramNameMap,
  }
}
