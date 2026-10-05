import { InputNumber } from 'antd'
import { amountToChinese } from './shared'

/**
 * MOP 金額輸入組件（含中文大寫自動轉換）
 *
 * 提取自 DeductAdd / TransferAdd / RechargeAdd 中重複的 InputNumber + amountToChinese 模式。
 */
export interface MOPAmountInputProps {
  value: number
  onChange: (v: number) => void
  placeholder?: string
  min?: number
  max?: number
  precision?: number
  width?: string | number
  /** 是否在金額下方顯示中文大寫（默認 true） */
  showChinese?: boolean
  /** 中文大寫顏色 */
  chineseColor?: string
  /** 自定義 label 下方的 marginBottom 調整 */
  labelMarginBottom?: number
}

export default function MOPAmountInput({
  value,
  onChange,
  placeholder = '請輸入金額',
  min = 0,
  max,
  precision = 2,
  width = '100%',
  showChinese = true,
  chineseColor = '#E8720C',
}: MOPAmountInputProps) {
  return (
    <div>
      <InputNumber
        placeholder={placeholder}
        min={min}
        max={max}
        precision={precision}
        value={value || undefined}
        onChange={(v) => onChange(v || 0)}
        style={{ width }}
        addonAfter="MOP"
        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        parser={(v) => Number(v?.replace(/,/g, '') || 0)}
      />
      {showChinese && value > 0 && (
        <div style={{ fontSize: 12, color: chineseColor, fontWeight: 500, marginTop: 4 }}>
          {amountToChinese(value)}
        </div>
      )}
    </div>
  )
}
