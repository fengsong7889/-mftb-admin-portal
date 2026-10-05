/**
 * PaymentDetailContent — DayPicker 支付確認彈窗內容（3種模式共用）
 *
 * 提取 promo / gift / mixed 三種支付模式共享的購買明細表格 + 摘要區塊
 */
import { useTranslation } from 'react-i18next'
import type { CartItem, DayTier } from '../_shared/ad-promotion/dayPickerConstants'

interface PaymentDetailContentProps {
  cartItems: CartItem[]
  totalOriginal: number
  currentDiscount: DayTier | null | undefined
  totalDiscount: number
  /** promo 模式：顯示應付總金額 */
  payableAmount?: number
  /** gift/mixed 模式：顯示贈送天數抵扣 + 有效天數 */
  giftDeduction?: number
  effectiveGiftDays?: number
}

export default function PaymentDetailContent({
  cartItems, totalOriginal, currentDiscount, totalDiscount,
  payableAmount, giftDeduction, effectiveGiftDays,
}: PaymentDetailContentProps) {
  const { t } = useTranslation()
  const showDaysMode = giftDeduction !== undefined

  return (
    <>
      <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
        <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>{t('purchaseDetail')}</h4>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#fafafa' }}>
            <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>{t('purchaseDateCol')}</th>
            <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>{t('salePriceCol')}</th>
          </tr></thead>
          <tbody>{cartItems.flatMap(item =>
            item.dates.map(date => (
              <tr key={`${item.key}-${date}`}>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{date}</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>
                  ${Math.round(item.originalPrice * (item.discount > 10 ? item.discount : item.discount * 10) / 100 / item.dates.length)}
                </td>
              </tr>
            ))
          )}</tbody>
        </table>
      </div>
      <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#595959' }}>{t('orderOriginal')}：</span>
          <span style={{ fontWeight: 600 }}>${totalOriginal}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#595959' }}>{showDaysMode ? '享受折扣：' : '享受折扣：'}</span>
          {currentDiscount ? (
            <span style={{ fontWeight: 600, color: '#52C41A' }}>{currentDiscount.discount > 10 ? currentDiscount.discount / 10 : currentDiscount.discount}折</span>
          ) : (
            <span style={{ color: '#BFBFBF' }}>{t('noDiscount')}</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
          <span>{t('orderDiscount')}：</span>
          <span style={{ fontWeight: 600 }}>-{totalDiscount}</span>
        </div>
        {showDaysMode && giftDeduction! > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
            <span>赠送天數抵扣：</span>
            <span style={{ fontWeight: 600 }}>-{giftDeduction}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
          {showDaysMode ? (
            <>
              <span style={{ fontWeight: 600 }}>抵扣天數：</span>
              <span style={{ fontWeight: 700 }}>{effectiveGiftDays}天</span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>{t('totalPayable')}：</span>
              <span style={{ fontWeight: 700 }}>${payableAmount}</span>
            </>
          )}
        </div>
      </div>
    </>
  )
}
