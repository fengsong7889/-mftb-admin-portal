/**
 * 驗收入庫編輯器 Hook（useInboundEditor）
 *
 * 核心職責：
 * 1. 管理採購明細的「行編輯狀態」與「驗收結果分配」分離模型
 * 2. 提供容量計算（可分配量 = 採購量 − 歷史 − 本次已分配）
 * 3. 提供結果操作（添加/編輯/撤銷分配）
 * 4. 提供提交 DTO 轉換
 *
 * 設計原則：
 * - 採購行（InspectionRow）只存快照 + 編輯輸入，不存最終狀態
 * - 結果分配（InspectionAllocation）是唯一事實源，每筆獨立
 * - 容量公式嚴格守恆，不用 Math.max(0,...) 隱藏超分配
 * - 草稿和未提交結果不修改後端累計量
 */
import { useReducer, useCallback, useMemo } from 'react'
import type { PurchaseOrderItem, PurchaseOrderSupplierGroup } from '../../../api/eam'

/* ==================== 類型定義 ==================== */

/** 驗收處置方式 */
export type InspectionDisposition = 'pass' | 'return' | 'exchange' | 'concession'

/** 現場照片結構（與後端序列化一致） */
export interface InspectionPhoto {
  name: string
  dataUrl: string
}

/** 配件清單結構（與後端序列化一致） */
export interface InspectionAccessory {
  name: string
  qty: number
}

/**
 * 單筆驗收結果分配（唯一事實源）
 * 每筆分配獨立記錄：數量、處置、倉庫、原因、照片、配件
 */
export interface InspectionAllocation {
  /** 前端生成的穩定 ID，提交後替換為後端批次明細 ID */
  clientLineId: string
  /** 所屬採購明細 ID */
  orderItemId: number
  /** 來源換貨明細 ID（換貨重驗時填寫，普通驗收為空） */
  sourceExchangeItemId?: number
  /** 所屬供應商分組 ID */
  groupId: string
  /** 該筆數量 */
  qty: number
  /** 處置方式 */
  disposition: InspectionDisposition
  /** 驗收日期 */
  inboundDate: string
  /** 存放倉庫 ID（pass/concession 必填，return/exchange 可空） */
  locationId?: number
  /** 存放倉庫名稱快照 */
  locationName?: string
  /** 管理部門 ID（pass/concession 必填） */
  departmentId?: number
  /** 管理部門名稱快照 */
  departmentName?: string
  /** 不通過原因（return/exchange/concession 時填寫） */
  reason?: string
  /** 現場照片 */
  photos: InspectionPhoto[]
  /** 配件清單 */
  accessories: InspectionAccessory[]
}

/**
 * 採購明細行編輯狀態
 * 只存快照 + 當前編輯輸入，不存最終狀態
 */
export interface InspectionRow {
  /** 採購明細原始數據（快照） */
  item: PurchaseOrderItem
  /** 所屬分組 ID */
  groupId: string
  /** 前端行 key */
  rowKey: string
  /** 是否勾選參與本次操作 */
  selected: boolean
  /** 當前編輯輸入數量（允許 null 表示未輸入） */
  inputQty: number | null
  /** 用戶是否觸碰過輸入框 */
  touched: boolean
  /** 歷史累計退貨件數 */
  histReturnQty: number
  /** 歷史累計換貨件數 */
  histExchangeQty: number
}

/** 分組數據 */
export interface InspectionGroup {
  group: PurchaseOrderSupplierGroup
  inboundDate: string
  rows: InspectionRow[]
}

/** 編輯器完整狀態 */
export interface EditorState {
  groups: InspectionGroup[]
  allocations: InspectionAllocation[]
  /** 訂單級歷史退貨總量（用於摘要展示） */
  orderHistReturnQty: number
  /** 訂單級歷史換貨總量（用於摘要展示） */
  orderHistExchangeQty: number
  /** 訂單級讓步接收總量（用於摘要展示） */
  orderHistConcessionQty: number
}

/* ==================== Reducer Actions ==================== */

