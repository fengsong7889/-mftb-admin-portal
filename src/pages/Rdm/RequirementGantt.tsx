/**
 * 需求甘特图（RequirementGantt）—— 阶段二：真实数据 + 安全保存
 *
 * 三视角同一页，用 URL ?mode= 区分：
 * - personal 我的需求：服务端按「与我相关」收敛（relatedOnly），可切「只看我的任务」；
 * - single   單條需求：从清单行/详情「排期」下钻，按角色分组展开该需求全部参与人计划起止；
 * - global   全局總覽：仅 canSeeAll 者可见入口，服务端对无权请求明确报错（不降级）。
 *
 * 数据与写回均走真实接口：读 GET /rdm/schedule/gantt（按需求分页、批量取任务/角色防 N+1）；
 * 写 POST /rdm/schedule/task-plans（本人任务 + expected planVersion 乐观锁 + 审计 + 幂等，整批原子）。
 * 前端 canAdjust 仅作 UX 提示，真正裁决在服务端；拖动只改本地 draft，保存才落库。
 *
 * 进度与排期分开保存：
 * - 进度松手即调 POST /rdm/delivery/task/{id}/progress（action=progress / done），乐观更新 + 失败回滚；
 * - PRD 任务进度封顶 99%，100% 只由「提交评审」产生；普通任务 100% 需填交付说明；
 * - PRD 任务改完成日会同步需求「承诺出 PRD 日期」，保存前二次确认。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, Modal, Pagination, Segmented, Select, Space, Spin, Tag, message } from 'antd'
import {
  AimOutlined,
  ArrowLeftOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  ExpandAltOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  ShrinkOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchRdmGantt,
  reportTask,
  saveRdmTaskPlans,
  type RdmGanttPage,
  type RdmGanttQuery,
  type RdmGanttRequirement,
  type RdmGanttTask,
  type RdmTaskPlanItem,
} from '../../api/rdm'
import { RDM_ROLE_LABEL, type RdmRoleCode } from '../../constants/rdm'
import { useTaskTypeDict } from '../../hooks/useTaskTypeDict'
import GanttBoard, { type GanttRow, type GanttDraft, type GanttTask } from './components/GanttBoard'
import './index.css'

/** 缩放档位对应的一天像素宽（基准；实际会被「铺满可视宽度」拉伸） */
const SCALE_DAY_W: Record<'day' | 'week' | 'month', number> = { day: 34, week: 12, month: 5 }
/** 单页需求数（服务端按需求分页） */
const PAGE_SIZE = 20

/** 角色分组展示顺序（管理岗在前、执行岗按交付顺序） */
const ROLE_ORDER: RdmRoleCode[] = ['PM', 'PMO', 'DEV_LEAD', 'DESIGNER', 'DEV', 'QA', 'ACCEPTOR']

type GanttMode = 'personal' | 'single' | 'global'
const VALID_MODES: GanttMode[] = ['personal', 'single', 'global']
/** 视角 → i18n key（字面量映射，避免模板 key 绕过门禁的引用完整性检查） */
const GANTT_MODE_KEY: Record<GanttMode, string> = {
  personal: 'rdm.gantt.modePersonal',
  single: 'rdm.gantt.modeSingle',
  global: 'rdm.gantt.modeGlobal',
}

interface Filters {
  keyword?: string
  // 任务类型已字典化：筛选值接受任意 code（新类型如 android/ios 不再限定内置六码）
  taskType?: string
  status?: string
  onlyOverdue?: boolean
  onlyUnscheduled?: boolean
}

