/**
 * 驗收入庫獨立表單頁（採購訂單風格）
 *
 * - 展示採購訂單完整信息（經辦人、部門、供應商分組、明細等），方便驗收人核對
 * - 每條明細可逐行設置「已驗收數量」與「存放仓库」，確認後提交
 * - 支持 URL ?poId= 帶入訂單（由採購訂單詳情/列表「驗收入庫」跳轉）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button, Checkbox, InputNumber, DatePicker, Row, Col, Table, Tag, Space, Spin, Modal, Input, Radio, message, Upload, AutoComplete, TreeSelect,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined,
  CameraOutlined, DeleteOutlined, PlusOutlined, AppstoreOutlined, UploadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import BrandTag from '../../../components/BrandTag'
import {
  fetchPurchaseOrderDetail, fetchLocationList, createInboundBatch,
  saveInboundDraft, loadInboundDraft, deleteInboundDraft,
  uploadInboundPhoto, fetchCategoryAccessories, fetchInboundList,
  type PurchaseOrder, type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
  type AssetLocation,
} from '../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { useInboundEditor, initEditorGroups, generateClientLineId } from './useInboundEditor'
import type { InspectionAllocation, InspectionDisposition, InspectionRow } from './useInboundEditor'

/* ==================== 照片上傳校驗 ==================== */

/** 單張照片大小上限（與後端 EamInboundController 一致：5MB） */
const MAX_PHOTO_SIZE = 5 * 1024 * 1024

/**
 * 收貨方式展示文案（值為 asset 段 key，渲染時經 t() 轉換；與 InboundList 保持一致）
 */
const DELIVERY_METHOD_LABEL: Record<string, string> = {
  self_pickup: 'deliverySelfPickup',
  supplier_delivery: 'deliverySupplier',
  express: 'deliveryExpress',
}

/**
 * 上傳前 UX 校驗：僅圖片、≤ 5MB。
 * 註：此處僅作即時反饋減少無效請求，後端仍會以 magic bytes 與大小重新校驗（前端不可信）。
 */
function validatePhotoFile(file: File, t: (key: string) => string): boolean {
  if (!file.type.startsWith('image/')) {
    message.error(t('asset.photoOnlyImage'))
    return false
  }
  if (file.size > MAX_PHOTO_SIZE) {
    message.error(t('asset.photoSizeLimit'))
    return false
  }
  return true
}

/* ==================== 位置樹構建 ==================== */

interface LocationTreeNode {
  title: string
  value: number
  key: number
  children?: LocationTreeNode[]
}

function buildLocationTree(list: AssetLocation[]): LocationTreeNode[] {
  const nodeMap = new Map<number, LocationTreeNode>()
  list.forEach((loc) => {
    // 拼接完整地址：城市 + 区县 + 详细地址
    const addressParts = [loc.city, loc.district, loc.address].filter(Boolean)
    const fullAddress = addressParts.length > 0 ? `(${addressParts.join('')})` : ''
    const title = `${loc.name}${fullAddress}`
    nodeMap.set(loc.id, { title, value: loc.id, key: loc.id, children: [] })
  })
  const roots: LocationTreeNode[] = []
  list.forEach((loc) => {
    const node = nodeMap.get(loc.id)!
    const parent = loc.parentId ? nodeMap.get(loc.parentId) : undefined
    if (parent) parent.children!.push(node)
    else roots.push(node)
  })
  return roots
}

/** 部門樹節點 */
interface DeptTreeNode {
  title: string
  value: number
  key: number
  children?: DeptTreeNode[]
}

/** 構建部門樹（用於 TreeSelect） */
function buildDeptTree(list: DepartmentItem[]): DeptTreeNode[] {
  const nodeMap = new Map<number, DeptTreeNode>()
  list.forEach((dept) => {
    nodeMap.set(dept.id, { title: dept.name, value: dept.id, key: dept.id, children: [] })
  })
  const roots: DeptTreeNode[] = []
  list.forEach((dept) => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) parent.children!.push(node)
    else roots.push(node)
  })
  return roots
}

/* ==================== 驗收不通過處置方式 ==================== */

/** 不通過處置方式（退貨/換貨）——讓步接收已歸入「通過」分類 */
type RejectStatus = 'return' | 'exchange'

/** 現場照片上限（與全局憑證上傳一致：OA 採購/充值/轉賬均限 5 張） */
const MAX_PHOTOS = 5

/** labelKey/descKey 值均為 asset 段 key，渲染時經 t() 轉換 */
const REJECT_OPTIONS: { value: RejectStatus; labelKey: string; descKey: string }[] = [
  { value: 'return', labelKey: 'rejectReturn', descKey: 'rejectReturnDesc' },
  { value: 'exchange', labelKey: 'rejectExchange', descKey: 'rejectExchangeDesc' },
]

const _REJECT_LABEL: Record<RejectStatus, string> = { return: 'rejectReturn', exchange: 'rejectExchange' }
const _REJECT_COLOR: Record<RejectStatus, string> = { return: 'error', exchange: 'warning' }

/**
 * 歷史已完全處理（累計已驗收 + 累計退貨 ≥ 採購數量，無剩餘可驗）。
 * 此類行不參與本次驗收操作：不提供通過/不通過按鈕、輸入禁用。
 */
function isFullyAccepted(it: { qty: number; receivedQty?: number; histReturnQty?: number }): boolean {
  return (it.receivedQty || 0) + (it.histReturnQty || 0) >= it.qty
}

/** 歷史已全退貨（剩餘待驗部分全部被退貨，終態）：僅展示退貨標記，不可再驗收 */
function isFullyReturned(it: { qty: number; receivedQty?: number; histReturnQty?: number }): boolean {
  const remaining = it.qty - (it.receivedQty || 0)
  return (it.histReturnQty || 0) > 0 && (it.histReturnQty || 0) >= remaining
}

/* ==================== 驗收狀態 ==================== */

interface Props {
  poId?: number
  /** 供應商分組 ID：傳入時僅驗收該供應商的物資（與列表按供應商一行展示對應，獨立驗收） */
  groupId?: string
  onBack: () => void
}