type EditorAction =
  | { type: 'INIT'; groups: InspectionGroup[] }
  | { type: 'SET_INPUT_QTY'; groupId: string; rowKey: string; qty: number | null }
  | { type: 'TOGGLE_SELECTED'; groupId: string; rowKey: string; selected: boolean }
  | { type: 'TOGGLE_GROUP_ALL'; groupId: string; selected: boolean }
  | { type: 'SET_GROUP_DATE'; groupId: string; inboundDate: string }
  | { type: 'ADD_ALLOCATION'; allocation: InspectionAllocation }
  | { type: 'UPDATE_ALLOCATION'; clientLineId: string; patch: Partial<InspectionAllocation> }
  | { type: 'REMOVE_ALLOCATION'; clientLineId: string }
  | { type: 'RESET_ROW_INPUT'; groupId: string; rowKey: string }

let _clientLineIdCounter = 0
/** 生成前端穩定 ID */
export function generateClientLineId(): string {
  return `alloc_${Date.now()}_${++_clientLineIdCounter}`
}

/** 容量計算：某採購明細在某來源下的可分配量 */
export function calcAllocatable(
  row: InspectionRow,
  allocations: InspectionAllocation[],
  sourceExchangeItemId?: number,
): number {
  const ordered = row.item.qty
  const received = row.item.receivedQty || 0
  const histReturn = row.histReturnQty || 0
  // 普通來源：採購量 − 已入庫 − 歷史退貨 − 本次該來源已分配
  // 換貨來源：該來源未結量 − 本次該來源已分配
  const alreadyAllocated = allocations
    .filter((a) => a.orderItemId === row.item.id && a.sourceExchangeItemId === sourceExchangeItemId)
    .reduce((s, a) => s + a.qty, 0)

  if (sourceExchangeItemId != null) {
    // 換貨來源：未結量由後端提供，此處用前端已知的換貨量近似
    // 實際應由後端返回精確的 openQty
    const exchangeOpen = row.histExchangeQty || 0
    return exchangeOpen - alreadyAllocated
  }

  const normalRemaining = ordered - received - histReturn
  return normalRemaining - alreadyAllocated
}

/** 某採購明細的本次已分配總量（所有來源） */
export function calcAllocatedTotal(row: InspectionRow, allocations: InspectionAllocation[]): number {
  return allocations
    .filter((a) => a.orderItemId === row.item.id)
    .reduce((s, a) => s + a.qty, 0)
}

/** 某採購明細的剩餘可處理量（普通來源） */
export function calcRemainingNormal(row: InspectionRow, allocations: InspectionAllocation[]): number {
  return calcAllocatable(row, allocations)
}

/** Reducer */
function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'INIT':
      return { ...state, groups: action.groups }

    case 'SET_INPUT_QTY': {
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.group.id !== action.groupId
            ? g
            : {
                ...g,
                rows: g.rows.map((r) =>
                  r.rowKey !== action.rowKey
                    ? r
                    : { ...r, inputQty: action.qty, touched: true },
                ),
              },
        ),
      }
    }

    case 'TOGGLE_SELECTED': {
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.group.id !== action.groupId
            ? g
            : {
                ...g,
                rows: g.rows.map((r) =>
                  r.rowKey !== action.rowKey ? r : { ...r, selected: action.selected },
                ),
              },
        ),
      }
    }

    case 'TOGGLE_GROUP_ALL': {
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.group.id !== action.groupId
            ? g
            : {
                ...g,
                rows: g.rows.map((r) => ({ ...r, selected: action.selected })),
              },
        ),
      }
    }

    case 'SET_GROUP_DATE': {
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.group.id !== action.groupId ? g : { ...g, inboundDate: action.inboundDate },
        ),
      }
    }

    case 'ADD_ALLOCATION': {
      return {
        ...state,
        allocations: [...state.allocations, action.allocation],
      }
    }

    case 'UPDATE_ALLOCATION': {
      return {
        ...state,
        allocations: state.allocations.map((a) =>
          a.clientLineId !== action.clientLineId ? a : { ...a, ...action.patch },
        ),
      }
    }

    case 'REMOVE_ALLOCATION': {
      return {
        ...state,
        allocations: state.allocations.filter((a) => a.clientLineId !== action.clientLineId),
      }
    }

    case 'RESET_ROW_INPUT': {
      return {
        ...state,
        groups: state.groups.map((g) =>
          g.group.id !== action.groupId
            ? g
            : {
                ...g,
                rows: g.rows.map((r) =>
                  r.rowKey !== action.rowKey
                    ? r
                    : { ...r, inputQty: null, touched: false },
                ),
              },
        ),
      }
    }

    default:
      return state
  }
}

