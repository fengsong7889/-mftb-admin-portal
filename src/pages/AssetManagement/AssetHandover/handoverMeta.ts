/**
 * 交接模塊共享常量（列表 / 詳情頁復用）
 */
import type { HandoverRecord } from '../../../api/eam'

export type HandoverReason = HandoverRecord['reason']

/** 交接原因 → i18n key / Tag 顏色 */
export const REASON_META: Record<HandoverReason, { key: string; color: string }> = {
  resign:   { key: 'asset.reasonResign',   color: 'error' },
  transfer: { key: 'asset.reasonTransfer', color: 'processing' },
  other:    { key: 'asset.reasonOther',    color: 'default' },
}
