/**
 * 項目詳情 —— V3 分批交付項目單項完整視圖
 *
 * 四大板塊（上而下）：
 * 1. 基本信息（Descriptions 4 列）
 * 2. 項目目標（長文本獨立成卡，避免與字段網格混排後難以區分）
 * 3. 交付清單（按需求分組、可展開）
 * 4. 待推進事項（按類型分組）
 *
 * 右側邊欄：快捷操作 + 成員列表
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Segmented,
  Space,
  Spin,
  Tag,
  message,
} from 'antd'
import dayjs from 'dayjs'
import {
  AimOutlined,
  AlertOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { FormInstance } from 'antd'
import EmployeeSelect from '../MeetingManagement/EmployeeSelect'
import RdmFormHeader from './components/RdmFormHeader'
import { useAuth } from '../../contexts/AuthContext'
import {
  addProjectMember,
  createProject,
  fetchProjectDetail,
  fetchProjectRequirementBoard,
  removeProjectMember,
  updateProject,
  urgeProject,
  type RdmProjectDetail as ProjectDetailType,
  type RdmProjectIterationGroup,
  type RdmProjectRequirementBoard,
  type RdmProjectRequirementRow,
  type RdmProjectRequirementTodo,
} from '../../api/rdm'
import {
  RDM_ITERATION_STATUS_LABEL,
  RDM_PROJECT_STATUS_COLOR,
  RDM_PROJECT_STATUS_LABEL,
  RDM_STATUS_COLOR,
  RDM_STATUS_LABEL,
} from '../../constants/rdm'
import './index.css'

/**
 * 待推進事項類型配置（需求/任務口徑）。
 * <p>取代舊的交付項待辦：項目下的待准入需求、未排期需求、逾期需求、阻塞任務與待裁決問題
 * 才是 PM 真正要推的事；交付項只是需求的驗收批次，不再是可見性前提。
 */
const PENDING_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  intake_pending: { icon: <FileTextOutlined />,          color: '#E8720C', bg: '#FFF7E6', label: '待准入需求' },
  unplanned:      { icon: <ClockCircleOutlined />,      color: '#1890FF', bg: '#E6F7FF', label: '未排期需求' },
  overdue:        { icon: <ExclamationCircleOutlined />, color: '#FF4D4F', bg: '#FFF1F0', label: '逾期需求' },
  blocked_task:   { icon: <StopOutlined />,              color: '#FF4D4F', bg: '#FFF1F0', label: '阻塞任務' },
  no_owner:       { icon: <UserAddOutlined />,           color: '#722ED1', bg: '#F9F0FF', label: '缺研發負責人' },
  decision:       { icon: <ThunderboltOutlined />,       color: '#722ED1', bg: '#F9F0FF', label: '待裁決' },
}

/** 需求交付完成口径：上线(released)仍需验收，不算完成 */
const REQ_DONE_STATUSES = new Set(['verified', 'closed'])
const isReqDone = (status: string) => REQ_DONE_STATUSES.has(status)

/**
 * 項目成員角色碼展示文案。
 * <p>後端存的是小寫口徑（pm/product/dev_lead/dev/designer/qa/ops/pmo），直接原樣渲染會把
 * 「dev_lead」這類下劃線碼擺到用戶面前；映射只影響展示，不改變寫入值。
 */
const MEMBER_ROLE_LABEL: Record<string, string> = {
  pm: 'PM', product: '產品', dev_lead: '技術', dev: '研發', designer: 'UI', qa: '測試', ops: '運維', pmo: 'PMO',
}

/** 手動添加成員可選角色（與後端 RdmProjectDTO.MemberAdd 的 roleCode 白名單一致） */
const MEMBER_ROLE_OPTIONS = ['pm', 'product', 'dev_lead', 'designer', 'qa', 'ops', 'pmo'] as const

/**
 * 負責人選擇行：字段存 sys_user.id 标量，姓名快照由 onPick 旁路寫入 *UserName。
 *
 * <p>EmployeeSelect 的 value 契约是 number[]，表单里存的却是标量 ID，两边用
 * getValueProps / normalize 做双向适配。过去把 Form.Item 绑在 *UserName 上、再在 JSX 里
 * 手写 value/onChange，会被 Form.Item 注入的同名 props 覆盖（rc-field-form 是
 * `{...childProps, ...valueProps}`，注入的 value 是姓名字符串，组件按 value[0] 只能取出
 * 一个汉字；注入的 onChange 又会先把字段覆盖成 ID 数组）。实测后果：编辑页六个负责人
 * 一个都不回显，新建提交时 pmUserName 丢成 undefined（姓名靠后端 resolveUserName 按 ID 兑回来）。
 */
function OwnerFormItem({ form, idKey, nameKey, label }: { form: FormInstance; idKey: string; nameKey: string; label: string }) {
  return (
    <Form.Item
      name={idKey}
      label={label}
      getValueProps={(v?: number) => ({ value: v == null ? [] : [v] })}
      normalize={(picked?: number[]) => picked?.[0]}
    >
      <EmployeeSelect
        single
        placeholder="搜尋姓名或工號"
        onPick={items => form.setFieldsValue({ [nameKey]: items[0]?.name ?? '' })}
      />
    </Form.Item>
  )
}

