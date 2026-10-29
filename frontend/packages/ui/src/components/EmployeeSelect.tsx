/**
 * 员工选择器（参会人 / 房间管理员共用）。
 *
 * <p>数据源是 HR 域的在职员工分页接口（employmentStatus=active），选项值一律用 sys_user.id：
 * 工号会变（重编）、姓名会重名，只有 ID 能作为服务端归属与鉴定的依据。
 *
 * <p>不做前端"权限过滤"：可见范围与能否被选为参会人由服务端判定，这里只是取数与展示。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Select, Space, Tag } from 'antd'
import { fetchEmployee, fetchEmployees } from '@/api/employee'
import { useTranslation } from 'react-i18next'

interface Props {
  /**
   * 已选人员，契约是 sys_user.id 数组。
   *
   * <p>但放进 Form.Item 后，注入进来的其实是那个字段的原值：历史上多个页面把 name 绑到了
   * 姓名字段上（原值是字符串），旧实现按 value?.[0] 取值会挖出名字的第一个字并当成选项文案渲染，
   * 界面表现为「编辑页负责人莫名其妙变空」。因此取值一律走 toIds 归一化：只认数字 ID。
   */
  value?: number[] | number
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
  /**
   * 已存快照回显（编辑场景）：把 id → 姓名(工号) 先垫进选项，避免选中项显示成裸 ID。
   *
   * <p>为什么需要这个入参：表单从服务端拿到的是 userId + 姓名快照，而搜到的选项靠 onSearch。
   * 没垫底时，用户一打开编辑页就只看到一个数字，不选新的人就永远不知道那是谁。
   */
  seed?: { id: number; name: string; empId?: string | null }[]
  /**
   * 透传给 Select 的样式（如弹窗里的 `width: '100%'`）。
   * <p>为什么要有：Select 默认宽度不撑满容器，弹窗里的选人框会窄到截断工号 Tag，
   * 调用处需要能把它对齐到同级输入框的宽度。
   */
  style?: CSSProperties
}

interface Loaded { id: number; name: string; empId?: string }

interface Option { value: number; label: ReactNode }

/**
 * 把外部注入的 value 归一化为数字 ID 列表。
 * <p>Number('') === 0 且是有限数，故额外排除 0 与非正数（sys_user.id 从 1 起）。
 */
function toIds(value?: number[] | number): number[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value]
  return raw
    .map(item => (typeof item === 'number' ? item : Number(item)))
    .filter(item => Number.isFinite(item) && item > 0)
}

