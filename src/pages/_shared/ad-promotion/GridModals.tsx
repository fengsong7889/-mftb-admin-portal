/**
 * 广告销售 / 推广销售配置 — 共享弹窗组件
 * 包含：冲突确认弹窗、支付成功弹窗、售罄提醒弹窗、预售日期提醒弹窗
 */
import { Modal, Tag, Button, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import type { PresaleInfo } from './DateStrip'
import { PRESALE_OPEN_HOUR } from './gridConstants'

// ─── 冲突确认弹窗 ──────────────────────────────────────────────────────────────

interface ConflictModalProps {
  visible: boolean
  onConfirm: () => void
  onCancel: () => void
  /** 使用 dtgSwitchWarnLine2 文案（PromotionSalesConfig）vs switchWarnLine2（AdSales） */
  variant?: 'default' | 'dtg'
}

export function ConflictModal({ visible, onConfirm, onCancel, variant = 'default' }: ConflictModalProps) {
  const { t } = useTranslation('adSales')
  const warnLine2Key = variant === 'dtg' ? 'dtgSwitchWarnLine2' : 'switchWarnLine2'

  return (
    <Modal
      title={t('switchConfirmTitle')}
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      okText={t('switchConfirmOk')}
      cancelText={t('common:cancel')}
      okButtonProps={{ danger: true }}
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ marginBottom: 12, fontSize: 14, color: '#262626' }}>
          {t('switchWarnLine1')}
        </p>
        <p style={{ marginBottom: 0, fontSize: 13, color: '#595959' }}>
          {t(warnLine2Key)}
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#595959' }}>
          <li>{t('switchOption1')}</li>
          <li>{t('switchOption2')}</li>
        </ul>
      </div>
    </Modal>
  )
}

// ─── 支付成功弹窗 ──────────────────────────────────────────────────────────────

interface SuccessModalProps {
  visible: boolean
  onClose: () => void
  onViewOrder: () => void
  onContinuePurchase: () => void
  /** 实际支付金额（AdSales 从接口取，Promotion 固定展示） */
  paidAmount: number | string
}

export function SuccessModal({ visible, onClose, onViewOrder, onContinuePurchase, paidAmount }: SuccessModalProps) {
  const { t } = useTranslation('adSales')
  return (
    <Modal
      title={t('purchaseSuccess')}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="view" type="primary" onClick={onViewOrder}>
          {t('viewOrder')}
        </Button>,
        <Button key="continue" onClick={onContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>
          {t('continueBuy')}
        </Button>,
      ]}
      width={400}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>
          {t('successMessage')}
        </p>
        <div style={{
          background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)',
          padding: '20px 16px',
          borderRadius: 8,
          marginBottom: 16,
        }}>
          <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
            {t('deductedPromo')}
          </p>
          <p style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#fa541c',
            margin: 0,
            lineHeight: 1.2,
          }}>
            {paidAmount ? `$${paidAmount}` : '--'}
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ─── 售罄提醒弹窗 ──────────────────────────────────────────────────────────────

interface SoldOutModalProps {
  visible: boolean
  onClose: () => void
  details: Array<{ date: string; regionName: string; mealSlot: string }>
  lockDurationSeconds: number
}

export function SoldOutModal({ visible, onClose, details, lockDurationSeconds }: SoldOutModalProps) {
  const { t } = useTranslation('adSales')
  return (
    <Modal
      title={
        <Space>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{t('partialSoldOut')}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="ok" type="primary" onClick={onClose} style={{ background: '#fa8c16', borderColor: '#fa8c16', minWidth: 100 }}>
          {t('gotIt')}
        </Button>,
      ]}
      width={460}
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontSize: 14, color: '#262626', marginBottom: 12, lineHeight: 1.6 }}>
          {t('soldOutExplain')}
        </p>
        <div style={{
          background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, maxHeight: 200, overflowY: 'auto',
        }}>
          {details.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0',
              borderBottom: idx < details.length - 1 ? '1px dashed #ffccc7' : 'none',
            }}>
              <span style={{ fontSize: 13, color: '#ff4d4f' }}>✕</span>
              <span style={{ fontSize: 13, color: '#595959' }}>
                <span style={{ fontWeight: 600, color: '#262626' }}>{item.date}</span>
                {' · '}
                <span style={{ color: '#722ed1' }}>{item.regionName}</span>
                {' · '}
                <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>{item.mealSlot}</Tag>
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#ff4d4f', margin: 0, fontWeight: 500 }}>
          {t('lockExpiryWarning', {
            count: lockDurationSeconds >= 60 ? lockDurationSeconds / 60 : lockDurationSeconds,
            unit: lockDurationSeconds >= 60 ? '分鐘' : '秒',
          })}
        </p>
      </div>
    </Modal>
  )
}

// ─── 预售日期提醒弹窗 ──────────────────────────────────────────────────────────

interface PresaleInfoModalProps {
  info: PresaleInfo | null
  onClose: () => void
}

export function PresaleInfoModal({ info, onClose }: PresaleInfoModalProps) {
  const { t } = useTranslation('adSales')
  return (
    <Modal
      title={
        <Space>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ color: '#1890ff', fontWeight: 600 }}>{t('notYetOnSale')}</span>
        </Space>
      }
      open={!!info}
      onCancel={onClose}
      footer={[
        <Button key="ok" type="primary" onClick={onClose} style={{ minWidth: 100 }}>
          {t('gotIt')}
        </Button>,
      ]}
      width={420}
    >
      {info && (
        <div style={{ padding: '8px 0' }}>
          <div style={{
            background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8,
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('saleTimeLabel')}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{info.openTime}</span>
          </div>
          <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12, marginBottom: 0 }}>
            {t('dailyReleaseHint', { hour: PRESALE_OPEN_HOUR })}
          </p>
        </div>
      )}
    </Modal>
  )
}
