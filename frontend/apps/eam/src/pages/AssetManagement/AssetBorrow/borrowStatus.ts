/**
 * 借用状态文案与颜色（借用列表 / 借用详情 / 我的资产 共用，避免多处口径漂移）
 */
export const BORROW_STATUS_LABEL: Record<string, string> = {
  active: '借用中',
  overdue: '已逾期',
  returned: '已归还',
  cancelled: '已取消',
  loss_closed: '異常終止·遺失',
  scrap_closed: '異常終止·報廢',
  repair_closed: '異常終止·送修',
}

/** antd Tag 颜色 */
export const BORROW_STATUS_COLOR: Record<string, string> = {
  active: 'processing',
  overdue: 'error',
  returned: 'success',
  cancelled: 'default',
  loss_closed: 'warning',
  scrap_closed: 'error',
  repair_closed: 'processing',
}
