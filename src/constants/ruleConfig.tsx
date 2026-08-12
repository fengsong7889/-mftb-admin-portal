/**
 * 通用系統規則配置定義
 *
 * 所有業務規則集中在此定義，UI 從配置自動渲染。
 * 新增/修改規則只需改動本文件，無需改動頁面組件。
 */
import {
  ShoppingCartOutlined,
  GiftOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

/* ==================== 類型定義 ==================== */

export type RuleValueType = 'switch' | 'number' | 'select' | 'text' | 'table'

export interface RuleItem {
  /** 唯一標識 */
  key: string
  /** 顯示名稱 */
  label: string
  /** 規則說明 */
  description?: string
  /** 控件類型 */
  type: RuleValueType
  /** 當前值（運行時由 Hook 注入） */
  value: unknown
  /** 默認值 */
  defaultValue: unknown
  /** 單位（如「天」「元」「次」） */
  unit?: string
  /** number 類型最小值 */
  min?: number
  /** number 類型最大值 */
  max?: number
  /** select 類型選項 */
  options?: { label: string; value: string | number }[]
  /** 子分組（用於在分組內再按維度歸類，如廣告類型） */
  subGroup?: string
  /** 備註（用於 table 類型的補充說明） */
  remark?: string
  /** 日期格式（用於 table 類型的編號規則：'YYYYMMDD' | 'YYMM' | ''） */
  dateFormat?: string
  /** 觸發菜單（用於 table 類型的編號規則，展示該業務在哪個菜單觸發） */
  menu?: string
}

export interface RuleGroup {
  /** 分組標識 */
  key: string
  /** 分組標題 */
  title: string
  /** 分組圖標 */
  icon: ReactNode
  /** 主題色 */
  color: string
  /** 分組說明 */
  description: string
  /** 規則列表 */
  rules: RuleItem[]
  /** 渲染類型（默認逐行渲染，table 為表格展示） */
  type?: RuleValueType
}

/* ==================== 默認規則定義 ==================== */

/** 廣告銷售規則 */
const AD_SALES_RULES: RuleItem[] = [
  {
    key: 'revival_mixed_payment',
    label: '盤活復蘇混合支付',
    description: '推廣金與贈送天數是否可混合使用',
    type: 'switch',
    value: true,
    defaultValue: true,
  },
  {
    key: 'popular_merchant_mixed_payment',
    label: '人氣商家混合支付',
    description: '推廣金與贈送天數是否可混合使用',
    type: 'switch',
    value: true,
    defaultValue: true,
  },
  {
    key: 'ad_click_cart_lock_seconds',
    label: '廣告點擊加購鎖定時長',
    description: '廣告銷售所有廣告點擊加購後鎖定的秒數，鎖定期間內不可重複加購',
    type: 'number',
    value: 60,
    defaultValue: 60,
    unit: '秒',
    min: 1,
    max: 3600,
  },
]

/** 贈送管理規則（按廣告類型獨立配置） */
const GIFT_MANAGEMENT_RULES: RuleItem[] = [
  /* ── 新店廣告 ── */
  {
    key: 'gift_limit_new_store',
    label: '贈送上限',
    description: '新店廣告每日最多贈送次數，0 = 不限',
    type: 'number',
    value: 10,
    defaultValue: 10,
    unit: '次',
    min: 0,
    max: 999,
    subGroup: 'new_store',
  },
  {
    key: 'gift_approval_new_store',
    label: '是否需要審批',
    description: '新店廣告贈送是否需上級審批後生效',
    type: 'switch',
    value: true,
    defaultValue: true,
    subGroup: 'new_store',
  },
  /* ── 盤活復蘇 ── */
  {
    key: 'gift_limit_revival',
    label: '贈送上限',
    description: '盤活復蘇每日最多贈送次數，0 = 不限',
    type: 'number',
    value: 10,
    defaultValue: 10,
    unit: '次',
    min: 0,
    max: 999,
    subGroup: 'revival',
  },
  {
    key: 'gift_approval_revival',
    label: '是否需要審批',
    description: '盤活復蘇贈送是否需上級審批後生效',
    type: 'switch',
    value: true,
    defaultValue: true,
    subGroup: 'revival',
  },
  /* ── 人氣商家 ── */
  {
    key: 'gift_limit_popular_merchant',
    label: '贈送上限',
    description: '人氣商家每日最多贈送次數，0 = 不限',
    type: 'number',
    value: 10,
    defaultValue: 10,
    unit: '次',
    min: 0,
    max: 999,
    subGroup: 'popular_merchant',
  },
  {
    key: 'gift_approval_popular_merchant',
    label: '是否需要審批',
    description: '人氣商家贈送是否需上級審批後生效',
    type: 'switch',
    value: true,
    defaultValue: true,
    subGroup: 'popular_merchant',
  },
]

/** 財務/審批規則 */
const FINANCE_RULES: RuleItem[] = [
  {
    key: 'approval_threshold',
    label: '審批金額閾值',
    description: '單筆超過此金額需主管審批',
    type: 'number',
    value: 5000,
    defaultValue: 5000,
    unit: '元',
    min: 0,
    max: 9999999,
  },
  {
    key: 'debt_warning_threshold',
    label: '欠款預警線',
    description: '欠款超過此金額觸發系統預警通知',
    type: 'number',
    value: 10000,
    defaultValue: 10000,
    unit: '元',
    min: 0,
    max: 9999999,
  },
  {
    key: 'auto_confirm_days',
    label: '自動確認天數',
    description: '賬單發送後超過此天數自動確認',
    type: 'number',
    value: 7,
    defaultValue: 7,
    unit: '天',
    min: 1,
    max: 90,
  },
]

/** 系統安全規則（管理員配置） */
const SYSTEM_SECURITY_RULES: RuleItem[] = [
  {
    key: 'session_idle_timeout_minutes',
    label: '空閒超時自動退出',
    description: '系統無任何操作超過設定時長後，將自動強制退出登錄',
    type: 'select',
    value: 60,
    defaultValue: 60,
    unit: '分鐘',
    options: [
      { label: '15 分鐘', value: 15 },
      { label: '30 分鐘', value: 30 },
      { label: '1 小時', value: 60 },
      { label: '2 小時', value: 120 },
      { label: '3 小時', value: 180 },
      { label: '6 小時', value: 360 },
      { label: '8 小時', value: 480 },
    ],
  },
]

/* ==================== 分組配置 ==================== */

/** 默認規則分組（含默認值） */
export const DEFAULT_RULE_GROUPS: RuleGroup[] = [
  {
    key: 'ad_sales',
    title: '廣告銷售規則',
    icon: <ShoppingCartOutlined />,
    color: '#E8720C',
    description: '廣告投放與費用結算相關規則',
    rules: AD_SALES_RULES,
  },
  {
    key: 'gift_management',
    title: '贈送管理規則',
    icon: <GiftOutlined />,
    color: '#52C41A',
    description: '推廣贈送按廣告類型獨立配置上限與審批規則',
    rules: GIFT_MANAGEMENT_RULES,
  },
  {
    key: 'finance',
    title: '財務/審批規則',
    icon: <DollarOutlined />,
    color: '#FF4D4F',
    description: '財務審批流程與預警閾值相關規則',
    rules: FINANCE_RULES,
  },
  {
    key: 'system_security',
    title: '系統安全規則',
    icon: <SafetyCertificateOutlined />,
    color: '#722ED1',
    description: '會話安全與空閒超時相關規則（僅管理員可配置）',
    rules: SYSTEM_SECURITY_RULES,
  },
  {
    key: 'id_generation',
    title: '編號生成規則',
    icon: <OrderedListOutlined />,
    color: '#1890FF',
    description: '後端 BizSeqService 統一管理，支持調整前綴與序號規則',
    type: 'table' as RuleValueType,
    rules: [
      /* ── 商戶集團管理（原門店管理） ── */
      { key: 'merchant_group', label: '集團ID', type: 'table', value: 'JT', defaultValue: 'JT', dateFormat: '', min: 6, max: 6, unit: 'JT000001', remark: '{prefix} + {n}位自增序號（取表內最大序號+1）', menu: '商戶集團管理' },
      { key: 'store', label: '門店ID', type: 'table', value: 'MD', defaultValue: 'MD', dateFormat: '', min: 6, max: 6, unit: 'MD000001', remark: '{prefix} + {n}位固定序號（無日期維度，全局自增）', menu: '商戶集團管理' },
      /* ── 算法庫 ── */
      { key: 'algo_star', label: '無敵星星算法ID', type: 'table', value: 'SFWD', defaultValue: 'SFWD', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFWD20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_new_store', label: '新店廣告算法ID', type: 'table', value: 'SFXD', defaultValue: 'SFXD', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFXD20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_revive', label: '盤活復蘇算法ID', type: 'table', value: 'SFPH', defaultValue: 'SFPH', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFPH20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_traffic', label: '流量廣告算法ID', type: 'table', value: 'SFLL', defaultValue: 'SFLL', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFLL20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_popular', label: '人氣商家算法ID', type: 'table', value: 'SFRQ', defaultValue: 'SFRQ', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFRQ20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_exclusive', label: '獨家商家算法ID', type: 'table', value: 'SFDJ', defaultValue: 'SFDJ', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFDJ20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_guess', label: '猜你喜歡算法ID', type: 'table', value: 'SFXH', defaultValue: 'SFXH', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFXH20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_organic', label: '自然流量算法ID', type: 'table', value: 'SFZR', defaultValue: 'SFZR', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFZR20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      { key: 'algo_brand', label: '品牌商家算法ID', type: 'table', value: 'SFPP', defaultValue: 'SFPP', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'SFPP20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '算法庫' },
      /* ── 瀑布流配置 ── */
      { key: 'config_waterfall', label: '瀑布流策略', type: 'table', value: 'PB', defaultValue: 'PB', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'PB20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '瀑布流配置' },
      /* ── 廣告銷售 ── */
      { key: 'ad_order_star', label: '無敵星星訂單', type: 'table', value: 'DDWD', defaultValue: 'DDWD', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'DDWD202608120001', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'ad_order_new_store', label: '新店廣告訂單', type: 'table', value: 'DDXD', defaultValue: 'DDXD', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'DDXD202608120001', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'ad_order_revive', label: '盤活復蘇訂單', type: 'table', value: 'DDPH', defaultValue: 'DDPH', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'DDPH202608120001', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'ad_order_traffic', label: '流量廣告訂單', type: 'table', value: 'DDLL', defaultValue: 'DDLL', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'DDLL202608120001', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'ad_order_popular', label: '人氣商家訂單', type: 'table', value: 'DDRQ', defaultValue: 'DDRQ', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'DDRQ202608120001', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'config_pricing_star', label: '無敵星星定價', type: 'table', value: 'DJWD', defaultValue: 'DJWD', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'DJWD20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'config_pricing_hot', label: '人氣商家定價', type: 'table', value: 'DJRQ', defaultValue: 'DJRQ', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'DJRQ20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      { key: 'config_pricing_revive', label: '盤活復蘇定價', type: 'table', value: 'DJPH', defaultValue: 'DJPH', dateFormat: 'YYYYMMDD', min: 3, max: 3, unit: 'DJPH20260812000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '廣告銷售' },
      /* ── 推廣贈送 ── */
      { key: 'gift_new_store', label: '新店廣告贈送ID', type: 'table', value: 'XDZS', defaultValue: 'XDZS', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'XDZS202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '推廣贈送' },
      { key: 'gift_popular', label: '人氣商家贈送ID', type: 'table', value: 'RQZS', defaultValue: 'RQZS', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'RQZS202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '推廣贈送' },
      { key: 'gift_revive', label: '盤活復蘇贈送ID', type: 'table', value: 'PHZS', defaultValue: 'PHZS', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'PHZS202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '推廣贈送' },
      /* ── 批次查詢 ── */
      { key: 'batch_recharge', label: '充值批次', type: 'table', value: 'CZPC', defaultValue: 'CZPC', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'CZPC202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '批次查詢' },
      { key: 'batch_transfer', label: '轉賬批次', type: 'table', value: 'ZZPC', defaultValue: 'ZZPC', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'ZZPC202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '批次查詢' },
      { key: 'batch_merge', label: '合併批次', type: 'table', value: 'HBPC', defaultValue: 'HBPC', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'HBPC202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '批次查詢' },
      /* ── 明細查詢 ── */
      { key: 'detail', label: '交易明細編號', type: 'table', value: 'MX', defaultValue: 'MX', dateFormat: 'YYYYMMDD', min: 6, max: 6, unit: 'MX20260812000000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '明細查詢' },
      /* ── 欠款對賬 ── */
      { key: 'debt', label: '欠款單編號', type: 'table', value: 'QK', defaultValue: 'QK', dateFormat: 'YYYYMMDD', min: 5, max: 5, unit: 'QK2026081200000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '欠款對賬' },
      /* ── 審批中心 ── */
      { key: 'recharge', label: '充值流程編號', type: 'table', value: 'CZ', defaultValue: 'CZ', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'CZ202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '審批中心' },
      { key: 'deduct', label: '扣款流程編號', type: 'table', value: 'KK', defaultValue: 'KK', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'KK202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '審批中心' },
      { key: 'transfer', label: '轉賬流程編號', type: 'table', value: 'ZZ', defaultValue: 'ZZ', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'ZZ202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '審批中心' },
      { key: 'merge', label: '合併流程編號', type: 'table', value: 'HB', defaultValue: 'HB', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'HB202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '審批中心' },
      { key: 'gift_approval', label: '贈送流程編號', type: 'table', value: 'ZS', defaultValue: 'ZS', dateFormat: 'YYYYMMDD', min: 4, max: 4, unit: 'ZS202608120000', remark: '{prefix} + YYYYMMDD + {n}位自增序號', menu: '審批中心' },
      /* ── 員工管理 ── */
      { key: 'employee_no', label: '工號', type: 'table', value: 'MF', defaultValue: 'MF', dateFormat: '', min: 5, max: 5, unit: 'MF00001', remark: '{prefix} + {n}位自增序號（全局自增）', menu: '員工管理' },
      /* ── 組織管理 ── */
      { key: 'dept_code', label: '部門編碼', type: 'table', value: 'BM', defaultValue: 'BM', dateFormat: '', min: 5, max: 5, unit: 'BM00001', remark: '{prefix} + {n}位自增序號（全局自增）', menu: '組織管理' },
      /* ── 職位管理 ── */
      { key: 'position_id', label: '職位ID', type: 'table', value: 'ZW', defaultValue: 'ZW', dateFormat: '', min: 5, max: 5, unit: 'ZW00001', remark: '{prefix} + {n}位自增序號（全局自增）', menu: '職位管理' },
    ],
  },
]

/** localStorage 存儲 key */
export const SYSTEM_RULE_STORAGE_KEY = 'system_rule_config'

/** 舊版支付規則存儲 key（向後兼容） */
export const LEGACY_PAYMENT_RULE_KEY = 'payment_rule_config'