export default function RequirementGantt() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  // 任务类型字典（业务可配置）：筛选选项与图例同源，label/color 均从接口取
  const { options: taskTypeOptions, items: taskTypeItems } = useTaskTypeDict()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasPermission, user } = useAuth()
  const myId = (user as { id?: number } | null)?.id ?? -1

  /** 全量可见（决定全局入口显隐）：与后端 RdmAccessGuard.canSeeAll 同口径；服务端仍会重裁 */
  const canSeeAll = hasPermission('rdm-requirement:view_all')
    || hasPermission('rdm-intake:view')
    || hasPermission('rdm-intake:edit')
    || hasPermission('rdm-requirement:dispatch')

  const rawMode = searchParams.get('mode') as GanttMode | null
  const requestedMode: GanttMode = rawMode && VALID_MODES.includes(rawMode) ? rawMode : 'personal'
  const mode: GanttMode = requestedMode === 'global' && !canSeeAll ? 'personal' : requestedMode
  const reqIdParam = Number(searchParams.get('reqId') ?? 0)

  const [scale, setScale] = useState<'day' | 'week' | 'month'>('day')
  const [compact, setCompact] = useState(false)
  const [filters, setFilters] = useState<Filters>({})
  const [onlyMine, setOnlyMine] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<GanttDraft>({})
  /** 进度乐观草稿：请求期间覆盖服务端值，成功/失败后移除 */
  const [progressDraft, setProgressDraft] = useState<Record<number, number>>({})
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [todayNonce, setTodayNonce] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [page, setPage] = useState<RdmGanttPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveSeq = useRef(0)

  const dayW = SCALE_DAY_W[scale]

  const switchMode = (m: GanttMode) => {
    const next = new URLSearchParams(searchParams)
    next.set('mode', m)
    if (m !== 'single') next.delete('reqId')
    setSearchParams(next, { replace: true })
    setPageNum(1)
  }

  /** 拉取真实甘特数据 */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query: RdmGanttQuery = {
        mode,
        reqId: mode === 'single' ? reqIdParam : undefined,
        page: pageNum,
        size: PAGE_SIZE,
        keyword: filters.keyword || undefined,
        taskType: filters.taskType,
        status: filters.status,
        onlyOverdue: filters.onlyOverdue || undefined,
        onlyUnscheduled: filters.onlyUnscheduled || undefined,
        onlyMine: onlyMine || undefined,
      }
      const res = await fetchRdmGantt(query)
      setPage(res)
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : t('rdm.gantt.loadFail'))
      setPage(null)
    } finally {
      setLoading(false)
    }
  }, [mode, reqIdParam, pageNum, filters.keyword, filters.taskType, filters.status, filters.onlyOverdue, filters.onlyUnscheduled, onlyMine, t])

  useEffect(() => { void load() }, [load])

  /** 切换视角/需求时重置展开态：全局折叠到需求层，个人/单需求展开 */
  useEffect(() => {
    if (!page) return
    const ids = new Set<string>()
    if (mode === 'personal') page.requirements.forEach(r => ids.add(`req-${r.id}`))
    if (mode === 'single') {
      const r = page.requirements[0]
      if (r) Array.from(new Set(r.tasks.map(t => t.roleCode))).forEach(rc => ids.add(`role-${r.id}-${rc}`))
    }
    setExpanded(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reqIdParam, page === null])

  /** 服务端任务 → 板任务（补 mine 高亮标记） */
  const toBoardTask = useCallback((t: RdmGanttTask): GanttTask => ({
    ...t,
    ownerUserId: t.ownerUserId,
    mine: t.ownerUserId != null && t.ownerUserId === myId,
  }), [myId])

  /** 构建扁平行 */
  const rows = useMemo<GanttRow[]>(() => {
    const out: GanttRow[] = []
    if (!page) return out
    if (mode === 'single') {
      const r = page.requirements[0]
      if (!r) return out
      const byRole = new Map<string, RdmGanttTask[]>()
      r.tasks.forEach(t => {
        const arr = byRole.get(t.roleCode) ?? []
        arr.push(t)
        byRole.set(t.roleCode, arr)
      })
      ROLE_ORDER.filter(rc => byRole.has(rc)).forEach(rc => {
        const gid = `role-${r.id}-${rc}`
        const isOpen = expanded.has(gid)
        out.push({ kind: 'group', id: gid, depth: 0, label: RDM_ROLE_LABEL[rc as RdmRoleCode] ?? rc, tag: t('rdm.gantt.itemCount', { count: byRole.get(rc)?.length ?? 0 }), tagColor: 'blue', expandable: true, expanded: isOpen })
        if (isOpen) byRole.get(rc)?.forEach(t => out.push({ kind: 'task', id: `task-${t.id}`, depth: 1, task: toBoardTask(t) }))
      })
      r.unscheduledRoles.forEach(rc => out.push({ kind: 'empty', id: `empty-${r.id}-${rc}`, depth: 0, text: t('rdm.gantt.roleUnscheduled', { role: RDM_ROLE_LABEL[rc as RdmRoleCode] ?? rc }) }))
      return out
    }
    page.requirements.forEach(r => {
      const gid = `req-${r.id}`
      const isOpen = expanded.has(gid)
      out.push({
        kind: 'group', id: gid, depth: 0,
        label: `${r.reqNo ?? t('rdm.gantt.reqNoPending')} ${r.title}`,
        tag: mode === 'global' ? (r.projectName ?? undefined) : undefined, tagColor: 'geekblue',
        meta: t('rdm.gantt.taskCountMeta', { iteration: r.iterationName ?? '-', count: r.tasks.length }),
        expandable: true, expanded: isOpen, spanStart: r.spanStart, spanEnd: r.spanEnd,
      })
      if (isOpen) {
        if (r.tasks.length === 0) out.push({ kind: 'empty', id: `empty-${r.id}`, depth: 1, text: t('rdm.gantt.noTaskUnderFilter') })
        r.tasks.forEach(t => out.push({ kind: 'task', id: `task-${t.id}`, depth: 1, task: toBoardTask(t) }))
        r.unscheduledRoles.forEach(rc => out.push({ kind: 'empty', id: `empty-${r.id}-${rc}`, depth: 1, text: t('rdm.gantt.roleUnscheduled', { role: RDM_ROLE_LABEL[rc as RdmRoleCode] ?? rc }) }))
      }
    })
    return out
  }, [page, mode, expanded, toBoardTask, t])

  /** 时间窗口：取已加载任务计划日期 + 今天，前后留白；拖动期间不跳动（用服务端原值） */
  const { windowStart, days } = useMemo(() => {
    const dates: string[] = []
    page?.requirements.forEach(r => r.tasks.forEach(t => {
      if (t.planStartDate) dates.push(t.planStartDate)
      if (t.planFinishDate) dates.push(t.planFinishDate)
    }))
    const today = dayjs().startOf('day')
    let min = today
    let max = today
    dates.forEach(ds => {
      const dd = dayjs(ds)
      if (dd.isBefore(min)) min = dd
      if (dd.isAfter(max)) max = dd
    })
    const start = min.subtract(3, 'day')
    const end = max.add(6, 'day')
    return { windowStart: start, days: Math.max(14, end.diff(start, 'day') + 1) }
  }, [page])

  /** 已加载任务索引（保存时取 planVersion） */
  const taskById = useMemo(() => {
    const m = new Map<number, RdmGanttTask>()
    page?.requirements.forEach(r => r.tasks.forEach(t => m.set(t.id, t)))
    return m
  }, [page])

  /** 任务 → 所属需求：PRD 改期确认需要展示需求号，避免只看到任务号不知道改的是哪条承诺 */
  const taskReqById = useMemo(() => {
    const m = new Map<number, RdmGanttRequirement>()
    page?.requirements.forEach(r => r.tasks.forEach(t => m.set(t.id, r)))
    return m
  }, [page])

  const draftCount = Object.keys(draft).length

  const onDragChange = useCallback((taskId: number, start: string, end: string) => {
    setDraft(prev => ({ ...prev, [taskId]: { start, end } }))
  }, [])

  const onDateChange = useCallback((taskId: number, start: string | null, end: string | null) => {
    if (start && end && dayjs(start).isAfter(dayjs(end), 'day')) {
      message.warning(t('rdm.gantt.startAfterEnd'))
      return
    }
    setDraft(prev => ({ ...prev, [taskId]: { start, end } }))
  }, [t])

  /**
   * 进度提交：松手即保存（乐观更新 + 失败回滚），不并入底部「保存排期」。
   * <p>100% 走完成任务（必须带交付说明）；PRD 任务由面板封顶 99%，不会走到 done。
   * 并发保护：把拖动前的服务端进度作为 expectedProgress 上送，过期则服务端拒绝覆盖。
   */
  const onProgressCommit = useCallback(async (taskId: number, progress: number, remark?: string): Promise<boolean> => {
    const src = taskById.get(taskId)
    if (!src) return false
    const prev = progressDraft[taskId] ?? src.progress ?? 0
    const isDone = progress >= 100
    setProgressDraft(p => ({ ...p, [taskId]: progress }))
    try {
      const res = await reportTask(taskId, {
        action: isDone ? 'done' : 'progress',
        progress,
        expectedProgress: prev,
        remark,
        clientRequestId: `gantt-progress-${taskId}-${Date.now()}`,
      })
      // 以服务端事实为准：完成会同时改状态，不能只信本地草稿
      setPage(prevPage => prevPage ? {
        ...prevPage,
        requirements: prevPage.requirements.map(r => ({
          ...r,
          tasks: r.tasks.map(t => {
            if (t.id !== taskId) return t
            const nextStatus = res.status ?? t.status
            // 任务一旦完成，日期与进度都不能再拖；不等下一次刷新就收掉手柄
            return {
              ...t,
              progress: res.progress ?? progress,
              status: nextStatus,
              canAdjust: nextStatus === 'done' ? false : t.canAdjust,
            }
          }),
        })),
      } : prevPage)
      setProgressDraft(p => {
        const next = { ...p }
        delete next[taskId]
        return next
      })
      if (isDone) message.success(t('rdm.ganttBoard.progressDoneSaved'))
      return true
    } catch {
      // 失败回滚：清掉草稿即回到服务端值；错误文案由 request.ts 统一弹出
      setProgressDraft(p => {
        const next = { ...p }
        delete next[taskId]
        return next
      })
      return false
    }
  }, [taskById, progressDraft, t])

  const toggleGroup = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const groupIds = useMemo(() => rows.filter(r => r.kind === 'group').map(r => r.id), [rows])
  const allExpanded = groupIds.length > 0 && groupIds.every(id => expanded.has(id))
  const toggleAllGroups = () => setExpanded(allExpanded ? new Set() : new Set(groupIds))

  const cancelEdit = () => { setDraft({}); setEditMode(false); setEditingTaskId(null) }

  /** 保存：组装 expectedPlanVersion 批量提交（整批原子 + 幂等 + 审计） */
  const handleSave = async () => {
    const items: RdmTaskPlanItem[] = []
    for (const [idStr, d] of Object.entries(draft)) {
      const taskId = Number(idStr)
      const src = taskById.get(taskId)
      if (!src || !d.start || !d.end) continue
      items.push({ taskId, expectedPlanVersion: src.planVersion, planStartDate: d.start, planFinishDate: d.end })
    }
    if (items.length === 0) {
      message.warning(t('rdm.gantt.nothingToSave'))
      return
    }
    /*
     * PRD 任务的完成日与需求「承诺出 PRD 日期」同源：改完成日就是对外承诺变更，
     * 不能像普通内部排期那样静默落库，保存前必须把新日期逐条摆出来二次确认。
     * 只改开始日不触动承诺，不需要弹窗。
     */
    const prdItems = items.filter(it => {
      const src = taskById.get(it.taskId)
      return src?.taskType === 'prd' && src.planFinishDate !== it.planFinishDate
    })
    if (prdItems.length > 0) {
      const confirmed = await new Promise<boolean>(resolve => {
        Modal.confirm({
          title: t('rdm.gantt.prdConfirmTitle'),
          className: 'custom-confirm-modal',
          icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
          content: (
            <div className="confirm-info-card">
              {prdItems.map(it => {
                const src = taskById.get(it.taskId)
                const req = taskReqById.get(it.taskId)
                return (
                  <div key={it.taskId} className="confirm-info-row">
                    <span>{req?.reqNo ?? src?.taskNo ?? '-'}</span>
                    <b>{src?.planFinishDate ?? '-'} → {it.planFinishDate}</b>
                  </div>
                )
              })}
              <div className="rdm-gantt-prd-confirm-note">{t('rdm.gantt.prdConfirmNote')}</div>
            </div>
          ),
          okText: t('rdm.gantt.prdConfirmOk'),
          cancelText: t('rdm.gantt.keepEditing'),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
      if (!confirmed) return
    }
    const seq = ++saveSeq.current
    const clientRequestId = `gantt-${Date.now()}-${seq}`
    setSaving(true)
    try {
      const res = await saveRdmTaskPlans(clientRequestId, items)
      message.success(t('rdm.gantt.savedCount', { count: res.updated }))
      setDraft({})
      setEditMode(false)
      setEditingTaskId(null)
      await load()
    } catch {
      // request.ts 已统一弹后端失败原因（含版本冲突提示），此处保留草稿供重试
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (draftCount > 0) {
      Modal.confirm({
        title: t('rdm.gantt.unsavedTitle'),
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: <div className="confirm-info-card"><div className="confirm-info-row"><span>{t('rdm.gantt.beforeLeave')}</span><b>{t('rdm.gantt.unsavedConfirm', { count: draftCount })}</b></div></div>,
        okText: t('rdm.gantt.discardAndBack'),
        okButtonProps: { danger: true },
        cancelText: t('rdm.gantt.keepEditing'),
        onOk: () => navigate('/rdm-requirement'),
      })
      return
    }
    navigate('/rdm-requirement')
  }

  const title = mode === 'single'
    ? (page?.requirements[0] ? `${page.requirements[0].reqNo ?? ''} ${t('rdm.gantt.scheduleTitle')}` : t('rdm.gantt.titleDefault'))
    : mode === 'global' ? t('rdm.gantt.titleGlobal') : t('rdm.gantt.titlePersonal')

  const modeOptions = (['personal', 'global'] as GanttMode[])
    .filter(m => m !== 'global' || canSeeAll)
    .map(m => ({ label: t(GANTT_MODE_KEY[m]), value: m }))

  // 空態以行集合為準：全局/個人視角默認摺疊時只有需求匯總條（group 行），不得誤判為無資料
  const hasRows = rows.length > 0
  const total = page?.total ?? 0
  // 當前頁可拖動任務數：编辑模式下為 0 時給明確引導，避免用戶對著唯讀色块空拖
  // PRD 任务第一阶段由前端放开（与 GanttBoard 的 prdOwned 同口径），否则只有 PRD 任务的人会被误判为无可调项
  const adjustableCount = useMemo(
    () => page?.requirements.reduce((n, r) => n + r.tasks.filter(t =>
      t.canAdjust
      || (t.taskType === 'prd' && t.ownerUserId != null && t.ownerUserId === myId
        && t.status !== 'done' && t.status !== 'cancelled'),
    ).length, 0) ?? 0,
    [page, myId],
  )

  return (
    <div className="content-area rdm-gantt-page">
      <div className="rdm-gantt-header">
        <div className="rdm-gantt-header-bar" />
        <div className="rdm-gantt-header-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack} className="rdm-gantt-back">{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 className="rdm-gantt-title">{title}</h2>
          </div>
          {mode === 'single' ? (
            <Space size={8}>
              <Tag color="blue" style={{ margin: 0 }}>{t('rdm.gantt.modeSingle')}</Tag>
              <Button size="small" onClick={() => switchMode('personal')}>{t('rdm.gantt.modePersonal')}</Button>
              {canSeeAll && <Button size="small" onClick={() => switchMode('global')}>{t('rdm.gantt.modeGlobal')}</Button>}
            </Space>
          ) : (
            <Segmented value={mode} onChange={v => switchMode(v as GanttMode)} options={modeOptions} />
          )}
        </div>
      </div>

      {/* 筛选区（服务端收敛） */}
      {mode !== 'single' && (
        <div className="search-section">
          <div className="rdm-gantt-filters">
            <Input allowClear placeholder={t('rdm.gantt.keywordPlaceholder')} prefix={<SearchOutlined />} value={filters.keyword} onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))} onPressEnter={() => setPageNum(1)} />
            <Select allowClear placeholder={t('rdm.gantt.taskTypePlaceholder')} style={{ width: '100%' }} value={filters.taskType} options={taskTypeOptions} onChange={v => setFilters(f => ({ ...f, taskType: v }))} />
            <Select allowClear placeholder={t('rdm.gantt.taskStatusPlaceholder')} style={{ width: '100%' }} value={filters.status} options={[{ value: 'todo', label: t('rdm.gantt.statusTodo') }, { value: 'doing', label: t('rdm.gantt.statusDoing') }, { value: 'done', label: t('rdm.gantt.statusDone') }, { value: 'blocked', label: t('rdm.gantt.statusBlocked') }]} onChange={v => setFilters(f => ({ ...f, status: v }))} />
            <div className="rdm-gantt-filter-checks">
              <Checkbox checked={!!filters.onlyUnscheduled} onChange={e => setFilters(f => ({ ...f, onlyUnscheduled: e.target.checked }))}>{t('rdm.gantt.onlyUnscheduled')}</Checkbox>
              <Checkbox checked={!!filters.onlyOverdue} onChange={e => setFilters(f => ({ ...f, onlyOverdue: e.target.checked }))}>{t('rdm.gantt.onlyOverdue')}</Checkbox>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => { setFilters({}); setOnlyMine(false); setPageNum(1) }}>{t('common.reset')}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="rdm-gantt-toolbar">
        <Space size={8} wrap>
          <Segmented value={scale} onChange={v => setScale(v as 'day' | 'week' | 'month')} options={[{ label: t('rdm.gantt.scaleDay'), value: 'day' }, { label: t('rdm.gantt.scaleWeek'), value: 'week' }, { label: t('rdm.gantt.scaleMonth'), value: 'month' }]} />
          <Button icon={<AimOutlined />} onClick={() => setTodayNonce(n => n + 1)}>{t('rdm.gantt.today')}</Button>
          <Button icon={allExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />} onClick={toggleAllGroups}>{allExpanded ? t('rdm.gantt.collapseAll') : t('rdm.gantt.expandAll')}</Button>
          <Button icon={<ColumnWidthOutlined />} onClick={() => setCompact(c => !c)}>{compact ? t('rdm.gantt.wideLeft') : t('rdm.gantt.compactLeft')}</Button>
          <Checkbox checked={onlyMine} onChange={e => { setOnlyMine(e.target.checked); setPageNum(1) }}>{t('rdm.gantt.onlyMineTasks')}</Checkbox>
          {editMode && <span className="rdm-gantt-edit-hint">{t('rdm.gantt.editingHint')}</span>}
        </Space>
        <Space size={8}>
          {draftCount > 0 && <Tag color="warning" style={{ margin: 0 }}>{t('rdm.gantt.unsavedTag', { count: draftCount })}</Tag>}
          {editMode
            ? <Button icon={<ColumnHeightOutlined />} onClick={cancelEdit}>{t('rdm.gantt.exitAdjust')}</Button>
            : <Button type="primary" icon={<ColumnHeightOutlined />} onClick={() => setEditMode(true)}>{t('rdm.gantt.adjustSchedule')}</Button>}
        </Space>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}><Spin size="large" /></div>
      ) : hasRows ? (
        <>
          {editMode && adjustableCount === 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
              message={t('rdm.gantt.noAdjustableTitle')}
              description={t('rdm.gantt.noAdjustableDesc')}
            />
          )}
          <GanttBoard
            rows={rows}
            windowStart={windowStart}
            days={days}
            dayW={dayW}
            scale={scale}
            editMode={editMode}
            draft={draft}
            editingTaskId={editingTaskId}
            compact={compact}
            focusTodayNonce={todayNonce}
            onToggleGroup={toggleGroup}
            onDragChange={onDragChange}
            onStartEditDates={setEditingTaskId}
            onDateChange={onDateChange}
            progressDraft={progressDraft}
            onProgressCommit={onProgressCommit}
          />
          <div className="rdm-gantt-pager">
            <span>{t('rdm.gantt.loadedPager', { loaded: page?.loaded ?? 0, total })}</span>
            {total > PAGE_SIZE && (
              <Pagination simple current={pageNum} pageSize={PAGE_SIZE} total={total} onChange={p => setPageNum(p)} />
            )}
          </div>
        </>
      ) : (
        <div className="rdm-gantt-empty">
          <Alert type="info" showIcon message={t('rdm.gantt.emptyTitle')} description={t('rdm.gantt.emptyDesc')} />
        </div>
      )}

      <div className="rdm-gantt-legend">
        <span className="rdm-gantt-legend-title">{t('rdm.gantt.legend')}</span>
        {taskTypeItems.map(i => (
          <span key={i.code} className="rdm-gantt-legend-item"><i style={{ background: i.color }} />{i.label}</span>
        ))}
        <span className="rdm-gantt-legend-sep" />
        <span className="rdm-gantt-legend-item"><i className="lg-mine" />{t('rdm.gantt.legendMine')}</span>
        <span className="rdm-gantt-legend-item"><i className="lg-overdue" />{t('rdm.gantt.legendOverdue')}</span>
        <span className="rdm-gantt-legend-item"><i className="lg-span" />{t('rdm.gantt.legendSpan')}</span>
      </div>

      {(editMode || draftCount > 0) && (
        <div className="form-footer">
          <Button onClick={cancelEdit}>{t('rdm.gantt.cancelAdjust')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={draftCount === 0} onClick={() => void handleSave()}>
            {t('rdm.gantt.saveSchedule')}{draftCount > 0 ? `（${draftCount}）` : ''}
          </Button>
        </div>
      )}
    </div>
  )
}
