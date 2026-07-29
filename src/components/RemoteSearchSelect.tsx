import { useCallback, useMemo, useRef, useState } from 'react'
import { Select, Spin } from 'antd'
import type { OptionItem } from '../api/types'

interface RemoteSearchSelectProps {
  /** 受控值（由 Form.Item 注入） */
  value?: string
  onChange?: (value?: string) => void
  placeholder?: string
  /** 远程搜索：空关键字时返回默认选项 */
  fetchOptions: (keyword: string) => Promise<OptionItem[]>
  /** 初始回显选项（页面跳转带入的已选值） */
  initialOptions?: OptionItem[]
  /** 搜索防抖间隔，默认 300ms */
  debounceMs?: number
}

/**
 * 远程搜索下拉框：输入关键字向后端匹配选项后选择，用于集团ID/名称、门店ID/名称、最后更新人等查询条件
 */
export default function RemoteSearchSelect({
  value,
  onChange,
  placeholder,
  fetchOptions,
  initialOptions,
  debounceMs = 300,
}: RemoteSearchSelectProps) {
  const [options, setOptions] = useState<OptionItem[]>(initialOptions ?? [])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<number>()
  // 请求序号：丢弃过期响应，避免快速输入时结果错乱
  const requestSeqRef = useRef(0)
  const loadedRef = useRef(false)

  const requestOptions = useCallback(async (keyword: string) => {
    const seq = ++requestSeqRef.current
    setLoading(true)
    try {
      const list = await fetchOptions(keyword)
      if (seq === requestSeqRef.current) {
        setOptions(list || [])
      }
    } catch {
      if (seq === requestSeqRef.current) {
        setOptions([])
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [fetchOptions])

  const handleSearch = (keyword: string) => {
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      loadedRef.current = true
      requestOptions(keyword)
    }, debounceMs)
  }

  /** 首次展开下拉时加载默认选项 */
  const handleOpenChange = (open: boolean) => {
    if (open && !loadedRef.current) {
      loadedRef.current = true
      requestOptions('')
    }
  }

  // 已选值不在当前选项内时补一条，保证回显
  const mergedOptions = useMemo(() => {
    if (!value || options.some(item => item.value === value)) {
      return options
    }
    const preset = initialOptions?.find(item => item.value === value)
    return [preset ?? { value, label: value }, ...options]
  }, [value, options, initialOptions])

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      showSearch
      allowClear
      filterOption={false}
      options={mergedOptions}
      loading={loading}
      onSearch={handleSearch}
      onOpenChange={handleOpenChange}
      notFoundContent={loading ? <Spin size="small" /> : undefined}
    />
  )
}
