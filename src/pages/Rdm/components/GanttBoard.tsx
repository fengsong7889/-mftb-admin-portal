/**
 * GanttBoard —— 需求甘特图时间轴渲染 + 拖拽调期（阶段一：演示数据驱动）
 *
 * 设计取舍（为什么自绘而不用甘特库）：项目未引入甘特依赖，且本图只需要
 * 「按天平铺的条 + 两端拖拽改期 + 今日线 + 周末底纹」，自绘 div/SVG 可控、
 * 贴合设计令牌，也避免为一个预览功能新增重型依赖（AGENTS 禁止未评估新增依赖）。
 *
 * 交互口径（与方案一致）：
 * 1. 条形位置 = 任务负责人填写的「计划起止日期」，不是系统推演日期；
 * 2. 只有「本人负责 + 处于调整模式 + 未完成」的条可拖动，其余只读；
 * 3. 拖动条身平移（保持原工期），拖动两端改单侧日期，按天吸附；
 * 4. 每次拖动只更新父级 draft（未保存草稿），真正落库在阶段二的保存接口。
 *
 * ⚠️ 阶段二：数据来自服务端 GET /rdm/schedule/gantt；可拖性由服务端 canAdjust 裁决，
 * 拖动只更新父级 draft（未保存草稿），保存走 POST /rdm/schedule/task-plans（乐观锁+审计+幂等）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { DatePicker, Popover, Tag } from 'antd'
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { RDM_TASK_TYPE_COLOR, RDM_ROLE_LABEL, RDM_TASK_STATUS_LABEL, type RdmTaskType, type RdmRoleCode, type RdmTaskStatus } from '../../../constants/rdm'

/**
 * 甘特条任务（服务端真实数据 + 前端 mine 标记）。
 * <p>canAdjust 由服务端裁决（负责人本人 + 任务/需求状态开放），前端只作 UX；
 * mine 仅用于高亮「我负责的行」，不作为权限依据。
 */
export interface GanttTask {
  id: number
  taskNo: string
  title: string
  taskType: string
  roleCode: string
  ownerUserId: number | null
  ownerName: string | null
  ownerEmpNo: string | null
  planStartDate: string | null
  planFinishDate: string | null
  status: string
  progress: number
  overdue: boolean
  planVersion: number
  canAdjust: boolean
  readOnlyReason?: string | null
  mine: boolean
}

/**
 * 左侧固定列宽。
 * <p>LABEL_W 必须等于「左内边距 + 折叠箭头 + 各列宽 + 列间距 + 右内边距」的真实渲染宽度：
 * 之前常量漏算了箭头/间距/内边距，导致时间轴起点压在左栏文字上、色块盖住面板（已修）。
 * 名称/负责人列用 flex:1 吸收余量，深度缩进不会撑破容器。
 */
const COL_PAD_L = 10
const COL_PAD_R = 10
const COL_CARET = 14
const COL_GAP = 6
const COL_ROLE = 90
const COL_OWNER = 90
const COL_DATE = 88
const FULL_LABEL_W = COL_PAD_L + COL_CARET + 200 + COL_ROLE + COL_OWNER + COL_DATE * 2 + COL_GAP * 5 + COL_PAD_R
const COMPACT_LABEL_W = COL_PAD_L + COL_CARET + COL_OWNER + COL_ROLE + COL_GAP * 2 + COL_PAD_R
/** 行高 */
const ROW_TASK = 42
const ROW_GROUP = 34
const BAR_H = 20

/** 甘特图行模型（父级已按折叠/筛选拍平，板只负责渲染） */
export type GanttRow =
  | { kind: 'group'; id: string; depth: number; label: string; tag?: string; tagColor?: string; meta?: string; expandable: boolean; expanded: boolean; spanStart?: string | null; spanEnd?: string | null }
  | { kind: 'task'; id: string; depth: number; task: GanttTask }
  | { kind: 'empty'; id: string; depth: number; text: string }

/** 草稿：taskId → 未保存的新起止 */
export type GanttDraft = Record<number, { start: string | null; end: string | null }>

