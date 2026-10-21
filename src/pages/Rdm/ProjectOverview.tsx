/**
 * 項目總覽 —— V3 分批交付項目列表與統計
 *
 * 佈局順序（AGENTS.md 強制 / check:stat-order）：search-section → 統計卡 → action-section → Table
 *
 * 任務30 強化：
 * 1. URL 保留篩選與分頁（keyword/status/pmUserId/pageNo/pageSize 同步 Hash query，刷新/返回不丟）；
 * 2. 負責人 pmUserId 真正進入查詢參數（此前只收集不查）；
 * 3. 三張統計卡可下鑽（服务端按与卡片同一批事实位过滤，分页与计数同口径）；
 * 4. 統計失敗不回零（保留上次值 + 明確錯誤態）；
 * 5. 全量報告導出（export-bundle 全量 + ExcelJS 多 Sheet，帶當前 filters，導出前校 reconciliation）；
 * 6. 暫停/恢復真調後端（updateProject，先取 version 做乐观锁）。
 *
 * 列拆分（2026-10）：「項目及目標」拆为「項目名稱」与独立的「目標」列，目標紧跟进度列、
 * 排在更新信息之前；新增「產品負責人」「計劃開始/結束日期」「最後更新人」，
 * 「更新時間」改名为「最後更新時間」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchExportBundle,
  fetchProjectDetail,
  fetchProjectPage,
  fetchProjectStats,
  updateProject,
  type RdmFactQuery,
  type RdmProjectListItem,
  type RdmProjectQuery,
  type RdmProjectStatsCard,
} from '../../api/rdm'
import { fetchEmployees, type EmployeeItem } from '../../api/employee'
import { exportProjectBundle } from './projectExport'
import {
  RDM_PROJECT_STATUS_COLOR,
  RDM_PROJECT_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

/** 進度狀態下拉選項（從常量生成，禁止硬編碼） */
const STATUS_OPTIONS = Object.entries(RDM_PROJECT_STATUS_LABEL).map(([value, label]) => ({ value, label }))

/** 分頁默認值 */
const DEFAULT_PAGE_SIZE = 20

/** 日期控件统一输出格式（与后端 plan_start_date / plan_end_date 的 yyyy-MM-dd 存储口径一致） */
const DATE_FORMAT = 'YYYY-MM-DD'

const { RangePicker } = DatePicker

/** 员工远程搜索选项（labelInValue 让 userId 与姓名同时可得，不必再回查接口） */
interface EmpOption {
  value: number
  label: string
}

/** 下鑽口徑（點擊統計卡過濾清單）；三个码与后端 RdmProjectFactService.DRILL_* 逐字对齐 */
type DrillKey = 'inProgress' | 'attention' | 'pending'

const DRILL_LABEL: Record<DrillKey, string> = {
  inProgress: '進行中項目',
  attention: '需關注項目',
  pending: '待裁決事項',
}

/**
 * 列顺序的唯一真源（§E.3 列表頁必須可顯隱/調序）。
 * key 與下方 columns 逐字對應，新增/改列時兩處同步，否則該列不會出現在字段設置面板。
 * <p>标题走 i18n，所以必须在组件内求值：模块顶层常量求值早于 i18n 初始化，直接把 key 渲染出来。
 */
const buildColumnMeta = (t: TFunction) => [
  // 項目編號（PROJ+YYYYMMDD+2 位日序，後端 ListItem 已下發）固定首列：
  // 編號是跨系統引用項目的唯一標識（導出 bundle 早有此列），列表此前漏渲染。
  { key: 'projectNo', title: '項目編號' },
  { key: 'name', title: t('rdm.projOverview.colName') },
  { key: 'pmUserName', title: t('rdm.projOverview.colPm') },
  { key: 'productOwnerUserName', title: t('rdm.projOverview.colPo') },
  { key: 'planStartDate', title: t('rdm.projOverview.colPlanStart') },
  { key: 'planEndDate', title: t('rdm.projOverview.colPlanEnd') },
  { key: 'delivery', title: t('rdm.projOverview.colDelivery') },
  { key: 'remaining', title: t('rdm.projOverview.colRemaining') },
  { key: 'nextDeliveryDate', title: t('rdm.projOverview.colNextDelivery') },
  { key: 'blockDecision', title: t('rdm.projOverview.colBlockDecision') },
  { key: 'status', title: t('rdm.projOverview.colStatus') },
  { key: 'objective', title: t('rdm.projOverview.colObjective') },
  { key: 'updatedBy', title: t('rdm.projOverview.colUpdatedBy') },
  { key: 'updatedAt', title: t('rdm.projOverview.colUpdatedAt') },
  { key: 'action', title: t('common.colAction') },
]

