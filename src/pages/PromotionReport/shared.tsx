/**
 * PromotionReport 共用組件
 * 在 Compare / OrderReport / Overview 之間共用篩選表單元素
 */
import { Select } from 'antd'
import { useTranslation } from 'react-i18next'

interface ReportFilterSelectProps {
  label: string
  value: any
  onChange: any
  labelMap: Record<string, string>
  labelFn?: (v: any) => string
  mode?: 'multiple'
  wrapperStyle?: React.CSSProperties
}

export function ReportFilterSelect({
  label, value, onChange, labelMap, labelFn, mode, wrapperStyle,
}: ReportFilterSelectProps) {
  const { t } = useTranslation()
  return (
    <div style={{ flex: '0 0 calc(25% - 9px)', ...wrapperStyle }}>
      <label style={{ display: 'block', marginBottom: 4, color: '#666' }}>{label}</label>
      <Select
        placeholder={t('common.all')}
        allowClear
        value={value}
        onChange={onChange}
        mode={mode}
        options={Object.entries(labelMap).map(([value]) => ({
          value: Number(value),
          label: labelFn ? labelFn(Number(value)) : Object.values(labelMap)[Number(value)],
        }))}
      />
    </div>
  )
}
