/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, DatePicker, Dropdown, Form, Input, Modal, Popover, Segmented, Select, Slider, Switch, Tag, Tooltip, message, type MenuProps } from 'antd'
import {
  AimOutlined, CalendarOutlined, CaretDownOutlined, CaretUpOutlined, CheckCircleOutlined, ClockCircleOutlined, DashboardOutlined,
  DeleteOutlined, DownloadOutlined, EditOutlined, FieldTimeOutlined, FileExcelOutlined, FileImageOutlined,
  FilePdfOutlined, HolderOutlined, ImportOutlined, InfoCircleOutlined, LeftOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  PlusOutlined, ReloadOutlined, RightOutlined, SearchOutlined, SyncOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import AnimatedNumber from '@/components/AnimatedNumber'
import { exportDocument, type DocumentExportKind } from '@/utils/documentExport'
import {
  GROUP_COLORS, HOURS_PER_DAY, PROGRESS_BANDS, STORAGE_KEY, TASK_STATUS_META, buildRange, dayBadge, exportCsv, fmt,
  hoursInPeriod, mondayOf, overlaps, progressColor, shiftDate, shortDate, taskHours, taskStatus,
  weekName, weekdayShort, workdayCount, type DayCell, type GanttData, type GanttGroup, type GanttTask, type TaskStatus,
} from './worklogGanttModel'
// API 函数统一加 api 前缀别名：本组件内部已有 deleteTask/deleteGroup 等同名局部函数，
// 不加别名会让本地函数把导入顶掉，编译期就报参数不匹配
import {
  createGroup as apiCreateGroup, createTask as apiCreateTask, deleteGroup as apiDeleteGroup,
  deleteTask as apiDeleteTask, fetchLedger, importLocalLedger, reorderGroups as apiReorderGroups,
  restoreGroup as apiRestoreGroup, restoreTask as apiRestoreTask, toImportPayload,
  updateGroup as apiUpdateGroup, updateTask as apiUpdateTask,
} from './worklogApi'
import { doneAtOf, progressAt } from './worklogReport'
import { noteToDisplayHtml, noteToText, sanitizeNoteHtml } from './noteRich'
import './worklogGantt.css'

dayjs.extend(isoWeek)

/**
 * 「項目甘特台账」视图（阶段一 UI，本地持久化）。
 *
 * 形态对标用户 Excel 原件：左側冻结窗格（需求合并单元格 × 子任务行，可收合），
 * 右側按周分组的連續圆角色条甘特（参考产研交付甘特：色条带 % 标签、点击弹详情卡）。
 * 耗时只计工作日（周末/节假日剔除，调休计入）；进度五段色（100% 绿）。
 * 导出复用共享层 documentExport：长图 PNG / A4 分页 PDF，另保留 CSV。
 */

/** 与 worklogGantt.css 左栏宽度变量总和保持一致（自动滚动边界兜底用） */
const LEFT_W = 1088

interface DragState {
  groupId: string
  taskId: string
  mode: 'move' | 'resize'
  delta: number
  originStart: string
  originEnd: string
}

/** 台账空值：服务端未返回前不给任何假数据（同域铁律：后端不可用就如实报错，不回退示例） */
const EMPTY_LEDGER: GanttData = { groups: [], holidays: [], makeup: [], compOff: [], leave: [] }

export default function WorklogGantt() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState<GanttData>(EMPTY_LEDGER)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 本地台账迁移向导：只在服务端台账为空、浏览器还存着旧数据时出现，导入一次就不再提 */
  const [localBackup, setLocalBackup] = useState<GanttData | null>(null)
  const [importing, setImporting] = useState(false)

  const [keywordDraft, setKeywordDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all')
  const [planFilter, setPlanFilter] = useState<'all' | 'planned' | 'inserted'>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [showWeekends, setShowWeekends] = useState(true)
  const [colW, setColW] = useState(34)
  const [collapsed, setCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'gantt' | 'list'>('gantt')
  const [timePreset, setTimePreset] = useState<'lastWeek' | 'week' | 'lastMonth' | 'month' | 'all' | 'custom'>('week')
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [periodOffset, setPeriodOffset] = useState(0)
  const [paneAvail, setPaneAvail] = useState(0)
  const [sort, setSort] = useState<{ key: 'start' | 'progress' | 'hours' | null; dir: 1 | -1 }>({ key: null, dir: 1 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState<DocumentExportKind | 'csv' | null>(null)
  const [noteTarget, setNoteTarget] = useState<{ gid: string; tid: string; title: string; note: string } | null>(null)
  const undoRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  /* ---------- 時間維度查詢：六檔 + 周期翻頁偏移，實時聯動列表與統計 ---------- */
  const timeRange = useMemo(() => {
    const weekAt = (n: number) => { const s = mondayOf(dayjs()).add(n * 7, 'day'); return { start: s, end: s.add(6, 'day') } }
    if (timePreset === 'lastWeek') return weekAt(periodOffset - 1)
    if (timePreset === 'week') return weekAt(periodOffset)
    if (timePreset === 'lastMonth') { const s = dayjs().subtract(1, 'month').startOf('month').add(periodOffset, 'month'); return { start: s, end: s.endOf('month') } }
    if (timePreset === 'month') { const s = dayjs().startOf('month').add(periodOffset, 'month'); return { start: s, end: s.endOf('month') } }
    if (timePreset === 'custom' && customRange?.[0] && customRange?.[1]) {
      const len = customRange[1].diff(customRange[0], 'day') + 1
      const s = customRange[0].add(periodOffset * len, 'day')
      return { start: s, end: s.add(len - 1, 'day') }
    }
    return null
  }, [timePreset, customRange, periodOffset])
  const rangeLabel = useMemo(() => {
    if (!timeRange) return t('cpm.gantt.range.all', { defaultValue: '全部時間' })
    if (timePreset === 'week' || timePreset === 'lastWeek') {
      return t('cpm.gantt.range.week', {
        week: timeRange.start.isoWeek(), start: timeRange.start.format('MM-DD'), end: timeRange.end.format('MM-DD'),
        defaultValue: '第 {{week}} 週（{{start}} ~ {{end}}）',
      })
    }
    if (timePreset === 'month' || timePreset === 'lastMonth') return timeRange.start.format(t('cpm.gantt.range.monthFormat', { defaultValue: 'YYYY 年 MM 月' }))
    return `${timeRange.start.format('YYYY-MM-DD')} ~ ${timeRange.end.format('YYYY-MM-DD')}`
  }, [timeRange, timePreset, t])
  const rangeStartStr = timeRange ? fmt(timeRange.start) : null
  const rangeEndStr = timeRange ? fmt(timeRange.end) : null
  const hoursOf = (t: GanttTask) => (rangeStartStr && rangeEndStr ? hoursInPeriod(t, rangeStartStr, rangeEndStr, data) : taskHours(t, data))

  /* ---------- 时间轴 ---------- */
  const days = useMemo(() => buildRange(data.groups, data, timeRange ?? undefined), [data, timeRange])
  const visibleDays = useMemo(
    () => (showWeekends ? days : days.filter(d => d.date.day() !== 0 && d.date.day() !== 6 || d.makeup)),
    [days, showWeekends],
  )
  /* 聚焦區間時日列自動鋪滿可用寬度（不留白）；全部檔保持基準密度橫滾 */
  const dayW = useMemo(() => {
    if (!timeRange || paneAvail <= 0 || visibleDays.length === 0) return colW
    return Math.max(colW, Math.floor(paneAvail / visibleDays.length))
  }, [timeRange, paneAvail, visibleDays.length, colW])
  const weeks = useMemo(() => {
    const out: { key: string; label: string; range: string; count: number }[] = []
    visibleDays.forEach(d => {
      const monday = d.date.subtract((d.date.day() + 6) % 7, 'day')
      const key = fmt(monday)
      const last = out[out.length - 1]
      if (last && last.key === key) last.count += 1
      else out.push({ key, label: weekName(out.length), range: `${monday.format('MM/DD')}–${monday.add(6, 'day').format('MM/DD')}`, count: 1 })
    })
    return out
  }, [visibleDays])

  /* ---------- 过滤 ---------- */
  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return data.groups
      .filter(g => groupFilter === 'all' || g.id === groupFilter)
      .map(g => {
        const groupHit = kw !== '' && g.title.toLowerCase().includes(kw)
        const tasks = g.tasks.filter(t => {
          if (statusFilter !== 'all' && taskStatus(t) !== statusFilter) return false
          if (planFilter !== 'all' && (t.planType ?? 'planned') !== planFilter) return false
          if (rangeStartStr && rangeEndStr) {
            // 時間篩選只作用於已排期任務；未排期在「全部」檔可見
            if (!overlaps(t, rangeStartStr, rangeEndStr)) return false
          }
          if (kw === '' || groupHit) return true
          return t.title.toLowerCase().includes(kw) || noteToText(t.note).toLowerCase().includes(kw)
        })
        return { ...g, tasks }
      })
      .filter(g => g.tasks.length > 0)
  }, [data.groups, keyword, statusFilter, planFilter, groupFilter, rangeStartStr, rangeEndStr])

  const stats = useMemo(() => {
    const tasks = filteredGroups.flatMap(g => g.tasks)
    const inRange = (d: string | null | undefined) => !!d && !!rangeStartStr && !!rangeEndStr && d >= rangeStartStr && d <= rangeEndStr
    // 周期檔三卡用期末快照（與匯報同源）；全部檔用當前狀態
    const done = rangeStartStr
      ? tasks.filter(t => inRange(doneAtOf(t))).length
      : tasks.filter(t => taskStatus(t) === 'done').length
    const doing = rangeStartStr
      ? tasks.filter(t => { const p = progressAt(t, rangeEndStr!); return p > 0 && p < 100 }).length
      : tasks.filter(t => taskStatus(t) === 'doing').length
    const pending = rangeStartStr
      ? tasks.filter(t => progressAt(t, rangeEndStr!) === 0).length
      : tasks.length - done - doing
    const inserted = tasks.filter(t => t.planType === 'inserted' && (rangeStartStr ? inRange(t.insertedAt ?? t.start) : true)).length
    const avg = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0
    const hours = tasks.reduce((s, t) => s + hoursOf(t), 0)
    return { total: tasks.length, done, doing, pending, inserted, avg, hours }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGroups, data, rangeStartStr, rangeEndStr])
  const filterKey = `${keyword}|${statusFilter}|${planFilter}|${groupFilter}|${timePreset}|${rangeStartStr}|${rangeEndStr}`

  /* ---------- 读取：服务端台账是唯一真源 ---------- */
  const reload = useCallback(async () => {
    try {
      const res = await fetchLedger(rangeStartStr ?? undefined, rangeEndStr ?? undefined)
      setData(res.data)
      setLoadError(null)
      if (res.data.groups.length === 0) {
        // 迁移向导：只在服务端为空且浏览器还存着旧台账时探一次，不弹窗不阻断
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          try {
            const legacy = JSON.parse(raw) as GanttData
            if (legacy?.groups?.length) setLocalBackup(legacy)
          } catch { /* 损坏的本地备份直接忽略 */ }
        }
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('cpm.gantt.loadFailed', { defaultValue: '台账載入失敗' }))
    } finally {
      setLoading(false)
    }
  }, [rangeStartStr, rangeEndStr, t])

  useEffect(() => { void reload() }, [reload])

  /* ---------- 变更：本地先行（拖动/输入要跟手），服务端落定后刷新 ---------- */
  const syncError = useCallback((e: unknown) => {
    message.error(e instanceof Error ? e.message : t('cpm.gantt.msg.syncFailed', { defaultValue: '保存失敗，請重試' }))
    void reload()
  }, [reload, t])

  const patchTask = (gid: string, tid: string, patch: Partial<GanttTask>) => {
    const origin = data.groups.find(g => g.id === gid)?.tasks.find(t => t.id === tid)
    if (!origin) return
    const merged: GanttTask = { ...origin, ...patch }
    if (patch.progress !== undefined && patch.progress !== origin.progress) {
      merged.history = [...(origin.history ?? []), { at: fmt(dayjs()), progress: patch.progress }]
    }
    setData(d => ({
      ...d,
      groups: d.groups.map(g => g.id !== gid ? g : { ...g, tasks: g.tasks.map(t => t.id === tid ? merged : t) }),
    }))
    void apiUpdateTask(Number(tid), {
      groupId: Number(gid),
      title: merged.title,
      start: merged.start,
      end: merged.end,
      progress: merged.progress,
      note: merged.note,
      planType: merged.planType ?? 'planned',
      insertedAt: merged.insertedAt ?? null,
    }).catch(syncError)
  }
  const patchGroup = (gid: string, patch: Partial<GanttGroup>) => {
    const origin = data.groups.find(g => g.id === gid)
    if (!origin) return
    setData(d => ({ ...d, groups: d.groups.map(g => g.id !== gid ? g : { ...g, ...patch }) }))
    if (patch.title !== undefined) {
      void apiUpdateGroup(Number(gid), { title: patch.title, hue: origin.hue }).catch(syncError)
    }
  }
  const addGroup = () => {
    void (async () => {
      try {
        const created = await apiCreateGroup({ title: t('cpm.gantt.newItemTitle', { defaultValue: '新工作項' }), hue: data.groups.length % GROUP_COLORS.length })
        await apiCreateTask({ groupId: created.id, title: t('cpm.gantt.subtaskN', { count: 1, defaultValue: '子任務 {{count}}' }), progress: 0 })
        await reload()
        setFreshId(String(created.id))
      } catch (e) { syncError(e) }
    })()
  }
  const addTask = (gid: string) => {
    void (async () => {
      try {
        const count = (data.groups.find(g => g.id === gid)?.tasks.length ?? 0) + 1
        const created = await apiCreateTask({
          groupId: Number(gid),
          title: t('cpm.gantt.subtaskN', { count, defaultValue: '子任務 {{count}}' }),
          progress: 0, planType: 'planned', insertedAt: null,
        })
        await reload()
        setFreshId(String(created.id))
      } catch (e) { syncError(e) }
    })()
  }
  /* 臨時插入標記：顯式人工標記、雙向可逆；insertedAt 預設今天 */
  const toggleInserted = (gid: string, task: GanttTask) => {
    const inserted = task.planType === 'inserted'
    patchTask(gid, task.id, inserted ? { planType: 'planned', insertedAt: null } : { planType: 'inserted', insertedAt: fmt(dayjs()) })
    message.success(inserted
      ? t('cpm.gantt.msg.planRestored', { defaultValue: '已恢復為原計劃' })
      : t('cpm.gantt.msg.insertedMarked', { date: fmt(dayjs()), defaultValue: '已標記臨時插入（{{date}}）' }))
  }
  const openNote = (g: GanttGroup, task: GanttTask) => setNoteTarget({ gid: g.id, tid: task.id, title: task.title, note: task.note })
  const offerUndo = (label: string, restore: () => void) => {
    undoRef.current = restore
    message.open({
      key: 'wg-undo',
      duration: 6,
      content: (
        <span>
          {label}
          <Button type="link" size="small" onClick={() => { undoRef.current?.(); undoRef.current = null; message.destroy('wg-undo') }}>{t('cpm.gantt.undo', { defaultValue: '撤銷' })}</Button>
        </span>
      ),
    })
  }
  const deleteTask = (g: GanttGroup, task: GanttTask) => {
    Modal.confirm({
      title: t('cpm.gantt.confirm.deleteTaskTitle', { defaultValue: '確定刪除該子任務？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('cpm.gantt.confirm.labelItem', { defaultValue: '工作項：' })}</span><b>{g.title}</b></div>
          <div className="confirm-info-row"><span>{t('cpm.gantt.confirm.labelTask', { defaultValue: '子任務：' })}</span><b>{task.title}</b></div>
        </div>
      ),
      okText: t('common.confirmDelete', { defaultValue: '確認刪除' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      okButtonProps: { danger: true },
      onOk: () => {
        const idx = g.tasks.findIndex(x => x.id === task.id)
        setData(d => ({ ...d, groups: d.groups.map(x => x.id !== g.id ? x : { ...x, tasks: x.tasks.filter(y => y.id !== task.id) }) }))
        void apiDeleteTask(Number(task.id)).catch(syncError)
        offerUndo(t('cpm.gantt.msg.taskDeleted', { defaultValue: '已刪除子任務。' }), () => {
          void (async () => {
            try {
              await apiRestoreTask(Number(task.id))
              setData(d => ({
                ...d,
                groups: d.groups.map(x => {
                  if (x.id !== g.id) return x
                  const tasks = [...x.tasks]
                  tasks.splice(Math.min(idx, tasks.length), 0, task)
                  return { ...x, tasks }
                }),
              }))
              await reload()
            } catch (e) { syncError(e) }
          })()
        })
      },
    })
  }
  const deleteGroup = (g: GanttGroup) => {
    Modal.confirm({
      title: t('cpm.gantt.confirm.deleteItemTitle', { defaultValue: '確定刪除整個工作項？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('cpm.gantt.confirm.labelItem', { defaultValue: '工作項：' })}</span><b>{g.title}</b></div>
          <div className="confirm-info-row">
            <span>{t('cpm.gantt.confirm.labelContains', { defaultValue: '包含：' })}</span>
            <b>{t('cpm.gantt.confirm.subtaskCount', { count: g.tasks.length, defaultValue: '{{count}} 個子任務，一併刪除' })}</b>
          </div>
        </div>
      ),
      okText: t('common.confirmDelete', { defaultValue: '確認刪除' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      okButtonProps: { danger: true },
      onOk: () => {
        const idx = data.groups.findIndex(x => x.id === g.id)
        setData(d => ({ ...d, groups: d.groups.filter(x => x.id !== g.id) }))
        void apiDeleteGroup(Number(g.id)).catch(syncError)
        offerUndo(t('cpm.gantt.msg.itemDeleted', { defaultValue: '已刪除工作項。' }), () => {
          void (async () => {
            try {
              await apiRestoreGroup(Number(g.id))
              setData(d => {
                const groups = [...d.groups]
                groups.splice(Math.min(idx, groups.length), 0, g)
                return { ...d, groups }
              })
              await reload()
            } catch (e) { syncError(e) }
          })()
        })
      },
    })
  }
  const reorder = (gid: string, fromId: string, toId: string) => {
    if (fromId === toId) return
    setData(d => ({
      ...d,
      groups: d.groups.map(g => {
        if (g.id !== gid) return g
        const tasks = [...g.tasks]
        const from = tasks.findIndex(t => t.id === fromId)
        const to = tasks.findIndex(t => t.id === toId)
        if (from < 0 || to < 0) return g
        const [moved] = tasks.splice(from, 1)
        tasks.splice(to, 0, moved)
        return { ...g, tasks }
      }),
    }))
    // 子任务行序就是用户拖出来的事实：服务端按条目 id 顺序重排，不依赖前端临时 id
    const group = data.groups.find(g => g.id === gid)
    if (group) {
      const next = [...group.tasks]
      const from = next.findIndex(t => t.id === fromId)
      const to = next.findIndex(t => t.id === toId)
      if (from >= 0 && to >= 0) {
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        void apiReorderGroups(next.map(t => Number(t.id))).catch(syncError)
      }
    }
  }
  const commitStart = (g: GanttGroup, task: GanttTask, val: string | null) => {
    const patch: Partial<GanttTask> = { start: val }
    if (val && task.end && task.end < val) patch.end = val
    patchTask(g.id, task.id, patch)
  }
  const commitEnd = (g: GanttGroup, task: GanttTask, val: string | null) => {
    if (val && task.start && val < task.start) {
      message.warning(t('cpm.gantt.msg.endBeforeStart', { defaultValue: '結束日期不能早於開始日期，已對齊開始日期' }))
      patchTask(g.id, task.id, { end: task.start })
      return
    }
    patchTask(g.id, task.id, { end: val })
  }
  const scrollToToday = (smooth = true) => {
    const idx = visibleDays.findIndex(d => d.today)
    const el = scrollRef.current
    if (idx < 0 || !el) return
    // jsdom / 不支持滚动 API 的环境里没有 Element.scrollTo：以前直接调用会让整页在测试里炸掉，
    // 现在只放弃定位（本来也只是首屏体验优化），不影响台账渲染
    if (typeof el.scrollTo !== 'function') return
    const leftEl = el.querySelector('.wg-left')
    const sticky = leftEl ? getComputedStyle(leftEl).position === 'sticky' : true
    const leftW = leftEl ? leftEl.getBoundingClientRect().width : LEFT_W
    el.scrollTo({ left: Math.max(0, (sticky ? 0 : leftW) + idx * dayW - 60), behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    const raf = requestAnimationFrame(() => scrollToToday(false))
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 量取甘特可用寬度（容器寬 − 左欄寬），供聚焦區間鋪滿日列。
   * 每次提交後都重量：收合/预设切换/筛选/数据变化都会重排左栏或轴线，
   * 只在少數幾個 state 上挂依赖曾導致 paneAvail 陳舊、日列縮回基準寬右側留白。
   * setPaneAvail 带容差守衛，值不變不重渲染，不會成環。 */
  const measurePane = () => {
    const el = scrollRef.current
    if (!el) return
    const left = el.querySelector('.wg-left')
    const lw = left ? left.getBoundingClientRect().width : 0
    const next = Math.max(0, el.clientWidth - lw)
    setPaneAvail(v => (Math.abs(v - next) > 1 ? next : v))
  }
  useLayoutEffect(() => { measurePane() })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(measurePane)
    ro.observe(el)
    window.addEventListener('resize', measurePane)
    return () => { ro.disconnect(); window.removeEventListener('resize', measurePane) }
  }, [])

  /* ---------- 导出：长图 PNG / A4 PDF / CSV ---------- */
  const runExport = async (kind: DocumentExportKind | 'csv') => {
    if (kind === 'csv') {
      exportCsv(filteredGroups, data)
      message.success(t('cpm.gantt.msg.csvDone', { defaultValue: '已導出 CSV，Excel 可直接打開' }))
      return
    }
    const src = sheetRef.current
    if (!src) { message.warning(t('cpm.gantt.msg.sheetNotReady', { defaultValue: '台账尚未載入' })); return }
    setExportBusy(kind)
    // 离屏克隆展开滚动区：截整张台账（全部周列 + 全部行），不动真实 DOM
    const host = document.createElement('div')
    host.className = 'wg-capture-host'
    const clone = src.cloneNode(true) as HTMLElement
    host.appendChild(clone)
    document.body.appendChild(host)
    try {
      const fileBase = t('cpm.gantt.export.fileBase', { date: fmt(dayjs()), defaultValue: '我的工作記錄_{{date}}' })
      await exportDocument(clone, kind, fileBase, { alias: 'cpm-worklog-gantt', fallbackName: 'worklog' })
      message.success(kind === 'image'
        ? t('cpm.gantt.export.imageDone', { defaultValue: '已下載當前台账的長圖快照' })
        : t('cpm.gantt.export.pdfDone', { defaultValue: '已下載當前台账的 A4 分頁 PDF' }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('cpm.gantt.export.failed', { defaultValue: '導出失敗，請重試' }))
    } finally {
      host.remove()
      setExportBusy(null)
    }
  }
  const exportItems: MenuProps['items'] = [
    { key: 'image', icon: <FileImageOutlined />, label: t('cpm.export.image', { defaultValue: '長圖圖片（PNG）' }) },
    { key: 'pdf', icon: <FilePdfOutlined />, label: t('cpm.export.pdf', { defaultValue: 'PDF 文件（A4 分頁）' }) },
    { key: 'csv', icon: <FileExcelOutlined />, label: t('cpm.gantt.export.csv', { defaultValue: 'Excel 表格（CSV）' }) },
  ]

  const applySearch = () => setKeyword(keywordDraft)
  const resetSearch = () => { setKeywordDraft(''); setKeyword(''); setStatusFilter('all'); setPlanFilter('all'); setGroupFilter('all') }

  /* ---------- 列表模式排序 ---------- */
  const toggleSort = (key: 'start' | 'progress' | 'hours') => {
    setSort(s => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }))
  }
  const sortedGroups = useMemo(() => {
    if (!sort.key) return filteredGroups
    const key = sort.key
    const val = (t: GanttTask): string | number => (key === 'start' ? (t.start ?? '9999-12-31') : key === 'progress' ? t.progress : hoursOf(t))
    return filteredGroups.map(g => ({
      ...g,
      tasks: [...g.tasks].sort((a, b) => { const va = val(a); const vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir }),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredGroups, sort, rangeStartStr, rangeEndStr, data])
  const displayGroups = viewMode === 'list' ? sortedGroups : filteredGroups

  const statCards = [
    { label: t('cpm.gantt.stat.avg', { defaultValue: '項目平均進度' }), value: stats.avg, suffix: t('cpm.gantt.suffix.percent', { defaultValue: '%' }), icon: <DashboardOutlined />, color: 'var(--brand)', bg: 'var(--brand-soft)', title: t('cpm.gantt.stat.avgTip', { defaultValue: '區間內任務的當前平均進度' }) },
    { label: rangeStartStr ? t('cpm.gantt.stat.doneInPeriod', { defaultValue: '本期完成' }) : t('cpm.status.done', { defaultValue: '已完成' }), value: stats.done, suffix: t('cpm.gantt.suffix.item', { defaultValue: ' 項' }), icon: <CheckCircleOutlined />, color: 'var(--success)', bg: 'var(--success-soft)', title: rangeStartStr ? t('cpm.gantt.stat.doneTip', { defaultValue: '完成時點落在查詢區間（與匯報同口徑）' }) : t('cpm.gantt.stat.doneNowTip', { defaultValue: '當前狀態為已完成' }) },
    { label: t('cpm.status.doing', { defaultValue: '進行中' }), value: stats.doing, suffix: t('cpm.gantt.suffix.item', { defaultValue: ' 項' }), icon: <SyncOutlined />, color: 'var(--info)', bg: 'var(--info-soft)', title: rangeStartStr ? t('cpm.gantt.stat.doingTip', { defaultValue: '期末進度 1–99%' }) : t('cpm.gantt.stat.doingNowTip', { defaultValue: '當前狀態為進行中' }) },
    { label: rangeStartStr ? t('cpm.gantt.stat.pendingStart', { defaultValue: '待啟動' }) : t('cpm.gantt.stat.pendingNow', { defaultValue: '待完成' }), value: stats.pending, suffix: t('cpm.gantt.suffix.item', { defaultValue: ' 項' }), icon: <ClockCircleOutlined />, color: 'var(--warning)', bg: 'var(--warning-soft)', title: rangeStartStr ? t('cpm.gantt.stat.pendingTip', { defaultValue: '期末進度 0%' }) : t('cpm.gantt.stat.pendingNowTip', { defaultValue: '當前狀態為待處理/待排期' }) },
    { label: t('cpm.gantt.stat.hours', { defaultValue: '總耗時（工作日口徑）' }), value: stats.hours, suffix: ' h', icon: <FieldTimeOutlined />, color: 'var(--purple)', bg: 'var(--purple-soft)', title: t('cpm.gantt.stat.hoursTip', { defaultValue: '區間交集工作日 × 8h' }) },
    { label: t('cpm.gantt.plan.inserted', { defaultValue: '臨時插入' }), value: stats.inserted, suffix: t('cpm.gantt.suffix.item', { defaultValue: ' 項' }), icon: <ThunderboltOutlined />, color: 'var(--warning-deep)', bg: 'var(--warning-soft)', title: rangeStartStr ? t('cpm.gantt.stat.insertedTip', { defaultValue: '插入時點落在查詢區間' }) : t('cpm.gantt.stat.insertedAllTip', { defaultValue: '全部標記為臨時插入的工作項' }) },
  ]

  return (
    <div>
      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }}
          message={t('cpm.gantt.loadFailed', { defaultValue: '台账載入失敗' })} description={loadError}
          action={<Button size="small" onClick={() => void reload()}>{t('cpm.sourceImport.retry', { defaultValue: '重試' })}</Button>} />
      )}
      {/* 搜索區：單排彈性布局，自定義區間出現時把查詢/重置往後擠 */}
      <div className="search-section wg-search">
        <Form layout="inline" onFinish={applySearch}>
          <Form.Item label={t('cpm.gantt.search.keyword', { defaultValue: '關鍵詞' })}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--text-3)' }} />}
              placeholder={t('cpm.gantt.search.keywordPlaceholder', { defaultValue: '工作項 / 子任務 / 備註' })}
              value={keywordDraft}
              onChange={e => { setKeywordDraft(e.target.value); if (!e.target.value) setKeyword('') }}
              onPressEnter={applySearch}
            />
          </Form.Item>
          <Form.Item label={t('cpm.gantt.search.status', { defaultValue: '狀態' })}>
            <Select
              value={statusFilter}
              onChange={v => setStatusFilter(v)}
              options={[
                { value: 'all', label: t('cpm.gantt.search.allStatus', { defaultValue: '全部狀態' }) },
                ...(Object.keys(TASK_STATUS_META) as TaskStatus[]).map(s => ({ value: s, label: TASK_STATUS_META[s].label })),
              ]}
            />
          </Form.Item>
          <Form.Item label={t('cpm.gantt.search.plan', { defaultValue: '計劃屬性' })}>
            <Select
              value={planFilter}
              onChange={v => setPlanFilter(v)}
              options={[
                { value: 'all', label: t('cpm.gantt.search.allPlan', { defaultValue: '全部屬性' }) },
                { value: 'planned', label: t('cpm.gantt.plan.planned', { defaultValue: '原計劃' }) },
                { value: 'inserted', label: t('cpm.gantt.plan.inserted', { defaultValue: '臨時插入' }) },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('cpm.gantt.col.item', { defaultValue: '工作項' })}>
            <Select
              className="wg-select-group"
              value={groupFilter}
              onChange={v => setGroupFilter(v)}
              options={[{ value: 'all', label: t('cpm.gantt.search.allItem', { defaultValue: '全部工作項' }) }, ...data.groups.map(g => ({ value: g.id, label: g.title }))]}
            />
          </Form.Item>
          <Form.Item label={t('cpm.gantt.search.cycle', { defaultValue: '工作週期' })} className="wg-item-cycle">
            <div className="wg-cycle-row">
              <div className="wg-time-field">
                <Segmented
                  value={timePreset}
                  onChange={v => { setTimePreset(v as typeof timePreset); setPeriodOffset(0); if (v !== 'custom') setCustomRange(null) }}
                  options={[
                    { label: t('cpm.gantt.preset.lastWeek', { defaultValue: '上週' }), value: 'lastWeek' },
                    { label: t('cpm.gantt.preset.week', { defaultValue: '本週' }), value: 'week' },
                    { label: t('cpm.gantt.preset.lastMonth', { defaultValue: '上月' }), value: 'lastMonth' },
                    { label: t('cpm.gantt.preset.month', { defaultValue: '本月' }), value: 'month' },
                    { label: t('common.all', { defaultValue: '全部' }), value: 'all' },
                    { label: t('cpm.gantt.preset.custom', { defaultValue: '自定義' }), value: 'custom' },
                  ]}
                />
                <span className="wg-periodnav">
                  <Button size="small" icon={<LeftOutlined />} disabled={!timeRange} onClick={() => setPeriodOffset(o => o - 1)} aria-label={t('cpm.gantt.period.prev', { defaultValue: '上一期' })} />
                  <Button size="small" icon={<RightOutlined />} disabled={!timeRange} onClick={() => setPeriodOffset(o => o + 1)} aria-label={t('cpm.gantt.period.next', { defaultValue: '下一期' })} />
                  {periodOffset !== 0 && (
                    <Button size="small" type="link" onClick={() => setPeriodOffset(0)}>{t('cpm.gantt.period.back', { defaultValue: '回本期' })}</Button>
                  )}
                </span>
                {timePreset === 'custom' && (
                  <DatePicker.RangePicker style={{ width: 260 }} value={customRange} onChange={v => { setCustomRange(v); setPeriodOffset(0) }} allowClear={false} />
                )}
                <span className="wg-rangechip"><CalendarOutlined />{rangeLabel}</span>
              </div>
              <span className="wg-search-btns">
                <Button type="primary" icon={<SearchOutlined />} onClick={applySearch}>{t('common.search', { defaultValue: '查詢' })}</Button>
                <Button icon={<ReloadOutlined />} onClick={resetSearch}>{t('common.reset', { defaultValue: '重置' })}</Button>
              </span>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 統計卡片：§B.7 三段式動效卡，搜索區下方，key 觸發計數動畫 */}
      <div className="wg-stats" key={filterKey}>
        {statCards.map(c => (
          <div key={c.label} className="wg-stat" style={{ '--stat-color': c.color, '--stat-bg': c.bg } as CSSProperties}>
            <div className="wg-stat__icon">{c.icon}</div>
            <div className="wg-stat__num"><AnimatedNumber value={c.value} suffix={c.suffix} /></div>
            <div className="wg-stat__label" title={c.title}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 操作區：功能全左、新增右（時間查詢已移入搜索區） */}
      <div className="action-section wg-actions">
        <div className="wg-actions__row">
            <Button type="primary" icon={<PlusOutlined />} onClick={addGroup}>{t('cpm.gantt.action.addItem', { defaultValue: '新增工作項' })}</Button>
            <Tooltip title={t('cpm.gantt.action.ganttSwitchTip', { defaultValue: '開啟顯示甘特圖，關閉切換為列表' })}>
              <Switch
                checked={viewMode === 'gantt'}
                onChange={c => setViewMode(c ? 'gantt' : 'list')}
                checkedChildren={t('cpm.gantt.action.gantt', { defaultValue: '甘特' })}
                unCheckedChildren={t('cpm.gantt.action.list', { defaultValue: '列表' })}
              />
            </Tooltip>
            {viewMode === 'gantt' && (
              <>
                <Button
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed(c => !c)}
                >{collapsed ? t('cpm.gantt.action.expandLeft', { defaultValue: '展開左欄' }) : t('cpm.gantt.action.collapseLeft', { defaultValue: '收合左欄' })}</Button>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {t('cpm.gantt.action.showWeekends', { defaultValue: '顯示周末' })} <Switch size="small" checked={showWeekends} onChange={setShowWeekends} />
                </span>
                <Select
                  size="small"
                  style={{ width: 96 }}
                  value={colW}
                  onChange={v => setColW(v)}
                  options={[
                    { value: 26, label: t('cpm.gantt.density.compact', { defaultValue: '緊湊' }) },
                    { value: 34, label: t('cpm.gantt.density.standard', { defaultValue: '標準' }) },
                    { value: 44, label: t('cpm.gantt.density.loose', { defaultValue: '寬鬆' }) },
                  ]}
                />
                <Button size="small" icon={<AimOutlined />} onClick={() => scrollToToday()}>{t('cpm.gantt.action.today', { defaultValue: '回到今天' })}</Button>
              </>
            )}
            <Dropdown trigger={['click']} disabled={!!exportBusy} menu={{ items: exportItems, onClick: ({ key }) => void runExport(key as DocumentExportKind | 'csv') }}>
              <Button className="btn-export" icon={<DownloadOutlined />} loading={!!exportBusy}>{t('common.export', { defaultValue: '導出' })}</Button>
            </Dropdown>
            <Button icon={<CalendarOutlined />} onClick={() => navigate('/cpm-holiday')}>{t('cpm.holiday.menu', { defaultValue: '節假日配置' })}</Button>
        </div>
      </div>

      {/* 台账主体 */}
      {loading ? (
        <div className="wg-empty">
          <h3>{t('cpm.gantt.loading', { defaultValue: '台账加載中…' })}</h3>
          <p>{t('cpm.gantt.loadingDesc', { defaultValue: '數據來自服務端台账，工時按工作日口徑計算。' })}</p>
        </div>
      ) : data.groups.length === 0 ? (
        <div className="wg-empty">
          <EmptyArt />
          <h3>{t('cpm.gantt.empty.title', { defaultValue: '還沒有工作項台账' })}</h3>
          <p>{t('cpm.gantt.empty.desc', { defaultValue: '新增一個工作項標題，拆分子任務並排期，甘特圖會按工作日自動鋪開。' })}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={addGroup}>{t('cpm.gantt.action.addItem', { defaultValue: '新增工作項' })}</Button>
            {/* 一次性迁移通道：服务端为空且浏览器还存着旧台账才出现，导入后改名备份而不是直接删 */}
            {localBackup && (
              <Button icon={<ImportOutlined />} loading={importing} onClick={() => {
                setImporting(true)
                void importLocalLedger(toImportPayload(localBackup))
                  .then(async () => {
                    message.success(t('cpm.gantt.import.done', {
                      count: localBackup.groups.length, defaultValue: '已導入本地台账（{{count}} 個工作項）',
                    }))
                    localStorage.setItem(`${STORAGE_KEY}.imported`, JSON.stringify(localBackup))
                    localStorage.removeItem(STORAGE_KEY)
                    setLocalBackup(null)
                    await reload()
                  })
                  .catch(syncError)
                  .finally(() => setImporting(false))
              }}>{t('cpm.gantt.import.button', { defaultValue: '導入本地台账' })}</Button>
            )}
          </div>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="wg-empty">
          <h3>{t('cpm.gantt.emptyFiltered.title', { defaultValue: '沒有符合條件的記錄' })}</h3>
          <p>{t('cpm.gantt.emptyFiltered.desc', { defaultValue: '調整關鍵詞或狀態篩選，或清除篩選查看全部工作項。' })}</p>
          <Button onClick={resetSearch}>{t('cpm.gantt.emptyFiltered.clear', { defaultValue: '清除篩選' })}</Button>
        </div>
      ) : (
        <div className={`wg-sheet${collapsed && viewMode === 'gantt' ? ' wg-sheet--collapsed' : ''}${viewMode === 'list' ? ' wg-sheet--list' : ''}`} ref={sheetRef}>
          <div className="wg-scroll" ref={scrollRef}>
            <div className="wg-body">
              {/* 左側冻结窗格（可收合） */}
              <div className="wg-left">
                <div className="wg-lhead">
                  {([
                    [t('cpm.gantt.col.item', { defaultValue: '工作項' }), 'var(--wg-req)', 'wg-h--req'],
                    [t('cpm.gantt.col.task', { defaultValue: '任務子項' }), 'var(--wg-task)', 'wg-h--task'],
                    [t('cpm.gantt.col.start', { defaultValue: '開始日期' }), 'var(--wg-date)', 'wg-h--start'],
                    [t('cpm.gantt.col.end', { defaultValue: '結束日期' }), 'var(--wg-date)', 'wg-h--end'],
                    [t('cpm.gantt.col.hours', { defaultValue: '耗時' }), 'var(--wg-hours)', 'wg-h--hours'],
                    [t('cpm.gantt.col.progress', { defaultValue: '當前進度' }), 'var(--wg-prog)', 'wg-h--prog'],
                    /* 列名用公共层的 common.colStatus（与其他列表页表头同一词），不另造重复词条 */
                    [t('common.colStatus', { defaultValue: '狀態' }), 'var(--wg-status)', 'wg-h--status'],
                    [t('cpm.gantt.col.note', { defaultValue: '備註原因' }), 'var(--wg-note)', 'wg-h--note'],
                  ] as const).map(([label, w, cls]) => {
                    const sortKey = cls === 'wg-h--start' ? 'start' as const : cls === 'wg-h--prog' ? 'progress' as const : cls === 'wg-h--hours' ? 'hours' as const : null
                    const sortable = sortKey !== null && viewMode === 'list'
                    return (
                      <div
                        key={label}
                        className={`wg-lhead__cell ${cls}${sortable ? ' wg-h--sortable' : ''}`}
                        style={{ width: w }}
                        onClick={sortable && sortKey ? () => toggleSort(sortKey) : undefined}
                      >
                        {label}
                        {sortable && sort.key === sortKey && (sort.dir === 1 ? <CaretUpOutlined /> : <CaretDownOutlined />)}
                      </div>
                    )
                  })}
                </div>
                {displayGroups.map(g => (
                  <div key={g.id} className="wg-group" style={{ '--group-color': GROUP_COLORS[g.hue % GROUP_COLORS.length] } as CSSProperties}>
                    <div className="wg-req">
                      <div className="wg-req__title">
                        <InlineText value={g.title} autoEdit={freshId === g.id} onSave={v => patchGroup(g.id, { title: v })} />
                      </div>
                      <div className="wg-req__ops">
                        <Tooltip title={t('cpm.gantt.req.addTask', { defaultValue: '添加子任務' })}>
                          <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addTask(g.id)} />
                        </Tooltip>
                        <Tooltip title={t('cpm.gantt.req.deleteItem', { defaultValue: '刪除工作項' })}>
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteGroup(g)} />
                        </Tooltip>
                      </div>
                    </div>
                    <div className="wg-rows">
                      {g.tasks.map(t => (
                        <LeftRow
                          key={t.id}
                          group={g}
                          task={t}
                          data={data}
                          hover={hoverId === t.id}
                          onHover={setHoverId}
                          fresh={freshId === t.id}
                          dropTarget={dropId === t.id}
                          onDropTarget={setDropId}
                          onReorder={(from, to) => reorder(g.id, from, to)}
                          onPatch={patch => patchTask(g.id, t.id, patch)}
                          onStart={v => commitStart(g, t, v)}
                          onEnd={v => commitEnd(g, t, v)}
                          onDelete={() => deleteTask(g, t)}
                          onEditNote={() => openNote(g, t)}
                          onToggleInserted={() => toggleInserted(g.id, t)}
                        />
                      ))}
                      <div className="wg-addrow">
                        <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addTask(g.id)}>{t('cpm.gantt.req.addTask', { defaultValue: '添加子任務' })}</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* 右側時間軸 */}
              <div className="wg-right" style={{ width: visibleDays.length * dayW }}>
                <div className="wg-rhead">
                  <div className="wg-weeks">
                    {weeks.map(w => (
                      <div key={w.key} className="wg-week" style={{ width: w.count * dayW }}>
                        {w.label}<small>{w.range}</small>
                      </div>
                    ))}
                  </div>
                  <div className="wg-days">
                    {visibleDays.map(d => (
                      <div
                        key={d.key}
                        className={`wg-day${d.rest ? ' wg-day--rest' : ''}${d.today ? ' wg-day--today' : ''}`}
                        style={{ width: dayW }}
                      >
                        <b>{d.date.date()}</b>
                        <small>{d.today ? t('cpm.gantt.badge.today', { defaultValue: '今' }) : d.holiday || d.compOff ? dayBadge('holiday') : d.leave ? dayBadge('leave') : d.makeup ? dayBadge('makeup') : weekdayShort(d.date.day())}</small>
                      </div>
                    ))}
                  </div>
                </div>
                {displayGroups.map(g => (
                  <div key={g.id} className="wg-group-r">
                    {g.tasks.map(t => (
                      <RightRow
                        key={t.id}
                        group={g}
                        task={t}
                        data={data}
                        days={visibleDays}
                        colW={dayW}
                        hover={hoverId === t.id}
                        onHover={setHoverId}
                        drag={drag}
                        onDrag={setDrag}
                        scrollRef={scrollRef}
                        onPatch={patch => patchTask(g.id, t.id, patch)}
                        onStart={v => commitStart(g, t, v)}
                        onEnd={v => commitEnd(g, t, v)}
                        onSchedule={key => patchTask(g.id, t.id, { start: key, end: key })}
                        onEditNote={() => openNote(g, t)}
                        onToggleInserted={() => toggleInserted(g.id, t)}
                      />
                    ))}
                    <div className="wg-addrow-r" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="wg-tabbar">
            <span className="wg-tabbar__left">
              <Popover
                trigger="click"
                placement="topLeft"
                title={t('cpm.gantt.caliber.title', { defaultValue: '工作日口徑' })}
                content={(
                  <div className="wg-caliber-pop">
                    <p>{t('cpm.gantt.caliber.p1', { hours: HOURS_PER_DAY, defaultValue: '耗時 = 區間工作日 × {{hours}}h；周末與節假日自動剔除，調休上班計入，請假/調休不計。' })}</p>
                    <p>{t('cpm.gantt.caliber.p2', { defaultValue: '點擊色條看詳情/改進度 · 拖拽色塊移動 · 拉伸右緣改結束 · 雙擊格子排期 · 行首手柄拖拽排序。' })}</p>
                    <p>{t('cpm.gantt.caliber.p3', { defaultValue: '虛線邊＋「插」角標＝臨時插入工作項；行內 ⚡ 可標記/取消。' })}</p>
                  </div>
                )}
              >
                <button type="button" className="wg-caliber-chip"><InfoCircleOutlined />{t('cpm.gantt.caliber.title', { defaultValue: '工作日口徑' })}</button>
              </Popover>
              <span className="wg-legend">
                {PROGRESS_BANDS.map(b => (
                  <span key={b.label} className="wg-legend__item"><i style={{ background: b.color }} />{b.label}</span>
                ))}
                <span className="wg-legend__item"><i className="wg-lg-inserted" />{t('cpm.gantt.plan.inserted', { defaultValue: '臨時插入' })}</span>
              </span>
            </span>
            <span>
              {t('cpm.gantt.tabbar.summary', {
                tasks: stats.total, workdays: visibleDays.filter(d => !d.rest).length,
                defaultValue: '{{tasks}} 個子任務 · {{workdays}} 個工作日',
              })}
            </span>
          </div>
        </div>
      )}
      <NoteEditorModal
        target={noteTarget}
        onClose={() => setNoteTarget(null)}
        onSave={html => { if (noteTarget) patchTask(noteTarget.gid, noteTarget.tid, { note: html }) }}
      />
    </div>
  )
}

/* ==================== 行內標題編輯 ==================== */

function InlineText({ value, onSave, autoEdit, done }: { value: string; onSave: (v: string) => void; autoEdit?: boolean; done?: boolean }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (autoEdit) { setDraft(value); setEditing(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])
  const commit = () => {
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    setEditing(false)
  }
  if (editing) {
    return (
      <Input
        size="small"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onPressEnter={commit}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        onClick={e => e.stopPropagation()}
        maxLength={60}
      />
    )
  }
  return (
    <span
      className={`wg-inline${done ? ' wg-task__title--done' : ''}`}
      title={t('cpm.gantt.inline.clickToEdit', { defaultValue: '點擊修改' })}
      onClick={e => { e.stopPropagation(); setDraft(value); setEditing(true) }}
    >
      {value}
    </span>
  )
}

/* ==================== 左側行 ==================== */

interface LeftRowProps {
  group: GanttGroup
  task: GanttTask
  data: GanttData
  hover: boolean
  onHover: (id: string | null) => void
  fresh: boolean
  dropTarget: boolean
  onDropTarget: (id: string | null) => void
  onReorder: (from: string, to: string) => void
  onPatch: (patch: Partial<GanttTask>) => void
  onStart: (v: string | null) => void
  onEnd: (v: string | null) => void
  onDelete: () => void
  onEditNote: () => void
  onToggleInserted: () => void
}

function LeftRow({ group, task, data, hover, onHover, fresh, dropTarget, onDropTarget, onReorder, onPatch, onStart, onEnd, onDelete, onEditNote, onToggleInserted }: LeftRowProps) {
  const { t } = useTranslation()
  const status = taskStatus(task)
  const hours = taskHours(task, data)
  const wd = workdayCount(task.start, task.end, data)
  const color = progressColor(task.progress)
  return (
    <div
      className={`wg-row${hover ? ' is-hover' : ''}${dropTarget ? ' wg-row--drop' : ''}`}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
      onDragOver={e => {
        if (e.dataTransfer.types.includes('text/wg-task')) { e.preventDefault(); onDropTarget(task.id) }
      }}
      onDrop={e => {
        const raw = e.dataTransfer.getData('text/wg-task')
        onDropTarget(null)
        if (!raw) return
        e.preventDefault()
        const payload = JSON.parse(raw) as { gid: string; tid: string }
        if (payload.gid === group.id) onReorder(payload.tid, task.id)
      }}
    >
      <div className="wg-c wg-c--task">
        <HolderOutlined
          className="wg-task__grip"
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('text/wg-task', JSON.stringify({ gid: group.id, tid: task.id }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => onDropTarget(null)}
        />
        <span className="wg-task__title">
          <InlineText value={task.title} autoEdit={fresh} done={status === 'done'} onSave={v => onPatch({ title: v })} />
        </span>
        {task.planType === 'inserted' && (
          <Tooltip title={t('cpm.gantt.insert.tagTip', { date: task.insertedAt ?? t('cpm.gantt.insert.noDate', { defaultValue: '日期未記' }), defaultValue: '臨時插入・{{date}}' })}>
            <Tag color="volcano" className="wg-insert-tag">{t('cpm.gantt.insert.tag', { defaultValue: '臨時' })}</Tag>
          </Tooltip>
        )}
        <span className="wg-row__ops">
          <Tooltip title={task.planType === 'inserted' ? t('cpm.gantt.insert.unmarkTip', { defaultValue: '取消臨時插入標記' }) : t('cpm.gantt.insert.markTip', { defaultValue: '標記為臨時插入' })}>
            <Button type="link" size="small" icon={<ThunderboltOutlined />} onClick={onToggleInserted} />
          </Tooltip>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} />
        </span>
      </div>
      <div className="wg-c wg-c--start">
        <DateCell value={task.start} onCommit={onStart} />
      </div>
      <div className="wg-c wg-c--end">
        <DateCell value={task.end} onCommit={onEnd} />
      </div>
      <div className="wg-c wg-c--hours">
        {task.start && task.end ? (
          <Tooltip title={t('cpm.gantt.hours.tip', { days: wd, hours: HOURS_PER_DAY, defaultValue: '{{days}} 個工作日 × {{hours}}h（周末/節假日不計）' })}>
            <span>{t('cpm.gantt.hours.value', { hours, defaultValue: '{{hours}}小時' })}</span>
          </Tooltip>
        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
      </div>
      <Popover
        trigger="click"
        placement="bottom"
        content={(
          <div style={{ width: 250 }}>
            <Slider
              value={task.progress}
              onChange={v => onPatch({ progress: v as number })}
              marks={{ 0: '0', 50: '50', 100: '100' }}
            />
            <ProgressChips value={task.progress} onPick={p => onPatch({ progress: p })} />
          </div>
        )}
      >
        <div className="wg-c wg-c--prog" style={{ '--prog-color': color } as CSSProperties}>
          <div className="wg-prog-track">
            <div className="wg-prog-fill" style={{ width: `${task.progress}%` }} />
          </div>
          <span className="wg-prog-num">{task.progress}%</span>
        </div>
      </Popover>
      <div className="wg-c wg-c--status">
        <Tooltip title={t('cpm.gantt.status.deriveTip', { defaultValue: '由進度自動判定：100% 已完成；1–99% 進行中；0% 待處理；未排期為待排期' })}>
          <Tag color={TASK_STATUS_META[status].tag} style={{ marginInlineEnd: 0 }}>{TASK_STATUS_META[status].label}</Tag>
        </Tooltip>
      </div>
      {task.note ? (
        <Popover
          trigger="hover"
          placement="bottomLeft"
          mouseEnterDelay={0.35}
          content={<div className="wg-note-hover" dangerouslySetInnerHTML={{ __html: noteToDisplayHtml(task.note) }} />}
        >
          <div className="wg-c wg-c--note" onClick={onEditNote}>
            <span className="wg-note-text" dangerouslySetInnerHTML={{ __html: noteToDisplayHtml(task.note) }} />
          </div>
        </Popover>
      ) : (
        <div className="wg-c wg-c--note" onClick={onEditNote}>
          <span className="wg-note-text wg-note-text--empty">{t('cpm.gantt.note.clickToFill', { defaultValue: '點擊填寫' })}</span>
        </div>
      )}
    </div>
  )
}

/** 0/25/50/75/100 快捷檔位（圖4 樣式） */
function ProgressChips({ value, onPick }: { value: number; onPick: (p: number) => void }) {
  return (
    <div className="wg-chips">
      {[0, 25, 50, 75, 100].map(p => (
        <button key={p} type="button" className={`wg-chip${value === p ? ' wg-chip--active' : ''}`} onClick={() => onPick(p)}>
          {p}%
        </button>
      ))}
    </div>
  )
}

function DateCell({ value, onCommit }: { value: string | null; onCommit: (v: string | null) => void }) {
  const { t } = useTranslation()
  // 單擊直接展開日期面板（borderless DatePicker 即单元格本身），不再二次點擊
  return (
    <DatePicker
      className={`wg-datepick${value ? '' : ' wg-datepick--empty'}`}
      variant="borderless"
      size="small"
      value={value ? dayjs(value) : null}
      onChange={d => onCommit(d ? fmt(d) : null)}
      allowClear
      placeholder={t('cpm.gantt.date.schedule', { defaultValue: '排期' })}
      format="YYYY-MM-DD"
      suffixIcon={null}
    />
  )
}

/* ==================== 右側甘特行：連續圆角色條 ==================== */

interface RightRowProps {
  group: GanttGroup
  task: GanttTask
  data: GanttData
  days: DayCell[]
  colW: number
  hover: boolean
  onHover: (id: string | null) => void
  drag: DragState | null
  onDrag: (d: DragState | null) => void
  scrollRef: RefObject<HTMLDivElement | null>
  onPatch: (patch: Partial<GanttTask>) => void
  onStart: (v: string | null) => void
  onEnd: (v: string | null) => void
  onSchedule: (key: string) => void
  onEditNote: () => void
  onToggleInserted: () => void
}

function RightRow({ group, task, data, days, colW, hover, onHover, drag, onDrag, scrollRef, onPatch, onStart, onEnd, onSchedule, onEditNote, onToggleInserted }: RightRowProps) {
  const { t } = useTranslation()
  const startXRef = useRef(0)
  const movedRef = useRef(false)
  const [popOpen, setPopOpen] = useState(false)
  const status = taskStatus(task)
  const dragging = drag !== null && drag.taskId === task.id
  const pStart = dragging ? shiftDate(drag.originStart, drag.mode === 'move' ? drag.delta : 0) : task.start
  const pEnd = dragging ? shiftDate(drag.originEnd, drag.delta) : task.end

  const span = useMemo(() => {
    if (!pStart || !pEnd) return null
    // 色条只铺工作日：整段落在節假日/請假/周末时隐藏，跨休息日时裁剪到首尾工作日
    let first = -1
    let last = -1
    days.forEach((d, i) => {
      if (!d.rest && d.key >= pStart && d.key <= pEnd) {
        if (first < 0) first = i
        last = i
      }
    })
    return first < 0 ? null : { first, last }
  }, [days, pStart, pEnd])

  const beginDrag = (e: RPointerEvent<HTMLSpanElement>, mode: 'move' | 'resize') => {
    if (!task.start || !task.end) return
    e.stopPropagation()
    e.preventDefault()
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* 合成事件無活躍指針時忽略 */ }
    startXRef.current = e.clientX
    movedRef.current = false
    onDrag({ groupId: group.id, taskId: task.id, mode, delta: 0, originStart: task.start, originEnd: task.end })
  }
  const moveDrag = (e: RPointerEvent<HTMLSpanElement>) => {
    if (!dragging || !drag) return
    const delta = Math.round((e.clientX - startXRef.current) / colW)
    if (delta !== drag.delta) {
      movedRef.current = true
      onDrag({ ...drag, delta })
    }
    const el = scrollRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      const leftEl = el.querySelector('.wg-left')
      const leftEdge = leftEl ? leftEl.getBoundingClientRect().right : rect.left + LEFT_W
      if (e.clientX > rect.right - 32) el.scrollLeft += 14
      else if (e.clientX > leftEdge && e.clientX < leftEdge + 32) el.scrollLeft -= 14
    }
  }
  const endDrag = () => {
    if (!dragging || !drag) return
    if (drag.delta !== 0) {
      if (drag.mode === 'move') {
        onCommitDates(shiftDate(drag.originStart, drag.delta), shiftDate(drag.originEnd, drag.delta))
      } else {
        let end = shiftDate(drag.originEnd, drag.delta)
        if (end && end < drag.originStart) end = drag.originStart
        onCommitDates(null, end)
      }
    }
    onDrag(null)
  }
  const onCommitDates = (s: string | null, e: string | null) => {
    if (s !== null) onStart(s)
    if (e !== null) onEnd(e)
  }

  const hours = taskHours(task, data)
  const wd = workdayCount(task.start, task.end, data)
  const previewHours = workdayCount(pStart, pEnd, data) * HOURS_PER_DAY
  const color = progressColor(task.progress)
  const barWidth = span ? (span.last - span.first + 1) * colW - 6 : 0
  const narrow = barWidth < 48

  return (
    <div
      className={`wg-rrow${hover ? ' is-hover' : ''}`}
      onMouseEnter={() => onHover(task.id)}
      onMouseLeave={() => onHover(null)}
    >
      {days.map(d => (
        <div
          key={d.key}
          className={`wg-cell${d.rest && d.weekend && !d.makeup ? ' wg-cell--rest' : ''}${d.holiday || d.compOff ? ' wg-cell--holiday' : ''}${d.leave ? ' wg-cell--leave' : ''}${d.today ? ' wg-cell--today' : ''}`}
          style={{ width: colW }}
          onDoubleClick={() => {
            if (d.rest) { message.info(t('cpm.gantt.cell.restTip', { defaultValue: '周末/節假日不計入工時，請選擇工作日' })); return }
            onSchedule(d.key)
          }}
        />
      ))}
      {span && pStart && pEnd && (
        <Popover
          trigger="click"
          placement="top"
          open={popOpen}
          onOpenChange={open => {
            // 拖拽结束的 click 不弹详情
            if (movedRef.current) { movedRef.current = false; return }
            setPopOpen(open)
          }}
          content={(
            <div className="wg-bar-pop">
              <div className="wg-bar-pop__head">
                <b>{task.title}</b>
                <Tag color={TASK_STATUS_META[status].tag} style={{ marginInlineEnd: 0 }}>{TASK_STATUS_META[status].label}</Tag>
              </div>
              <div className="wg-bar-pop__row">
                <span>{t('cpm.gantt.pop.plan', { defaultValue: '計劃' })}</span>
                <DatePicker size="small" value={dayjs(pStart)} onChange={d => d && onStart(fmt(d))} allowClear={false} />
                <i>–</i>
                <DatePicker size="small" value={dayjs(pEnd)} onChange={d => d && onEnd(fmt(d))} allowClear={false} />
              </div>
              <div className="wg-bar-pop__row">
                <span>{t('cpm.gantt.pop.hours', { defaultValue: '耗時' })}</span>
                <b>{hours}h</b>
                <small>{t('cpm.gantt.pop.workdays', { days: wd, hours: HOURS_PER_DAY, defaultValue: '{{days}} 個工作日 × {{hours}}h' })}</small>
              </div>
              <div className="wg-bar-pop__row">
                <span>{t('cpm.gantt.pop.planType', { defaultValue: '屬性' })}</span>
                <Switch
                  size="small"
                  checked={task.planType === 'inserted'}
                  onChange={onToggleInserted}
                  checkedChildren={t('cpm.gantt.insert.tag', { defaultValue: '臨時' })}
                  unCheckedChildren={t('cpm.gantt.plan.planned', { defaultValue: '原計劃' })}
                />
                {task.insertedAt && <small>{t('cpm.gantt.pop.insertedAt', { date: task.insertedAt, defaultValue: '{{date}} 插入' })}</small>}
              </div>
              <div className="wg-bar-pop__row">
                <span>{t('cpm.gantt.pop.progress', { defaultValue: '進度' })}</span>
                <Slider style={{ flex: 1, margin: '0 8px' }} value={task.progress} onChange={v => onPatch({ progress: v as number })} />
                <b style={{ color }}>{task.progress}%</b>
              </div>
              <ProgressChips value={task.progress} onPick={p => onPatch({ progress: p })} />
              <div className="wg-bar-pop__row"><span>{t('cpm.gantt.pop.note', { defaultValue: '備註' })}</span></div>
              {task.note
                ? <div className="wg-note-preview" dangerouslySetInnerHTML={{ __html: noteToDisplayHtml(task.note) }} />
                : <p className="wg-note-empty">{t('cpm.gantt.pop.noNote', { defaultValue: '尚無備註' })}</p>}
              <Button size="small" icon={<EditOutlined />} onClick={onEditNote} style={{ marginTop: 6 }}>{t('cpm.gantt.pop.editNote', { defaultValue: '編輯備註' })}</Button>
              <footer>{t('cpm.gantt.pop.footer', { defaultValue: '拖拽色塊移動 · 拉伸右緣改結束 · 雙擊格子排期' })}</footer>
            </div>
          )}
        >
          <span
            className={`wg-bar${dragging ? ' wg-bar--dragging' : ''}${task.planType === 'inserted' ? ' wg-bar--inserted' : ''}`}
            style={{
              left: span.first * colW + 3,
              width: (span.last - span.first + 1) * colW - 6,
              '--bar-color': color,
            } as CSSProperties}
            onPointerDown={e => beginDrag(e, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {task.planType === 'inserted' && <span className="wg-bar__flag">{t('cpm.gantt.insert.flag', { defaultValue: '插' })}</span>}
            <span className="wg-bar__fill" style={{ width: `${task.progress}%` }} />
            {!narrow && <span className="wg-bar__chip">{task.progress}%</span>}
            <span
              className="wg-resize"
              onPointerDown={e => beginDrag(e, 'resize')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </span>
        </Popover>
      )}
      {span && narrow && (
        <span className="wg-bar__chip-out" style={{ left: (span.last + 1) * colW + 1 }}>{task.progress}%</span>
      )}
      {dragging && pStart && pEnd && span && (
        <div className="wg-drag-tip" style={{ left: span.first * colW }}>
          {shortDate(pStart)} – {shortDate(pEnd)} · {previewHours}h
        </div>
      )}
    </div>
  )
}

/* ==================== 備註富文本彈窗 ==================== */

function NoteEditorModal({ target, onClose, onSave }: {
  target: { gid: string; tid: string; title: string; note: string } | null
  onClose: () => void
  onSave: (html: string) => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (target && ref.current) {
      ref.current.innerHTML = noteToDisplayHtml(target.note)
      try { document.execCommand('styleWithCSS', false, 'true') } catch { /* 忽略 */ }
    }
  }, [target])
  // mousedown  preventDefault 保住編輯區選區，execCommand 才作用於選中文本
  const exec = (cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
  }
  const pickColor = (token: string) => {
    const c = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    exec('foreColor', c)
  }
  return (
    <Modal
      open={!!target}
      title={t('cpm.gantt.note.title', { title: target?.title ?? '', defaultValue: '備註・{{title}}' })}
      width={680}
      okText={t('cpm.gantt.note.save', { defaultValue: '保存備註' })}
      cancelText={t('common.cancel', { defaultValue: '取消' })}
      onCancel={onClose}
      onOk={() => { onSave(sanitizeNoteHtml(ref.current?.innerHTML ?? '')); onClose() }}
      destroyOnClose
    >
      <div className="wg-note-toolbar">
        <button type="button" title={t('cpm.gantt.note.bold', { defaultValue: '加粗' })} onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><b>B</b></button>
        <button type="button" title={t('cpm.gantt.note.italic', { defaultValue: '斜體' })} onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></button>
        <button type="button" title={t('cpm.gantt.note.underline', { defaultValue: '下劃線' })} onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}><u>U</u></button>
        <span className="wg-note-toolbar__sep" />
        {(['--text-1', '--danger', '--warning-deep', '--success-deep', '--info', '--purple'] as const).map(tk => (
          <button
            key={tk}
            type="button"
            title={t('cpm.gantt.note.color', { defaultValue: '字色' })}
            className="wg-note-swatch"
            style={{ background: `var(${tk})` }}
            onMouseDown={e => e.preventDefault()}
            onClick={() => pickColor(tk)}
          />
        ))}
        <span className="wg-note-toolbar__sep" />
        {([
          ['2', t('cpm.gantt.note.sizeSm', { defaultValue: '小' })],
          ['3', t('cpm.gantt.note.sizeMd', { defaultValue: '標準' })],
          ['4', t('cpm.gantt.note.sizeLg', { defaultValue: '大' })],
          ['5', t('cpm.gantt.note.sizeXl', { defaultValue: '特大' })],
        ] as const).map(([v, label]) => (
          <button key={v} type="button" title={t('cpm.gantt.note.sizeTip', { size: label, defaultValue: '字號・{{size}}' })} onMouseDown={e => e.preventDefault()} onClick={() => exec('fontSize', v)}>{label}</button>
        ))}
        <span className="wg-note-toolbar__sep" />
        <button type="button" title={t('cpm.gantt.note.clearFormat', { defaultValue: '清除格式' })} onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')}>{t('cpm.gantt.note.clear', { defaultValue: '清除' })}</button>
      </div>
      <div ref={ref} className="wg-note-editor" contentEditable suppressContentEditableWarning />
      <p className="wg-note-tip">{t('cpm.gantt.note.tip', { defaultValue: '支持加粗／斜體／下劃線／字色／字號；保存時自動淨化。列表備註懸停即可閱讀全文，無需點擊。' })}</p>
    </Modal>
  )
}

/* ==================== 空狀態插畫 ==================== */

function EmptyArt() {
  return (
    <svg width="180" height="96" viewBox="0 0 180 96" fill="none" aria-hidden="true">
      <rect x="8" y="12" width="164" height="72" rx="8" fill="var(--surface-3)" stroke="var(--border-1)" />
      <rect x="8" y="12" width="164" height="18" rx="8" fill="var(--info-deep)" />
      <rect x="20" y="40" width="34" height="34" rx="4" fill="color-mix(in srgb, var(--brand) 25%, var(--surface-2))" />
      <rect x="62" y="40" width="24" height="8" rx="3" fill="var(--border-1)" />
      <rect x="62" y="54" width="40" height="8" rx="3" fill="var(--border-2)" />
      <rect x="112" y="42" width="14" height="10" rx="3" fill="var(--brand)" />
      <rect x="128" y="42" width="14" height="10" rx="3" fill="color-mix(in srgb, var(--brand) 60%, var(--surface-2))" />
      <rect x="112" y="58" width="14" height="10" rx="3" fill="color-mix(in srgb, var(--info) 45%, var(--surface-2))" />
      <rect x="128" y="58" width="14" height="10" rx="3" fill="color-mix(in srgb, var(--info) 25%, var(--surface-2))" />
      <rect x="144" y="58" width="14" height="10" rx="3" fill="color-mix(in srgb, var(--info) 25%, var(--surface-2))" />
    </svg>
  )
}