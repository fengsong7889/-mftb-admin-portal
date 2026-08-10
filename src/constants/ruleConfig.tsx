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
} from '@ant-design/icons'
import type { ReactNode } from 'react'

/* ==================== 類型定義 ==================== */

export type RuleValueType = 'switch' | 'number' | 'select' | 'text'

export interface RuleItem {
  /** 唯一標識 */
  key: string
  /** 顯示名稱 */
  label: string
  /** 規則說明 */
  description: string
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
]

/** localStorage 存儲 key */
export const SYSTEM_RULE_STORAGE_KEY = 'system_rule_config'

/** 舊版支付規則存儲 key（向後兼容） */
export const LEGACY_PAYMENT_RULE_KEY = 'payment_rule_config'
