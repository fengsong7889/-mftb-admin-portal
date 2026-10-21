import { Segmented, Select } from 'antd'
import type { CSSProperties } from 'react'
import { AI_SCOPE_OPTIONS, type AiScope } from '../constants/aiScope'

/**
 * AI 配置页统一的「作用域切换器」：共用 / 各业务系统（可选全部）。
 *
 * <p>放在每个配置列表顶部，让「共用配置」与「某系统专属配置」分开维护；
 * 数据量增长后不再靠搜索框猜测归属。系统较少时用 Segmented，超过 5 项自动换 Select。
 */
export default function AiScopeSwitch({
  value,
  onChange,
  includeAll = false,
  extraOptions = [],
  style,
}: {
  value: AiScope
  onChange: (value: AiScope) => void
  /** 是否提供「全部」视图（管理员审计用） */
  includeAll?: boolean
  /** 数据里出现、但常量表还没登记的系统 */
  extraOptions?: Array<{ value: string; label: string }>
  style?: CSSProperties
}) {
  const merged = [...AI_SCOPE_OPTIONS]
  for (const extra of extraOptions) {
    if (!merged.some((o) => o.value === extra.value)) merged.push(extra as (typeof merged)[number])
  }
  const options = includeAll
    ? [{ value: 'all', label: '全部' }, ...merged]
    : merged

  if (options.length <= 5) {
    return (
      <Segmented
        options={options as Array<{ value: string; label: string }>}
        value={value}
        onChange={(next) => onChange(String(next))}
        aria-label="作用域：共用或指定業務系統"
        style={style}
      />
    )
  }
  return (
    <Select
      options={options as Array<{ value: string; label: string }>}
      value={value}
      onChange={onChange}
      aria-label="作用域：共用或指定業務系統"
      title="作用域：共用或指定業務系統"
      style={{ minWidth: 160, ...style }}
    />
  )
}
