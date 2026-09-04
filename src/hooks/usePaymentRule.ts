import { useState, useEffect } from 'react'
import { getSystemRuleValue } from './useSystemRules'
import { getSystemConfig, updateSystemConfig } from '../api/systemConfig'

/** 支付方式模式（4 種互斥） */
export type PaymentMode = 'promo_only' | 'gift_only' | 'mixed' | 'switchable'

/** 支持獨立配置支付方式的廣告類型 */
export const PAYMENT_AD_TYPES = ['revival', 'popular_merchant', 'golden_signboard', 'traffic_ad'] as const

/** 校驗是否為合法支付模式 */
export function isValidPaymentMode(v: unknown): v is PaymentMode {
  return v === 'promo_only' || v === 'gift_only' || v === 'mixed' || v === 'switchable'
}

/** 從 4 個互斥布爾開關推導支付模式（規則配置編輯器本地表示） */
export function derivePaymentMode(b: { promoOnly?: unknown; giftOnly?: unknown; switchable?: unknown }): PaymentMode {
  if (b.promoOnly === true) return 'promo_only'
  if (b.giftOnly === true) return 'gift_only'
  if (b.switchable === true) return 'switchable'
  return 'mixed'
}

/** 從本地規則配置（localStorage）讀取指定廣告類型的支付模式（同步、降級用） */
export function getPaymentMode(adType?: string): PaymentMode {
  const t = adType || 'revival'
  return derivePaymentMode({
    promoOnly: getSystemRuleValue<boolean>(`payment_${t}_promo_only`),
    giftOnly: getSystemRuleValue<boolean>(`payment_${t}_gift_only`),
    switchable: getSystemRuleValue<boolean>(`payment_${t}_switchable`),
  })
}

/** 將指定廣告類型的支付模式同步到後端 sys_config */
export function syncPaymentModeToBackend(adType: string, mode: PaymentMode): Promise<void> {
  return updateSystemConfig(`payment_mode_${adType}`, mode)
}

/** 從後端讀取指定廣告類型的支付模式（失敗時回退本地） */
export async function fetchPaymentMode(adType?: string): Promise<PaymentMode> {
  const t = adType || 'revival'
  try {
    const res = await getSystemConfig(`payment_mode_${t}`)
    if (res && isValidPaymentMode(res.value)) return res.value
  } catch { /* 後端不可用 → 回退本地 */ }
  return getPaymentMode(t)
}

/** 支付規則 Hook（按廣告類型獨立配置；後端優先、本地降級） */
export function usePaymentRule(adType?: string) {
  const [mode, setMode] = useState<PaymentMode>(() => getPaymentMode(adType))

  useEffect(() => {
    let alive = true
    setMode(getPaymentMode(adType))
    fetchPaymentMode(adType).then(m => { if (alive) setMode(m) })
    return () => { alive = false }
  }, [adType])

  return {
    /** 當前支付模式 */
    mode,
    /** 是否混合支付（兩個模塊都展示） */
    mixedPayment: mode === 'mixed',
    /** 是否可切換（用戶自選一種） */
    switchable: mode === 'switchable',
  }
}

/** 獲取支付模式（同步版本，僅讀本地） */
export function getPaymentRule(adType?: string): { mixedPayment: boolean; mode: PaymentMode } {
  const mode = getPaymentMode(adType)
  return { mixedPayment: mode === 'mixed', mode }
}
