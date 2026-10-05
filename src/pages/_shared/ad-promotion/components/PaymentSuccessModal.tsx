/**
 * 支付成功弹窗 — AdSales 与 PromotionSalesConfig 共用
 */
import { Modal, Button } from 'antd'
import { useTranslation } from 'react-i18next'

interface PaymentSuccessModalProps {
  visible: boolean
  onCancel: () => void
  onViewOrder: () => void
  onContinuePurchase: () => void
  paidAmount: number
  /** AdSales 独有：赠送天数（混合支付时展示） */
  paidGiftDays?: number
  /** AdSales 独有：支付模式（mixed/promo/gift） */
  paidPaymentMode?: 'promo' | 'gift' | 'mixed'
}

export default function PaymentSuccessModal({
  visible,
  onCancel,
  onViewOrder,
  onContinuePurchase,
  paidAmount,
  paidGiftDays = 0,
  paidPaymentMode = 'promo',
}: PaymentSuccessModalProps) {
  const { t } = useTranslation('adSales')

  return (
    <Modal
      title={t('purchaseSuccess')}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="view" type="primary" onClick={onViewOrder}>{t('viewOrder')}</Button>,
        <Button key="continue" onClick={onContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>{t('continueBuy')}</Button>,
      ]}
      width={400}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>{t('successMessage')}</p>
        <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8, marginBottom: 16 }}>
          {/* 混合支付：同時展示推廣金花費和贈送天數 */}
          {paidPaymentMode === 'mixed' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
              <div>
                <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('deductedPromo')}</p>
                <p style={{ fontSize: 30, fontWeight: 700, color: '#E8720C', margin: 0, lineHeight: 1.2 }}>${paidAmount}</p>
              </div>
              {paidGiftDays > 0 && (
                <div>
                  <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('usedGiftPromoDays')}</p>
                  <p style={{ fontSize: 30, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{paidGiftDays} {t('dayUnitCount')}</p>
                </div>
              )}
            </div>
          )}
          {/* 僅推廣金支付 */}
          {paidPaymentMode === 'promo' && (
            <>
              <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('deductedPromoFull')}</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${paidAmount}</p>
            </>
          )}
          {/* 僅贈送天數抵扣 */}
          {paidPaymentMode === 'gift' && (
            <>
              <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('usedGiftPromoDays')}</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{paidGiftDays} {t('dayUnitCount')}</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
