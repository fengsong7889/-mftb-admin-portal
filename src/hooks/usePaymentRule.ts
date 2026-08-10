import { useState, useEffect } from 'react'
import { getSystemRuleValue } from './useSystemRules'

/** 支付規則配置項（向後兼容接口） */
export interface PaymentRuleConfig {
  key: string
  mixedPayment: boolean
}

/** 廣告類型 → 規則 key 映射 */
const AD_TYPE_TO_RULE_KEY: Record<string, string> = {
  revival: 'revival_mixed_payment',
  popular_merchant: 'popular_merchant_mixed_payment',
}

/** 獲取指定廣告類型的支付規則（是否支持混合支付） */
export function usePaymentRule(adType: string) {
  const ruleKey = AD_TYPE_TO_RULE_KEY[adType]
  const [mixedPayment, setMixedPayment] = useState(true)

  useEffect(() => {
    if (ruleKey) {
      const val = getSystemRuleValue<boolean>(ruleKey)
      setMixedPayment(val ?? true)
    }
  }, [adType, ruleKey])

  return { mixedPayment }
}

/** 獲取指定廣告類型的支付規則（同步版本） */
export function getPaymentRule(adType: string): { mixedPayment: boolean } {
  const ruleKey = AD_TYPE_TO_RULE_KEY[adType]
  if (ruleKey) {
    const val = getSystemRuleValue<boolean>(ruleKey)
    return { mixedPayment: val ?? true }
  }
  return { mixedPayment: true }
}
