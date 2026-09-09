/**
 * 資產操作類型 → 展示元數據（i18n key + Tag 顏色）
 *
 * 台賬詳情「操作動態」與變更歷史頁共用，避免兩處重複維護
 */
import type { AssetOpType } from '../../api/asset'

export const OP_META: Record<AssetOpType, { key: string; color: string }> = {
  create:       { key: 'asset.opCreate',       color: 'blue' },
  inbound:      { key: 'asset.opInbound',      color: 'geekblue' },
  claim:        { key: 'asset.opClaim',        color: 'green' },
  borrow:       { key: 'asset.opBorrow',       color: 'volcano' },
  renew:        { key: 'asset.opRenew',        color: 'magenta' },
  transfer:     { key: 'asset.opTransfer',     color: 'cyan' },
  return:       { key: 'asset.opReturn',       color: 'orange' },
  handover:     { key: 'asset.opHandover',     color: 'blue' },
  repair:       { key: 'asset.opRepair',       color: 'gold' },
  repair_done:  { key: 'asset.opRepairDone',   color: 'lime' },
  compensation: { key: 'asset.opCompensation', color: 'red' },
  scrap:        { key: 'asset.opScrap',        color: 'red' },
  inventory:    { key: 'asset.opInventory',    color: 'purple' },
}

/** 變更歷史頁操作類型過濾選項（按業務流轉順序排列） */
export const OP_TYPE_LIST: AssetOpType[] = [
  'create', 'inbound', 'claim', 'borrow', 'renew', 'transfer',
  'return', 'handover', 'repair', 'repair_done', 'compensation', 'scrap', 'inventory',
]