/* ==================== Hook ==================== */

export interface UseInboundEditorReturn {
  state: EditorState
  dispatch: React.Dispatch<EditorAction>

  /** 查找行 */
  findRow: (groupId: string, rowKey: string) => InspectionRow | undefined
  /** 查找分組 */
  findGroup: (groupId: string) => InspectionGroup | undefined

  /** 某行的可分配量（普通來源） */
  getAllocatable: (row: InspectionRow) => number
  /** 某行的本次已分配總量 */
  getAllocatedTotal: (row: InspectionRow) => number
  /** 某行的剩餘可處理量 */
  getRemaining: (row: InspectionRow) => number

  /** 添加分配（確認通過/不通過） */
  addAllocation: (alloc: Omit<InspectionAllocation, 'clientLineId'>) => void
  /** 更新分配 */
  updateAllocation: (clientLineId: string, patch: Partial<InspectionAllocation>) => void
  /** 撤銷分配 */
  removeAllocation: (clientLineId: string) => void

  /** 設置輸入數量 */
  setInputQty: (groupId: string, rowKey: string, qty: number | null) => void
  /** 切換勾選 */
  toggleSelected: (groupId: string, rowKey: string, selected: boolean) => void
  /** 全選/取消全選 */
  toggleGroupAll: (groupId: string, selected: boolean) => void
  /** 設置分組日期 */
  setGroupDate: (groupId: string, inboundDate: string) => void

  /** 獲取某行的所有分配 */
  getRowAllocations: (row: InspectionRow) => InspectionAllocation[]

  /** 提交 DTO 轉換 */
  buildSubmitItems: () => {
    clientLineId: string
    orderItemId: number
    sourceExchangeItemId?: number
    modelId: number | undefined
    inboundDate: string
    qty: number
    locationId: number | undefined
    locationName?: string
    departmentId?: number
    departmentName?: string
    disposition: InspectionDisposition
    reason?: string
    photos?: InspectionPhoto[]
    accessories?: InspectionAccessory[]
  }[]

  /** 摘要統計 */
  summary: {
    totalAllocated: number
    passQty: number
    returnQty: number
    exchangeQty: number
    concessionQty: number
    allocationCount: number
  }
}

