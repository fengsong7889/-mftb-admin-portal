import type { FlashSaleTier } from '../api/flashSale'

/**
 * 秒杀价阶梯展示单元格（登记/统计共用）
 * 样式: 階梯N：MOP 價格 / 庫存 N（/ 補貼 N）
 */
export default function FlashSaleTierCell({ tiers, showSubsidy = false }: {
  tiers: FlashSaleTier[]
  /** 是否展示阶梯补贴（登记场景展示，统计场景补贴可为空） */
  showSubsidy?: boolean
}) {
  if (!tiers || tiers.length === 0) return <span style={{ color: '#BFBFBF' }}>-</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {tiers.map((tier, idx) => (
        <span key={idx} style={{ fontSize: 12, lineHeight: '20px' }}>
          {tiers.length > 1 && (
            <span style={{ color: '#8C8C8C' }}>階梯{idx + 1}：</span>
          )}
          <span style={{ color: '#E8720C', fontWeight: 600 }}>MOP {Number(tier.tierPrice).toFixed(2)}</span>
          <span style={{ color: '#8C8C8C' }}> / 庫存 {tier.tierStock}</span>
          {showSubsidy && tier.tierSubsidy !== null && tier.tierSubsidy !== undefined && (
            <span style={{ color: '#52C41A' }}> / 補貼 {Number(tier.tierSubsidy).toFixed(2)}</span>
          )}
        </span>
      ))}
    </div>
  )
}
