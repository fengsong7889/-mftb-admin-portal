/** 統計卡語義配色（設計規範 12.1 色板） */
export const STAT_COLORS = {
  /** 信息/總量 */
  info: { main: '#1890FF', bg: '#E6F7FF' },
  /** 成功/剩餘 */
  success: { main: '#52C41A', bg: '#F6FFED' },
  /** 品牌/已用 */
  brand: { main: '#E8720C', bg: '#FFF7E6' },
  /** 系統/時間 */
  system: { main: '#722ED1', bg: '#F9F0FF' },
  /**
   * 危险/待处理阻断项（§B.7 原色板未含红色，但 §A.1 危险色 #FF4D4F 与
   * §K.4 统计卡红色底 #FFEBEE 均已登记，此处按已登记色值扩展，不引入新色）。
   */
  danger: { main: '#FF4D4F', bg: '#FFEBEE' },
} as const

export type StatColorKey = keyof typeof STAT_COLORS