interface GanttBoardProps {
  rows: GanttRow[]
  windowStart: Dayjs
  days: number
  dayW: number
  scale: 'day' | 'week' | 'month'
  editMode: boolean
  draft: GanttDraft
  editingTaskId: number | null
  /** 紧凑左栏：只留「姓名 + 角色」两列，把宽度让给时间轴 */
  compact?: boolean
  /** 每次自增触发一次「滚动定位到今天」（工具栏今天按钮用） */
  focusTodayNonce?: number
  onToggleGroup: (id: string) => void
  onDragChange: (taskId: number, start: string, end: string) => void
  onStartEditDates: (taskId: number) => void
  onDateChange: (taskId: number, start: string | null, end: string | null) => void
}

/** 两个 yyyy-MM-dd 相差的整天数（b→a） */
function diffDays(a: string | Dayjs, b: Dayjs): number {
  return dayjs(a).startOf('day').diff(b.startOf('day'), 'day')
}

const FMT = 'YYYY-MM-DD'

/** 拖拽中的临时状态（画原位置轮廓 + 跟随日期气泡） */
interface DragState {
  taskId: number
  mode: 'move' | 'start' | 'end'
  origStart: string
  origEnd: string
  curStart: string
  curEnd: string
  startClientX: number
}

export default function GanttBoard(props: GanttBoardProps) {
  const { rows, windowStart, days, dayW: baseDayW, scale, editMode, draft, editingTaskId, compact, focusTodayNonce, onToggleGroup, onDragChange, onStartEditDates, onDateChange } = props
  const { t } = useTranslation()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const labelW = compact ? COMPACT_LABEL_W : FULL_LABEL_W

  /** 滚动容器可视宽度：用于让时间轴自适应铺满，避免週/月缩放下右侧大片留白 */
  const [availW, setAvailW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setAvailW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /**
   * 一天像素宽 = max(缩放基准, 铺满可视宽度所需)。
   * <p>週/月基准 dayW 很小，若固定使用则时间轴窄、右侧留白；这里拉伸到铺满容器，
   * 缩放档位只决定刻度疏密（日/週/月标签），不再决定留白。
   */
  const dayW = Math.max(baseDayW, availW > 0 && days > 0 ? Math.floor(Math.max(0, availW - labelW) / days) : baseDayW)

  const timelineW = days * dayW
  const todayX = diffDays(dayjs(), windowStart) * dayW
  const showToday = todayX >= 0 && todayX <= timelineW

  // 挂载 / 换窗口 / 换缩放 / 点「今天」时，把今天滚到可视区靠左，避免条形落在屏幕外
  useEffect(() => {
    const el = scrollRef.current
    if (el && showToday) el.scrollLeft = Math.max(0, todayX - Math.min(labelW, el.clientWidth / 3))
  }, [focusTodayNonce, windowStart, scale, showToday, todayX, labelW])

  /** 周末底纹：以窗口首日为相位，用 7 天周期的重复渐变，避免逐格渲染上千个 div */
  const weekendBg = useMemo(() => {
    const dow0 = windowStart.day()
    const stops: string[] = []
    for (let i = 0; i < 7; i++) {
      const dow = (dow0 + i) % 7
      const c = dow === 0 || dow === 6 ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0)'
      stops.push(`${c} ${i * dayW}px`, `${c} ${(i + 1) * dayW}px`)
    }
    return `repeating-linear-gradient(90deg, ${stops.join(',')})`
  }, [windowStart, dayW])

  /** 顶部月份分段（跨月的需求一眼看出月份边界） */
  const monthSegs = useMemo(() => {
    const segs: { x: number; w: number; label: string }[] = []
    const monthLabel = (d: Dayjs) => t('rdm.ganttBoard.monthLabel', { y: d.year(), m: d.month() + 1 })
    let curMonth = -1
    let startX = 0
    for (let i = 0; i < days; i++) {
      const day = windowStart.add(i, 'day')
      const m = day.month()
      if (m !== curMonth) {
        if (curMonth !== -1) segs.push({ x: startX, w: i * dayW - startX, label: monthLabel(windowStart.add(startX / dayW, 'day')) })
        curMonth = m
        startX = i * dayW
      }
    }
    segs.push({ x: startX, w: days * dayW - startX, label: monthLabel(windowStart.add(startX / dayW, 'day')) })
    return segs
  }, [windowStart, days, dayW, t])

  /** 日期刻度（day：逐日；week：每周一；month：不画日刻度） */
  const dayTicks = useMemo(() => {
    if (scale === 'month') return [] as { x: number; label: string; weekend: boolean; today: boolean }[]
    const out: { x: number; label: string; weekend: boolean; today: boolean }[] = []
    const step = scale === 'week' ? 7 : 1
    for (let i = 0; i < days; i += step) {
      const day = windowStart.add(i, 'day')
      out.push({
        x: i * dayW,
        label: scale === 'week' ? day.format('MM/DD') : day.format('D'),
        weekend: day.day() === 0 || day.day() === 6,
        today: day.isSame(dayjs(), 'day'),
      })
    }
    return out
  }, [windowStart, days, dayW, scale])

  const xOf = (date: string | null) => (date == null ? null : diffDays(date, windowStart) * dayW)

  /** 任务生效日期：优先取未保存草稿 */
  const effDates = (task: GanttTask) => {
    const dd = draft[task.id]
    return { start: dd ? dd.start : task.planStartDate, end: dd ? dd.end : task.planFinishDate }
  }

  /** 是否可在图上调整：调整模式 + 服务端裁决 canAdjust */
  const adjustable = (task: GanttTask) => editMode && task.canAdjust

  /** 开始拖动：按落点决定平移还是改单侧 */
  const handlePointerDown = (e: React.PointerEvent, task: GanttTask) => {
    if (!adjustable(task)) return
    const { start, end } = effDates(task)
    if (!start || !end) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offset = e.clientX - rect.left
    const mode: DragState['mode'] = offset <= 8 ? 'start' : offset >= rect.width - 8 ? 'end' : 'move'
    const st: DragState = { taskId: task.id, mode, origStart: start, origEnd: end, curStart: start, curEnd: end, startClientX: e.clientX }
    dragRef.current = st
    setDrag(st)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current
    if (!st) return
    const deltaDays = Math.round((e.clientX - st.startClientX) / dayW)
    if (deltaDays === 0 && st.curStart === st.origStart && st.curEnd === st.origEnd) return
    let { curStart, curEnd } = st
    if (st.mode === 'move') {
      curStart = dayjs(st.origStart).add(deltaDays, 'day').format(FMT)
      curEnd = dayjs(st.origEnd).add(deltaDays, 'day').format(FMT)
    } else if (st.mode === 'start') {
      // 开始日不得晚于结束日（同一天按一天工期，允许相等）
      const next = dayjs(st.origStart).add(deltaDays, 'day')
      curStart = (next.isAfter(dayjs(st.origEnd), 'day') ? dayjs(st.origEnd) : next).format(FMT)
    } else {
      const next = dayjs(st.origEnd).add(deltaDays, 'day')
      curEnd = (next.isBefore(dayjs(st.origStart), 'day') ? dayjs(st.origStart) : next).format(FMT)
    }
    if (curStart === st.curStart && curEnd === st.curEnd) return
    const nextSt = { ...st, curStart, curEnd }
    dragRef.current = nextSt
    setDrag(nextSt)
    onDragChange(st.taskId, curStart, curEnd)
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* 已释放则忽略 */ }
    dragRef.current = null
    setDrag(null)
  }

  /**
   * 悬浮卡片内容：标签-取值分行对齐，取代原先一整段拼接文本。
   * <p>为什么不用单串 Tooltip：多行 \n 文本在悬浮框里会连成一段、需逐字阅读；
   * 结构化的「标题 + 键值行」才能一眼扫到角色/负责人/计划/进度。
   */
  const hoverRows = (task: GanttTask, start: string | null, end: string | null) => {
    const color = RDM_TASK_TYPE_COLOR[task.taskType as RdmTaskType] ?? '#E8720C'
    return (
      <div className="rdm-g2-hover">
        <div className="rdm-g2-hover-row"><span>{t('rdm.ganttBoard.role')}</span><b>{RDM_ROLE_LABEL[task.roleCode as RdmRoleCode]}</b></div>
        <div className="rdm-g2-hover-row"><span>{t('rdm.ganttBoard.owner')}</span><b>{task.ownerName}（{task.ownerEmpNo}）</b></div>
        <div className="rdm-g2-hover-row"><span>{t('rdm.ganttBoard.plan')}</span><b>{start ?? '—'} ～ {end ?? '—'}</b></div>
        {/* 进度为重点关注项：迷你进度条 + 加粗彩色百分比，标签同步提色 */}
        <div className="rdm-g2-hover-row rdm-g2-hover-progress">
          <span>{t('rdm.ganttBoard.progress')}</span>
          <b className="rdm-g2-hover-progress-val">
            <span className="rdm-g2-hover-track"><i style={{ width: `${task.progress}%`, background: color }} /></span>
            <em style={{ color }}>{task.progress}%</em>
          </b>
        </div>
        <div className="rdm-g2-hover-row">
          <span>{t('rdm.ganttBoard.status')}</span>
          <b>
            {RDM_TASK_STATUS_LABEL[task.status as RdmTaskStatus] ?? task.status}
            {task.overdue && <em className="rdm-g2-hover-overdue">{t('rdm.ganttBoard.overdue')}</em>}
          </b>
        </div>
      </div>
    )
  }

  /** 渲染一根任务条（含拖拽手柄、进度、逾期点、我标识） */
  const renderBar = (task: GanttTask) => {
    const { start, end } = effDates(task)
    const sx = xOf(start)
    const ex = xOf(end)
    if (sx == null || ex == null) {
      // 无日期：不画条，但在时间轴左端给占位，避免任务「凭空消失」
      return <span className="rdm-g2-unscheduled">{t('rdm.ganttBoard.unscheduled')}</span>
    }
    const left = Math.min(sx, ex)
    const right = Math.max(sx, ex) + dayW
    const width = Math.max(dayW * 0.6, right - left)
    const color = RDM_TASK_TYPE_COLOR[task.taskType as RdmTaskType] ?? '#E8720C'
    const canDrag = adjustable(task)
    const isDragging = drag?.taskId === task.id
    const clipL = left < 0
    const clipR = right > timelineW
    return (
      <>
        {/* 拖动时画原位置轮廓，方便对比移动了多少 */}
        {isDragging && drag && (
          <div
            className="rdm-g2-bar-ghost"
            style={{ left: Math.max(0, xOf(drag.origStart) ?? 0), width: Math.max(dayW * 0.6, (xOf(drag.origEnd) ?? 0) - (xOf(drag.origStart) ?? 0) + dayW) }}
          />
        )}
        <Popover
          trigger="hover"
          mouseEnterDelay={0.15}
          placement="top"
          title={<span className="rdm-g2-hover-title">{task.title}<span className="rdm-g2-hover-no">{task.taskNo}</span></span>}
          content={hoverRows(task, start, end)}
        >
          <div
            className={`rdm-g2-bar${canDrag ? ' draggable' : ''}${task.mine ? ' mine' : ''}${task.overdue ? ' overdue' : ''}${task.status === 'done' ? ' done' : ''}${isDragging ? ' dragging' : ''}${width < 56 ? ' narrow' : ''}`}
            style={{ left, width, top: (ROW_TASK - BAR_H) / 2, background: task.status === 'done' ? `${color}55` : `${color}dd`, borderLeft: clipL ? `2px dashed ${color}` : undefined, borderRight: clipR ? `2px dashed ${color}` : undefined }}
            onPointerDown={e => handlePointerDown(e, task)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="rdm-g2-bar-progress" style={{ width: `${task.progress}%` }} />
            <span className="rdm-g2-bar-label">{task.title}</span>
            {/* 进度重点标记：加粗百分比徽标常驻色块右端，一眼可见完成度 */}
            <span className="rdm-g2-bar-pct">{task.progress}%</span>
            {canDrag && <span className="rdm-g2-handle left" />}
            {canDrag && <span className="rdm-g2-handle right" />}
          </div>
        </Popover>
        {task.overdue && <span className="rdm-g2-overdue-dot" style={{ left: Math.min(right + 4, timelineW - 8) }} />}
        {/* 拖动时的跟随气泡：实时反馈新起止 */}
        {isDragging && drag && (
          <span className="rdm-g2-drag-tip" style={{ left: Math.max(0, left), top: (ROW_TASK - BAR_H) / 2 - 22 }}>
            {drag.curStart} ~ {drag.curEnd}
          </span>
        )}
      </>
    )
  }

  /** 日期单元格：调整模式下本人任务可点开精确改期 */
  const renderDateCell = (task: GanttTask, field: 'start' | 'end') => {
    const { start, end } = effDates(task)
    const val = field === 'start' ? start : end
    const editing = editingTaskId === task.id && adjustable(task)
    if (editing) {
      return (
        <DatePicker
          size="small"
          autoFocus
          allowClear={false}
          value={val ? dayjs(val) : null}
          style={{ width: COL_DATE - 8 }}
          onChange={dv => {
            if (!dv) return
            const ns = field === 'start' ? dv.format(FMT) : start
            const ne = field === 'end' ? dv.format(FMT) : end
            onDateChange(task.id, ns, ne)
          }}
        />
      )
    }
    const clickable = adjustable(task)
    return (
      <span
        className={`rdm-g2-date${clickable ? ' editable' : ''}${val == null ? ' empty' : ''}${task.overdue && field === 'end' ? ' overdue' : ''}`}
        onClick={clickable ? () => onStartEditDates(task.id) : undefined}
      >
        {val ?? '—'}
      </span>
    )
  }

  return (
    <div className="rdm-g2">
      <div className="rdm-g2-scroll" ref={scrollRef}>
        <div className="rdm-g2-inner" style={{ width: labelW + timelineW }}>
          {/* 表头：左侧列名（sticky）+ 右侧月份/日期刻度（sticky top） */}
          <div className="rdm-g2-head">
            <div className="rdm-g2-labels head" style={{ width: labelW, gap: COL_GAP, paddingRight: COL_PAD_R, paddingLeft: COL_PAD_L }}>
              {compact ? (
                <>
                  <span className="rdm-g2-col-flex">{t('rdm.ganttBoard.owner')}</span>
                  <span style={{ width: COL_ROLE }}>{t('rdm.ganttBoard.role')}</span>
                </>
              ) : (
                <>
                  <span className="rdm-g2-col-flex">{t('rdm.ganttBoard.colReqTask')}</span>
                  <span style={{ width: COL_ROLE }}>{t('rdm.ganttBoard.role')}</span>
                  <span style={{ width: COL_OWNER }}>{t('rdm.ganttBoard.owner')}</span>
                  <span style={{ width: COL_DATE }}>{t('rdm.ganttBoard.start')}</span>
                  <span style={{ width: COL_DATE }}>{t('rdm.ganttBoard.end')}</span>
                </>
              )}
            </div>
            <div className="rdm-g2-timeline head" style={{ width: timelineW }}>
              <div className="rdm-g2-month-row">
                {monthSegs.map((s, i) => (
                  <span key={i} style={{ left: s.x, width: s.w }}>{s.label}</span>
                ))}
              </div>
              <div className="rdm-g2-day-row">
                {dayTicks.map((tk, i) => (
                  <span key={i} className={`rdm-g2-daytick${tk.weekend ? ' weekend' : ''}${tk.today ? ' today' : ''}`} style={{ left: tk.x, width: scale === 'week' ? dayW * 7 : dayW }}>
                    {scale === 'day' || scale === 'week' ? tk.label : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 数据行 */}
          {rows.map(row => {
            if (row.kind === 'group') {
              const gsx = xOf(row.spanStart ?? null)
              const gex = xOf(row.spanEnd ?? null)
              return (
                <div key={row.id} className="rdm-g2-row group" style={{ height: ROW_GROUP }}>
                  <div className="rdm-g2-labels group" style={{ width: labelW, gap: COL_GAP, paddingRight: COL_PAD_R, paddingLeft: COL_PAD_L + row.depth * 16 }}>
                    {row.expandable ? (
                      <span className="rdm-g2-caret" onClick={() => onToggleGroup(row.id)}>
                        {row.expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                      </span>
                    ) : <span className="rdm-g2-caret-ph" />}
                    <span className="rdm-g2-group-label">{row.label}</span>
                    {row.tag && <Tag color={row.tagColor ?? 'default'} style={{ margin: 0 }}>{row.tag}</Tag>}
                    {row.meta && <span className="rdm-g2-group-meta">{row.meta}</span>}
                  </div>
                  <div className="rdm-g2-timeline" style={{ width: timelineW, background: weekendBg }}>
                    {showToday && <span className="rdm-g2-today" style={{ left: todayX, height: ROW_GROUP }} />}
                    {gsx != null && gex != null && (
                      <div className="rdm-g2-spanbar" style={{ left: Math.max(0, gsx), width: Math.max(6, Math.min(timelineW, gex + dayW) - Math.max(0, gsx)), top: ROW_GROUP / 2 - 4 }} />
                    )}
                  </div>
                </div>
              )
            }
            if (row.kind === 'empty') {
              return (
                <div key={row.id} className="rdm-g2-row" style={{ height: ROW_TASK }}>
                  <div className="rdm-g2-labels" style={{ width: labelW, gap: COL_GAP, paddingRight: COL_PAD_R, paddingLeft: COL_PAD_L + row.depth * 16 }}>
                    <span className="rdm-g2-caret-ph" />
                    <span className="rdm-g2-empty-text">{row.text}</span>
                  </div>
                  <div className="rdm-g2-timeline" style={{ width: timelineW, background: weekendBg }}>
                    {showToday && <span className="rdm-g2-today" style={{ left: todayX, height: ROW_TASK }} />}
                  </div>
                </div>
              )
            }
            const task = row.task
            const { start, end } = effDates(task)
            return (
              <div key={row.id} className={`rdm-g2-row${task.mine ? ' mine' : ''}`} style={{ height: ROW_TASK }}>
                <div className="rdm-g2-labels" style={{ width: labelW, gap: COL_GAP, paddingRight: COL_PAD_R, paddingLeft: COL_PAD_L + row.depth * 16 }}>
                  <span className="rdm-g2-caret-ph" />
                  {compact ? (
                    <>
                      {/* 紧凑模式：只留姓名 + 角色，任务名交给条形自身展示 */}
                      <span className="rdm-g2-owner rdm-g2-col-flex" title={`${task.ownerName}（${task.ownerEmpNo}）`}>
                        {task.mine && <span className="rdm-g2-me">{t('rdm.ganttBoard.me')}</span>}
                        {task.ownerName}
                      </span>
                      <span className="rdm-g2-role" style={{ width: COL_ROLE }}>
                        <i className="rdm-g2-type-dot" style={{ background: RDM_TASK_TYPE_COLOR[task.taskType as RdmTaskType] }} />
                        {RDM_ROLE_LABEL[task.roleCode as RdmRoleCode]}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="rdm-g2-name rdm-g2-col-flex" title={`${task.taskNo} ${task.title}`}>
                        {task.mine && <span className="rdm-g2-me">{t('rdm.ganttBoard.me')}</span>}
                        {task.title}
                      </span>
                      <span className="rdm-g2-role" style={{ width: COL_ROLE }}>
                        <i className="rdm-g2-type-dot" style={{ background: RDM_TASK_TYPE_COLOR[task.taskType as RdmTaskType] }} />
                        {RDM_ROLE_LABEL[task.roleCode as RdmRoleCode]}
                      </span>
                      <span className="rdm-g2-owner" style={{ width: COL_OWNER }} title={`${task.ownerName}（${task.ownerEmpNo}）`}>
                        {task.ownerName}
                      </span>
                      <span className="rdm-g2-datecell" style={{ width: COL_DATE }}>{renderDateCell(task, 'start')}</span>
                      <span className="rdm-g2-datecell" style={{ width: COL_DATE }}>{renderDateCell(task, 'end')}</span>
                    </>
                  )}
                </div>
                <div className="rdm-g2-timeline" style={{ width: timelineW, background: weekendBg }}>
                  {showToday && <span className="rdm-g2-today" style={{ left: todayX, height: ROW_TASK }} />}
                  {renderBar(task)}
                  {/* 起止同日时的连接提示（避免看起来像没有工期） */}
                  {start && end && start === end && <span className="rdm-g2-sameday" style={{ left: (xOf(start) ?? 0) + dayW + 6 }}>{t('rdm.ganttBoard.sameDay')}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