export default function EmployeeSelect({
  value, onChange, placeholder, excludeIds = [], maxTagCount = 6, disabled, single, onPick, seed, style,
}: Props) {
  const { t } = useTranslation()
  const [searchResults, setSearchResults] = useState<Loaded[]>([])
  /** 按 ID 反查到的档案（编辑态回显专用，与搜索结果分开存） */
  const [resolved, setResolved] = useState<Loaded[]>([])
  const [fetching, setFetching] = useState(false)
  /** 已见过的人员总账：一次搜索不能把之前选的人从选项里挤掉，否则已选值会退化成裸 ID 显示 */
  const archive = useRef<Map<number, Loaded>>(new Map())
  /** 已反查过的 ID（含失败的）：同一次挂载内不重复请求（403 时反复重试只会刷屏） */
  const attempted = useRef<Set<number>>(new Set())

  const ids = useMemo(() => toIds(value), [value])
  /** 值语义的依赖键：数组每次渲染都是新对象，不能用身份当依赖 */
  const idsKey = ids.join(',')

  /**
   * 快照垫底：seed 只用来回显已知的人，不代表搜到了他们。
   * 依赖里用 JSON 钥匙而不是数组引用，否则父组件每次渲染都传新数组，这里会无限重跑。
   * <p>同时把 seed 的 ID 记进 attempted：已有姓名快照就不必再走员工详情反查（无授权时那接口是 403）。
   */
  const seedKey = JSON.stringify(seed ?? [])
  useEffect(() => {
    const known = (JSON.parse(seedKey || '[]') as { id: number; name: string; empId?: string | null }[])
      .filter(item => item && item.id > 0)
      .map(item => ({ id: item.id, name: item.name, empId: item.empId ?? undefined }))
    if (known.length === 0) return
    known.forEach(item => {
      archive.current.set(item.id, item)
      attempted.current.add(item.id)
    })
    setResolved(prev => {
      const merged = new Map(prev.map(item => [item.id, item]))
      known.forEach(item => { if (!merged.has(item.id)) merged.set(item.id, item) })
      return [...merged.values()]
    })
  }, [seedKey])

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
      }))
      loaded.forEach(item => archive.current.set(item.id, item))
      setSearchResults(loaded)
    } catch {
      // 搜索失败不弹错：下拉里空着并保留已选项即可，报错由外层表单提交时统一暴露
      setSearchResults([])
    } finally {
      setFetching(false)
    }
  }, [])

  /**
   * 编辑态回显：Select 的 value 若不在 options 里，antd 会把裸 ID 当文案渲染
   * （缺陷现场：迭代编辑页的「迭代負責人」显示成 7）。首次遇到未知 ID 时走员工详情接口补齐成姓名。
   * <p>查不到就保持原样：无 employee-management 授权时接口会 403，退化成改造前的行为，
   * 不得在这里弹错打断表单加载。
   * <p>依赖必须是 idsKey 而不是 ids：调用方（getValueProps / 内联数组）每次渲染都新建数组，
   * 用数组身份当依赖会让这个副作用每渲染一次都重跑一遍。
   */
  useEffect(() => {
    const current = idsKey ? idsKey.split(',').map(Number) : []
    const missing = current.filter(id => !attempted.current.has(id))
    if (!missing.length) return
    let cancelled = false
    void (async () => {
      const found = await Promise.all(missing.map(async id => {
        try {
          const e = await fetchEmployee(id)
          return { id, name: e.name || e.username, empId: e.empId } as Loaded
        } catch {
          return null
        }
      }))
      if (cancelled) return
      // 成功与失败都记账，且只在请求落地后记：提前记账会让 StrictMode/清理重跑的那一轮直接跳过，
      // 结果是「第一轮被取消、第二轮不跑」，回显永远补不上姓名。
      missing.forEach(id => attempted.current.add(id))
      const ok = found.filter((item): item is Loaded => !!item)
      if (!ok.length) return
      ok.forEach(item => archive.current.set(item.id, item))
      setResolved(prev => [...prev, ...ok])
    })()
    return () => { cancelled = true }
  }, [idsKey])

  const options = useMemo<Option[]>(() => {
    const currentIds = idsKey ? idsKey.split(',').map(Number) : []
    const merged = new Map<number, Loaded>()
    resolved.forEach(item => merged.set(item.id, item))
    searchResults.forEach(item => merged.set(item.id, item))
    currentIds.forEach(id => {
      if (!merged.has(id)) {
        const known = archive.current.get(id)
        if (known) merged.set(id, known)
      }
    })
    return [...merged.values()]
      .filter(item => !excludeIds.includes(item.id))
      .map(item => ({
        value: item.id,
        label: (
          <Space size={4}>
            <span>{item.name}</span>
            {/* 选人下拉统一「姓名 + 工號」，不拼部门：部门不参与消歧，且会批量暴露组织归属 */}
            {item.empId && <Tag style={{ marginInlineEnd: 0 }}>{item.empId}</Tag>}
          </Space>
        ),
      }))
  }, [excludeIds, idsKey, resolved, searchResults])

  return (
    <Select
      mode={single ? undefined : 'multiple'}
      allowClear
      disabled={disabled}
      style={style}
      // 远程搜索必须显式开 showSearch：只给 onSearch 时 antd 会告警且输入框只读，
      // 单选的负责人选择器就变成「只能从默认 30 人里点，搜不到人」
      showSearch
      // 面板不跟随触发器宽度：调用处容器窄时，「姓名 + 工號」Tag 会被截断；
      // 按内容自适应后任何场景都能看全员工信息（宽容器下视觉仍是撑满的）
      popupMatchSelectWidth={false}
      placeholder={placeholder ?? t('meeting.searchByNameOr', { defaultValue: '搜尋姓名或工號' })}
      value={single ? ids[0] : ids}
      onChange={next => {
        // 单选清空时回空数组而不是 [undefined]：调用方按"有没有值"判断，不该看到 length=1 的空项
        const picked = single ? (next == null ? [] : [next as number]) : ((next as number[]) ?? [])
        onPick?.(picked
          .map(id => archive.current.get(id))
          .filter((item): item is Loaded => !!item)
          .map(item => ({ id: item.id, name: item.name })))
        onChange?.(picked)
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
