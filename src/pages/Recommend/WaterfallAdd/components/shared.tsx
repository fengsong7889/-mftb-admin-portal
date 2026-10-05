/**
 * WaterfallAdd 定價頁面共享工具 —— GoldenSignboardPricing 與 PopularSkinPricing 的公共邏輯
 */

/** 生成 SVG dataURL */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** 退費比例規則 */
export interface CancelFeeRule {
  id: number
  maxDays: number
  feePercent: number
}

/** 卡片外殼統一樣式 */
export const cardShellStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 卡片標題（圖標色塊 + 標題 + 分隔線 + 可選操作區） */
export const cardTitle = (
  icon: React.ReactNode,
  iconBg: string,
  title: string,
  extra?: React.ReactNode,
  action?: React.ReactNode,
) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
    {extra}
    <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    {action}
  </div>
)
