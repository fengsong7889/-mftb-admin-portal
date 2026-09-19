/**
 * 驗收入庫獨立表單頁（採購訂單風格）
 *
 * - 展示採購訂單完整信息（經辦人、部門、供應商分組、明細等），方便驗收人核對
 * - 每條明細可逐行設置「已驗收數量」與「存放仓库」，確認後提交
 * - 支持 URL ?poId= 帶入訂單（由採購訂單詳情/列表「驗收入庫」跳轉）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button, Checkbox, InputNumber, Select, TreeSelect, DatePicker, Row, Col, Table, Tag, Space, Spin, Modal, Input, Radio, message, Upload, AutoComplete, Alert,
} from 'antd'
import type { TableColumnsType, UploadFile } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined, ExclamationCircleOutlined,
  CameraOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, AppstoreOutlined, UploadOutlined,
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
    nodeMap.set(loc.id, { title: loc.name, value: loc.id, key: loc.id, children: [] })
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

/* ==================== 驗收不通過處置方式 ==================== */

type RejectStatus = 'return' | 'exchange' | 'concession'

/** 現場照片上限（與全局憑證上傳一致：OA 採購/充值/轉賬均限 5 張） */
const MAX_PHOTOS = 5

/** labelKey/descKey/REJECT_LABEL 值均為 asset 段 key，渲染時經 t() 轉換（模塊級不能調 hook） */
const REJECT_OPTIONS: { value: RejectStatus; labelKey: string; descKey: string }[] = [
  { value: 'return', labelKey: 'rejectReturn', descKey: 'rejectReturnDesc' },
  { value: 'exchange', labelKey: 'rejectExchange', descKey: 'rejectExchangeDesc' },
  { value: 'concession', labelKey: 'rejectConcession', descKey: 'rejectConcessionDesc' },
]

const REJECT_LABEL: Record<RejectStatus, string> = { return: 'rejectReturn', exchange: 'rejectExchange', concession: 'rejectConcession' }
const REJECT_COLOR: Record<RejectStatus, string> = { return: 'error', exchange: 'warning', concession: 'processing' }

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

interface InboundItem extends PurchaseOrderItem {
  /** 是否參與本次驗收（未勾選行不提交，強化「選擇性拉取」的操作感知） */
  selected: boolean
  /** 本次驗收數量 */
  inboundQty: number
  /** 存放仓库 */
  locationId?: number
  /** 是否已確認驗收 */
  confirmed: boolean
  /** 不通過處置方式 */
  rejectStatus?: RejectStatus
  /** 不通過原因 */
  rejectReason?: string
  /** 驗收照片 [{name, dataUrl}] */
  photos: { name: string; dataUrl: string }[]
  /** 配件清單 [{name, qty}]（隨驗收記錄保存） */
  accessories: { name: string; qty: number }[]
  /** 歷史累計退貨件數（從入庫批次反查，終態不計入待驗收） */
  histReturnQty?: number
  /** 歷史累計換貨件數（從入庫批次反查，等待供應商二次發貨） */
  histExchangeQty?: number
}

