/**
 * 员工选择器（参会人 / 房间管理员共用）。
 *
 * <p>数据源是 HR 域的在职员工分页接口（employmentStatus=active），选项值一律用 sys_user.id：
 * 工号会变（重编）、姓名会重名，只有 ID 能作为服务端归属与鉴定的依据。
 *
 * <p>不做前端"权限过滤"：可见范围与能否被选为参会人由服务端判定，这里只是取数与展示。
 */
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Select, Space, Tag } from 'antd'
import { fetchEmployees } from '../../api/employee'
import { useTranslation } from 'react-i18next'

interface Props {
  value?: number[]
  onChange?: (value: number[]) => void
  placeholder?: string
  /** 排除某些人（组织者本人不该出现在自己的参会人名单里） */
  excludeIds?: number[]
  maxTagCount?: number
  disabled?: boolean
  /**
   * 单选模式：行政代订的「實際使用人」只能是一个人。
   * 边界仍用 number[] 承载（与多选同构，调用方不必写两套取值代码），只在 UI 层收敛成一个。
   */
  single?: boolean
  /**
   * 选中项的人员摘要（id + 姓名）。
   *
   * <p>为什么要有这个回调：行政代订的二次确认框必须写清"挂名给谁"，
   * 而 Select 的 onChange 只有 id；让调用方自己按 id 再查一次姓名，
   * 等于把"同一个人在两处显示成两个名字"的风险再造一遍。
   */
  onPick?: (items: { id: number; name: string }[]) => void
}

interface Loaded { id: number; name: string; empId?: string; department?: string }

interface Option { value: number; label: ReactNode }

export default function EmployeeSelect({
  value, onChange, placeholder = '搜尋姓名或工號', excludeIds = [], maxTagCount = 6, disabled, single, onPick,
}: Props) {
  const [options, setOptions] = useState<Option[]>([])
  const [fetching, setFetching] = useState(false)
  /** 已选中但不在当前搜索结果里的人要留档，否则一次搜索就把之前选的人从选项里挤掉 */
  const pinned = useRef<Map<number, Loaded>>(new Map())

  const search = useCallback(async (keyword: string) => {
    setFetching(true)
    try {
      const res = await fetchEmployees({
        page: 1,
        size: 30,
        keyword: keyword.trim() || undefined,
        employmentStatus: 'active',
      })
      const loaded = (res.records ?? []).map(item => ({
        id: item.id,
        name: item.name || item.username,
        empId: item.empId,
        department: item.department,
      }))
      loaded.forEach(item => pinned.current.set(item.id, item))
      const merged = new Map<number, Loaded>()
      loaded.forEach(item => merged.set(item.id, item))
      ;(value ?? []).forEach(id => {
        const known = pinned.current.get(id)
        if (known) merged.set(id, known)
      })
      setOptions([...merged.values()]
        .filter(item => !excludeIds.includes(item.id))
        .map(item => ({
          value: item.id,
          label: (
            <Space size={4}>
              <span>{item.name}</span>
              {item.empId && <Tag style={{ marginInlineEnd: 0 }}>{item.empId}</Tag>}
              {item.department && <span style={{ color: '#8C8C8C', fontSize: 12 }}>{item.department}</span>}
            </Space>
          ),
        })))
    } catch {
      // 搜索失败不弹错：下拉里空着并保留已选项即可，报错由外层表单提交时统一暴露
      setOptions([])
    } finally {
      setFetching(false)
    }
  }, [excludeIds, value])

  return (
    <Select
      mode={single ? undefined : 'multiple'}
      allowClear
      disabled={disabled}
      placeholder={placeholder}
      value={single ? value?.[0] : value}
      onChange={next => {
        // 单选清空时回空数组而不是 [undefined]：调用方按"有没有值"判断，不该看到 length=1 的空项
        const ids = single ? (next == null ? [] : [next as number]) : ((next as number[]) ?? [])
        onPick?.(ids
          .map(id => pinned.current.get(id))
          .filter((item): item is Loaded => !!item)
          .map(item => ({ id: item.id, name: item.name })))
        onChange?.(ids)
      }}
      onSearch={search}
      onFocus={() => void search('')}
      filterOption={false}
      loading={fetching}
      maxTagCount={maxTagCount}
      options={options}
    />
  )
}
