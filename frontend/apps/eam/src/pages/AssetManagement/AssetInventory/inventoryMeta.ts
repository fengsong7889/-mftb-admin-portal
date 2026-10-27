/** 盘点枚举的展示元数据（i18n key + Tag 颜色），供三视图共用 */

export const ITEM_STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'asset.invItemPending',
  normal: 'asset.invItemNormal',
  lost: 'asset.invItemLost',
  damaged: 'asset.invItemDamaged',
}
export const ITEM_STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  normal: 'success',
  lost: 'error',
  damaged: 'warning',
}

export const RESULT_LABEL_KEY: Record<string, string> = {
  CONSISTENT: 'asset.invResultConsistent',
  DIFF: 'asset.invResultDiff',
  PENDING: 'asset.invResultPending',
  NA: 'asset.invResultNa',
}
export const RESULT_COLOR: Record<string, string> = {
  CONSISTENT: 'success',
  DIFF: 'error',
  PENDING: 'default',
  NA: 'default',
}

export const HOLDER_TYPE_LABEL_KEY: Record<string, string> = {
  EMPLOYEE: 'asset.invHolderEmployee',
  NONE: 'asset.invHolderNone',
  EXTERNAL: 'asset.invHolderExternal',
  PENDING: 'asset.invHolderPending',
}

export const CHECK_METHOD_LABEL_KEY: Record<string, string> = {
  ONSITE: 'asset.invMethodOnsite',
  HOLDER: 'asset.invMethodHolder',
  DOC: 'asset.invMethodDoc',
}

export const TASK_STATUS_LABEL_KEY: Record<string, string> = {
  in_progress: 'asset.statusInProgress',
  completed: 'asset.statusCompleted',
  partially_completed: 'asset.statusPartiallyCompleted',
  cancelled: 'asset.statusCancelled',
}
export const TASK_STATUS_COLOR: Record<string, string> = {
  in_progress: 'processing',
  completed: 'success',
  partially_completed: 'warning',
  cancelled: 'default',
}

/** 台账状态繁体展示（账面/当前台账对照用） */
export const ASSET_STATUS_LABEL: Record<string, string> = {
  idle: '閒置',
  in_use: '在用',
  in_repair: '維修中',
  pending_inspection: '找回待驗收',
  lost: '已遺失',
  scrapped: '已報廢',
  written_off: '已核銷',
}
