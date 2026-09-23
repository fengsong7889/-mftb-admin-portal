/**
 * 梯度折扣編輯器（復用組件）
 *
 * 用於人氣商家定價頁的「購買多天折扣配置」卡片。
 * 支持共享模式（一組梯度）和獨立模式（小圖/大圖各一組）。
 *
 * 數值語義：
 *  - DiscountTierRow.discount 統一存儲後端百分比（如 80 = 8折）
 *  - 組件輸入框顯示「折」（0.1–9.9），在渲染和回調時做 ÷10 / ×10 轉換
 *  - 父組件無需關心轉換邏輯，直接存取後端百分比值
 */
import { Button, InputNumber } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

/** 梯度行；discount 為後端百分比（如 80 = 8折） */
export interface DiscountTierRow {
  days: number | undefined
  /** 後端百分比：80 = 8折、95 = 9.5折 */
  discount: number | undefined
}

interface Props {
  value: DiscountTierRow[]
  onChange: (next: DiscountTierRow[]) => void
  disabled?: boolean
  /** 組標題（如「小圖」「大圖」） */
  groupLabel?: string
  color?: string
  bgColor?: string
  borderColor?: string
}

/** 後端百分比 → UI 折值（80 → 8） */
const pctToZhe = (pct: number | undefined): number | undefined =>
  pct != null && pct > 0 ? Math.round((pct / 10) * 100) / 100 : undefined

/** UI 折值 → 後端百分比（8 → 80） */
const zheToPct = (zhe: number | undefined): number | undefined =>
  zhe != null && zhe > 0 ? Math.round(zhe * 10 * 100) / 100 : undefined

export default function DiscountTierEditor({
  value, onChange, disabled, groupLabel,
  color = '#722ED1', bgColor = '#F9F0FF', borderColor = '#D3ADF7',
}: Props) {
  const { t } = useTranslation()

  const handleAdd = () => onChange([...value, { days: undefined, discount: undefined }])
  const handleRemove = (idx: number) => onChange(value.filter((_, i) => i !== idx))

  const handleUpdate = (idx: number, field: keyof DiscountTierRow, raw: number | null) => {
    onChange(value.map((row, i) => {
      if (i !== idx) return row
      if (field === 'discount') {
        // 用戶輸入折值 → 轉為後端百分比存儲
        return { ...row, discount: zheToPct(raw ?? undefined) }
      }
      return { ...row, [field]: raw ?? undefined }
    }))
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color, background: bgColor,
    border: `1px solid ${borderColor}`, borderRadius: 4, padding: '1px 8px', flexShrink: 0,
  }

  return (
    <div>
      {value.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c', fontSize: 13 }}>
          {t('recommend.popularSkin.noGradientConfig')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {value.map((row, idx) => {
            // 後端百分比 → 折值顯示
            const uiDiscount = pctToZhe(row.discount)
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                <span style={labelStyle}>
                  {groupLabel && value.length > 1
                    ? `${groupLabel} ${idx + 1}`
                    : t('recommend.popularSkin.gradientN', { index: idx + 1 })}
                </span>
                <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.popularSkin.purchaseDaysGe')}</span>
                <InputNumber
                  min={1} max={9999} precision={0} style={{ width: 110 }}
                  value={row.days ?? undefined} disabled={disabled}
                  onChange={v => handleUpdate(idx, 'days', v)}
                />
                <span style={{ fontSize: 13, color: '#595959' }}>{t('recommend.popularSkin.correspondingDiscount')}</span>
                <InputNumber
                  min={0.1} max={9.9} precision={1} style={{ width: 120 }}
                  addonAfter={t('recommend.zheUnit')}
                  value={uiDiscount ?? undefined} disabled={disabled}
                  onChange={v => handleUpdate(idx, 'discount', v)}
                />
                {!disabled && (
                  <Button type="link" danger size="small" icon={<DeleteOutlined />} style={{ marginLeft: 'auto' }}
                    onClick={() => handleRemove(idx)}>{t('recommend.popularSkin.skinDelete')}</Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!disabled && (
        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd}
          style={{ width: '100%', marginTop: 12, borderRadius: 6, borderColor: '#d9d9d9', color: '#595959' }}>
          {t('recommend.popularSkin.addGradient')}
        </Button>
      )}
    </div>
  )
}

/** 校驗一組梯度是否完整（無空行），返回第一個有問題的索引，-1 表示全部完整 */
export function validateTiers(tiers: DiscountTierRow[]): number {
  for (let i = 0; i < tiers.length; i++) {
    if (!tiers[i].days || !tiers[i].discount) return i
  }
  return -1
}

/** 將已填好的梯度轉為後端請求格式（過濾空行 + 按天數升序） */
export function tiersToBackend(tiers: DiscountTierRow[]): { minDays: number; discount: number }[] {
  return tiers
    .filter(r => r.days && r.discount)
    .map(r => ({ minDays: r.days!, discount: r.discount! }))
    .sort((a, b) => a.minDays - b.minDays)
}

/** 從後端響應格式轉為組件狀態 */
export function tiersFromBackend(backend: { minDays?: number; days?: number; discount: number }[]): DiscountTierRow[] {
  return backend.map(r => ({
    days: (r.minDays ?? r.days) || undefined,
    discount: r.discount || undefined,
  }))
}