interface InboundGroup extends PurchaseOrderSupplierGroup {
  items: InboundItem[]
  /** 該分組的驗收日期 */
  inboundDate: dayjs.Dayjs
}

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
  const [groups, setGroups] = useState<InboundGroup[]>([])
  const [locations, setLocations] = useState<AssetLocation[]>([])

  // 員工搜索（展示經辦人部門）
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null)

  // 驗收不通過彈窗
  const [rejectModal, setRejectModal] = useState<{ groupId: string; rowKey: string } | null>(null)
  const [rejectType, setRejectType] = useState<RejectStatus>('return')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectPhotos, setRejectPhotos] = useState<{ name: string; dataUrl: string }[]>([])

  // 驗收確認彈窗（通過項：拍照憑證 + 配件清單）
  const [passModal, setPassModal] = useState<{ groupId: string; rowKey: string } | null>(null)
  const [passAccessories, setPassAccessories] = useState<{ name: string; qty: number }[]>([])
  /** 分類配件配置（资产品牌產品庫按分類維護，key 為 categoryCode；取代寫死枚舉） */
  const [categoryAccessories, setCategoryAccessories] = useState<Map<string, { name: string; defaultQty: number }[]>>(new Map())

  // 配件選擇彈窗（快速選擇配件：勾選後批量添加）
  const [accessorySelectOpen, setAccessorySelectOpen] = useState(false)
  const [selectedAccessoryNames, setSelectedAccessoryNames] = useState<Set<string>>(new Set())

  // 照片預覽
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [uploading, setUploading] = useState(false)

  /** 更新分組驗收日期 */
  const updateGroupDate = (groupId: string, date: dayjs.Dayjs) => {
    setGroups((prev) => prev.map((g) => (g.id !== groupId ? g : { ...g, inboundDate: date })))
  }

  /* ----- 加載數據 ----- */
  const loadData = useCallback(async () => {
    if (!poId) return
    setLoading(true)
    try {
      const [orderData, locList] = await Promise.all([
        fetchPurchaseOrderDetail(poId),
        fetchLocationList(),
      ])
      setOrder(orderData)
      setLocations(locList)
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

      const inboundGroupsAll: InboundGroup[] = srcGroups.map((g) => ({
        ...g,
        inboundDate: dayjs(),
        items: g.items.map((it, idx) => {
          // 剩餘可驗 = 總數 - 已驗收 - 歷史退貨（終態）；與後端校驗口徑一致，避免 InputNumber 初值超限
          const remaining = Math.max(0, it.qty - (it.receivedQty || 0) - (it.returnedQty || 0))
          const hist = it.id != null ? histMap.get(it.id) : undefined
          return {
            ...it,
            key: it.key || `${g.id}_${idx}_${it.modelId || 'x'}`,
            selected: true,
            inboundQty: remaining,
            locationId: defaultLoc,
            confirmed: false,
            rejectStatus: undefined,
            rejectReason: '',
            photos: [],
            accessories: [],
            histReturnQty: it.returnedQty ?? hist?.ret ?? 0,
            histExchangeQty: it.exchangedQty ?? hist?.exc ?? 0,
          }
        }),
      }))
      // 按供應商獨立驗收：指定分組時僅載入該供應商的物資明細（與列表按供應商一行展示口徑一致）
      const inboundGroups = groupId && inboundGroupsAll.some((g) => g.id === groupId)
        ? inboundGroupsAll.filter((g) => g.id === groupId)
        : inboundGroupsAll
      setGroups(inboundGroups)

      // 嘗試恢復草稿（分組級草稿優先）
      const draft = await loadInboundDraft(poId, groupId)
      if (draft && draft.items.length > 0) {
        const restored = inboundGroups.map((g) => ({
          ...g,
          inboundDate: draft.inboundDate ? dayjs(draft.inboundDate) : g.inboundDate,
          items: g.items.map((it) => {
            const di = draft.items.find((d) => d.orderItemId != null && d.orderItemId === it.id)
            if (!di) return it
            return {
              ...it,
              inboundQty: Math.min(di.qty, Math.max(0, it.qty - it.receivedQty)),
              locationId: di.locationId || it.locationId,
              confirmed: di.status === 'pass',
              rejectStatus: di.status !== 'pass' ? di.status : undefined,
              rejectReason: di.reason || '',
              accessories: di.accessories || [],
            }
          }),
        }))
        setGroups(restored)
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

  /** 位置樹數據 */
  const locationTree = useMemo(() => buildLocationTree(locations), [locations])

  /* ----- 分組操作 ----- */
  const updateGroupItem = (groupId: string, rowKey: string, patch: Partial<InboundItem>) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return { ...g, items: g.items.map((it) => (it.key === rowKey ? { ...it, ...patch } : it)) }
    }))
  }

  /* ----- 照片上傳 ----- */
  const handleItemPhotoUpload = useCallback(async (groupId: string, rowKey: string, file: File) => {
    if (!validatePhotoFile(file, t)) return false
    setUploading(true)
    try {
      const result = await uploadInboundPhoto(file)
      updateGroupItem(groupId, rowKey, {
        photos: [...(groups.find((g) => g.id === groupId)?.items.find((it) => it.key === rowKey)?.photos || []), result],
      })
    } catch (err) {
      // 優先展示後端具體校驗消息（如文件類型/大小/魔數不合法），否則回退通用文案
      message.error(err instanceof Error && err.message ? err.message : t('asset.photoUploadFailed'))
    } finally {
      setUploading(false)
    }
    return false // 阻止 antd Upload 自動上傳
  }, [groups, t])

  const handleItemPhotoRemove = useCallback((groupId: string, rowKey: string, idx: number) => {
    const item = groups.find((g) => g.id === groupId)?.items.find((it) => it.key === rowKey)
    if (!item) return
    const next = [...item.photos]
    next.splice(idx, 1)
    updateGroupItem(groupId, rowKey, { photos: next })
  }, [groups])

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

  /** 驗收確認彈窗當前行（展示物資信息 / 照片 / 配件） */
  const passItem = useMemo(() => {
    if (!passModal) return null
    return groups.find((g) => g.id === passModal.groupId)?.items.find((it) => it.key === passModal.rowKey) || null
  }, [passModal, groups])

  /** 彈窗打開時按分類加載配件配置（AutoComplete 選項 + 一鍵帶入數據源；取代寫死枚舉） */
  useEffect(() => {
    if (!passModal) return
    const item = groups.find((g) => g.id === passModal.groupId)?.items.find((it) => it.key === passModal.rowKey)
    const code = item?.categoryCode
    if (!code || categoryAccessories.has(code)) return
    fetchCategoryAccessories(code, true)
      .then((list) => setCategoryAccessories((prev) => new Map(prev).set(code, list.map((a) => ({ name: a.name, defaultQty: a.defaultQty || 1 })))))
      .catch(() => setCategoryAccessories((prev) => new Map(prev).set(code, [])))
  }, [passModal, groups, categoryAccessories])

  /** 當前分類已配置的配件選項（AutoComplete 仍支持手動輸入其他名稱） */
  const passAccessoryOptions = useMemo(() => {
    const code = passItem?.categoryCode
    if (!code) return []
    return (categoryAccessories.get(code) || []).map((a) => ({ value: a.name }))
  }, [passItem, categoryAccessories])

  /** 打開配件選擇彈窗（預勾選已存在的配件） */
  const handleOpenAccessorySelect = () => {
    const existing = new Set(passAccessories.map((a) => a.name))
    setSelectedAccessoryNames(existing)
    setAccessorySelectOpen(true)
  }

  /** 確認配件選擇：僅將勾選的配件添加到清單（跳過已存在的名稱，數量取默認配置） */
  const handleAccessorySelectConfirm = () => {
    const code = passItem?.categoryCode
    const list = code ? categoryAccessories.get(code) || [] : []
    const existing = new Set(passAccessories.map((a) => a.name))
    const additions = list
      .filter((a) => selectedAccessoryNames.has(a.name) && !existing.has(a.name))
      .map((a) => ({ name: a.name, qty: a.defaultQty || 1 }))
    setPassAccessories((prev) => [...prev, ...additions])
    setAccessorySelectOpen(false)
  }

  /** 確認通過：寫入配件清單並標記驗收通過（照片至少 1 張，作為到貨憑證） */
  const handlePassConfirm = () => {
    if (!passModal || !passItem) return
    if (passItem.photos.length === 0) { message.warning(t('asset.warnPhotoRequired')); return }
    if (passAccessories.some((a) => !a.name.trim())) { message.warning(t('asset.warnAccessoryName')); return }
    if (passAccessories.some((a) => a.qty <= 0)) { message.warning(t('asset.warnAccessoryQty')); return }
    const accessories = passAccessories.map((a) => ({ name: a.name.trim(), qty: a.qty }))
    updateGroupItem(passModal.groupId, passModal.rowKey, { confirmed: true, selected: true, accessories })
    setPassModal(null)
    setPassAccessories([])
  }

  const groupSubtotal = (group: InboundGroup) =>
    group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)

  const grandTotal = groups.reduce((s, g) => s + groupSubtotal(g), 0)

  /** 全選/取消全選分組內未處理明細（已通過或不通過的行必須隨批次提交，不可取消勾選） */
  const toggleGroupAll = (groupId: string, checked: boolean) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return { ...g, items: g.items.map((it) => ((it.confirmed || it.rejectStatus || isFullyAccepted(it)) ? it : { ...it, selected: checked })) }
    }))
  }

  /** 已驗收總數（僅計勾選參與本次驗收的明細） */
  const totalInboundQty = groups.reduce((s, g) => s + g.items.reduce((ss, it) => ss + (it.selected && it.confirmed ? it.inboundQty : 0), 0), 0)
  /** 不通過總數（僅計勾選參與本次驗收的明細） */
  const totalRejectedQty = groups.reduce((s, g) => s + g.items.filter((it) => it.selected && it.rejectStatus).length, 0)
  /** 待驗收總數 */
  const totalRemainingQty = groups.reduce((s, g) => s + g.items.reduce((ss, it) => ss + Math.max(0, it.qty - it.receivedQty), 0), 0)

  /** 提交不通過 */
  const handleRejectConfirm = () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) { message.warning(t('asset.warnRejectReason')); return }
    updateGroupItem(rejectModal.groupId, rejectModal.rowKey, {
      rejectStatus: rejectType,
      rejectReason: rejectReason.trim(),
      photos: rejectPhotos,
      confirmed: false,
      selected: true,
    })
    setRejectModal(null)
    setRejectType('return')
    setRejectReason('')
    setRejectPhotos([])
  }

  /* ----- 明細表格列 ----- */
  const itemColumns = useCallback((groupId: string): TableColumnsType<InboundItem> => [
    {
      title: (() => {
        const g = groups.find((gg) => gg.id === groupId)
        const items = g?.items || []
        const allSelected = items.length > 0 && items.every((it) => it.selected)
        const someSelected = items.some((it) => it.selected)
        const allLocked = items.length > 0 && items.every((it) => it.confirmed || it.rejectStatus || isFullyAccepted(it))
        return (
          <Checkbox
            checked={allSelected}
            indeterminate={!allSelected && someSelected}
            disabled={allLocked}
            onChange={(e) => toggleGroupAll(groupId, e.target.checked)}
          />
        )
      })(),
      key: 'selected', width: 50, align: 'center',
      render: (_: unknown, r: InboundItem) => (
        <Checkbox
          checked={r.selected}
          disabled={r.confirmed || !!r.rejectStatus || isFullyAccepted(r)}
          onChange={(e) => updateGroupItem(groupId, r.key!, { selected: e.target.checked })}
        />
      ),
    },
    { title: t('asset.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 90, ellipsis: true,
      render: (v: string | undefined) => v || '-' },
    { title: t('asset.colBrand'), dataIndex: 'brandName', key: 'brandName', width: 90, ellipsis: true,
      render: (v: string | undefined) => v || '-' },
    { title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 140, ellipsis: true },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
    {
      title: t('asset.colUnitPrice'), key: 'confirmedPrice', width: 100, align: 'right',
      render: (_: unknown, r: InboundItem) => (
        <span style={{ fontWeight: r.confirmedPrice ? 600 : 400, color: r.confirmedPrice ? '#52c41a' : '#bfbfbf' }}>
          {r.confirmedPrice ? `MOP ${r.confirmedPrice.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: InboundItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP ${(cp * r.qty).toLocaleString()}</span>
      },
    },
    {
      title: t('asset.colReceived'), dataIndex: 'receivedQty', key: 'receivedQty', width: 90, align: 'right',
      render: (v: number, r: InboundItem) => (
        <Space size={2} style={{ justifyContent: 'flex-end' }}>
          <Tag color={v > 0 ? 'success' : 'default'} style={{ margin: 0 }}>{v}</Tag>
          {isFullyAccepted(r) && (
            <Tag color="success" style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{t('asset.tagCompleted')}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('asset.colThisInbound'), key: 'inboundQty', width: 110,
      render: (_: unknown, r: InboundItem) => (
        <InputNumber
          value={r.inboundQty}
          onChange={(v) => updateGroupItem(groupId, r.key!, { inboundQty: v ?? 0 })}
          style={{ width: '100%' }}
          min={0}
          max={Math.max(0, r.qty - r.receivedQty - (r.histReturnQty || 0))}
          size="small"
          disabled={!r.selected || r.confirmed || !!r.rejectStatus || isFullyAccepted(r)}
        />
      ),
    },
    {
      title: t('asset.colStorageLocation'), key: 'locationId', width: 180,
      render: (_: unknown, r: InboundItem) => (
        <TreeSelect
          value={r.locationId}
          onChange={(v: number) => updateGroupItem(groupId, r.key!, { locationId: v })}
          style={{ width: '100%' }}
          size="small"
          treeData={locationTree}
          treeDefaultExpandAll
          placeholder={t('asset.phSelectLocation')}
          disabled={!r.selected || r.confirmed || !!r.rejectStatus || isFullyAccepted(r)}
        />
      ),
    },
    {
      title: t('asset.colAction'), key: 'action', width: 120, align: 'center',
      render: (_: unknown, r: InboundItem) => {
        const maxQty = Math.max(0, r.qty - r.receivedQty - (r.histReturnQty || 0))
        // 已不通過 → 顯示處置標籤 + 撤銷
        if (r.rejectStatus) {
          return (
            <div>
              <Space size={4}>
                <Tag color={REJECT_COLOR[r.rejectStatus]} style={{ margin: 0, fontSize: 11 }}>
                  {t(`asset.${REJECT_LABEL[r.rejectStatus]}`)}
                </Tag>
                <Button
                  type="link" size="small" danger
                  onClick={() => updateGroupItem(groupId, r.key!, { rejectStatus: undefined, rejectReason: '', photos: [] })}
                  style={{ fontSize: 12, padding: '0 2px' }}
                >
                  {t('asset.undo')}
                </Button>
              </Space>
            </div>
          )
        }
        // 已驗收通過 → 已驗收標籤 + 撤銷
        if (r.confirmed) {
          return (
            <div>
              <Space size={4}>
                <Tag color="success" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagAccepted')}</Tag>
                <Button
                  type="link" size="small" danger
                  onClick={() => updateGroupItem(groupId, r.key!, { confirmed: false })}
                  style={{ fontSize: 12, padding: '0 2px' }}
                >
                  {t('asset.undo')}
                </Button>
              </Space>
            </div>
          )
        }
        // 歷史已全退貨（終態）→ 僅顯示「退貨」標記，不提供操作按鈕
        if (isFullyReturned(r)) {
          return <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('asset.rejectReturn')}</Tag>
        }
        // 歷史已完全驗收（無剩餘可驗）→ 僅顯示「已驗收」標記，不提供操作按鈕
        if (maxQty <= 0) {
          return <Tag color="success" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagAccepted')}</Tag>
        }
        // 未處理 → 驗收確認（彈窗內拍照 + 配件清單）/ 驗收不通過；歷史換貨/部分退貨以標籤前置提示
        return (
          <div>
            <Space size={4} wrap>
              {(r.histExchangeQty || 0) > 0 && (
                <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagExchangeCount', { count: r.histExchangeQty })}</Tag>
              )}
              {(r.histReturnQty || 0) > 0 && (
                <Tag color="error" style={{ margin: 0, fontSize: 11 }}>{t('asset.tagReturnCount', { count: r.histReturnQty })}</Tag>
              )}
              <Button
                type="link" size="small"
                disabled={!r.selected || r.inboundQty <= 0 || !r.locationId || maxQty <= 0}
                onClick={() => { setPassModal({ groupId, rowKey: r.key! }); setPassAccessories(r.accessories.length > 0 ? [...r.accessories] : []) }}
                style={{ color: '#52C41A', fontWeight: 600, fontSize: 12, padding: '0 2px' }}
              >
                {t('asset.passBtn')}
              </Button>
              <Button
                type="link" size="small" danger
                disabled={!r.selected || maxQty <= 0}
                onClick={() => { setRejectModal({ groupId, rowKey: r.key! }); setRejectType('return'); setRejectReason(''); setRejectPhotos([]) }}
                style={{ fontSize: 12, padding: '0 2px' }}
              >
                {t('asset.failBtn')}
              </Button>
            </Space>
          </div>
        )
      },
    },
  ], [groups, locationTree, t])

  /* ----- 提交 / 保存 ----- */
  const [saving, setSaving] = useState(false)

  /** 當前驗收範圍的供應商名稱（按分組進入時展示，訂單級進入為空） */
  const scopeSupplier = groupId ? groups[0]?.supplier || '' : ''

  /** 保存草稿（不跳轉，保留當前狀態） */
  const handleSave = async () => {
    if (!order) return
    setSaving(true)
    try {
      const draftItems = groups.flatMap((g) =>
        g.items
          .filter((it) => it.confirmed || it.rejectStatus)
          .map((it) => ({
            orderItemId: it.id,
            modelId: it.modelId!,
            inboundDate: g.inboundDate.format('YYYY-MM-DD'),
            qty: it.inboundQty,
            locationId: it.locationId || 0,
            status: (it.confirmed ? 'pass' : it.rejectStatus) as 'pass' | 'return' | 'exchange' | 'concession',
            reason: it.rejectReason || undefined,
            accessories: it.accessories.length > 0 ? it.accessories : undefined,
          }))
      )
      await saveInboundDraft({
        poId: order.id,
        groupId,
        inboundDate: groups[0]?.inboundDate.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
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
    // 驗收通過項：生成資產編號並寫入台賬
    const passItems = groups.flatMap((g) =>
      g.items
        .filter((it) => it.selected && it.confirmed && it.inboundQty > 0 && it.locationId)
        .map((it) => ({
          orderItemId: it.id!,
          modelId: it.modelId,
          inboundDate: g.inboundDate.format('YYYY-MM-DD'),
          qty: it.inboundQty,
          locationId: it.locationId!,
          disposition: 'pass' as const,
          photos: it.photos.length > 0 ? it.photos : undefined,
          accessories: it.accessories.length > 0 ? it.accessories : undefined,
        }))
    )
    // 驗收不通過項：退貨/換貨/讓步接收，隨批次提交留痕（不生成資產）
    const rejectItems = groups.flatMap((g) =>
      g.items
        .filter((it) => it.selected && it.rejectStatus)
        .map((it) => ({
          orderItemId: it.id!,
          modelId: it.modelId,
          inboundDate: g.inboundDate.format('YYYY-MM-DD'),
          qty: it.inboundQty,
          locationId: 0,
          disposition: it.rejectStatus!,
          rejectReason: it.rejectReason || undefined,
          photos: it.photos.length > 0 ? it.photos : undefined,
          accessories: it.accessories.length > 0 ? it.accessories : undefined,
        }))
    )
    const allItems = [...passItems, ...rejectItems]
    if (allItems.some((it) => !it.orderItemId || it.qty <= 0)) {
      message.warning(t('asset.warnInvalidItems'))
      return
    }
    if (!allItems.length) {
      message.warning(t('asset.warnNoItems'))
      return
    }
    Modal.confirm({
      title: t('asset.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('asset.poLabel')}</span><b>{order.poNo}</b></div>
          {scopeSupplier && <div className="confirm-info-row"><span>{t('asset.supplierLabel')}</span><b>{scopeSupplier}</b></div>}
          <div className="confirm-info-row"><span>{t('asset.qtyLabel')}</span><b>{allItems.reduce((sum, it) => sum + it.qty, 0)}</b></div>
          <div className="confirm-info-row"><span>{t('asset.assetsGenLabel')}</span><b>{passItems.reduce((sum, it) => sum + it.qty, 0)}</b></div>
        </div>
      ),
      okText: t('asset.confirmSubmitOk'), cancelText: t('common.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
      const batch = await createInboundBatch({
        poId: order.id,
        inboundDate: groups[0]?.inboundDate.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        operator: selectedEmp?.name || order.purchaser || '',
        items: allItems,
        remark: t('asset.inboundRemark', { poNo: order.poNo }) + (scopeSupplier ? t('asset.remarkSupplierPart', { supplier: scopeSupplier }) : ''),
      })
      // 驗收成功後清除草稿（僅清當前驗收範圍，不影響其他供應商草稿）
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
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.orderInfoTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Row gutter={16}>
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
        <Row gutter={16}>
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

      {/* ====== 歷史驗收異常提示（訂單級：退貨/換貨/讓步接收） ====== */}
      {(order.returnQty || order.exchangeQty || order.concessionQty) ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('asset.histAlertMsg')}
          description={(
            <Space size={16} wrap>
              {(order.returnQty || 0) > 0 && (
                <span>{t('asset.rejectReturn')} <b style={{ color: '#FF4D4F' }}>{order.returnQty}</b> {t('asset.histReturnUnit')}</span>
              )}
              {(order.exchangeQty || 0) > 0 && (
                <span>{t('asset.rejectExchange')} <b style={{ color: '#FA8C16' }}>{order.exchangeQty}</b> {t('asset.histExchangeUnit')}</span>
              )}
              {(order.concessionQty || 0) > 0 && (
                <span>{t('asset.rejectConcession')} <b style={{ color: '#1890FF' }}>{order.concessionQty}</b> {t('asset.histConcessionUnit')}</span>
              )}
            </Space>
          )}
        />
      ) : null}

      {/* ====== 採購物資分組 ====== */}
      {groups.map((group, gi) => {
        const subtotal = groupSubtotal(group)
        const groupConfirmed = group.items.filter((it) => it.confirmed).length
        const groupRejected = group.items.filter((it) => it.rejectStatus).length
        const groupTotal = group.items.length
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
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('asset.groupTitle')}</span>
                <Tag color="blue" style={{ fontSize: 11 }}>{t('asset.groupSubtotalTag', { amount: subtotal.toLocaleString() })}</Tag>
                <Tag color={groupConfirmed === groupTotal ? 'success' : 'processing'} style={{ fontSize: 11 }}>
                  {t('asset.groupProgressTag', { confirmed: groupConfirmed, total: groupTotal })}
                </Tag>
                {groupRejected > 0 && (
                  <Tag color="error" style={{ fontSize: 11 }}>{t('asset.groupRejectedTag', { count: groupRejected })}</Tag>
                )}
              </div>
            </div>

            {/* 供應商信息（只讀）+ 驗收日期 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelSupplierName')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{group.supplier || '-'}</div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelSupplierContact')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{group.contact || '-'}</div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelOrderDate')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{group.orderDate || '-'}</div>
              </Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelDeliveryMethod')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>{group.deliveryMethod && DELIVERY_METHOD_LABEL[group.deliveryMethod] ? t(`asset.${DELIVERY_METHOD_LABEL[group.deliveryMethod]}`) : '-'}</div>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.labelInboundDate')}</div>
                <DatePicker
                  value={group.inboundDate}
                  onChange={(d) => updateGroupDate(group.id, d || dayjs())}
                  style={{ width: '100%' }}
                  size="small"
                />
              </Col>
            </Row>

            {/* 明細表格 */}
            <Table<InboundItem>
              columns={itemColumns(group.id)}
              dataSource={group.items}
              rowKey={(r) => r.key || r.modelId?.toString() || Math.random().toString()}
              size="small"
              pagination={false}
              scroll={{ x: 1200 }}
              rowClassName={(r) => {
                if (r.rejectStatus) return 'inbound-rejected-row'
                if ((r.histReturnQty || 0) > 0 && !r.confirmed) return 'inbound-returned-row'
                if ((r.histExchangeQty || 0) > 0 && !r.confirmed) return 'inbound-exchanged-row'
                if (isFullyAccepted(r) && !r.confirmed) return 'inbound-accepted-row'
                if (!r.selected && !r.confirmed) return 'inbound-unselected-row'
                return ''
              }}
            />
          </div>
        )
      })}

      {/* ====== 驗收異常記錄匯總 ====== */}
      {totalRejectedQty > 0 && (() => {
        const rejectedItems = groups.flatMap((g) =>
          g.items.filter((it) => it.rejectStatus).map((it) => ({ ...it, _groupId: g.id, _supplier: g.supplier }))
        )
        return (
          <div style={{ border: '1px solid #ffd8bf', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff2f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ExclamationCircleOutlined style={{ fontSize: 14, color: '#FF4D4F' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.exceptionTitle')}</span>
              <Tag color="error" style={{ fontSize: 11 }}>{t('asset.exceptionCountTag', { count: totalRejectedQty })}</Tag>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <Table
              columns={[
                { title: t('asset.colSupplier'), dataIndex: '_supplier', key: '_supplier', width: 120, ellipsis: true },
                { title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 160, ellipsis: true },
                { title: t('asset.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 90, ellipsis: true,
                  render: (v: string | undefined) => v || '-' },
                { title: t('asset.colBrand'), dataIndex: 'brandName', key: 'brandName', width: 90, ellipsis: true,
                  render: (v: string | undefined) => v || '-' },
                { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
                {
                  title: t('asset.colDisposeMethod'), dataIndex: 'rejectStatus', key: 'rejectStatus', width: 100,
                  render: (v: RejectStatus) => <Tag color={REJECT_COLOR[v]}>{t(`asset.${REJECT_LABEL[v]}`)}</Tag>,
                },
                {
                  title: t('asset.colRejectReason'), dataIndex: 'rejectReason', key: 'rejectReason', ellipsis: true,
                  render: (v: string | undefined) => <span style={{ color: '#595959' }}>{v || '-'}</span>,
                },
                {
                  title: t('asset.colAction'), key: 'action', width: 80, align: 'center',
                  render: (_: unknown, r: typeof rejectedItems[0]) => (
                    <Button
                      type="link" size="small" danger
                      onClick={() => updateGroupItem(r._groupId, r.key!, { rejectStatus: undefined, rejectReason: '' })}
                      style={{ fontSize: 12 }}
                    >
                      {t('asset.undo')}
                    </Button>
                  ),
                },
              ]}
              dataSource={rejectedItems}
              rowKey={(r) => r.key || Math.random().toString()}
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
            disabled={totalInboundQty <= 0 && totalRejectedQty <= 0}>
            {t('asset.submitBtn', { count: totalInboundQty })}{totalRejectedQty > 0 ? t('asset.rejectedSuffix', { count: totalRejectedQty }) : ''}
          </Button>
        </Space>
      </div>

      {/* ====== 驗收確認彈窗（通過項：拍照憑證 + 配件清單） ====== */}
      <Modal
        title={t('asset.passModalTitle')}
        open={!!passModal}
        onOk={handlePassConfirm}
        onCancel={() => { setPassModal(null); setPassAccessories([]) }}
        okText={t('asset.passOkText')}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnClose
      >
        {passItem && (
          <>
            {/* 物資信息 */}
            <div style={{ background: '#FAFAFA', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', rowGap: 10, fontSize: 13 }}>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.modelNameLabel')}</span><span style={{ fontWeight: 600 }}>{passItem.modelName}</span></div>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.categoryLabel')}</span>{passItem.categoryName || '-'}</div>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.thisQtyLabel')}</span><span style={{ fontWeight: 700, color: '#E8720C' }}>{passItem.inboundQty}</span> {t('asset.unitPiece')}</div>
                <div><span style={{ color: '#8C8C8C' }}>{t('asset.locationLabel')}</span>{locations.find((l) => l.id === passItem.locationId)?.name || '-'}</div>
              </div>
            </div>

            {/* 現場照片（到貨憑證，同步寫入資產主圖；全局統一憑證上傳樣式） */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#262626', marginBottom: 8, fontWeight: 500 }}>
                <CameraOutlined style={{ marginRight: 4 }} />
                {t('asset.sitePhotoRequired')}
                <span style={{ color: '#FF4D4F' }}> *</span>
                <span style={{ color: '#8C8C8C', fontWeight: 400, marginLeft: 8 }}>{t('asset.photoLimitHint', { max: MAX_PHOTOS })}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {passItem.photos.map((p, idx) => (
                  <div key={idx} style={{ position: 'relative', width: 88, height: 88 }}>
                    <img
                      src={p.dataUrl} alt={p.name}
                      style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8', cursor: 'pointer', display: 'block', background: '#fafafa' }}
                      onClick={() => { setPreviewImage(p.dataUrl); setPreviewVisible(true) }}
                    />
                    <Button type="text" size="small" danger
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, minWidth: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => { if (passModal) handleItemPhotoRemove(passModal.groupId, passModal.rowKey, idx) }}
                    >×</Button>
                  </div>
                ))}
                {passItem.photos.length < MAX_PHOTOS && (
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => { if (passModal) handleItemPhotoUpload(passModal.groupId, passModal.rowKey, file); return false }}
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
              {passItem.photos.length > 0 && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
                  {t('asset.uploadedCount', { current: passItem.photos.length, max: MAX_PHOTOS })}
                </div>
              )}
            </div>

            {/* 配件清單（分類級配置，资产品牌產品庫維護） */}
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

      {/* ====== 驗收不通過彈窗 ====== */}
      <Modal
        title={t('asset.rejectModalTitle')}
        open={!!rejectModal}
        onOk={handleRejectConfirm}
        onCancel={() => setRejectModal(null)}
        okText={t('common.confirm')}
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
            const code = passItem?.categoryCode
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

      {/* ====== 照片預覽 ====== */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        centered
      >
        <img alt="preview" style={{ width: '100%' }} src={previewImage} />
      </Modal>
    </Spin>
  )
}
