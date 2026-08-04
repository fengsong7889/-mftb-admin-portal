/**
 * 審批數據共享存儲（localStorage）
 * 充值/轉賬/扣款/合併/推廣贈送等頁面提交後，數據進入審批中心
 */

import { createGiftRecord } from '../api/gift'

const STORAGE_KEY = 'mftb_approval_records'
const LEGACY_TG_CLEANUP_KEY = 'mftb_approval_tg_cleanup_v2'

export interface ApprovalRecord {
  key: string
  groupId: string
  groupName: string
  brand: string
  flowNo: string
  approvalType: string // recharge | deduct | transfer | merge | gift
  applicant: string
  applyTime: string
  // 業務主管
  bizApprover: string
  bizApproveTime: string
  bizApproveStatus: string // pending | approved | rejected
  // 運營主管
  opsApprover: string
  opsApproveTime: string
  opsApproveStatus: string
  // 財務主管
  finApprover: string
  finApproveTime: string
  finApproveStatus: string
  // 流程
  flowStatus: string // pending | approved | rejected | cancelled
  rejectReason: string
  // 擴展數據（不同類型存不同字段）
  extra?: Record<string, unknown>
}

/** 舊版預設審批人（已廢棄，僅用於存量數據清洗） */
const LEGACY_NODE_APPROVERS = ['朱元璋(001)', '李世民(003)', '趙匡胤(004)']

/**
 * 一次性清理：
 * 1. 刪除早期測試提交的 TG 贈送流程（申請人為演示賬號 朱棣(002) 的臟數據，修復後申請人已改為當前登錄人）
 * 2. 待審節點若殘留舊版預設審批人，重置為 '--'（與後端一致：審批人由實際操作人在審批時記錄）
 */
function cleanupLegacyGiftRecords(): void {
  if (localStorage.getItem(LEGACY_TG_CLEANUP_KEY) === 'done') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const records: ApprovalRecord[] = JSON.parse(raw)
      const cleaned = records
        .filter(r => !(r.approvalType === 'gift' && r.applicant === '朱棣(002)'))
        .map(r => {
          const fixed = { ...r }
          if (fixed.bizApproveStatus === 'pending' && LEGACY_NODE_APPROVERS.includes(fixed.bizApprover)) fixed.bizApprover = '--'
          if (fixed.opsApproveStatus === 'pending' && LEGACY_NODE_APPROVERS.includes(fixed.opsApprover)) fixed.opsApprover = '--'
          if (fixed.finApproveStatus === 'pending' && LEGACY_NODE_APPROVERS.includes(fixed.finApprover)) fixed.finApprover = '--'
          return fixed
        })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    }
  } catch { /* 解析失敗跳過清理，不影響審批記錄讀取 */ }
  localStorage.setItem(LEGACY_TG_CLEANUP_KEY, 'done')
}