export default function ProjectOverview() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── URL 是篩選/分頁的單一事實源（刷新/返回不丟條件） ──
  const keyword = searchParams.get('keyword') ?? ''
  const status = searchParams.get('status') ?? undefined
  const pmUserId = searchParams.get('pmUserId') ? Number(searchParams.get('pmUserId')) : undefined
  const pmName = searchParams.get('pmName') ?? ''
  const poUserId = searchParams.get('poUserId') ? Number(searchParams.get('poUserId')) : undefined
  const poName = searchParams.get('poName') ?? ''
  const planDateFrom = searchParams.get('planDateFrom') ?? ''
  const planDateTo = searchParams.get('planDateTo') ?? ''
  const pageNo = Number(searchParams.get('pageNo') ?? 1)
  const pageSize = Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)
  const drill = (searchParams.get('drill') as DrillKey | null) ?? null

  // ── 搜索草稿（輸入過程不入 URL，點「查詢」才提交） ──
  const [keywordDraft, setKeywordDraft] = useState(keyword)
  const [statusDraft, setStatusDraft] = useState<string | undefined>(status)
  const [pmDraft, setPmDraft] = useState<EmpOption | undefined>(
    pmUserId ? { value: pmUserId, label: pmName || `#${pmUserId}` } : undefined,
  )
  const [poDraft, setPoDraft] = useState<EmpOption | undefined>(
    poUserId ? { value: poUserId, label: poName || `#${poUserId}` } : undefined,
  )
  const [planRangeDraft, setPlanRangeDraft] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(
    planDateFrom || planDateTo
      ? [planDateFrom ? dayjs(planDateFrom) : null, planDateTo ? dayjs(planDateTo) : null]
      : null,
  )
  // 两个选人下拉各自持有选项集：共用一份会被另一个人的搜索结果覆盖
  const [pmOptions, setPmOptions] = useState<EmpOption[]>([])
  const [poOptions, setPoOptions] = useState<EmpOption[]>([])
  const [empSearching, setEmpSearching] = useState(false)

  // ── 列表數據 ──
  const [rows, setRows] = useState<RdmProjectListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── 統計卡數據（失敗保留上次值，不回零） ──
  const [stats, setStats] = useState<RdmProjectStatsCard | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState(false)
  const lastGoodStats = useRef<RdmProjectStatsCard | null>(null)
  const [statsAnimKey, setStatsAnimKey] = useState(0)

  const [exporting, setExporting] = useState(false)

  // ── 提交到 URL（合併式更新，未傳的鍵保留） ──
  const commitQuery = useCallback((patch: Record<string, string | number | undefined | null>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k)
        else next.set(k, String(v))
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  // ── 由 URL 派生的查詢參數（fetchProjectPage / stats / export-bundle 共用同一組 filters） ──
  // 统计卡与列表必须共用这一组 filters（§E.8），新增筛选条件一律在此处补齐，不得另拼条件
  const queryParams = useMemo<RdmProjectQuery>(
    () => ({
      keyword: keyword || undefined,
      status,
      pmUserId,
      productOwnerUserId: poUserId,
      planDateFrom: planDateFrom || undefined,
      planDateTo: planDateTo || undefined,
      pageNo,
      pageSize,
    }),
    [keyword, status, pmUserId, poUserId, planDateFrom, planDateTo, pageNo, pageSize],
  )

  /**
   * 列表请求 = 同一组 filters + drill。
   * <p>下钻口径必须交给服务端筛：前端过去只能筛「已加载的本页」，卡片说的是全量项目数、
   * 表格只给本页命中行，跳页时两个数永远对不上（实测出现过「卡片 4 / 下钻空表」）。
   * <p>统计卡与导出固定不带 drill：否则点一次卡片就把该卡数字刷成自己筛出的值，
   * 三张卡之间失去可比性，也导不到全量口径。
   */
  const listQuery = useMemo<RdmProjectQuery>(
    () => ({ ...queryParams, drill: drill ?? undefined }),
    [queryParams, drill],
  )

  // ── 載入列表 ──
  const loadList = useCallback(async (params: RdmProjectQuery) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchProjectPage(params)
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setError('項目列表載入失敗，請重試')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── 載入統計卡（失敗不回零：保留 lastGoodStats，僅標記錯誤態） ──
  const loadStats = useCallback(async (params: RdmProjectQuery) => {
    setStatsLoading(true)
    try {
      const res = await fetchProjectStats(params)
      lastGoodStats.current = res
      setStats(res)
      setStatsError(false)
    } catch {
      // 不靜默歸零：有上次值就沿用，沒有就保持 null（卡片渲染「—」明確錯誤態）
      setStats(lastGoodStats.current)
      setStatsError(true)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadList(listQuery)
    loadStats(queryParams)
  }, [listQuery, queryParams, loadList, loadStats])

  // ── 負責人 / 產品負責人搜索（員工接口远程搜索，labelInValue → *UserId 進查詢） ──
  const searchEmployee = useCallback(async (kw: string, setOptions: (options: EmpOption[]) => void) => {
    setEmpSearching(true)
    try {
      const res = await fetchEmployees({ page: 1, size: 20, keyword: kw || undefined })
      setOptions((res.records ?? []).map((e: EmployeeItem) => ({ value: e.id, label: e.name })))
    } catch {
      setOptions([])
    } finally {
      setEmpSearching(false)
    }
  }, [])

  // ── 查詢 ──
  const handleSearch = () => {
    commitQuery({
      keyword: keywordDraft.trim(),
      status: statusDraft,
      pmUserId: pmDraft?.value,
      pmName: pmDraft?.label,
      poUserId: poDraft?.value,
      poName: poDraft?.label,
      planDateFrom: planRangeDraft?.[0]?.format(DATE_FORMAT),
      planDateTo: planRangeDraft?.[1]?.format(DATE_FORMAT),
      pageNo: 1,
    })
    setStatsAnimKey(k => k + 1)
  }

  // ── 重置 ──
  const handleReset = () => {
    setKeywordDraft('')
    setStatusDraft(undefined)
    setPmDraft(undefined)
    setPoDraft(undefined)
    setPlanRangeDraft(null)
    setSearchParams(new URLSearchParams(), { replace: true })
    setStatsAnimKey(k => k + 1)
  }

  // ── 分頁 ──
  /** §E.4：每页条数变化时必须重置到第 1 页，否则会从越界页码发起空结果查询 */
  const handlePageChange = (page: number, size: number) =>
    commitQuery({ pageNo: size !== pageSize ? 1 : page, pageSize: size })

  // ── 卡片下鑽（再點同口徑取消） ──
  const handleDrill = (key: DrillKey) => {
    commitQuery({ drill: drill === key ? undefined : key, pageNo: 1 })
  }

  // ── 暫停 / 恢復（真調後端；RdmProjectListItem 無 version，先取詳情拿乐观锁版本） ──
  const handleTogglePause = (record: RdmProjectListItem) => {
    const nextPaused = record.pausedFlag !== 1
    Modal.confirm({
      title: nextPaused ? '確認暫停項目' : '確認恢復推進',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: nextPaused
        ? `暫停「${record.name}」後，該項目不再計入推進口徑，確定繼續嗎？`
        : `恢復「${record.name}」推進，確定繼續嗎？`,
      okText: nextPaused ? '確認暫停' : '確認恢復',
      okType: nextPaused ? 'danger' : 'primary',
      cancelText: '取消',
      onOk: async () => {
        try {
          const detail = await fetchProjectDetail(record.id)
          // 后端 DTO 的 pausedFlag 是 Integer(TINYINT)，上送布尔会被 Jackson 拒成 400「請求參數格式錯誤」
          await updateProject(record.id, { pausedFlag: nextPaused ? 1 : 0, expectedVersion: detail.version })
          message.success(nextPaused ? '已暫停項目' : '已恢復推進')
          loadList(queryParams)
          loadStats(queryParams)
        } catch {
          // request.ts 已统一弹后端失败原因，这里不再双弹
        }
      },
    })
  }

  // ── 全量導出（export-bundle 全量 + ExcelJS；帶當前 filters；導出前校 reconciliation） ──
  const buildFilterLabel = () => {
    const parts: string[] = []
    if (keyword) parts.push(`關鍵詞=${keyword}`)
    if (status) parts.push(`狀態=${RDM_PROJECT_STATUS_LABEL[status] ?? status}`)
    if (pmUserId) parts.push(`項目負責人=${pmName || `#${pmUserId}`}`)
    if (poUserId) parts.push(`產品負責人=${poName || `#${poUserId}`}`)
    if (planDateFrom || planDateTo) parts.push(`計劃日期=${planDateFrom || '不限'}~${planDateTo || '不限'}`)
    return parts.length ? parts.join('，') : '全部項目（無篩選）'
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const factQuery: RdmFactQuery = {
        keyword: keyword || undefined, status, pmUserId,
        productOwnerUserId: poUserId,
        planDateFrom: planDateFrom || undefined, planDateTo: planDateTo || undefined,
        includeTodos: true, includeItems: true,
      }
      const bundle = await fetchExportBundle(factQuery)
      if (!bundle) {
        message.error('導出數據載入失敗（後端不可用），請重試')
        return
      }
      const rec = bundle.reconciliation
      const doExport = () => exportProjectBundle(bundle, buildFilterLabel())
        .then(() => message.success('全量報告已導出（含全部項目/交付項/待辦，非當前頁）'))
        .catch(() => message.error('導出失敗，請重試'))
      // 對賬不一致：給出提示而非靜默導出（仍允許用戶確認後導出，但明示口徑風險）
      if (!rec.consistent || rec.mismatches.length > 0) {
        Modal.confirm({
          title: '對賬口徑不一致',
          className: 'custom-confirm-modal',
          icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
          content: (
            <div>
              <div style={{ marginBottom: 8 }}>導出前對賬發現 <b>{rec.mismatches.length || '若干'}</b> 處不一致，導出數字可能與逐行口徑存在偏差：</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#CF1322' }}>
                {(rec.mismatches.length ? rec.mismatches : ['對賬未通過']).slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <div style={{ marginTop: 8, color: '#8C8C8C' }}>仍要導出嗎？</div>
            </div>
          ),
          okText: '仍要導出',
          okType: 'danger',
          cancelText: '取消',
          onOk: doExport,
        })
      } else {
        await doExport()
      }
    } finally {
      setExporting(false)
    }
  }

  // ── 表格排序（服务端已按 drill 筛过，本页不再做客户端过滤） ──
  const [sortField, setSortField] = useState<string>('updatedAt')
  const [sortOrder, setSortOrder] = useState<'ascend' | 'descend'>('descend')
  const handleTableChange = (_p: unknown, _f: unknown, sorter: unknown) => {
    const s = sorter as { field?: string; order?: 'ascend' | 'descend' | null }
    if (s.field && s.order) { setSortField(s.field); setSortOrder(s.order) }
    else { setSortField('updatedAt'); setSortOrder('descend') }
  }
  const sortedRows = useMemo(() => {
    if (!rows.length) return rows
    const sorted = [...rows]
    sorted.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortField]
      const bv = (b as unknown as Record<string, unknown>)[sortField]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = String(av).localeCompare(String(bv))
      return sortOrder === 'ascend' ? cmp : -cmp
    })
    return sorted
  }, [rows, sortField, sortOrder])

  // ── 統計卡數值（無數據渲染「—」，不回零） ──
  const statVal = (v: number | undefined) => (stats ? (v ?? 0) : '—')

  /** §E.3 列配置元數據：标题跟随 i18n，语言切换时字段面板不掉回 key */
  const columnMeta = useMemo(() => buildColumnMeta(t), [t])

  const columns: TableColumnsType<RdmProjectListItem> = [
    {
      // 固定首列：14 位（PROJ+8 位日期+2 位日序）需留足寬度，存量空值降級 -
      title: '項目編號', dataIndex: 'projectNo', key: 'projectNo', width: 150,
      render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>-</span>,
    },
    {
      title: t('rdm.projOverview.colName'), dataIndex: 'name', key: 'name', width: 200,
      render: (name: string, record) => (
        <div
          style={{ fontWeight: 600, color: '#262626', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onClick={() => navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)}
          title={name}
        >
          {name}
        </div>
      ),
    },
    { title: t('rdm.projOverview.colPm'), dataIndex: 'pmUserName', key: 'pmUserName', width: 110, render: (v?: string | null) => v || '-' },
    { title: t('rdm.projOverview.colPo'), dataIndex: 'productOwnerUserName', key: 'productOwnerUserName', width: 110, render: (v?: string | null) => v || '-' },
    { title: t('rdm.projOverview.colPlanStart'), dataIndex: 'planStartDate', key: 'planStartDate', width: 125, sorter: true, render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>-</span> },
    { title: t('rdm.projOverview.colPlanEnd'), dataIndex: 'planEndDate', key: 'planEndDate', width: 125, sorter: true, render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>-</span> },
    {
      /**
       * 三层进度同格呈现（需求 → 交付项 → 研发任务）：三个数全部取自后端事实源同一行，
       * 前端不做任何换算，否则又会出现「卡片≠行级导出」的多套口径。
       */
      title: t('rdm.projOverview.colDelivery'), key: 'delivery', width: 300,
      render: (_, record) => (
        <span
          style={{ color: '#1890FF', cursor: 'pointer', fontSize: 13 }}
          onClick={() => navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)}
        >
          {t('rdm.projOverview.deliveryTriple', {
            req: record.requirementTotal ?? 0,
            done: record.deliveredCount,
            total: record.totalDeliveryCount,
            taskDone: record.taskCompleted ?? 0,
            taskTotal: record.taskTotal ?? 0,
          })}
        </span>
      ),
    },
    {
      title: t('rdm.projOverview.colRemaining'), key: 'remaining', width: 130,
      render: (_, record) => {
        // 口径：剩余 = 承诺交付项数 − 已交付数，只算交付项，不算需求与研发任务。
        // 承诺数为 0 时必须单独呈现：旧实现 0−0=0 走「全部完成」分支，刚建完还没排交付项的项目
        // 会被显示成已全部交付完，等于把「还没承诺」谎报成「已经做完」。
        if (record.totalDeliveryCount === 0) return <span style={{ color: '#8C8C8C' }}>{t('rdm.projOverview.remainingNone')}</span>
        const remaining = record.totalDeliveryCount - record.deliveredCount
        if (remaining <= 0) return <span style={{ color: '#52C41A' }}>{t('rdm.projOverview.remainingAllDone')}</span>
        return (
          <span style={{ fontSize: 13, color: '#595959' }}>
            {record.blockedCount > 0 && <Tag color="error" style={{ marginRight: 4 }}>{t('rdm.projOverview.blockedInline', { n: record.blockedCount })}</Tag>}
            {t('rdm.projOverview.remainingMore', { n: remaining })}
          </span>
        )
      },
    },
    { title: t('rdm.projOverview.colNextDelivery'), dataIndex: 'nextDeliveryDate', key: 'nextDeliveryDate', width: 120, render: (v?: string | null) => v || <span style={{ color: '#8C8C8C' }}>-</span> },
    {
      title: t('rdm.projOverview.colBlockDecision'), key: 'blockDecision', width: 130,
      render: (_, record) => (
        <Space size={4}>
          {record.blockedCount > 0 && <Tag color="error" style={{ margin: 0 }}>{t('rdm.projOverview.blockedTag', { n: record.blockedCount })}</Tag>}
          {record.pendingDecisionCount > 0 && <Tag color="purple" style={{ margin: 0 }}>{t('rdm.projOverview.pendingTag', { n: record.pendingDecisionCount })}</Tag>}
          {record.blockedCount === 0 && record.pendingDecisionCount === 0 && <span style={{ color: '#52C41A', fontSize: 12 }}>{t('rdm.projOverview.normalText')}</span>}
        </Space>
      ),
    },
    {
      title: t('rdm.projOverview.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string, record) => (
        <Space size={4}>
          <Tag color={RDM_PROJECT_STATUS_COLOR[v] ?? 'default'} style={{ margin: 0 }}>{RDM_PROJECT_STATUS_LABEL[v] ?? v}</Tag>
          {/* 标记是 0/1 数字，必须用 === 1 判定；写成 `flag && <Tag/>` 会把 0 当成文本渲染出来 */}
          {record.pausedFlag === 1 && <Tag color="warning" style={{ margin: 0 }}>{t('rdm.projOverview.tagPaused')}</Tag>}
          {record.riskFlag === 1 && <Tag color="error" style={{ margin: 0 }}>{t('rdm.projOverview.tagRisk')}</Tag>}
        </Space>
      ),
    },
    {
      // 目标已从「項目及目標」拆出独立成列：单元格单行截断，鼠标移入弹 Tooltip 看全文。
      // 表格单元格截断悬浮属「问号/提示说明规范」保留 Tooltip 的正当场景（非解释性长文案）。
      // antd 默认 .ant-tooltip 宽上限 250px，目标多为多句长文本，必须放宽 root 宽度才会折行。
      title: t('rdm.projOverview.colObjective'), dataIndex: 'objective', key: 'objective', width: 240,
      render: (v?: string | null) => v
        ? (
          <Tooltip
            title={v}
            placement="topLeft"
            styles={{
              root: { maxWidth: 520 },
              body: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7 },
            }}
          >
            <span style={{ color: '#595959', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v}
            </span>
          </Tooltip>
        )
        : <span style={{ color: '#8C8C8C' }}>-</span>,
    },
    // 最后更新人：后端 rdm:schema:v3.14 起写入；存量行为空，降级显示 -
    { title: t('rdm.projOverview.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 110, render: (v?: string | null) => v || '-' },
    { title: t('rdm.projOverview.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 135, sorter: true, defaultSortOrder: 'descend', render: (v?: string) => v?.slice(0, 10) || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 220, fixed: 'right',
      /** §B.9 操作列纯文字 + 竖线分隔；原先收进「更多」的编辑/暂停直接放出来，省一次点击与误点下拉 */
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)}>詳情</Button>
          <Button type="link" size="small" onClick={() => navigate(`/rdm-project-detail?id=${record.id}&mode=edit&${searchParams.toString()}`)}>{t('common.edit')}</Button>
          <Button type="link" size="small" onClick={() => handleTogglePause(record)}>
            {record.pausedFlag === 1 ? t('rdm.projOverview.btnResume') : t('rdm.projOverview.btnPause')}
          </Button>
        </Space>
      ),
    },
  ]

  // §E.3 列配置：字段设置面板放操作区右侧，編號固定首列、操作列固定末列
  const { configComponent, applyConfig } = useColumnConfig('rdm-project-overview', columnMeta, [
    { key: 'projectNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const visibleColumns = applyConfig(columns)
  // 横向滚动宽度按「当前可见列」累计，隐藏列不再撑出空白
  const tableWidth = visibleColumns.reduce((sum, col) => sum + Number(col.width ?? 120), 0)
  const canManageGrayscale = hasPermission('rdm-delivery-release:edit')
  const canManageMigration = hasPermission('rdm-delivery:edit')

  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error" showIcon closable style={{ marginBottom: 12 }} message={error}
          action={<Button size="small" onClick={() => loadList(queryParams)}>重試</Button>}
        />
      )}

      {/* ── 搜索區（必須在統計卡之前）：§E.1 由 .search-section + Form layout="inline" 提供 4 列 grid ── */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('rdm.projOverview.filterKeyword')}>
            <Input
              placeholder={t('rdm.projOverview.filterKeywordPlaceholder')}
              value={keywordDraft}
              onChange={e => setKeywordDraft(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
            />
          </Form.Item>
          <Form.Item label={t('rdm.projOverview.filterPm')}>
            <Select
              showSearch
              labelInValue
              placeholder={t('rdm.projOverview.filterPmPlaceholder')}
              value={pmDraft}
              filterOption={false}
              onSearch={(v) => void searchEmployee(v, setPmOptions)}
              onChange={(v) => { setPmDraft(v as EmpOption | undefined) }}
              onFocus={() => { if (!pmOptions.length) void searchEmployee('', setPmOptions) }}
              notFoundContent={empSearching ? <Spin size="small" /> : null}
              options={pmOptions}
              allowClear
            />
          </Form.Item>
          <Form.Item label={t('rdm.projOverview.filterPo')}>
            <Select
              showSearch
              labelInValue
              placeholder={t('rdm.projOverview.filterPoPlaceholder')}
              value={poDraft}
              filterOption={false}
              onSearch={(v) => void searchEmployee(v, setPoOptions)}
              onChange={(v) => { setPoDraft(v as EmpOption | undefined) }}
              onFocus={() => { if (!poOptions.length) void searchEmployee('', setPoOptions) }}
              notFoundContent={empSearching ? <Spin size="small" /> : null}
              options={poOptions}
              allowClear
            />
          </Form.Item>
          <Form.Item label={t('rdm.projOverview.filterStatus')}>
            <Select
              placeholder={t('rdm.projOverview.filterStatusPlaceholder')}
              value={statusDraft}
              onChange={setStatusDraft}
              options={STATUS_OPTIONS}
              allowClear
            />
          </Form.Item>
          <Form.Item label={t('rdm.projOverview.filterPlanDate')}>
            <RangePicker
              value={planRangeDraft}
              onChange={(v) => setPlanRangeDraft(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              placeholder={[t('common.startDate'), t('common.endDate')]}
              format={DATE_FORMAT}
              style={{ width: '100%' }}
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ── 統計卡片（必須在搜索區之後、action-section 之前）：可下鑽 ── */}
      <div style={{ marginBottom: 16 }}>
        {statsError && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 8 }}
            message={stats ? '統計載入失敗，以下為上次成功口徑（未回零）' : '統計載入失敗，暫無可用口徑'}
          />
        )}
        {statsLoading && !stats ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <StatCards
            animationKey={statsAnimKey}
            /* §B.7：數據指標卡固定 4 格 grid，3 张卡不得拉伸铺满整行 */
            columns={4}
            items={[
              {
                key: 'inProgress', icon: <SyncOutlined spin />, value: statVal(stats?.inProgressCount),
                label: '進行中項目', color: 'info', active: drill === 'inProgress',
                title: '點擊下鑽：僅看進行中項目', onClick: () => handleDrill('inProgress'),
              },
              {
                key: 'attention', icon: <AlertOutlined />, value: statVal(stats?.attentionCount),
                label: '需關注項目', color: 'brand', active: drill === 'attention',
                title: t('rdm.projOverview.drillTitleAttention'), onClick: () => handleDrill('attention'),
              },
              {
                key: 'pending', icon: <ClockCircleOutlined />, value: statVal(stats?.pendingDecisionCount),
                label: '待裁決事項', color: 'system', active: drill === 'pending',
                title: '點擊下鑽：僅看待裁決項目', onClick: () => handleDrill('pending'),
              },
            ]}
          />
        )}
      </div>

      {/* ── 操作區：§E.2 導出/批量类在左，新增与字段设置在右 ── */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>導出全量報告</Button>
          {canManageMigration && (
            <Button icon={<SwapOutlined />} onClick={() => navigate('/rdm-stock-migration')}>存量遷移</Button>
          )}
          {canManageGrayscale && (
            <Button icon={<ControlOutlined />} onClick={() => navigate('/rdm-grayscale')}>灰度管理</Button>
          )}
          {drill && (
            <Tag color="blue" closable onClose={() => commitQuery({ drill: undefined })}>
              {t('rdm.projOverview.drillCount', { label: DRILL_LABEL[drill], total })}
            </Tag>
          )}
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/rdm-project-detail?mode=create&${searchParams.toString()}`)}>
            新增項目
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ── 數據表格 ── */}
      <Table<RdmProjectListItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={visibleColumns}
        dataSource={sortedRows}
        tableLayout="fixed"
        scroll={{ x: tableWidth }}
        onChange={handleTableChange}
        onRow={record => ({
          onClick: (e) => {
            const target = e.target as HTMLElement
            if (target.closest('button') || target.closest('.ant-dropdown')) return
            navigate(`/rdm-project-detail?id=${record.id}&${searchParams.toString()}`)
          },
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: error
            ? <Empty description="載入失敗" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            : <Empty description="暫無項目數據" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
        }}
        pagination={{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          // drill 已在服务端参与筛选与计数，分页总数就是下钻后的项目数（无需再标注「僅當前頁」）
          showTotal: (total: number) => (drill ? t('rdm.projOverview.pageDrill', { total }) : t('rdm.projOverview.pageAll', { total })),
          onChange: handlePageChange,
        }}
      />
    </div>
  )
}