export function useInboundEditor(): UseInboundEditorReturn {
  const [state, dispatch] = useReducer(editorReducer, {
    groups: [],
    allocations: [],
    orderHistReturnQty: 0,
    orderHistExchangeQty: 0,
    orderHistConcessionQty: 0,
  })

  const findRow = useCallback(
    (groupId: string, rowKey: string) =>
      state.groups.find((g) => g.group.id === groupId)?.rows.find((r) => r.rowKey === rowKey),
    [state.groups],
  )

  const findGroup = useCallback(
    (groupId: string) => state.groups.find((g) => g.group.id === groupId),
    [state.groups],
  )

  const getAllocatable = useCallback(
    (row: InspectionRow) => calcAllocatable(row, state.allocations),
    [state.allocations],
  )

  const getAllocatedTotal = useCallback(
    (row: InspectionRow) => calcAllocatedTotal(row, state.allocations),
    [state.allocations],
  )

  const getRemaining = useCallback(
    (row: InspectionRow) => calcRemainingNormal(row, state.allocations),
    [state.allocations],
  )

  const addAllocation = useCallback(
    (alloc: Omit<InspectionAllocation, 'clientLineId'>) => {
      dispatch({ type: 'ADD_ALLOCATION', allocation: { ...alloc, clientLineId: generateClientLineId() } })
    },
    [],
  )

  const updateAllocation = useCallback(
    (clientLineId: string, patch: Partial<InspectionAllocation>) => {
      dispatch({ type: 'UPDATE_ALLOCATION', clientLineId, patch })
    },
    [],
  )

  const removeAllocation = useCallback(
    (clientLineId: string) => {
      dispatch({ type: 'REMOVE_ALLOCATION', clientLineId })
    },
    [],
  )

  const setInputQty = useCallback(
    (groupId: string, rowKey: string, qty: number | null) => {
      dispatch({ type: 'SET_INPUT_QTY', groupId, rowKey, qty })
    },
    [],
  )

  const toggleSelected = useCallback(
    (groupId: string, rowKey: string, selected: boolean) => {
      dispatch({ type: 'TOGGLE_SELECTED', groupId, rowKey, selected })
    },
    [],
  )

  const toggleGroupAll = useCallback(
    (groupId: string, selected: boolean) => {
      dispatch({ type: 'TOGGLE_GROUP_ALL', groupId, selected })
    },
    [],
  )

  const setGroupDate = useCallback(
    (groupId: string, inboundDate: string) => {
      dispatch({ type: 'SET_GROUP_DATE', groupId, inboundDate })
    },
    [],
  )

  const getRowAllocations = useCallback(
    (row: InspectionRow) =>
      state.allocations.filter((a) => a.orderItemId === row.item.id),
    [state.allocations],
  )

  const buildSubmitItems = useCallback(() => {
    return state.allocations.map((a) => ({
      clientLineId: a.clientLineId,
      orderItemId: a.orderItemId,
      sourceExchangeItemId: a.sourceExchangeItemId,
      modelId: state.groups
        .find((g) => g.group.id === a.groupId)
        ?.rows.find((r) => r.item.id === a.orderItemId)?.item.modelId,
      inboundDate: a.inboundDate,
      qty: a.qty,
      locationId: a.locationId,
      locationName: a.locationName,
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      disposition: a.disposition,
      reason: a.reason,
      photos: a.photos.length > 0 ? a.photos : undefined,
      accessories: a.accessories.length > 0 ? a.accessories : undefined,
    }))
  }, [state.allocations, state.groups])

  const summary = useMemo(() => {
    let passQty = 0
    let returnQty = 0
    let exchangeQty = 0
    let concessionQty = 0
    for (const a of state.allocations) {
      switch (a.disposition) {
        case 'pass': passQty += a.qty; break
        case 'return': returnQty += a.qty; break
        case 'exchange': exchangeQty += a.qty; break
        case 'concession': concessionQty += a.qty; break
      }
    }
    return {
      totalAllocated: passQty + returnQty + exchangeQty + concessionQty,
      passQty,
      returnQty,
      exchangeQty,
      concessionQty,
      allocationCount: state.allocations.length,
    }
  }, [state.allocations])

  return {
    state,
    dispatch,
    findRow,
    findGroup,
    getAllocatable,
    getAllocatedTotal,
    getRemaining,
    addAllocation,
    updateAllocation,
    removeAllocation,
    setInputQty,
    toggleSelected,
    toggleGroupAll,
    setGroupDate,
    getRowAllocations,
    buildSubmitItems,
    summary,
  }
}

/* ==================== 初始化輔助 ==================== */

/** 從採購訂單數據初始化編輯器分組 */
export function initEditorGroups(
  supplierGroups: PurchaseOrderSupplierGroup[],
  histMap: Map<number, { ret: number; exc: number }>,
  defaultInboundDate: string,
  filterGroupId?: string,
): InspectionGroup[] {
  const srcGroups = supplierGroups.length > 0
    ? supplierGroups
    : [{
        id: 'sg_default',
        supplier: '',
        items: [],
      }]

  const allGroups: InspectionGroup[] = srcGroups.map((g) => ({
    group: g,
    inboundDate: defaultInboundDate,
    rows: g.items.map((it, idx) => {
      const hist = it.id != null ? histMap.get(it.id) : undefined
      return {
        item: it,
        groupId: g.id,
        rowKey: `${g.id}_${idx}_${it.modelId || 'x'}`,
        selected: true,
        inputQty: null,
        touched: false,
        histReturnQty: it.returnedQty ?? hist?.ret ?? 0,
        histExchangeQty: it.exchangedQty ?? hist?.exc ?? 0,
      }
    }),
  }))

  if (filterGroupId && allGroups.some((g) => g.group.id === filterGroupId)) {
    return allGroups.filter((g) => g.group.id === filterGroupId)
  }
  return allGroups
}