/** 獲取所有自定義審批記錄 */
export function getApprovalRecords(): ApprovalRecord[] {
  cleanupLegacyGiftRecords()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 保存審批記錄（追加） */
export function addApprovalRecord(record: ApprovalRecord): void {
  const records = getApprovalRecords()
  records.unshift(record) // 新記錄插入最前
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

/** 根據流程編號查找審批記錄 */
export function getApprovalRecordByFlowNo(flowNo: string): ApprovalRecord | undefined {
  return getApprovalRecords().find(r => r.flowNo === flowNo)
}

/** 更新審批記錄 */
export function updateApprovalRecord(flowNo: string, updates: Partial<ApprovalRecord>): void {
  const records = getApprovalRecords()
  const idx = records.findIndex(r => r.flowNo === flowNo)
  if (idx === -1) return
  records[idx] = { ...records[idx], ...updates }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

/** 當前登錄人簽名（姓名(工號)）：與後端 operatorSignature 行為一致，審批時記錄實際操作人 */
function currentOperatorSignature(): string {
  try {
    const info = JSON.parse(localStorage.getItem('user_info') || '{}')
    if (info.name && info.empId) return `${info.name}(${info.empId})`
    if (info.name) return info.name
  } catch { /* 解析失敗回退默認操作人 */ }
  return '系統管理員'
}

/** 審批節點推進結果 */
export interface ApproveNodeResult {
  nodeName: string // 本次通過的節點名稱
  finished: boolean // 是否全部節點已通過
  nextNode?: string // 下一待審節點名稱
}

/**
 * 通過當前待審節點（業務主管→運營主管→財務主管逐級推進）
 * 最後一個節點通過後流程完成，自動寫入批次查詢
 */
export function approveCurrentNode(flowNo: string): ApproveNodeResult | null {
  const record = getApprovalRecordByFlowNo(flowNo)
  if (!record || record.flowStatus !== 'pending') return null
  const now = formatNow()
  const approver = currentOperatorSignature()
  if (record.bizApproveStatus === 'pending') {
    updateApprovalRecord(flowNo, {
      bizApprover: approver, bizApproveTime: now, bizApproveStatus: 'approved',
    })
    return { nodeName: '業務主管審批', finished: false, nextNode: '運營主管審批' }
  }
  if (record.opsApproveStatus === 'pending') {
    updateApprovalRecord(flowNo, {
      opsApprover: approver, opsApproveTime: now, opsApproveStatus: 'approved',
    })
    return { nodeName: '運營主管審批', finished: false, nextNode: '財務主管審批' }
  }
  if (record.finApproveStatus === 'pending') {
    updateApprovalRecord(flowNo, {
      finApprover: approver, finApproveTime: now, finApproveStatus: 'approved',
      flowStatus: 'approved',
    })
    // 全部節點通過 → 寫入批次查詢（充值/轉賬/合併）與明細查詢（全部類型）
    const finished = getApprovalRecordByFlowNo(flowNo)
    if (finished) writeApprovedRecords(finished, now)
    return { nodeName: '財務主管審批', finished: true }
  }
  return null
}

/** 駁回當前待審節點，整個流程結束 */
export function rejectCurrentNode(flowNo: string, reason: string): string | null {
  const record = getApprovalRecordByFlowNo(flowNo)
  if (!record || record.flowStatus !== 'pending') return null
  const now = formatNow()
  const approver = currentOperatorSignature()
  if (record.bizApproveStatus === 'pending') {
    updateApprovalRecord(flowNo, {
      bizApprover: approver, bizApproveTime: now, bizApproveStatus: 'rejected',
      flowStatus: 'rejected', rejectReason: reason,
    })
    return '業務主管審批'
  }
  if (record.opsApproveStatus === 'pending') {
    updateApprovalRecord(flowNo, {
      opsApprover: approver, opsApproveTime: now, opsApproveStatus: 'rejected',
      flowStatus: 'rejected', rejectReason: reason,
    })
    return '運營主管審批'
  }
  if (record.finApproveStatus === 'pending') {
    updateApprovalRecord(flowNo, {
      finApprover: approver, finApproveTime: now, finApproveStatus: 'rejected',
      flowStatus: 'rejected', rejectReason: reason,
    })
    return '財務主管審批'
  }
  return null
}

/* ==================== 批次查詢數據 ==================== */

const BATCH_STORAGE_KEY = 'mftb_batch_records'

/** 批次查詢記錄（審批全部通過後寫入） */
export interface BatchStoreRecord {
  key: string
  groupId: string
  groupName: string
  brand: string
  batchType: string // recharge | transfer | deduct | merge
  batchNo: string
  flowNo: string
  tradeTime: string // 交易時間（審批通過時間）
  isActual: string // 是 | 否 | --
  virtualAmount: number | null // 虛擬賬戶金額（負數表示轉出/扣減）
  actualAmount: number | null
  discountAmount: number | null
  applicant: string
  bd: string
  remark: string
  extra?: Record<string, unknown> // 明細頁展示數據
}

/** 獲取所有批次記錄 */
export function getBatchRecords(): BatchStoreRecord[] {
  try {
    const raw = localStorage.getItem(BATCH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 根據 key 查找批次記錄 */
export function getBatchRecordByKey(key: string): BatchStoreRecord | undefined {
  return getBatchRecords().find(r => r.key === key)
}

/** 生成批次號：PC + 年月日 + 4位自增序號（0000起） */
export function generateBatchNo(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const dayKey = `PC${dateStr}`
  let seqMap: Record<string, number> = {}
  try {
    const raw = localStorage.getItem(SEQ_STORAGE_KEY)
    if (raw) seqMap = JSON.parse(raw)
  } catch { /* ignore */ }
  const currentSeq = seqMap[dayKey] ?? 0
  seqMap[dayKey] = currentSeq + 1
  localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(seqMap))
  return `${dayKey}${String(currentSeq).padStart(4, '0')}`
}

/**
 * 審批全部通過後的統一寫入入口
 * - 充值/轉賬/合併：生成批次（寫入批次查詢）+ 對應交易明細（寫入明細查詢）
 * - 扣款：不生成批次，僅寫入扣款明細（按最早批次 FIFO 依次扣減，可能跨多個批次）
 */
function writeApprovedRecords(record: ApprovalRecord, tradeTime: string): void {
  if (record.approvalType === 'gift') {
    writeGiftApprovedRecord(record)
    return
  }
  if (record.approvalType === 'deduct') {
    writeDeductDetailRecords(record, tradeTime)
    return
  }
  const batchNo = writeBatchRecords(record, tradeTime)
  if (batchNo) {
    writeFlowDetailRecords(record, tradeTime, batchNo)
    writeDebtRecords(record, tradeTime, batchNo)
  }
}

/**
 * 推廣贈送審批全部通過後寫入贈送記錄（此時剩餘天數才會新增）
 * 審批未通過/被駁回的申請不會寫入；後端不可用時由 gift API 自動降級寫入本地 Mock 贈送數據
 */
function writeGiftApprovedRecord(record: ApprovalRecord): void {
  const extra = (record.extra || {}) as Record<string, unknown>
  void createGiftRecord({
    groupId: Number(extra.groupId) || 0,
    storeId: Number(extra.storeId) || 0,
    brand: record.brand,
    adType: String(extra.adType || ''),
    giftDays: Number(extra.giftDays) || 0,
    validDays: Number(extra.validDays) || 0,
    reason: String(extra.reason || extra.remark || ''),
    credentials: Array.isArray(extra.credentials) ? (extra.credentials as string[]) : [],
  }).catch(() => { /* 贈送記錄寫入失敗不阻斷審批流轉 */ })
}

/**
 * 審批全部通過後，按類型映射寫入批次查詢（僅充值/轉賬/合併生成批次，扣款不生成）
 * - 充值：寫入 1 條
 * - 轉賬/合併：雙方集團各寫 1 條（轉出負數/轉入正數），共享批次號，以流程編號關聯
 * @returns 本次生成的批次號（未生成時返回空字符串）
 */
function writeBatchRecords(record: ApprovalRecord, tradeTime: string): string {
  const extra = (record.extra || {}) as Record<string, unknown>
  const batchNo = generateBatchNo()
  const base = {
    batchNo,
    flowNo: record.flowNo,
    tradeTime,
    applicant: record.applicant,
  }
  const newRecords: BatchStoreRecord[] = []

  if (record.approvalType === 'recharge') {
    newRecords.push({
      ...base,
      key: `batch_${Date.now()}_1`,
      groupId: record.groupId,
      groupName: record.groupName,
      brand: record.brand,
      batchType: 'recharge',
      isActual: extra.isActual ? '是' : '否',
      virtualAmount: Number(extra.virtualAmount) || 0,
      actualAmount: extra.isActual ? (Number(extra.actualTotal) || 0) : null,
      discountAmount: Number(extra.discountAmount) || 0,
      bd: extra.bd || '--',
      remark: extra.remark || '--',
      extra,
    })
  } else if (record.approvalType === 'transfer') {
    const amount = Number(extra.transferAmount) || 0
    // 轉出集團（負數）
    newRecords.push({
      ...base,
      key: `batch_${Date.now()}_1`,
      groupId: record.groupId,
      groupName: record.groupName,
      brand: record.brand,
      batchType: 'transfer',
      isActual: '--',
      virtualAmount: -amount,
      actualAmount: null,
      discountAmount: null,
      bd: '--',
      remark: extra.remark || '--',
      extra: { ...extra, direction: 'out' },
    })
    // 轉入集團（正數）
    newRecords.push({
      ...base,
      key: `batch_${Date.now()}_2`,
      groupId: extra.toGroupId || '',
      groupName: extra.toGroupName || '',
      brand: record.brand,
      batchType: 'transfer',
      isActual: '--',
      virtualAmount: amount,
      actualAmount: null,
      discountAmount: null,
      bd: '--',
      remark: extra.remark || '--',
      extra: { ...extra, direction: 'in' },
    })
  } else if (record.approvalType === 'merge') {
    const balance = Number(extra.sourceVirtualBalance) || 0
    // 註銷集團（餘額轉出，負數）
    newRecords.push({
      ...base,
      key: `batch_${Date.now()}_1`,
      groupId: record.groupId,
      groupName: record.groupName,
      brand: record.brand,
      batchType: 'merge',
      isActual: '--',
      virtualAmount: -balance,
      actualAmount: null,
      discountAmount: null,
      bd: '--',
      remark: extra.remark || '--',
      extra: { ...extra, direction: 'out' },
    })
    // 存續集團（餘額接收，正數）
    newRecords.push({
      ...base,
      key: `batch_${Date.now()}_2`,
      groupId: extra.targetGroupId || '',
      groupName: extra.targetGroupName || '',
      brand: record.brand,
      batchType: 'merge',
      isActual: '--',
      virtualAmount: balance,
      actualAmount: null,
      discountAmount: null,
      bd: '--',
      remark: extra.remark || '--',
      extra: { ...extra, direction: 'in' },
    })
  }

  if (newRecords.length === 0) return ''
  const all = getBatchRecords()
  localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify([...newRecords, ...all]))
  return batchNo
}

const SEQ_STORAGE_KEY = 'mftb_flow_seq'

/* ==================== 明細查詢數據（全量交易流水） ==================== */

const DETAIL_STORAGE_KEY = 'mftb_detail_records'

/**
 * 交易明細記錄（審批全部通過後寫入）
 * 充值/轉賬/合併生成批次同時寫入對應明細；扣款不生成批次，僅寫入明細
 */
export interface DetailStoreRecord {
  key: string
  detailId: string
  groupId: string
  groupName: string
  brand: string
  storeId: string // '--' 表示集團維度（無門店）
  storeName: string
  channel: string
  tradeType: string // 充值 | 扣款 | 轉入 | 轉出
  changeType: string // 變動類別：充值/充值批次扣款/賬戶扣款/消費類型(如基礎套餐)/廣告類型(如無敵星星)/欠款償還/轉賬轉出(入)/合併轉出(入)
  tradeTime: string
  virtualChange: number
  actualChange: number | null
  batchNo: string // 關聯批次號（扣款行為被扣減的批次）
  flowNo: string
  bd: string
  remark: string
}

/** 獲取所有交易明細記錄 */
export function getDetailRecords(): DetailStoreRecord[] {
  try {
    const raw = localStorage.getItem(DETAIL_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 等比例扣款規則：充值時虛擬/實收各記一筆並同屬一個批次，
 * 後續消費/扣款/轉出按「該批次實收充值 ÷ 虛擬充值」比例同步扣減實收賬戶。
 * 如：虛擬充值 10 萬、實收 5 萬，商家每消費 x 元，虛擬扣 x、實收扣 0.5x。
 */

/** 計算充值批次的實收比例（實收充值 ÷ 虛擬充值），純贈送批次（無實收）返回 null */
function getBatchActualRatio(batchNo: string): number | null {
  const batch = getBatchRecords().find(b => b.batchNo === batchNo && b.batchType === 'recharge')
  if (!batch || !(batch.virtualAmount && batch.virtualAmount > 0) || !batch.actualAmount) return null
  return batch.actualAmount / batch.virtualAmount
}

/** 計算集團的綜合實收比例（Σ實收充值 ÷ Σ虛擬充值），用於轉賬/合併等集團維度交易 */
function getGroupActualRatio(groupId: string): number | null {
  const batches = getBatchRecords().filter(
    b => b.groupId === groupId && b.batchType === 'recharge' && (b.virtualAmount || 0) > 0,
  )
  const virtualTotal = batches.reduce((s, b) => s + (b.virtualAmount || 0), 0)
  const actualTotal = batches.reduce((s, b) => s + (b.actualAmount || 0), 0)
  if (virtualTotal <= 0 || actualTotal <= 0) return null
  return actualTotal / virtualTotal
}

/** 按比例計算實收變動金額（保留兩位小數），無比例返回 null */
function calcActualChange(virtualValue: number, ratio: number | null): number | null {
  if (ratio === null) return null
  return Math.round(virtualValue * ratio * 100) / 100
}

/** 生成明細ID：MX + 年月日 + 4位自增序號（0000起） */
export function generateDetailId(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const dayKey = `MX${dateStr}`
  let seqMap: Record<string, number> = {}
  try {
    const raw = localStorage.getItem(SEQ_STORAGE_KEY)
    if (raw) seqMap = JSON.parse(raw)
  } catch { /* ignore */ }
  const currentSeq = seqMap[dayKey] ?? 0
  seqMap[dayKey] = currentSeq + 1
  localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(seqMap))
  return `${dayKey}${String(currentSeq).padStart(4, '0')}`
}

/** 追加明細記錄（新記錄插入最前） */
function appendDetailRecords(rows: DetailStoreRecord[]): void {
  if (rows.length === 0) return
  const all = getDetailRecords()
  localStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify([...rows, ...all]))
}

/** 從門店選項文案中提取門店ID/名稱（如「廣州酒家(123456789)」） */
function parseStoreLabel(label: string): { storeId: string; storeName: string } {
  const match = (label || '').match(/\((\d+)\)/)
  return {
    storeId: match?.[1] || '--',
    storeName: (label || '').replace(/\(\d+\)/, '').trim() || '--',
  }
}

/**
 * 充值/轉賬/合併審批通過後，寫入對應交易明細（與批次明細頁流水口徑一致）
 */
function writeFlowDetailRecords(record: ApprovalRecord, tradeTime: string, batchNo: string): void {
  const extra = (record.extra || {}) as Record<string, unknown>
  const rows: DetailStoreRecord[] = []
  let seq = 0
  const push = (row: Omit<DetailStoreRecord, 'key' | 'detailId' | 'tradeTime' | 'flowNo' | 'batchNo'> & { batchNo?: string }) => {
    seq += 1
    rows.push({
      ...row,
      key: `detail_${Date.now()}_${seq}`,
      detailId: generateDetailId(),
      tradeTime,
      flowNo: record.flowNo,
      batchNo: row.batchNo || batchNo,
    })
  }
  const groupBase = {
    groupId: record.groupId,
    groupName: record.groupName,
    brand: record.brand,
    storeId: '--',
    storeName: '--',
    channel: '外賣',
  }

  if (record.approvalType === 'recharge') {
    push({
      ...groupBase,
      tradeType: '充值',
      changeType: '充值',
      virtualChange: Number(extra.virtualAmount) || 0,
      actualChange: extra.isActual ? (Number(extra.actualTotal) || 0) : null,
      bd: extra.bd || '--',
      remark: extra.remark || '--',
    })
    // 營業額支付：按門店寫入充值批次扣款明細
    ;((extra.deductStores as unknown[]) || []).forEach(s => {
      const { storeId, storeName } = parseStoreLabel(s.storeLabel || '')
      push({
        ...groupBase,
        storeId: s.storeId || storeId,
        storeName,
        tradeType: '扣款',
        changeType: '充值批次扣款',
        virtualChange: -(Number(s.amount) || 0),
        actualChange: -(Number(s.amount) || 0),
        bd: extra.bd || '--',
        remark: '營業額支付扣款',
      })
    })
  } else if (record.approvalType === 'transfer') {
    const amount = Number(extra.transferAmount) || 0
    // 轉出/轉入按轉出集團的綜合實收比例同步變動實收賬戶
    const transferRatio = getGroupActualRatio(record.groupId)
    push({
      ...groupBase,
      tradeType: '轉出',
      changeType: '轉賬轉出',
      virtualChange: -amount,
      actualChange: calcActualChange(-amount, transferRatio),
      bd: '--',
      remark: extra.remark || '--',
    })
    push({
      ...groupBase,
      groupId: extra.toGroupId || '',
      groupName: extra.toGroupName || '',
      tradeType: '轉入',
      changeType: '轉賬轉入',
      virtualChange: amount,
      actualChange: calcActualChange(amount, transferRatio),
      bd: '--',
      remark: extra.remark || '--',
    })
  } else if (record.approvalType === 'merge') {
    const balance = Number(extra.sourceVirtualBalance) || 0
    // 欠款償還/合併轉出入按註銷集團的綜合實收比例同步變動實收賬戶
    const mergeRatio = getGroupActualRatio(record.groupId)
    // 欠款償還門店（註銷集團）
    ;((extra.repayStores as unknown[]) || []).forEach(s => {
      const { storeId, storeName } = parseStoreLabel(s.storeLabel || '')
      push({
        ...groupBase,
        storeId: s.storeId || storeId,
        storeName,
        tradeType: '扣款',
        changeType: '欠款償還',
        virtualChange: -(Number(s.amount) || 0),
        actualChange: calcActualChange(-(Number(s.amount) || 0), mergeRatio),
        bd: s.bd || '--',
        remark: '集團合併欠款償還',
      })
    })
    push({
      ...groupBase,
      tradeType: '轉出',
      changeType: '合併轉出',
      virtualChange: -balance,
      actualChange: calcActualChange(-balance, mergeRatio),
      bd: '--',
      remark: extra.remark || '--',
    })
    push({
      ...groupBase,
      groupId: extra.targetGroupId || '',
      groupName: extra.targetGroupName || '',
      tradeType: '轉入',
      changeType: '合併轉入',
      virtualChange: balance,
      actualChange: calcActualChange(balance, mergeRatio),
      bd: '--',
      remark: extra.remark || '--',
    })
  }

  appendDetailRecords(rows)
}

/**
 * 扣款審批通過後寫入扣款明細（不生成批次）
 * - 消費扣款：有門店信息，變動類別直接展示所選消費類型枚舉（如「基礎套餐」）
 * - 充值批次扣款：無門店信息，變動類別展示「充值批次扣款」，直接關聯選定的充值批次，寫入 1 條
 * - 賬戶扣款：無門店信息，變動類別展示「賬戶扣款」
 * - 賬戶扣款/消費扣款：按該集團現有批次交易時間升序 FIFO 依次扣減，
 *   單筆金額超過最早批次餘額時自動拆分為多條明細（跨多個批次），共享同一流程編號
 * - 實收變動：每條明細按所扣批次的實收比例同步扣減實收賬戶，純贈送批次顯示 --
 */
function writeDeductDetailRecords(record: ApprovalRecord, tradeTime: string): void {
  const extra = (record.extra || {}) as Record<string, unknown>
  const method = (extra.deductMethod as string) || 'account'
  const amount = Number(extra.deductAmount) || 0
  const changeType = method === 'consume'
    ? ((extra.consumeType as string) || '消費扣款')
    : method === 'batch' ? '充值批次扣款' : '賬戶扣款'
  const store = method === 'consume' ? parseStoreLabel(extra.consumeStore || '') : { storeId: '--', storeName: '--' }
  const base = {
    groupId: record.groupId,
    groupName: record.groupName,
    brand: record.brand,
    storeId: store.storeId,
    storeName: store.storeName,
    channel: method === 'consume' ? (extra.consumeChannel || '外賣') : '外賣',
    tradeType: '扣款',
    changeType,
    bd: method === 'consume' ? (extra.consumeBd || '--') : '--',
  }
  const rows: DetailStoreRecord[] = []
  let seq = 0
  const push = (batchNo: string, value: number, remark: string) => {
    seq += 1
    rows.push({
      ...base,
      key: `detail_${Date.now()}_${seq}`,
      detailId: generateDetailId(),
      tradeTime,
      virtualChange: -value,
      // 按所扣批次的實收比例同步扣減實收賬戶
      actualChange: calcActualChange(-value, getBatchActualRatio(batchNo)),
      batchNo,
      flowNo: record.flowNo,
      remark,
    })
  }

  if (method === 'batch') {
    // 充值批次扣款：明確指定批次
    push((extra.batchNo as string) || '--', amount, extra.remark || '--')
  } else {
    // 賬戶/消費扣款：按最早批次 FIFO 依次扣減
    const batches = getBatchRecords()
      .filter(b => b.groupId === record.groupId && (b.virtualAmount || 0) > 0)
      .sort((a, b) => a.tradeTime.localeCompare(b.tradeTime))
    let remaining = amount
    const parts: { batchNo: string; value: number }[] = []
    for (const b of batches) {
      if (remaining <= 0) break
      const take = Math.min(b.virtualAmount || 0, remaining)
      parts.push({ batchNo: b.batchNo, value: take })
      remaining -= take
    }
    if (remaining > 0 || parts.length === 0) {
      parts.push({ batchNo: batches.length > 0 ? batches[batches.length - 1].batchNo : '--', value: remaining > 0 ? remaining : amount })
    }
    const multi = parts.length > 1
    parts.forEach((p, i) => {
      const splitTag = multi ? `（跨批次扣款 ${i + 1}/${parts.length}）` : ''
      push(p.batchNo, p.value, `${extra.remark || '--'}${splitTag}`)
    })
  }

  appendDetailRecords(rows)
}

/* ==================== 欠款單數據（欠款對賬） ==================== */

const DEBT_STORAGE_KEY = 'mftb_debt_records'

/** 還款明細行 */
export interface DebtRepaymentRecord {
  key: string
  date: string
  channel: string // 推廣金扣款 | 營業額扣款 | 對公轉賬 | 轉移結算
  amount: number
  remark: string
  operator: string
  operateTime: string
  canDelete: boolean
}

/**
 * 欠款單（審批全部通過後生成）
 * - 充值：實收賬戶充值含營業額支付（混合支付/營業額支付）時，每個扣款門店生成一條
 * - 合併：存續集團每個欠款償還門店生成一條；註銷集團原欠款單轉結
 */
export interface DebtStoreRecord {
  key: string
  billNo: string // 賬單編號：QK + 年月日 + 4位自增序號
  groupId: string
  groupName: string
  brand: string
  storeId: string
  storeName: string
  channel: string
  bd: string
  source: string // recharge=充值營業額扣款 | merge=合併欠款轉入
  loanDate: string
  batchNo: string
  flowNo: string
  debtTotal: number
  paidAmount: number
  remainAmount: number
  status: string // unsettled=未結清 | settled=已結清 | transferred=已轉結
  repayments: DebtRepaymentRecord[]
}

/** 獲取所有欠款單 */
export function getDebtRecords(): DebtStoreRecord[] {
  try {
    const raw = localStorage.getItem(DEBT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 保存全量欠款單 */
function saveDebtRecords(records: DebtStoreRecord[]): void {
  localStorage.setItem(DEBT_STORAGE_KEY, JSON.stringify(records))
}

/** 生成賬單編號：QK + 年月日 + 4位自增序號（0000起） */
export function generateDebtBillNo(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const dayKey = `QK${dateStr}`
  let seqMap: Record<string, number> = {}
  try {
    const raw = localStorage.getItem(SEQ_STORAGE_KEY)
    if (raw) seqMap = JSON.parse(raw)
  } catch { /* ignore */ }
  const currentSeq = seqMap[dayKey] ?? 0
  seqMap[dayKey] = currentSeq + 1
  localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(seqMap))
  return `${dayKey}${String(currentSeq).padStart(4, '0')}`
}

/** 保留兩位小數 */
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * 充值/合併審批全部通過後生成欠款單
 * - 充值：實收賬戶充值含營業額支付（混合支付/營業額支付）時，
 *   所選每個扣款門店生成一條欠款單（欠款總額 = 該門店營業額扣款金額）
 * - 合併：存續集團每個欠款償還門店生成一條新欠款單；
 *   註銷集團原未結清欠款單標記「已轉結」，還款明細追加一條
 *   還款渠道=轉移結算的記錄，備註該筆欠款已轉移
 */
function writeDebtRecords(record: ApprovalRecord, tradeTime: string, batchNo: string): void {
  const extra = (record.extra || {}) as Record<string, unknown>
  const loanDate = tradeTime.slice(0, 10)

  if (record.approvalType === 'recharge') {
    const stores = (extra.deductStores as unknown[]) || []
    if (!extra.isActual || stores.length === 0) return
    const rows: DebtStoreRecord[] = stores.map((s, i) => {
      const { storeId, storeName } = parseStoreLabel(s.storeLabel || '')
      const amount = Number(s.amount) || 0
      return {
        key: `debt_${Date.now()}_${i}`,
        billNo: generateDebtBillNo(),
        groupId: record.groupId,
        groupName: record.groupName,
        brand: record.brand,
        storeId: s.storeId || storeId,
        storeName,
        channel: (extra.businessChannelLabel as string) || '--',
        bd: (extra.bd as string) || '--',
        source: 'recharge',
        loanDate,
        batchNo,
        flowNo: record.flowNo,
        debtTotal: amount,
        paidAmount: 0,
        remainAmount: amount,
        status: 'unsettled',
        repayments: [],
      }
    })
    saveDebtRecords([...rows, ...getDebtRecords()])
  } else if (record.approvalType === 'merge') {
    const targetGroupName = (extra.targetGroupName as string) || ''
    // 1. 存續集團每個欠款償還門店生成一條新欠款單
    const newRows: DebtStoreRecord[] = ((extra.repayStores as unknown[]) || []).map((s, i) => {
      const { storeId, storeName } = parseStoreLabel(s.storeLabel || '')
      const amount = Number(s.amount) || 0
      return {
        key: `debt_${Date.now()}_m${i}`,
        billNo: generateDebtBillNo(),
        groupId: (extra.targetGroupId as string) || '',
        groupName: targetGroupName,
        brand: record.brand,
        storeId: s.storeId || storeId,
        storeName,
        channel: '--',
        bd: s.bd || '--',
        source: 'merge',
        loanDate,
        batchNo,
        flowNo: record.flowNo,
        debtTotal: amount,
        paidAmount: 0,
        remainAmount: amount,
        status: 'unsettled',
        repayments: [],
      }
    })
    const newBillNos = newRows.map(r => r.billNo).join('、')
    // 2. 註銷集團原未結清欠款單轉結，還款明細追加「轉移結算」記錄
    const all = getDebtRecords()
    all.forEach(bill => {
      if (bill.groupId !== record.groupId || bill.status !== 'unsettled') return
      bill.repayments = [
        ...(bill.repayments || []),
        {
          key: `repay_${Date.now()}_${bill.billNo}`,
          date: loanDate,
          channel: '轉移結算',
          amount: bill.remainAmount,
          remark: `商戶合併，該筆欠款已轉移至存續集團「${targetGroupName}」${newBillNos ? `，新賬單編號：${newBillNos}` : ''}`,
          operator: '系統',
          operateTime: tradeTime,
          canDelete: false,
        },
      ]
      bill.paidAmount = round2(bill.paidAmount + bill.remainAmount)
      bill.remainAmount = 0
      bill.status = 'transferred'
    })
    saveDebtRecords(newRows.length > 0 ? [...newRows, ...all] : all)
  }
}

/**
 * 本地新增還款記錄（後端不可用時的降級寫入）
 * 僅能更新 localStorage 中的欠款單；靜態演示賬單返回 null，由調用方僅更新頁面狀態
 */
export function addDebtRepayment(billNo: string, repayment: Omit<DebtRepaymentRecord, 'key'>): DebtStoreRecord | null {
  const all = getDebtRecords()
  const bill = all.find(b => b.billNo === billNo)
  if (!bill) return null
  bill.repayments = [
    ...(bill.repayments || []),
    { ...repayment, key: `repay_${Date.now()}` },
  ]
  bill.paidAmount = round2(bill.paidAmount + repayment.amount)
  bill.remainAmount = round2(Math.max(0, bill.debtTotal - bill.paidAmount))
  bill.status = bill.remainAmount <= 0 ? 'settled' : 'unsettled'
  saveDebtRecords(all)
  return bill
}

/** 本地刪除還款記錄（後端不可用時的降級寫入），返回更新後的欠款單 */
export function removeDebtRepayment(billNo: string, key: string): DebtStoreRecord | null {
  const all = getDebtRecords()
  const bill = all.find(b => b.billNo === billNo)
  if (!bill) return null
  const target = (bill.repayments || []).find(r => r.key === key)
  if (!target) return null
  bill.repayments = bill.repayments.filter(r => r.key !== key)
  bill.paidAmount = round2(Math.max(0, bill.paidAmount - target.amount))
  bill.remainAmount = round2(Math.max(0, bill.debtTotal - bill.paidAmount))
  bill.status = bill.remainAmount <= 0 ? 'settled' : 'unsettled'
  saveDebtRecords(all)
  return bill
}

/** 生成流程編號：前綴 + 年月日 + 4位自增序號（0000起） */
export function generateFlowNo(type: string): string {
  const prefixMap: Record<string, string> = {
    recharge: 'CZ',
    deduct: 'KK',
    transfer: 'ZZ',
    merge: 'HB',
    gift: 'TG',
  }
  const prefix = prefixMap[type] || 'SP'
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const dayKey = `${prefix}${dateStr}`

  // 讀取當日已有序號
  let seqMap: Record<string, number> = {}
  try {
    const raw = localStorage.getItem(SEQ_STORAGE_KEY)
    if (raw) seqMap = JSON.parse(raw)
  } catch { /* ignore */ }

  const currentSeq = seqMap[dayKey] ?? 0
  seqMap[dayKey] = currentSeq + 1
  localStorage.setItem(SEQ_STORAGE_KEY, JSON.stringify(seqMap))

  return `${dayKey}${String(currentSeq).padStart(4, '0')}`
}

/** 格式化當前時間 */
export function formatNow(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}