/**
 * 催辦結果（頁面級擴展類型，additive）。
 * <p>api/rdm.ts 的 RdmTodoNotifyResult 只聲明了 3 個核心字段；後端 TodoNotifyResult 實際下發
 * 更完整的「為什麼沒發」可解釋字段。此處僅在頁面層做只讀擴展展示，不改動已驗證的 API 契約類型。
 * <p>該端點已接 executeOnce：同日重複點擊會回放首次結果，故呈现為「結果回放」而非「又發一次」。
 */
interface UrgeNotifyResult {
  scannedProjects?: number; scannedTodos?: number;
  notified?: number; deduped?: number; unassigned?: number;
  nonWorkingDay?: number; belowThreshold?: number; failed?: number;
  remindDay?: string; notes?: string[];
}

/** 從詳情頁 URL 中提取總覽的篩選/分頁鍵（排除 mode/id），用於返回時還原條件 */
const LIST_QUERY_KEYS = ['keyword', 'status', 'pmUserId', 'pmName', 'pageNo', 'pageSize', 'drill']

const { TextArea } = Input

type FormMode = 'create' | 'edit' | 'view'

export default function ProjectDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const mode: FormMode = (searchParams.get('mode') as FormMode) || 'view'
  const projectId = searchParams.get('id') ? Number(searchParams.get('id')) : NaN
  const isFormMode = mode === 'create' || mode === 'edit'
  /**
   * 详情页只读边界：只有 view 的人不得看到编辑/成员维护/催办入口。
   * 这些按钮背后都是 @RequirePermission(..., action = "edit") 的写接口，
   * 放出来只会让查看者点一次 403；真正的强校验仍由后端兜底。
   */
  const canEditProject = hasPermission('rdm-dashboard-project:edit')
  const canCreateProject = hasPermission('rdm-dashboard-project:create')

  // ── 數據狀態 ──
  const [detail, setDetail] = useState<ProjectDetailType | null>(null)
  /** 需求視角：迭代分組 + 需求行 + 待推進；取代舊的交付項清單/待辦兩套接口 */
  const [board, setBoard] = useState<RdmProjectRequirementBoard | null>(null)
  const [loading, setLoading] = useState(!isFormMode || mode === 'edit')
  const [error, setError] = useState<string | null>(null)

  // ── 表單狀態（create/edit） ──
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // ── 交付清單篩選 ──
  const [checklistFilter, setChecklistFilter] = useState<'unfinished' | 'all'>('unfinished')

  // ── 添加成員 Modal ──
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [memberUserId, setMemberUserId] = useState<number | null>(null)
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState<string>('dev')
  const [memberSubmitting, setMemberSubmitting] = useState(false)

  // ── 催辦（urge）結果 ──
  const [urging, setUrging] = useState(false)
  const [urgeResult, setUrgeResult] = useState<UrgeNotifyResult | null>(null)
  const [urgeOpen, setUrgeOpen] = useState(false)

  // ── 返回總覽時還原原查詢條件（keyword/status/pmUserId/pageNo/pageSize/drill）──
  const backToList = useCallback(() => {
    const q = new URLSearchParams()
    for (const k of LIST_QUERY_KEYS) {
      const v = searchParams.get(k)
      if (v) q.set(k, v)
    }
    const qs = q.toString()
    navigate(qs ? `/rdm-project?${qs}` : '/rdm-project')
  }, [navigate, searchParams])

  /** 帶當前總覽條件跳轉編輯（返回後仍可還原） */
  const listSuffix = useMemo(() => {
    const q = new URLSearchParams()
    for (const k of LIST_QUERY_KEYS) {
      const v = searchParams.get(k)
      if (v) q.set(k, v)
    }
    const qs = q.toString()
    return qs ? `&${qs}` : ''
  }, [searchParams])

  // ── 手動催辦：展示「為什麼沒發」的可解釋結果 ──
  const handleUrge = async () => {
    if (!projectId || isNaN(projectId)) return
    setUrging(true)
    try {
      const res = await urgeProject(projectId) as unknown as UrgeNotifyResult
      setUrgeResult(res)
      setUrgeOpen(true)
    } catch {
      // request.ts 已统一弹后端失败原因
    } finally {
      setUrging(false)
    }
  }

  // ── 載入數據 ──
  const loadAll = useCallback(async () => {
    if (!projectId || isNaN(projectId)) return
    setLoading(true)
    setError(null)
    try {
      if (isFormMode) {
        // 表單模式只需加載項目基本信息
        const detailRes = await fetchProjectDetail(projectId)
        setDetail(detailRes)
        if (mode === 'edit') {
          form.setFieldsValue({
            name: detailRes.name,
            objective: detailRes.objective || '',
            pmUserId: detailRes.pmUserId ?? undefined,
            pmUserName: detailRes.pmUserName || '',
            productOwnerUserId: detailRes.productOwnerUserId ?? undefined,
            productOwnerUserName: detailRes.productOwnerUserName || '',
            techLeadUserId: detailRes.techLeadUserId ?? undefined,
            techLeadUserName: detailRes.techLeadUserName || '',
            uiDesignerUserId: detailRes.uiDesignerUserId ?? undefined,
            uiDesignerUserName: detailRes.uiDesignerUserName || '',
            qaLeadUserId: detailRes.qaLeadUserId ?? undefined,
            qaLeadUserName: detailRes.qaLeadUserName || '',
            opsLeadUserId: detailRes.opsLeadUserId ?? undefined,
            opsLeadUserName: detailRes.opsLeadUserName || '',
            planStartDate: detailRes.planStartDate ? dayjs(detailRes.planStartDate) : null,
            planEndDate: detailRes.planEndDate ? dayjs(detailRes.planEndDate) : null,
            defaultAcceptancePath: detailRes.defaultAcceptancePath || 'A',
          })
        }
      } else {
        const [detailRes, boardRes] = await Promise.all([
          fetchProjectDetail(projectId),
          fetchProjectRequirementBoard(projectId),
        ])
        setDetail(detailRes)
        setBoard(boardRes)
      }
    } catch {
      setError(isFormMode ? '項目數據載入失敗，請重試' : '項目詳情載入失敗，請重試')
    } finally {
      setLoading(false)
    }
  }, [projectId, isFormMode, mode, form])

  useEffect(() => {
    if (mode === 'create') {
      // 新增模式無需載入數據
      setLoading(false)
      form.setFieldsValue({ defaultAcceptancePath: 'A' })
    } else if (projectId && !isNaN(projectId)) {
      loadAll()
    } else {
      // 無 id 且非 create 模式 → 錯誤
      setLoading(false)
      setError('缺少有效的項目 ID')
    }
  }, [mode, projectId, loadAll, form])

  // ── 篩選後的迭代/需求（未完成 = 排除已驗證/已關閉）──
  const visibleIterations = useMemo<RdmProjectIterationGroup[]>(() => {
    const list = board?.iterations ?? []
    if (checklistFilter === 'all') return list
    return list.map(group => ({
      ...group,
      requirements: group.requirements.filter(req => !isReqDone(req.status)),
    }))
  }, [board, checklistFilter])

  const visibleUnplanned = useMemo<RdmProjectRequirementRow[]>(() => {
    const list = board?.unplanned ?? []
    return checklistFilter === 'all' ? list : list.filter(req => !isReqDone(req.status))
  }, [board, checklistFilter])

  /** 交付清單是否有內容（迭代下需求 + 未排期需求） */
  const hasRequirementContent = visibleIterations.some(g => g.requirements.length > 0) || visibleUnplanned.length > 0

  // ── 待推進事項按類型分組 ──
  const pendingGroups = useMemo(() => {
    const map = new Map<string, RdmProjectRequirementTodo[]>()
    for (const item of board?.todos ?? []) {
      const list = map.get(item.type) ?? []
      list.push(item)
      map.set(item.type, list)
    }
    return Array.from(map.entries())
  }, [board])

  /**
   * 需求行渲染（迭代分组与未排期组共用）。
   * <p>交付项完成度只作补充：未拆分（deliveryItemTotal=0）不代表没进展，不给“缺失”误导色。
   */
  const renderRequirementRows = (rows: RdmProjectRequirementRow[], emptyText: string) => {
    if (rows.length === 0) {
      return <div style={{ fontSize: 12, color: '#8C8C8C', padding: '4px 0' }}>{emptyText}</div>
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(req => (
          <div
            key={req.id}
            onClick={() => navigate(`/rdm-detail?id=${req.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
              background: req.blocked || req.overdue ? '#FFF7F0' : '#FAFBFC',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Tag color="default" style={{ margin: 0, flexShrink: 0 }}>{req.reqNo || `需求 #${req.id}`}</Tag>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#262626' }}>
              {req.title}
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C', flexShrink: 0 }}>
              {req.pmName ? `PM ${req.pmName}` : 'PM -'} · {req.devOwnerName ? `研發 ${req.devOwnerName}` : '研發 -'}
            </span>
            <Tag
              color={(RDM_STATUS_COLOR as Record<string, string>)[req.status] ?? 'default'}
              style={{ margin: 0, flexShrink: 0 }}
            >
              {(RDM_STATUS_LABEL as Record<string, string>)[req.status] ?? req.status}
            </Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C', flexShrink: 0, minWidth: 72 }}>{req.planDevDate || '-'}</span>
            {req.deliveryItemTotal > 0 ? (
              <Tag
                color={req.deliveryItemDone === req.deliveryItemTotal ? 'success' : 'blue'}
                style={{ margin: 0, flexShrink: 0 }}
              >
                交付項 {req.deliveryItemDone}/{req.deliveryItemTotal}
              </Tag>
            ) : (
              <Tag style={{ margin: 0, flexShrink: 0 }}>未拆分</Tag>
            )}
            {req.blocked && <Tag color="error" style={{ margin: 0, flexShrink: 0 }}>阻塞</Tag>}
            {req.overdue && <Tag color="red" style={{ margin: 0, flexShrink: 0 }}>逾期</Tag>}
          </div>
        ))}
      </div>
    )
  }

  // ── 添加成員 ──
  /** 關閉並重置：不清空會讓下一次打開面帶上一次的人和角色 */
  const closeMemberModal = () => {
    setMemberModalOpen(false)
    setMemberUserId(null)
    setMemberName('')
  }

  const handleAddMember = async () => {
    // 成員必須綁真實 sys_user.id：舊實現傳 userId: 0，寫進去的人在權限與負載計算裡都是幽靈行
    if (!memberUserId) {
      message.warning('請選擇成員')
      return
    }
    setMemberSubmitting(true)
    try {
      await addProjectMember(projectId, { userId: memberUserId, userName: memberName, roleCode: memberRole })
      message.success('成員添加成功')
      closeMemberModal()
      loadAll()
    } catch {
      // request.ts 已统一彈後端失敗原因（如「該成員已在項目中」），這裡再彈就是双彈（AGENTS §G.4）
    } finally {
      setMemberSubmitting(false)
    }
  }

  // ── 移除成員 ──
  const handleRemoveMember = (userId: number, userName: string) => {
    Modal.confirm({
      title: '確認移除成員',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: `確定要將「${userName}」從項目中移除嗎？`,
      okText: '確認移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await removeProjectMember(projectId, userId)
          message.success('已移除成員')
          loadAll()
        } catch {
          // request.ts 已统一弹后端返回的失败原因，这里再弹一次就是双弹（AGENTS §G.4）
        }
      },
    })
  }

  // ── 表單提交 ──
  const handleFormSubmit = async () => {
    try {
      // validateFields 只返回「已注册 Form.Item」的字段，所以用它做校验；
      // 但六个负责人是按 EmployeeSelect 的 onChange/onPick 双写的，*UserId 并没有注册字段、
      // 只存在于 form store 里。过去直接拿 validateFields 的返回值拼 payload，
      // pmUserId 等六个 ID 恒为 undefined（端到端实测：POST/PATCH 体里根本没有 pmUserId），
      // 后果是项目没有 PM → 不会被自动拉进成员表 → 创建人自己也改不动自己建的项目。
      await form.validateFields()
      const values = form.getFieldsValue(true)
      setSubmitting(true)
      const payload = {
        name: values.name,
        objective: values.objective || undefined,
        // 六组负责人一律「未选 = userId null + userName 空串」：后端拿 userName 非 null
        // 当「本次提供了该角色」的哨兵，配合实体列的 updateStrategy=ALWAYS 才能真把负责人清空。
        // 过去 PM/PO 走 `|| undefined`，JSON 里连 key 都不发，后端哨兵不成立 → 清空不生效。
        pmUserId: values.pmUserId ?? null,
        pmUserName: values.pmUserName ?? '',
        productOwnerUserId: values.productOwnerUserId ?? null,
        productOwnerUserName: values.productOwnerUserName ?? '',
        techLeadUserId: values.techLeadUserId ?? null,
        techLeadUserName: values.techLeadUserName ?? '',
        uiDesignerUserId: values.uiDesignerUserId ?? null,
        uiDesignerUserName: values.uiDesignerUserName ?? '',
        qaLeadUserId: values.qaLeadUserId ?? null,
        qaLeadUserName: values.qaLeadUserName ?? '',
        opsLeadUserId: values.opsLeadUserId ?? null,
        opsLeadUserName: values.opsLeadUserName ?? '',
        planStartDate: values.planStartDate ? values.planStartDate.format('YYYY-MM-DD') : undefined,
        planEndDate: values.planEndDate ? values.planEndDate.format('YYYY-MM-DD') : undefined,
        defaultAcceptancePath: values.defaultAcceptancePath || 'A',
      }
      if (mode === 'edit' && detail) {
        await updateProject(projectId, { ...payload, expectedVersion: detail.version })
        message.success('項目更新成功')
      } else {
        await createProject(payload)
        message.success('項目創建成功')
      }
      backToList()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(mode === 'edit' ? '更新失敗，請重試' : '創建失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 載入中 ──
  if (loading && !detail) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="載入項目..." />
      </div>
    )
  }

  // ── 錯誤或無 ID（非表單模式）──
  if (error && !isFormMode) {
    return (
      <div className="content-area">
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={loadAll}>重試</Button>}
          style={{ marginBottom: 16 }}
        />
        <Button onClick={() => backToList()}>返回項目總覽</Button>
      </div>
    )
  }

  // ── 錯誤（表單模式 edit 載入失敗）──
  if (error && isFormMode) {
    return (
      <div className="content-area">
        <RdmFormHeader title={mode === 'edit' ? '編輯項目' : '新增項目'} onBack={() => backToList()} backText="返回項目" />
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={loadAll}>重試</Button>}
        />
      </div>
    )
  }

  // ── 表單權限守衛：直接拼 URL 進入 edit/create 也不放行 ──
  // 列表已按權限隱藏入口，這裡再兜一層前端體驗邊界（安全仍由後端 @RequirePermission 兜底），
  // 避免只有查看權的人通過手改地址進入可提交的表單。
  if (isFormMode && !(mode === 'create' ? canCreateProject : canEditProject)) {
    return (
      <div className="content-area">
        <RdmFormHeader title={mode === 'edit' ? '編輯項目' : '新增項目'} onBack={() => backToList()} backText="返回項目" />
        <Alert
          type="warning"
          showIcon
          message={t('rdm.projDetail.editDeniedTitle')}
          description={t('rdm.projDetail.editDeniedDesc')}
          action={<Button size="small" onClick={() => backToList()}>{t('rdm.projDetail.backToProject')}</Button>}
        />
      </div>
    )
  }

  // ── 表單視圖（create / edit）──
  if (isFormMode) {
    return (
      <div className="content-area">
        <RdmFormHeader
          title={mode === 'edit' ? '編輯項目' : '新增項目'}
          onBack={() => backToList()}
          backText="返回項目"
        />
        <div className="rdm-card" style={{ padding: '20px 24px' }}>
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
              <FileTextOutlined style={{ fontSize: 14 }} />
            </span>
            <span>基本信息</span>
            <div className="rdm-card-title-split" />
          </div>
          <Form form={form} layout="vertical">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item name="name" label="項目名稱" rules={[{ required: true, message: '請輸入項目名稱' }]}>
                <Input placeholder="輸入項目名稱" maxLength={100} />
              </Form.Item>
              <OwnerFormItem form={form} idKey="pmUserId" nameKey="pmUserName" label="項目經理" />
              <OwnerFormItem form={form} idKey="productOwnerUserId" nameKey="productOwnerUserName" label="產品負責人" />
              <OwnerFormItem form={form} idKey="techLeadUserId" nameKey="techLeadUserName" label="技術負責人" />
              <OwnerFormItem form={form} idKey="uiDesignerUserId" nameKey="uiDesignerUserName" label="UI 設計負責人" />
              <OwnerFormItem form={form} idKey="qaLeadUserId" nameKey="qaLeadUserName" label="測試負責人" />
              <OwnerFormItem form={form} idKey="opsLeadUserId" nameKey="opsLeadUserName" label="運維負責人" />
              <Form.Item name="planStartDate" label="計劃開始日期">
                <DatePicker style={{ width: '100%' }} placeholder="選擇開始日期" />
              </Form.Item>
              <Form.Item name="planEndDate" label="計劃結束日期">
                <DatePicker style={{ width: '100%' }} placeholder="選擇結束日期" />
              </Form.Item>
            </div>
            <Form.Item name="objective" label="項目目標" style={{ marginTop: 16 }}>
              <TextArea placeholder="描述項目的核心目標與交付成果" rows={3} maxLength={500} />
            </Form.Item>
            <Form.Item name="defaultAcceptancePath" label="默認驗收路徑">
              <Radio.Group>
                <Radio value="A">路徑A（先驗收後上線）</Radio>
                <Radio value="B">路徑B（先上線後驗收）</Radio>
              </Radio.Group>
            </Form.Item>
          </Form>
        </div>
        <div className="form-footer">
          <Button onClick={() => backToList()}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleFormSubmit}>
            {mode === 'edit' ? '保存修改' : '創建項目'}
          </Button>
        </div>
      </div>
    )
  }

  // ── 正常詳情視圖需要 detail ──
  if (!detail) {
    return (
      <div className="content-area">
        <Alert type="error" showIcon message="無法載入項目" style={{ marginBottom: 16 }} />
        <Button onClick={() => backToList()}>返回項目總覽</Button>
      </div>
    )
  }

  const statusLabel = RDM_PROJECT_STATUS_LABEL[detail.status] ?? detail.status
  const statusColor = RDM_PROJECT_STATUS_COLOR[detail.status] ?? 'default'

  return (
    <div className="content-area">
      {/* ── 頁頭 ── */}
      <RdmFormHeader
        title={detail.name}
        onBack={() => backToList()}
        backText="返回項目"
        badge={
          <Space size={4}>
            <Tag color={statusColor} style={{ margin: 0 }}>{statusLabel}</Tag>
            {/* 标记是后端 Integer 的 0/1，必须 === 1 判定；写成 `flag && <Tag/>` 会把 0 当成文本渲染到头部 */}
            {detail.pausedFlag === 1 && <Tag color="warning" icon={<PauseCircleOutlined />} style={{ margin: 0 }}>{t('rdm.projDetail.tagPaused')}</Tag>}
            {detail.riskFlag === 1 && <Tag color="error" icon={<AlertOutlined />} style={{ margin: 0 }}>{t('rdm.projDetail.tagRisk')}</Tag>}
            {detail.overdueFlag === 1 && <Tag color="red" style={{ margin: 0 }}>{t('rdm.projDetail.tagOverdue')}</Tag>}
          </Space>
        }
        meta={
          <span>
            項目編號 {detail.projectNo}
            {detail.pmUserName && ` · 負責人 ${detail.pmUserName}`}
            {detail.planStartDate && ` · 計劃 ${detail.planStartDate} ~ ${detail.planEndDate || '待定'}`}
          </span>
        }
      />

      {/* 头部只留返回 + 标题 + 状态/编号（§C.2）：刷新/催办/编辑/新增都属于操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>
          {canEditProject && (
            <Button icon={<BellOutlined />} loading={urging} onClick={handleUrge}>催辦待辦</Button>
          )}
        </div>
        <div className="action-section-right">
          {/* 交付項只能在需求下拆分（后端强制 reqId）：项目维度不再提供创建入口 */}
          {canEditProject && (
            <Button icon={<EditOutlined />} onClick={() => navigate(`/rdm-project-detail?id=${detail.id}&mode=edit${listSuffix}`)}>編輯項目</Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-submit')}>新增需求</Button>
        </div>
      </div>

      {/* ── 主體：左側內容 + 右側邊欄 ── */}
      <div className="rdm-detail-grid">
        {/* 左側主內容 */}
        <div className="rdm-detail-main">
          {/* Section 1：基本信息（項目目標已拆出為獨立卡片） */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
                <FileTextOutlined />
              </span>
              基本信息
              <span className="rdm-card-title-split" />
            </div>
            <Descriptions
              column={4}
              size="small"
              styles={{ label: { color: '#8C8C8C', fontSize: 12 }, content: { color: '#262626', fontSize: 13 } }}
            >
              <Descriptions.Item label="項目經理">{detail.pmUserName || '-'}</Descriptions.Item>
              <Descriptions.Item label="產品負責人">{detail.productOwnerUserName || '-'}</Descriptions.Item>
              <Descriptions.Item label="計劃開始">{detail.planStartDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="計劃結束">{detail.planEndDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="當前狀態">
                <Tag color={statusColor} style={{ margin: 0 }}>{statusLabel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="默認驗收路徑">
                {detail.defaultAcceptancePath === 'A' ? '路徑A（先驗收後上線）' :
                 detail.defaultAcceptancePath === 'B' ? '路徑B（先上線後驗收）' : '-'}
              </Descriptions.Item>
              {/* 列名与项目总览列表保持一致：清单叫「最後更新時間」，详情里还叫「更新時間」会让人以为是两个字段 */}
              <Descriptions.Item label="最後更新時間">{detail.updatedAt?.slice(0, 16).replace('T', ' ') || '-'}</Descriptions.Item>
              <Descriptions.Item label="版本號">v{detail.version}</Descriptions.Item>
            </Descriptions>
          </div>

          {/* Section 2：項目目標 —— 目標多為帶編號的多句長文，塞進 Descriptions 會和字段網格混成一片，故獨立成卡 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}>
                <AimOutlined />
              </span>
              項目目標
              <span className="rdm-card-title-split" />
            </div>
            {detail.objective ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 6,
                  background: '#FAFBFC',
                  border: '1px solid #f0f0f0',
                  fontSize: 13,
                  lineHeight: 1.9,
                  color: '#262626',
                  // 目標常按「1，2，3」分條書寫，保留使用者輸入的換行
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {detail.objective}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: '#BFBFBF' }}>未設定</span>
            )}
          </div>

          {/* Section 3：交付清單 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}>
                <CheckCircleOutlined />
              </span>
              交付清單
              <span className="rdm-card-title-split" />
              <Segmented
                size="small"
                value={checklistFilter}
                onChange={v => setChecklistFilter(v as 'unfinished' | 'all')}
                options={[
                  { label: '未完成', value: 'unfinished' },
                  { label: '全部', value: 'all' },
                ]}
              />
            </div>

            {!hasRequirementContent ? (
              <Empty description="暫無需求" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                  項目下暫無迭代/需求；待准入需求也會出現在此處
                </div>
              </Empty>
            ) : (
              <Collapse
                accordion={false}
                defaultActiveKey={[
                  ...visibleIterations.slice(0, 2).map(g => g.iterationCode),
                  ...(visibleUnplanned.length > 0 ? ['__unplanned__'] : []),
                ]}
                ghost
                items={[
                  ...visibleIterations.map(group => ({
                    key: group.iterationCode,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color="purple" style={{ margin: 0 }}>{group.iterationCode}</Tag>
                        <span style={{ fontWeight: 500, color: '#262626' }}>{group.iterationName}</span>
                        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                          {(RDM_ITERATION_STATUS_LABEL as Record<string, string>)[group.status] ?? group.status}
                          {group.startDate && ` · ${group.startDate} ~ ${group.endDate || '待定'}`}
                        </span>
                        <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 'auto' }}>
                          {group.requirementDelivered}/{group.requirementTotal} 需求已交付
                        </span>
                      </div>
                    ),
                    children: renderRequirementRows(group.requirements, '該迭代下暫無需求'),
                  })),
                  ...(visibleUnplanned.length > 0
                    ? [{
                        key: '__unplanned__',
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag color="orange" style={{ margin: 0 }}>未排期</Tag>
                            <span style={{ fontWeight: 500, color: '#262626' }}>未挂迭代的需求</span>
                            <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 'auto' }}>
                              {visibleUnplanned.length} 條，需在需求詳情排期時選擇迭代
                            </span>
                          </div>
                        ),
                        children: renderRequirementRows(visibleUnplanned, '暫無未排期需求'),
                      }]
                    : []),
                ]}
              />
            )}
          </div>

          {/* Section 4：待推進事項 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}>
                <ClockCircleOutlined />
              </span>
              待推進事項
              <span className="rdm-card-title-split" />
              <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>共 {board?.todos.length ?? 0} 項</span>
            </div>

            {pendingGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 24 }} />
                <div style={{ fontSize: 13, color: '#8C8C8C', marginTop: 8 }}>所有事項均已推進完成</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pendingGroups.map(([type, items]) => {
                  const cfg = PENDING_TYPE_CONFIG[type] ?? { icon: <AlertOutlined />, color: '#8C8C8C', bg: '#FAFAFA', label: type }
                  return (
                    <div key={type}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span className="rdm-icon-block" style={{ background: cfg.bg, color: cfg.color, width: 22, height: 22 }}>
                          {cfg.icon}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                        <span style={{ fontSize: 12, color: '#8C8C8C' }}>({items.length})</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {items.map(item => (
                          <div
                            key={`${item.type}-${item.refId}`}
                            onClick={() => {
                              if (item.actionUrl) navigate(item.actionUrl)
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '7px 12px',
                              borderRadius: 6,
                              border: '1px solid #f0f0f0',
                              background: '#fff',
                              cursor: item.actionUrl ? 'pointer' : 'default',
                              transition: 'all 0.2s',
                            }}
                          >
                            <Tag color="default" style={{ margin: 0, flexShrink: 0 }}>{item.reqNo || '-'}</Tag>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#262626' }}>
                              {item.title}
                            </span>
                            {item.detail && (
                              <span style={{ fontSize: 12, color: '#8C8C8C', flexShrink: 0, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.detail}
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: '#8C8C8C', flexShrink: 0 }}>{item.responsibleName || '-'}</span>
                            {item.dueDate && (
                              <span style={{ fontSize: 12, color: '#8C8C8C', flexShrink: 0, minWidth: 72 }}>截止 {item.dueDate}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右側邊欄 */}
        <div className="rdm-detail-side">
          {/* 進度統計（雙口徑：需求/迭代為主，交付項為可選批次） */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}>
                <ThunderboltOutlined />
              </span>
              交付進度
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8C8C8C' }}>已交付需求</span>
                <span style={{ color: '#52C41A', fontWeight: 600 }}>
                  {board?.summary.requirementDelivered ?? 0}
                  <span style={{ color: '#BFBFBF', fontWeight: 400 }}> / {board?.summary.requirementTotal ?? 0}</span>
                </span>
              </div>
              {/* 需求進度條 */}
              <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  borderRadius: 3,
                  width: (board?.summary.requirementTotal ?? 0) > 0
                    ? `${Math.round(((board?.summary.requirementDelivered ?? 0) / (board!.summary.requirementTotal)) * 100)}%`
                    : '0%',
                  background: 'linear-gradient(90deg, #52C41A, #73D13D)',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8C8C8C' }}>迭代數</span>
                <span style={{ color: '#262626', fontWeight: 600 }}>{board?.summary.iterationTotal ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8C8C8C' }}>進行中需求</span>
                <span style={{ color: '#1890FF', fontWeight: 600 }}>{board?.summary.requirementInProgress ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8C8C8C' }}>待准入/草稿需求</span>
                <span style={{ color: (board?.summary.requirementPending ?? 0) > 0 ? '#E8720C' : '#262626', fontWeight: 600 }}>
                  {board?.summary.requirementPending ?? 0}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8C8C8C' }}>阻塞任務</span>
                <span style={{ color: (board?.summary.blockedTaskCount ?? 0) > 0 ? '#FF4D4F' : '#262626', fontWeight: 600 }}>
                  {board?.summary.blockedTaskCount ?? 0}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#8C8C8C' }}>待裁決</span>
                <span style={{ color: (board?.summary.pendingDecisionCount ?? 0) > 0 ? '#722ED1' : '#262626', fontWeight: 600 }}>
                  {board?.summary.pendingDecisionCount ?? 0}
                </span>
              </div>
              {/* 次口徑：交付項（可選拆分批次，未拆分時為 0 不誤導） */}
              <div style={{ borderTop: '1px dashed #f0f0f0', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#8C8C8C' }}>交付項（可選批次）</span>
                  <span style={{ color: '#262626', fontWeight: 600 }}>
                    {board?.summary.deliveryItemDone ?? 0}
                    <span style={{ color: '#BFBFBF', fontWeight: 400 }}> / {board?.summary.deliveryItemTotal ?? 0}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#8C8C8C' }}>待驗收交付項</span>
                  <span style={{ color: '#262626', fontWeight: 600 }}>{board?.summary.pendingAcceptanceCount ?? 0}</span>
                </div>
              </div>
              {detail.nextDeliveryDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#8C8C8C' }}>下次交付</span>
                  <span style={{ color: '#E8720C', fontWeight: 600 }}>{detail.nextDeliveryDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* 成員列表 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}>
                <TeamOutlined />
              </span>
              項目成員
              <span className="rdm-card-title-split" />
              {canEditProject && (
                <Button
                  type="link"
                  size="small"
                  icon={<UserAddOutlined />}
                  onClick={() => setMemberModalOpen(true)}
                  style={{ padding: 0, height: 'auto' }}
                >
                  添加
                </Button>
              )}
            </div>
            {detail.members.length === 0 ? (
              <div style={{ fontSize: 12, color: '#8C8C8C', textAlign: 'center', padding: 8 }}>暫無成員</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.members.map(m => (
                  <div key={m.id} className="rdm-participant-row">
                    <span style={{ flex: 1, fontSize: 13, color: '#262626' }}>{m.userName || m.empNo}</span>
                    {/* 历史行存过大写角色码（DEV），查找前归一化，否则会直接露出原始码 */}
                    <Tag color="default" style={{ margin: 0 }}>{MEMBER_ROLE_LABEL[(m.roleCode || '').toLowerCase()] ?? m.roleCode}</Tag>
                    {canEditProject && (
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveMember(m.userId, m.userName)}
                        style={{ padding: '0 4px', height: 'auto' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 快捷操作 */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}>
                <ThunderboltOutlined />
              </span>
              快捷操作
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 交付項不再从项目入口创建：它挂需求，入口在需求详情「交付項清單」 */}
              <Button
                block
                icon={<PlusOutlined />}
                onClick={() => navigate('/rdm-submit')}
              >
                新增需求
              </Button>
              {canEditProject && (
                <Button
                  block
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/rdm-project-detail?id=${detail.id}&mode=edit${listSuffix}`)}
                >
                  編輯項目信息
                </Button>
              )}
              {canEditProject && (
                <Button
                  block
                  icon={<UserAddOutlined />}
                  onClick={() => setMemberModalOpen(true)}
                >
                  添加項目成員
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 底部時間戳（§D.4 操作記錄：只展示創建/最後更新人/最後更新時間，不做完整操作日誌） ── */}
      <div className="rdm-detail-footer">
        <span>創建於 <b>{detail.createdAt?.slice(0, 16).replace('T', ' ') || '-'}</b></span>
        {/* 存量行為空（rdm:schema:v3.14 之前没有该列），降级显示 - 而不是空白 */}
        <span>最後更新人 <b>{detail.updatedBy || '-'}</b></span>
        <span>最後更新 <b>{detail.updatedAt?.slice(0, 16).replace('T', ' ') || '-'}</b></span>
      </div>

      {/* ── 添加成員 Modal ── */}
      <Modal
        title="添加項目成員"
        open={memberModalOpen}
        onOk={handleAddMember}
        onCancel={closeMemberModal}
        confirmLoading={memberSubmitting}
        okText="確認添加"
        cancelText="取消"
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>成員 <span style={{ color: '#FF4D4F' }}>*</span></div>
            {/* 必須選真實員工：後端以 userId 為歸屬鍵，手輸姓名無法建立可用的成員關係 */}
            <EmployeeSelect
              single
              value={memberUserId ?? undefined}
              placeholder="搜尋姓名或工號"
              onChange={ids => setMemberUserId(ids[0] ?? null)}
              onPick={items => setMemberName(items[0]?.name ?? '')}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>角色</div>
            <Space size={6} wrap>
              {MEMBER_ROLE_OPTIONS.map(role => (
                <Tag
                  key={role}
                  color={memberRole === role ? 'blue' : 'default'}
                  style={{ cursor: 'pointer', padding: '2px 10px' }}
                  onClick={() => setMemberRole(role)}
                >
                  {MEMBER_ROLE_LABEL[role]}
                </Tag>
              ))}
            </Space>
          </div>
        </div>
      </Modal>

      {/* ── 催辦結果 Modal（展示「為什麼沒發」；executeOnce 同日回放非重發） ── */}
      <Modal
        title={<Space><BellOutlined />催辦結果</Space>}
        open={urgeOpen}
        onCancel={() => setUrgeOpen(false)}
        footer={<Button type="primary" onClick={() => setUrgeOpen(false)}>知道了</Button>}
        width={520}
      >
        {urgeResult && (
          <div>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="催辦已接 executeOnce：同一提醒日重複點擊會回放首次結果，並非重複發送。"
            />
            <Descriptions column={2} size="small" bordered
              styles={{ label: { color: '#8C8C8C', fontSize: 12 }, content: { fontSize: 13 } }}
            >
              <Descriptions.Item label="已通知">{urgeResult.notified ?? 0}</Descriptions.Item>
              <Descriptions.Item label="已去重(同提醒日)">{urgeResult.deduped ?? 0}</Descriptions.Item>
              <Descriptions.Item label="未指派(無責任人)">{urgeResult.unassigned ?? 0}</Descriptions.Item>
              <Descriptions.Item label="非工作日不發">{urgeResult.nonWorkingDay ?? 0}</Descriptions.Item>
              <Descriptions.Item label="未達逾期門檻">{urgeResult.belowThreshold ?? 0}</Descriptions.Item>
              <Descriptions.Item label="發送失敗">{urgeResult.failed ?? 0}</Descriptions.Item>
              <Descriptions.Item label="提醒日" span={2}>{urgeResult.remindDay || '-'}</Descriptions.Item>
            </Descriptions>
            {urgeResult.notes && urgeResult.notes.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>說明（為什麼沒發）</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: '#595959', fontSize: 13 }}>
                  {urgeResult.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