export default function InboundForm({ poId, groupId, onBack }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const editor = useInboundEditor()
  const { state: editorState, dispatch: editorDispatch } = editor
  /** 從 hook 狀態派生當前渲染用的分組（保留 groups 變量名以減少下游改動） */
  const groups = editorState.groups
  const allocations = editorState.allocations
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const locationTree = useMemo(() => buildLocationTree(locations), [locations])
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])

  // 員工搜索（展示經辦人部門）
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)

  // 驗收不通過彈窗
  const [rejectModal, setRejectModal] = useState<{ groupId: string; rowKey: string } | null>(null)
  const [rejectType, setRejectType] = useState<RejectStatus>('return')
  const [rejectQty, setRejectQty] = useState<number | null>(1)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectPhotos, setRejectPhotos] = useState<{ name: string; dataUrl: string }[]>([])

  // 驗收確認彈窗（通過項：拍照憑證 + 配件清單）
  const [passModal, setPassModal] = useState<{ groupId: string; rowKey: string } | null>(null)
  const [passAccessories, setPassAccessories] = useState<{ name: string; qty: number }[]>([])
  /** 分類配件配置（品牌產品庫按分類維護，key 為 categoryCode；取代寫死枚舉） */
  const [categoryAccessories, setCategoryAccessories] = useState<Map<string, { name: string; defaultQty: number }[]>>(new Map())

  // 配件選擇彈窗（快速選擇配件：勾選後批量添加）
  const [accessorySelectOpen, setAccessorySelectOpen] = useState(false)
  const [selectedAccessoryNames, setSelectedAccessoryNames] = useState<Set<string>>(new Set())

  // 照片預覽
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [previewPhotos, setPreviewPhotos] = useState<{ name: string; dataUrl: string }[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewRotate, setPreviewRotate] = useState(0)
  const [uploading, setUploading] = useState(false)

  // 編輯模式：正在編輯的分配記錄（null 表示新建）
  const [editingAllocation, setEditingAllocation] = useState<InspectionAllocation | null>(null)
  /** 通過彈窗處置方式（pass=正常通過 / concession=讓步接收） */
  const [passDisposition, setPassDisposition] = useState<'pass' | 'concession'>('pass')
  /** 讓步接收原因（僅 passDisposition=concession 時生效） */
  const [passReason, setPassReason] = useState('')
  /** 通過彈窗存放倉庫 ID（可編輯） */
  const [passLocationId, setPassLocationId] = useState<number | undefined>(undefined)
  /** 通過彈窗管理部門 ID（可編輯） */
  const [passDepartmentId, setPassDepartmentId] = useState<number | undefined>(undefined)

  /** 更新分組驗收日期 */
  const updateGroupDate = (groupId: string, date: dayjs.Dayjs) => {
    editorDispatch({ type: 'SET_GROUP_DATE', groupId, inboundDate: date.format('YYYY-MM-DD') })
  }

  /* ----- 加載數據 ----- */
  const loadData = useCallback(async () => {
    if (!poId) return
    setLoading(true)
    try {
      const [orderData, locList, deptList] = await Promise.all([
        fetchPurchaseOrderDetail(poId),
        fetchLocationList(),
        fetchDepartments(),
      ])
      setOrder(orderData)
      setLocations(locList)
      setDepartments(deptList)
      const defaultLoc = locList[0]?.id

      // 歷史驗收處置反查：從入庫批次按明細匯總退貨/換貨件數（用於行級標記）
      const histMap = new Map<number, { ret: number; exc: number }>()
      try {
        const batchRes = await fetchInboundList({ page: 1, size: 200 })
        ;(batchRes.records || [])
          .filter((b) => b.poId === orderData.id)
          .forEach((b) => {
            (b.items || []).forEach((bi) => {
              if (bi.orderItemId == null) return
              const cur = histMap.get(bi.orderItemId) || { ret: 0, exc: 0 }
              if (bi.disposition === 'return') cur.ret += bi.qty || 0
              else if (bi.disposition === 'exchange') cur.exc += bi.qty || 0
              histMap.set(bi.orderItemId, cur)
            })
          })
      } catch { /* 歷史處置查詢失敗不阻斷主流程 */ }

      // 初始化供應商分組（含驗收字段）
      const srcGroups: PurchaseOrderSupplierGroup[] = orderData.supplierGroups?.length
        ? orderData.supplierGroups
        : [{
            id: 'sg_default',
            supplier: orderData.supplier || '',
            contact: orderData.contact || '',
            orderDate: orderData.orderDate || '',
            trackingNo: orderData.trackingNo || '',
            items: orderData.items.map((it) => ({ ...it })),
          }]

      const inboundGroupsAll = initEditorGroups(srcGroups, histMap, dayjs().format('YYYY-MM-DD'))
      // 按供應商獨立驗收：指定分組時僅載入該供應商的物資明細
      const inboundGroups = groupId && inboundGroupsAll.some((g) => g.group.id === groupId)
        ? inboundGroupsAll.filter((g) => g.group.id === groupId)
        : inboundGroupsAll
      editorDispatch({ type: 'INIT', groups: inboundGroups })

      // 嘗試恢復草稿（分組級草稿優先）
      const draft = await loadInboundDraft(poId, groupId)
      if (draft && draft.items.length > 0) {
        // 恢復分組日期
        if (draft.inboundDate) {
          inboundGroups.forEach((g) => {
            editorDispatch({ type: 'SET_GROUP_DATE', groupId: g.group.id, inboundDate: draft.inboundDate })
          })
        }
        // 恢復分配記錄
        draft.items.forEach((di) => {
          const row = inboundGroups
            .flatMap((g) => g.rows)
            .find((r) => r.item.id === di.orderItemId)
          if (!row) return
          editorDispatch({
            type: 'ADD_ALLOCATION',
            allocation: {
              clientLineId: di.clientLineId || generateClientLineId(),
              orderItemId: di.orderItemId!,
              groupId: row.groupId,
              qty: di.qty,
              disposition: (di.status || 'pass') as InspectionDisposition,
              inboundDate: di.inboundDate || draft.inboundDate || dayjs().format('YYYY-MM-DD'),
              locationId: di.locationId || undefined,
              reason: di.reason,
              photos: di.photos || [],
              accessories: di.accessories || [],
            },
          })
        })
        message.info(t('asset.draftRestored'))
      }

      // 經辦人信息
      if (orderData.purchaser) {
        const empRes = await fetchEmployees({ page: 1, size: 30, keyword: orderData.purchaser, employmentStatus: 'active' })
        setEmployees(empRes.records || [])
        const emp = empRes.records.find((e) => e.name === orderData.purchaser || e.empId === orderData.purchaser)
        if (emp) setSelectedEmp(emp)
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [poId, groupId, t])

  useEffect(() => { loadData() }, [loadData])

  /* ----- 分組操作 ----- */

  /* ----- 通過彈窗照片（彈窗局部狀態，確認後寫入分配記錄） ----- */
  const [passPhotos, setPassPhotos] = useState<{ name: string; dataUrl: string }[]>([])

  const handlePassPhotoUpload = useCallback(async (file: File) => {
    if (!validatePhotoFile(file, t)) return false
    setUploading(true)
    try {
      const result = await uploadInboundPhoto(file)
      setPassPhotos((prev) => [...prev, result])
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : t('asset.photoUploadFailed'))
    } finally {
      setUploading(false)
    }
    return false
  }, [t])

  const handlePassPhotoRemove = useCallback((idx: number) => {
    setPassPhotos((prev) => {
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }, [])

  const handleRejectPhotoUpload = useCallback(async (file: File) => {
    if (!validatePhotoFile(file, t)) return false
    setUploading(true)
    try {
      const result = await uploadInboundPhoto(file)
      setRejectPhotos((prev) => [...prev, result])
    } catch (err) {
      // 優先展示後端具體校驗消息（如文件類型/大小/魔數不合法），否則回退通用文案
      message.error(err instanceof Error && err.message ? err.message : t('asset.photoUploadFailed'))
    } finally {
      setUploading(false)
    }
    return false
  }, [t])

  const handleRejectPhotoRemove = useCallback((idx: number) => {
    setRejectPhotos((prev) => {
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
  }, [])

  /** 驗收確認彈窗當前行（展示物資信息；編輯模式按 orderItemId 查找） */
  const passRow = useMemo(() => {
    if (!passModal) return null
    if (editingAllocation) {
      return groups.find((g) => g.group.id === passModal.groupId)?.rows.find((r) => r.item.id === editingAllocation.orderItemId) || null
    }
    return groups.find((g) => g.group.id === passModal.groupId)?.rows.find((r) => r.rowKey === passModal.rowKey) || null
  }, [passModal, groups, editingAllocation])

  /** 彈窗打開時按分類加載配件配置 */
  useEffect(() => {
    if (!passModal) return
    const code = passRow?.item.categoryCode
    if (!code || categoryAccessories.has(code)) return
    fetchCategoryAccessories(code, true)
      .then((list) => setCategoryAccessories((prev) => new Map(prev).set(code, list.map((a) => ({ name: a.name, defaultQty: a.defaultQty || 1 })))))
      .catch(() => setCategoryAccessories((prev) => new Map(prev).set(code, [])))
  }, [passModal, groups, categoryAccessories])

  /** 當前分類已配置的配件選項 */
  const passAccessoryOptions = useMemo(() => {
    const code = passRow?.item.categoryCode
    if (!code) return []
    return (categoryAccessories.get(code) || []).map((a) => ({ value: a.name }))
  }, [passRow, categoryAccessories])

  /** 打開配件選擇彈窗（預勾選已存在的配件） */
  const handleOpenAccessorySelect = () => {
    const existing = new Set(passAccessories.map((a) => a.name))
    setSelectedAccessoryNames(existing)
    setAccessorySelectOpen(true)
  }

  /** 確認配件選擇：僅將勾選的配件添加到清單 */
  const handleAccessorySelectConfirm = () => {
    const code = passRow?.item.categoryCode
    const list = code ? categoryAccessories.get(code) || [] : []
    const existing = new Set(passAccessories.map((a) => a.name))
    const additions = list
      .filter((a) => selectedAccessoryNames.has(a.name) && !existing.has(a.name))
      .map((a) => ({ name: a.name, qty: a.defaultQty || 1 }))
    setPassAccessories((prev) => [...prev, ...additions])
    setAccessorySelectOpen(false)
  }

  /** 確認通過（含讓步接收）：新建或編輯分配記錄 */
  const handlePassConfirm = () => {
    if (!passModal || !passRow) return
    // 編輯模式用分配記錄的 qty，新建模式用行輸入 qty
    const qty = editingAllocation ? editingAllocation.qty : passRow.inputQty
    if (!qty || qty <= 0) { message.warning(t('asset.warnRejectQty')); return }
    if (passPhotos.length === 0) { message.warning(t('asset.warnPhotoRequired')); return }
    if (passAccessories.some((a) => !a.name.trim())) { message.warning(t('asset.warnAccessoryName')); return }
    if (passAccessories.some((a) => a.qty <= 0)) { message.warning(t('asset.warnAccessoryQty')); return }
    if (passDisposition === 'concession' && !passReason.trim()) { message.warning(t('asset.warnConcessionReason')); return }
    if (!passLocationId) { message.warning(t('asset.warnLocationRequired')); return }
    if (!passDepartmentId) { message.warning(t('asset.warnDepartmentRequired')); return }
    const group = groups.find((g) => g.group.id === passModal.groupId)
    if (!group) return
    const disposition = passDisposition // 'pass' | 'concession'
    const locationName = locations.find((l) => l.id === passLocationId)?.name || ''
    const departmentName = departments.find((d) => d.id === passDepartmentId)?.name || ''
    const payload = {
      orderItemId: passRow.item.id!,
      groupId: passModal.groupId,
      qty,
      disposition,
      inboundDate: group.inboundDate,
      locationId: passLocationId,
      locationName,
      departmentId: passDepartmentId,
      departmentName,
      reason: disposition === 'concession' ? passReason.trim() : undefined,
      photos: [...passPhotos],
      accessories: passAccessories.map((a) => ({ name: a.name.trim(), qty: a.qty })),
    }
    if (editingAllocation) {
      editor.updateAllocation(editingAllocation.clientLineId, payload)
    } else {
      editor.addAllocation(payload)
      editorDispatch({ type: 'RESET_ROW_INPUT', groupId: passModal.groupId, rowKey: passModal.rowKey })
    }
    setPassModal(null)
    setPassPhotos([])
    setPassAccessories([])
    setEditingAllocation(null)
    setPassDisposition('pass')
    setPassReason('')
  }

  const groupSubtotal = (ig: typeof groups[0]) =>
    ig.group.items.reduce((s: number, it: PurchaseOrderItem) => s + (it.confirmedPrice || it.price) * it.qty, 0)

  const grandTotal = groups.reduce((s, g) => s + groupSubtotal(g), 0)

  /** 全選/取消全選分組內明細 */
  const toggleGroupAll = (gid: string, checked: boolean) => {
    editorDispatch({ type: 'TOGGLE_GROUP_ALL', groupId: gid, selected: checked })
  }

  /** 已分配總數（所有處置方式） */
  const totalAllocatedQty = editor.summary.totalAllocated
  /** 本次分配筆數 */
  const allocationCount = editor.summary.allocationCount

  /** 提交不通過：新建或編輯分配記錄 */
  const handleRejectConfirm = () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) { message.warning(t('asset.warnRejectReason')); return }
    if (rejectPhotos.length === 0) { message.warning(t('asset.warnPhotoRequired')); return }
    if (!rejectQty || rejectQty <= 0) { message.warning(t('asset.warnRejectQty')); return }
    const row = groups.find((g) => g.group.id === rejectModal.groupId)?.rows.find((r) => r.rowKey === rejectModal.rowKey)
    if (!row) return
    const group = groups.find((g) => g.group.id === rejectModal.groupId)
    if (!group) return
    const payload = {
      orderItemId: row.item.id!,
      groupId: rejectModal.groupId,
      qty: rejectQty,
      disposition: rejectType as InspectionDisposition,
      inboundDate: group.inboundDate,
      reason: rejectReason.trim(),
      photos: [...rejectPhotos],
      accessories: [],
    }
    if (editingAllocation) {
      editor.updateAllocation(editingAllocation.clientLineId, payload)
    } else {
      editor.addAllocation(payload)
      editorDispatch({ type: 'RESET_ROW_INPUT', groupId: rejectModal.groupId, rowKey: rejectModal.rowKey })
    }
    setRejectModal(null)
    setRejectType('return')
    setRejectQty(1)
    setRejectReason('')
    setRejectPhotos([])
    setEditingAllocation(null)
  }

  /** 編輯分配記錄：根據處置方式打開對應彈窗，預填現有數據 */
  const handleEditAllocation = (alloc: InspectionAllocation) => {
    setEditingAllocation(alloc)
    if (alloc.disposition === 'pass' || alloc.disposition === 'concession') {
      // 通過 / 讓步接收 → 打開通過彈窗
      setPassDisposition(alloc.disposition === 'concession' ? 'concession' : 'pass')
      setPassReason(alloc.reason || '')
      setPassPhotos([...alloc.photos])
      setPassAccessories(alloc.accessories.map((a) => ({ ...a })))
      setPassLocationId(alloc.locationId || undefined)
      setPassDepartmentId(alloc.departmentId || undefined)
      setPassModal({ groupId: alloc.groupId, rowKey: `edit_${alloc.clientLineId}` })
    } else {
      // 退貨 / 換貨 → 打開不通過彈窗
      setRejectType(alloc.disposition as RejectStatus)
      setRejectQty(alloc.qty)
      setRejectReason(alloc.reason || '')
      setRejectPhotos([...alloc.photos])
      setRejectModal({ groupId: alloc.groupId, rowKey: `edit_${alloc.clientLineId}` })
    }
  }

  /* ----- 明細表格列 ----- */
  const itemColumns = useCallback((gid: string): TableColumnsType<InspectionRow> => [
    {
      title: (() => {
        const g = groups.find((gg) => gg.group.id === gid)
        const rows = g?.rows || []
        const allSel = rows.length > 0 && rows.every((r) => r.selected)
        const someSel = rows.some((r) => r.selected)
        return (
          <Checkbox checked={allSel} indeterminate={!allSel && someSel}
            onChange={(e) => toggleGroupAll(gid, e.target.checked)}
          />
        )
      })(),
      key: 'selected', width: 50, align: 'center',
      render: (_: unknown, r: InspectionRow) => (
        <Checkbox checked={r.selected}
          onChange={(e) => editorDispatch({ type: 'TOGGLE_SELECTED', groupId: gid, rowKey: r.rowKey, selected: e.target.checked })}
        />
      ),
    },
    { title: t('asset.colCategory'), key: 'categoryName', width: 90, ellipsis: true,
      render: (_: unknown, r: InspectionRow) => r.item.categoryName || '-' },
    { title: t('asset.colBrand'), key: 'brandName', width: 90, ellipsis: true,
      render: (_: unknown, r: InspectionRow) => r.item.brandName || '-' },
    { title: t('asset.colAssetName'), key: 'modelName', width: 140, ellipsis: true,
      render: (_: unknown, r: InspectionRow) => r.item.modelName },
    { title: t('asset.colQty'), key: 'qty', width: 60, align: 'right',
      render: (_: unknown, r: InspectionRow) => r.item.qty },
    {
      title: t('asset.purchaseType'), key: 'purchaseType', width: 80,
      render: (_: unknown, r: InspectionRow) => {
        const pt = r.item.purchaseType
        if (!pt) return <span style={{ color: '#bfbfbf' }}>-</span>
        return <Tag color={pt === 'purchase' ? 'blue' : 'green'}>{pt === 'purchase' ? t('asset.purchaseTypePurchase') : t('asset.purchaseTypeLease')}</Tag>
      },
    },
    {
      title: `${t('asset.colUnitPrice')}(MOP)`, key: 'confirmedPrice', width: 100, align: 'right',
      render: (_: unknown, r: InspectionRow) => (
        <span style={{ fontWeight: r.item.confirmedPrice ? 600 : 400, color: r.item.confirmedPrice ? '#52c41a' : '#bfbfbf' }}>
          {r.item.confirmedPrice ? r.item.confirmedPrice.toLocaleString() : '-'}
        </span>
      ),
    },
    {
      title: `${t('asset.colSubtotal')}(MOP)`, key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: InspectionRow) => {
        const cp = r.item.confirmedPrice || r.item.price
        return <span style={{ fontWeight: 700, color: '#262626' }}>{(cp * r.item.qty).toLocaleString()}</span>
      },
    },
    {
      title: t('asset.colReceived'), key: 'receivedQty', width: 90, align: 'right',
      render: (_: unknown, r: InspectionRow) => {
        const v = r.item.receivedQty || 0
        const full = isFullyAccepted(r.item)
        return (
          <Space size={2} style={{ justifyContent: 'flex-end' }}>
            <Tag color={v > 0 ? 'success' : 'default'} style={{ margin: 0 }}>{v}</Tag>
            {full && <Tag color="success" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{t('asset.tagCompleted')}</Tag>}
          </Space>
        )
      },
    },
    {
      title: t('asset.colThisInbound'), key: 'inputQty', width: 110,
      render: (_: unknown, r: InspectionRow) => {
        const allocatable = editor.getAllocatable(r)
        const rowAllocs = editor.getRowAllocations(r).length
        return (
          <div>
            <InputNumber
              value={r.inputQty}
              onChange={(v) => editor.setInputQty(gid, r.rowKey, v ?? null)}
              style={{ width: '100%' }}
              min={0}
              max={Math.max(0, allocatable)}
              disabled={!r.selected || allocatable <= 0}
              placeholder={allocatable <= 0 ? t('asset.tagCompleted') : undefined}
            />
            {rowAllocs > 0 && (
              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>
                {t('asset.allocatedCount', { count: rowAllocs })}
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: t('asset.colHistory'), key: 'history', width: 100, align: 'center',
      render: (_: unknown, r: InspectionRow) => {
        if (isFullyReturned(r.item)) {
          return <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('asset.rejectReturn')}</Tag>
        }
        if (isFullyAccepted(r.item) && !(r.histExchangeQty || 0) && !(r.histReturnQty || 0)) {
          return <Tag color="success" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagCompleted')}</Tag>
        }
        return (
          <Space size={2} wrap>
            {(r.histExchangeQty || 0) > 0 && (
              <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagExchangeCount', { count: r.histExchangeQty })}</Tag>
            )}
            {(r.histReturnQty || 0) > 0 && (
              <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagReturnCount', { count: r.histReturnQty })}</Tag>
            )}
            {!(r.histExchangeQty || 0) && !(r.histReturnQty || 0) && !isFullyAccepted(r.item) && <span style={{ color: '#bfbfbf', fontSize: 11 }}>-</span>}
          </Space>
        )
      },
    },
    {
      title: t('asset.colAction'), key: 'action', width: 100, align: 'center',
      render: (_: unknown, r: InspectionRow) => {
        const allocatable = editor.getAllocatable(r)
        const rowAllocs = editor.getRowAllocations(r)
        if (isFullyReturned(r.item)) return null
        if (allocatable <= 0 && rowAllocs.length === 0) return null
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button
              type="link" size="small"
              disabled={!r.selected || allocatable <= 0}
              onClick={() => {
                if (!r.inputQty || r.inputQty <= 0) { message.warning(t('asset.warnInputQtyFirst')); return }
                if (r.inputQty > allocatable) {
                  message.warning(t('asset.warnQtyExceed', { max: allocatable }))
                  editor.setInputQty(gid, r.rowKey, allocatable)
                  return
                }
                setEditingAllocation(null)
                setPassDisposition('pass')
                setPassReason('')
                setPassModal({ groupId: gid, rowKey: r.rowKey })
                setPassPhotos([])
                setPassAccessories([])
              }}
              style={{ color: '#52C41A', fontWeight: 600, fontSize: 12, padding: '0 2px' }}
            >
              {t('asset.passBtn')}
            </Button>
            <Button
              type="link" size="small" danger
              disabled={!r.selected || allocatable <= 0}
              onClick={() => {
                if (!r.inputQty || r.inputQty <= 0) { message.warning(t('asset.warnInputQtyFirst')); return }
                if (r.inputQty > allocatable) {
                  message.warning(t('asset.warnQtyExceed', { max: allocatable }))
                  editor.setInputQty(gid, r.rowKey, allocatable)
                  return
                }
                setEditingAllocation(null)
                setRejectModal({ groupId: gid, rowKey: r.rowKey })
                setRejectType('return')
                setRejectQty(r.inputQty || 1)
                setRejectReason('')
                setRejectPhotos([])
              }}
              style={{ fontSize: 12, padding: '0 2px' }}
            >
              {t('asset.failBtn')}
            </Button>
          </Space>
        )
      },
    },
  ], [groups, allocations, locationTree, t, editor])

  /* ----- 提交 / 保存 ----- */
  const [saving, setSaving] = useState(false)

  /** 當前驗收範圍的供應商名稱 */
  const scopeSupplier = groupId ? groups[0]?.group.supplier || '' : ''

  /** 保存草稿（不跳轉，保留當前狀態） */
  const handleSave = async () => {
    if (!order) return
    setSaving(true)
    try {
      const draftItems = allocations.map((a) => ({
        orderItemId: a.orderItemId,
        modelId: groups.flatMap((g) => g.rows).find((r) => r.item.id === a.orderItemId)?.item.modelId || 0,
        inboundDate: a.inboundDate,
        qty: a.qty,
        locationId: a.locationId || 0,
        status: a.disposition as 'pass' | 'return' | 'exchange' | 'concession',
        reason: a.reason,
        photos: a.photos.length > 0 ? a.photos : undefined,
        accessories: a.accessories.length > 0 ? a.accessories : undefined,
        clientLineId: a.clientLineId,
      }))
      await saveInboundDraft({
        poId: order.id,
        groupId,
        inboundDate: groups[0]?.inboundDate || dayjs().format('YYYY-MM-DD'),
        operator: selectedEmp?.name || order.purchaser || '',
        items: draftItems,
        remark: t('asset.draftRemark', { poNo: order.poNo }) + (scopeSupplier ? t('asset.remarkSupplierPart', { supplier: scopeSupplier }) : ''),
      })
      message.success(t('asset.draftSaved'))
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  /** 確認驗收（跳轉回列表） */
  const handleSubmit = async () => {
    if (!order) return
    const submitItems = editor.buildSubmitItems()
    const allItems = submitItems.map((a) => ({
      clientLineId: a.clientLineId,
      orderItemId: a.orderItemId,
      sourceExchangeItemId: a.sourceExchangeItemId,
      modelId: a.modelId,
      inboundDate: a.inboundDate,
      qty: a.qty,
      // pass 和 concession 均需要 locationId（均生成资产入库）
      locationId: (a.disposition === 'pass' || a.disposition === 'concession') ? (a.locationId || 0) : 0,
      locationName: a.locationName,
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      disposition: a.disposition,
      rejectReason: a.reason,
      photos: a.photos,
      accessories: a.accessories,
    }))
    if (allItems.some((it) => !it.orderItemId || it.qty <= 0)) {
      message.warning(t('asset.warnInvalidItems'))
      return
    }
    if (!allItems.length) {
      message.warning(t('asset.warnNoItems'))
      return
    }
    const passQty = allItems.filter((it) => it.disposition === 'pass').reduce((s, it) => s + it.qty, 0)
    Modal.confirm({
      title: t('asset.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('asset.poLabel')}</span><b>{order.poNo}</b></div>
          {scopeSupplier && <div className="confirm-info-row"><span>{t('asset.supplierLabel')}</span><b>{scopeSupplier}</b></div>}
          <div className="confirm-info-row"><span>{t('asset.qtyLabel')}</span><b>{editor.summary.totalAllocated} ({editor.summary.allocationCount} {t('asset.unitPiece')})</b></div>
          <div className="confirm-info-row"><span>{t('asset.assetsGenLabel')}</span><b>{passQty}</b></div>
        </div>
      ),
      okText: t('asset.confirmSubmitOk'), cancelText: t('common.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
      const batch = await createInboundBatch({
        poId: order.id,
        inboundDate: groups[0]?.inboundDate || dayjs().format('YYYY-MM-DD'),
        operator: selectedEmp?.name || order.purchaser || '',
        items: allItems,
        remark: t('asset.inboundRemark', { poNo: order.poNo }) + (scopeSupplier ? t('asset.remarkSupplierPart', { supplier: scopeSupplier }) : ''),
        contractVersion: 2,
      })
      await deleteInboundDraft(order.id, groupId)
      message.success(t('asset.inboundSuccess', { count: batch.generatedAssetCount }))
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  if (loading || !order) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const purchaserDept = selectedEmp?.department || ''

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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{t('asset.inboundTitle')}</h2>
          <Tag color="orange" style={{ marginLeft: 4 }}>{order.poNo}</Tag>
          {scopeSupplier && <Tag color="purple">{t('asset.supplierLabel')}{scopeSupplier}</Tag>}
        </div>
      </div>

      {/* ====== 訂單信息 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 24px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.orderInfoTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Row gutter={[16, 8]}>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.colPurchaser')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{order.purchaser || '-'}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderDept')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{purchaserDept || '-'}</div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderBrand')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {order.brand ? <BrandTag value={order.brand} /> : <span style={{ color: '#bfbfbf', fontSize: 14 }}>-</span>}
              {order.brand === 1 && <span style={{ fontSize: 12, color: '#E8720C' }}>{t('asset.brandCodeTb')}</span>}
              {order.brand === 2 && <span style={{ fontSize: 12, color: '#1890FF' }}>{t('asset.brandCodeMf')}</span>}
            </div>
          </Col>
        </Row>
        <Row gutter={[16, 8]}>
          <Col xs={24} sm={12} md={8}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderTotal')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {grandTotal.toLocaleString()}</div>
          </Col>
          <Col xs={24} sm={12} md={16}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderReasonLabel')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{order.remark || '-'}</div>
          </Col>
        </Row>

      </div>

      {/* ====== 採購物資分組 ====== */}
      {groups.map((ig, gi) => {
        const subtotal = groupSubtotal(ig)
        const groupAllocs = allocations.filter((a) => a.groupId === ig.group.id)
        const groupAllocQty = groupAllocs.reduce((s, a) => s + a.qty, 0)
        const groupTotal = ig.rows.length
        return (
          <div key={ig.group.id} style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 24px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {/* 分組標題 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                }}>{gi + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('asset.groupTitle')}</span>
                <Tag color="blue" style={{ fontSize: 11 }}>{t('asset.groupSubtotalTag', { amount: subtotal.toLocaleString() })}</Tag>
                <Tag color={groupAllocs.length > 0 ? 'success' : 'processing'} style={{ fontSize: 11 }}>
                  {t('asset.groupProgressTag', { confirmed: groupAllocs.length, total: groupTotal })}
                </Tag>
                {groupAllocQty > 0 && (
                  <Tag color="warning" style={{ fontSize: 11 }}>{t('asset.groupAllocatedTag', { count: groupAllocs.length, qty: groupAllocQty })}</Tag>
                )}
              </div>
            </div>

            {/* 供應商信息（只讀）+ 驗收日期 */}
            <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelSupplierName')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{ig.group.supplier || '-'}</div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelSupplierContact')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{ig.group.contact || '-'}</div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelOrderDate')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{ig.group.orderDate || '-'}</div>
              </Col>
            </Row>
            <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelDeliveryMethod')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{ig.group.deliveryMethod && DELIVERY_METHOD_LABEL[ig.group.deliveryMethod] ? t(`asset.${DELIVERY_METHOD_LABEL[ig.group.deliveryMethod]}`) : '-'}</div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelInboundDate')}</div>
                <DatePicker
                  value={dayjs(ig.inboundDate)}
                  onChange={(d) => updateGroupDate(ig.group.id, d || dayjs())}
                  style={{ width: '100%' }}
                  disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                />
              </Col>
            </Row>

            {/* 明細表格 */}
            <Table<InspectionRow>
              columns={itemColumns(ig.group.id)}
              dataSource={ig.rows}
              rowKey={(r) => r.rowKey}
              size="small"
              pagination={false}
              scroll={{ x: 1200 }}
              rowClassName={(r) => {
                const rowAllocs = allocations.filter((a) => a.orderItemId === r.item.id)
                if (rowAllocs.some((a) => a.disposition === 'return' || a.disposition === 'exchange')) return 'inbound-rejected-row'
                if ((r.histReturnQty || 0) > 0) return 'inbound-returned-row'
                if ((r.histExchangeQty || 0) > 0) return 'inbound-exchanged-row'
                if (isFullyAccepted(r.item)) return 'inbound-accepted-row'
                if (!r.selected) return 'inbound-unselected-row'
                return ''
              }}
            />
          </div>
        )
      })}

      {/* ====== 本次驗收結果（未提交） ====== */}
      {allocationCount > 0 && (() => {
        const DISP_LABEL: Record<string, { color: string; key: string }> = {
          pass: { color: 'success', key: 'asset.tagAccepted' },
          return: { color: 'error', key: 'asset.rejectReturn' },
          exchange: { color: 'warning', key: 'asset.rejectExchange' },
          concession: { color: 'processing', key: 'asset.rejectConcession' },
        }
        return (
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 24px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f0f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AppstoreOutlined style={{ fontSize: 14, color: '#1890FF' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.resultsTitle')}</span>
              <Tag color="blue" style={{ fontSize: 11 }}>{t('asset.resultsCountTag', { count: allocationCount, qty: totalAllocatedQty })}</Tag>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <Table
              columns={[
                { title: t('asset.colSupplier'), key: 'supplier', width: 120, ellipsis: true,
                  render: (_: unknown, a: InspectionAllocation) => groups.find((g) => g.group.id === a.groupId)?.group.supplier || '-' },
                { title: t('asset.colAssetName'), key: 'modelName', width: 160, ellipsis: true,
                  render: (_: unknown, a: InspectionAllocation) => groups.flatMap((g) => g.rows).find((r) => r.item.id === a.orderItemId)?.item.modelName || '-' },
                { title: t('asset.colQty'), key: 'qty', width: 60, align: 'right',
                  render: (_: unknown, a: InspectionAllocation) => <span style={{ fontWeight: 600 }}>{a.qty}</span> },
                {
                  title: t('asset.colDisposeMethod'), key: 'disposition', width: 100,
                  render: (_: unknown, a: InspectionAllocation) => {
                    const d = DISP_LABEL[a.disposition] || DISP_LABEL.pass
                    return <Tag color={d.color}>{t(d.key)}</Tag>
                  },
                },
                {
                  title: t('asset.colRejectReason'), key: 'reason', ellipsis: true,
                  render: (_: unknown, a: InspectionAllocation) => <span style={{ color: '#595959' }}>{a.reason || '-'}</span>,
                },
                {
                  title: t('asset.colPhotos'), key: 'photos', width: 100, align: 'center',
                  render: (_: unknown, a: InspectionAllocation) => {
                    if (!a.photos || a.photos.length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
                    return (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                        {a.photos.slice(0, 3).map((p, idx) => (
                          <img
                            key={idx}
                            src={p.dataUrl}
                            alt={p.name}
                            onClick={() => { setPreviewPhotos(a.photos); setPreviewIndex(idx); setPreviewImage(p.dataUrl); setPreviewRotate(0); setPreviewVisible(true) }}
                            style={{
                              width: 36, height: 36, objectFit: 'cover', borderRadius: 4,
                              border: '1px solid #e8e8e8', cursor: 'pointer', background: '#fafafa',
                              transition: 'transform 0.2s',
                            }}
                            onMouseEnter={(e) => { (e.target as HTMLImageElement).style.transform = 'scale(1.15)' }}
                            onMouseLeave={(e) => { (e.target as HTMLImageElement).style.transform = 'scale(1)' }}
                          />
                        ))}
                        {a.photos.length > 3 && (
                          <span style={{ fontSize: 11, color: '#8C8C8C', marginLeft: 2 }}>+{a.photos.length - 3}</span>
                        )}
                      </div>
                    )
                  },
                },
                {
                  title: t('asset.colAction'), key: 'action', width: 120, align: 'center',
                  render: (_: unknown, a: InspectionAllocation) => (
                    <Space size={0} split={<span className="action-split">|</span>}>
                      <Button type="link" size="small"
                        onClick={() => handleEditAllocation(a)}
                        style={{ fontSize: 12 }}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button type="link" size="small" danger
                        onClick={() => editor.removeAllocation(a.clientLineId)}
                        style={{ fontSize: 12 }}
                      >
                        {t('asset.undo')}
                      </Button>
                    </Space>
                  ),
                },
              ]}
              dataSource={allocations}
              rowKey={(a) => a.clientLineId}
              size="small"
              pagination={false}
            />
          </div>
        )
      })()}

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={handleSave}>
            {t('common.save')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}
            disabled={allocationCount <= 0}>
            {t('asset.submitBtn', { count: totalAllocatedQty })} ({allocationCount})
          </Button>
        </Space>
      </div>

      {/* ====== 驗收確認彈窗（通過 / 讓步接收） ====== */}
      <Modal
        title={editingAllocation ? t('asset.editAllocationTitle') : t('asset.passModalTitle')}
        open={!!passModal}
        onOk={handlePassConfirm}
        onCancel={() => { setPassModal(null); setPassPhotos([]); setPassAccessories([]); setEditingAllocation(null); setPassDisposition('pass'); setPassReason(''); setPassLocationId(undefined); setPassDepartmentId(undefined) }}
        okText={passDisposition === 'concession' ? t('asset.confirmConcession') : (editingAllocation ? t('common.confirm') : t('asset.passOkText'))}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnClose
      >
        {passRow && (
          <>
            {/* 物資信息 */}
            <div style={{ background: '#FAFAFA', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', rowGap: 10, fontSize: 13 }}>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.modelNameLabel')}</span><span style={{ fontWeight: 600 }}>{passRow.item.modelName}</span></div>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.categoryLabel')}</span>{passRow.item.categoryName || '-'}</div>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.thisQtyLabel')}</span><span style={{ fontWeight: 700, color: '#E8720C' }}>{editingAllocation ? editingAllocation.qty : (passRow.inputQty ?? 0)}</span> {t('asset.unitPiece')}</div>
                <div>
                  <span style={{ color: '#8C8C8C' }}>{t('asset.purchaseType')}</span>
                  {passRow.item.purchaseType
                    ? <Tag color={passRow.item.purchaseType === 'purchase' ? 'blue' : 'green'} style={{ marginLeft: 4 }}>{passRow.item.purchaseType === 'purchase' ? t('asset.purchaseTypePurchase') : t('asset.purchaseTypeLease')}</Tag>
                    : <span style={{ color: '#bfbfbf' }}>-</span>}
                </div>
              </div>
            </div>

            {/* 處置方式選擇（正常通過 / 讓步接收） */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>{t('asset.passDispositionLabel')}</div>
              <Radio.Group value={passDisposition} onChange={(e) => setPassDisposition(e.target.value)} style={{ width: '100%' }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Radio value="pass">
                    <span style={{ fontWeight: 500 }}>{t('asset.passDispositionNormal')}</span>
                    <span style={{ color: '#8C8C8C', fontSize: 12, marginLeft: 4 }}>{t('asset.passDispositionNormalDesc')}</span>
                  </Radio>
                  <Radio value="concession">
                    <span style={{ fontWeight: 500 }}>{t('asset.passDispositionConcession')}</span>
                    <span style={{ color: '#8C8C8C', fontSize: 12, marginLeft: 4 }}>{t('asset.passDispositionConcessionDesc')}</span>
                  </Radio>
                </Space>
              </Radio.Group>
            </div>

            {/* 讓步接收原因（僅 concession 時顯示） */}
            {passDisposition === 'concession' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
                  {t('asset.concessionReasonLabel')} <span style={{ color: '#FF4D4F' }}>*</span>
                </div>
                <Input.TextArea
                  rows={2}
                  maxLength={200}
                  showCount
                  placeholder={t('asset.concessionReasonPh')}
                  value={passReason}
                  onChange={(e) => setPassReason(e.target.value)}
                  style={{ resize: 'none' }}
                />
              </div>
            )}

            {/* 現場照片（到貨憑證，同步寫入資產主圖；全局統一憑證上傳樣式） */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
                <CameraOutlined style={{ marginRight: 4 }} />
                {t('asset.sitePhotoRequired')}
                <span style={{ color: '#FF4D4F' }}> *</span>
                <span style={{ color: '#8C8C8C', fontWeight: 400, marginLeft: 8 }}>{t('asset.photoLimitHint', { max: MAX_PHOTOS })}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {passPhotos.map((p, idx) => (
                  <div key={idx} style={{ position: 'relative', width: 88, height: 88 }}>
                    <img
                      src={p.dataUrl} alt={p.name}
                      style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8', cursor: 'pointer', display: 'block', background: '#fafafa' }}
                      onClick={() => { setPreviewPhotos(passPhotos); setPreviewIndex(idx); setPreviewImage(p.dataUrl); setPreviewRotate(0); setPreviewVisible(true) }}
                    />
                    <Button type="text" size="small" danger
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, minWidth: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => handlePassPhotoRemove(idx)}
                    >×</Button>
                  </div>
                ))}
                {passPhotos.length < MAX_PHOTOS && (
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => { handlePassPhotoUpload(file); return false }}
                    accept="image/*"
                  >
                    <div style={{ width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa', transition: 'all 0.3s' }}
                      onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = '#E8720C'; el.style.background = '#fff7e6'; el.style.color = '#E8720C' }}
                      onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = '#d9d9d9'; el.style.background = '#fafafa'; el.style.color = '#999' }}
                    >
                      <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: 'inherit' }} />
                      <span>{uploading ? t('asset.uploadingNow') : t('asset.photoUploadBtn')}</span>
                    </div>
                  </Upload>
                )}
              </div>
              {passPhotos.length > 0 && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
                  {t('asset.uploadedCount', { current: passPhotos.length, max: MAX_PHOTOS })}
                </div>
              )}
            </div>

            {/* 存放倉庫 + 管理部門 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ marginBottom: 4, fontWeight: 500, color: '#262626' }}>
                    {t('asset.storageLocationSection')} <span style={{ color: '#FF4D4F' }}>*</span>
                  </div>
                  <TreeSelect
                    value={passLocationId}
                    onChange={setPassLocationId}
                    treeData={locationTree}
                    placeholder={t('asset.selectWarehousePh')}
                    style={{ width: '100%' }}
                    showSearch
                    treeNodeFilterProp="title"
                    allowClear
                  />
                </div>
                <div>
                  <div style={{ marginBottom: 4, fontWeight: 500, color: '#262626' }}>
                    {t('asset.mgmtDeptLabel')} <span style={{ color: '#FF4D4F' }}>*</span>
                  </div>
                  <TreeSelect
                    value={passDepartmentId}
                    onChange={setPassDepartmentId}
                    treeData={deptTree}
                    placeholder={t('asset.selectDeptPh')}
                    style={{ width: '100%' }}
                    showSearch
                    treeNodeFilterProp="title"
                    allowClear
                  />
                </div>
              </div>
            </div>

            {/* 配件清單（分類級配置，品牌產品庫維護） */}
            <div>
              <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
                <AppstoreOutlined style={{ marginRight: 4 }} />
                {t('asset.accessoryListTitle')}
              </div>
              {passAccessories.map((acc, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <AutoComplete
                    value={acc.name}
                    options={passAccessoryOptions}
                    placeholder={t('asset.accessoryPh')}
                    style={{ flex: 1 }}
                    filterOption={(input, option) => String(option?.value ?? '').includes(input)}
                    onChange={(v: string) => setPassAccessories((prev) => prev.map((a, i) => (i === idx ? { ...a, name: v } : a)))}
                  />
                  <InputNumber
                    min={1} precision={0} value={acc.qty}
                    style={{ width: 110 }}
                    addonAfter={t('asset.unitPiece')}
                    onChange={(v) => setPassAccessories((prev) => prev.map((a, i) => (i === idx ? { ...a, qty: v || 1 } : a)))}
                  />
                  <Button type="text" danger icon={<DeleteOutlined />}
                    onClick={() => setPassAccessories((prev) => prev.filter((_, i) => i !== idx))} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="dashed" icon={<PlusOutlined />} style={{ flex: 1 }}
                  onClick={() => setPassAccessories((prev) => [...prev, { name: '', qty: 1 }])}>
                  {t('asset.accessoryManual')}
                </Button>
                {passAccessoryOptions.length > 0 && (
                  <Button type="dashed" icon={<AppstoreOutlined />} style={{ flex: 1 }}
                    onClick={handleOpenAccessorySelect}>
                    {t('asset.accessoryQuickSelect', { count: passAccessoryOptions.length })}
                  </Button>
                )}
              </div>
              {passAccessories.length === 0 && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 6 }}>
                  {t('asset.accessoryTip')}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ====== 驗收不通過彈窗（退貨 / 換貨） ====== */}
      <Modal
        title={editingAllocation ? t('asset.editAllocationTitle') : t('asset.rejectModalTitle')}
        open={!!rejectModal}
        onOk={handleRejectConfirm}
        onCancel={() => { setRejectModal(null); setEditingAllocation(null) }}
        okText={editingAllocation ? t('common.confirm') : t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true }}
        width={640}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>{t('asset.colDisposeMethod')}</div>
          <Radio.Group value={rejectType} onChange={(e) => setRejectType(e.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {REJECT_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>
                  <span style={{ fontWeight: 500 }}>{t(`asset.${opt.labelKey}`)}</span>
                  <span style={{ color: '#8C8C8C', fontSize: 12, marginLeft: 4 }}>{t(`asset.${opt.descKey}`)}</span>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
            {t('asset.rejectQtyLabel')} <span style={{ color: '#FF4D4F' }}>*</span>
          </div>
          <InputNumber
            value={rejectQty}
            onChange={(v) => setRejectQty(v)}
            min={1}
            max={(() => {
              if (!rejectModal) return 1
              if (editingAllocation) return Math.max(1, editingAllocation.qty)
              const row = groups.find((g) => g.group.id === rejectModal.groupId)?.rows.find((r) => r.rowKey === rejectModal.rowKey)
              if (!row) return 1
              return Math.max(1, editor.getAllocatable(row))
            })()}
            style={{ width: '100%' }}
            placeholder={t('asset.rejectQtyPh')}
          />
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
            {t('asset.rejectQtyHint', { max: (() => {
              if (!rejectModal) return 1
              if (editingAllocation) return editingAllocation.qty
              const row = groups.find((g) => g.group.id === rejectModal.groupId)?.rows.find((r) => r.rowKey === rejectModal.rowKey)
              if (!row) return 1
              return Math.max(1, editor.getAllocatable(row))
            })() })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
            {t('asset.colRejectReason')} <span style={{ color: '#FF4D4F' }}>*</span>
          </div>
          <Input.TextArea
            rows={3}
            maxLength={200}
            showCount
            placeholder={t('asset.rejectReasonPh')}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            style={{ resize: 'none' }}
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
            <CameraOutlined style={{ marginRight: 4 }} />
            {t('asset.sitePhotoEvidence')}
            <span style={{ color: '#8C8C8C', fontWeight: 400, marginLeft: 8 }}>{t('asset.photoMaxHint', { max: MAX_PHOTOS })}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {rejectPhotos.map((p, idx) => (
              <div key={idx} style={{ position: 'relative', width: 88, height: 88 }}>
                <img
                  src={p.dataUrl} alt={p.name}
                  style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8', cursor: 'pointer', display: 'block', background: '#fafafa' }}
                  onClick={() => { setPreviewImage(p.dataUrl); setPreviewVisible(true) }}
                />
                <Button type="text" size="small" danger
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, minWidth: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => handleRejectPhotoRemove(idx)}
                >×</Button>
              </div>
            ))}
            {rejectPhotos.length < MAX_PHOTOS && (
              <Upload
                showUploadList={false}
                beforeUpload={(file) => { handleRejectPhotoUpload(file); return false }}
                accept="image/*"
              >
                <div style={{ width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa', transition: 'all 0.3s' }}
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = '#E8720C'; el.style.background = '#fff7e6'; el.style.color = '#E8720C' }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = '#d9d9d9'; el.style.background = '#fafafa'; el.style.color = '#999' }}
                >
                  <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: 'inherit' }} />
                  <span>{uploading ? t('asset.uploadingNow') : t('asset.photoUploadBtn')}</span>
                </div>
              </Upload>
            )}
          </div>
        </div>
      </Modal>

      {/* ====== 配件選擇彈窗（快速選擇配件） ====== */}
      <Modal
        title={t('asset.accessorySelectTitle')}
        open={accessorySelectOpen}
        onOk={handleAccessorySelectConfirm}
        onCancel={() => setAccessorySelectOpen(false)}
        okText={t('asset.accessorySelectOk')}
        cancelText={t('common.cancel')}
        width={480}
        destroyOnClose
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
          {t('asset.accessorySelectTip')}
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px' }}>
          {(() => {
            const code = passRow?.item.categoryCode
            const list = code ? categoryAccessories.get(code) || [] : []
            if (list.length === 0) {
              return <div style={{ padding: 24, textAlign: 'center', color: '#bfbfbf', fontSize: 13 }}>{t('asset.accessoryEmpty')}</div>
            }
            return list.map((acc) => {
              const checked = selectedAccessoryNames.has(acc.name)
              const alreadyAdded = passAccessories.some((a) => a.name === acc.name)
              return (
                <div key={acc.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 4px', borderBottom: '1px solid #f5f5f5',
                }}>
                  <Checkbox
                    checked={checked}
                    onChange={(e) => {
                      setSelectedAccessoryNames((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(acc.name)
                        else next.delete(acc.name)
                        return next
                      })
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#262626' }}>{acc.name}</span>
                    {alreadyAdded && (
                      <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>{t('asset.tagAdded')}</Tag>
                    )}
                  </Checkbox>
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.defaultQtyHint', { count: acc.defaultQty || 1 })}</span>
                </div>
              )
            })
          })()}
        </div>
        {selectedAccessoryNames.size > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', textAlign: 'right' }}>
            {t('asset.selectedCount', { count: selectedAccessoryNames.size })}
          </div>
        )}
      </Modal>

      {/* ====== 照片預覽（支持左右切換 + 旋轉） ====== */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => { setPreviewVisible(false); setPreviewRotate(0) }}
        centered
        width={720}
        title={<span style={{ fontSize: 15, fontWeight: 600 }}>照片預覽 ({previewIndex + 1} / {previewPhotos.length})</span>}
      >
        {/* 圖片區域 */}
        <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8, padding: 24 }}>
          <img
            alt="preview"
            src={previewImage}
            style={{
              maxWidth: '100%',
              maxHeight: 520,
              objectFit: 'contain',
              transform: `rotate(${previewRotate}deg)`,
              transition: 'transform 0.3s ease',
            }}
          />
        </div>

        {/* 工具欄：所有按鈕並排展示 */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {/* 上一張 */}
          <Button
            onClick={() => {
              if (previewIndex > 0) {
                const idx = previewIndex - 1
                setPreviewIndex(idx)
                setPreviewImage(previewPhotos[idx].dataUrl)
                setPreviewRotate(0)
              }
            }}
            disabled={previewIndex === 0}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #d9d9d9',
              background: '#fff',
            }}
          >
            ‹
          </Button>

          {/* 逆時針旋轉 */}
          <Button
            onClick={() => setPreviewRotate((prev) => prev - 90)}
            style={{
              height: 40,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid #d9d9d9',
              background: '#fff',
              padding: '0 16px',
            }}
          >
            ↺ 逆時針
          </Button>

          {/* 順時針旋轉 */}
          <Button
            onClick={() => setPreviewRotate((prev) => prev + 90)}
            style={{
              height: 40,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid #d9d9d9',
              background: '#fff',
              padding: '0 16px',
            }}
          >
            ↻ 順時針
          </Button>

          {/* 下一張 */}
          <Button
            onClick={() => {
              if (previewIndex < previewPhotos.length - 1) {
                const idx = previewIndex + 1
                setPreviewIndex(idx)
                setPreviewImage(previewPhotos[idx].dataUrl)
                setPreviewRotate(0)
              }
            }}
            disabled={previewIndex === previewPhotos.length - 1}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #d9d9d9',
              background: '#fff',
            }}
          >
            ›
          </Button>
        </div>

        {/* 底部縮略圖導航 */}
        {previewPhotos.length > 1 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
            {previewPhotos.map((p, i) => (
              <img
                key={i}
                src={p.dataUrl}
                alt={p.name}
                onClick={() => {
                  setPreviewIndex(i)
                  setPreviewImage(p.dataUrl)
                  setPreviewRotate(0)
                }}
                style={{
                  width: 56,
                  height: 56,
                  objectFit: 'cover',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: i === previewIndex ? '2px solid #E8720C' : '1px solid #f0f0f0',
                  opacity: i === previewIndex ? 1 : 0.6,
                  transition: 'all 0.2s',
                  boxShadow: i === previewIndex ? '0 2px 8px rgba(232,114,12,0.25)' : 'none',
                }}
              />
            ))}
          </div>
        )}
      </Modal>
    </Spin>
  )
}
