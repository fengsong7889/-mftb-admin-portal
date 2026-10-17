/**
 * 提交需求 —— 全员需求入口（表单页，独立页面非弹窗）
 *
 * 阶段 1A 的界面口径（业务方视角，不是产研视角）：
 * 1. 首屏只要求业务方说得清的三件事：标题、现状与痛点、期望结果；
 * 2. 需求对象支持「针对已有功能 / 新增菜单或功能 / 暂不确定」三条路径，且可 multiple（一条需求打多个入口）；
 * 3. 复杂度、研发排期、优先级细则、业务价值等产研判断项收进「更多設置」，默认收起但有安全默认值；
 * 4. 审批要求不再由提交人勾选：它取服务端准入策略的裁决结果（simulateIntake）展示，
 *    提交后服务端会再算一次并以结果为准，前端传什么都不影响结论。
 * 5. 执行顺序：表单校验 → 二次确认弹窗 → 提交（禁止先弹框后校验）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Cascader,
  Collapse,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import type { FormInstance } from 'antd'
import type { RcFile } from 'antd/es/upload'
import {
  AimOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import HelpPopover from '../../components/HelpPopover'
import { useAuth } from '../../contexts/AuthContext'
import { fetchEmployees, type EmployeeItem } from '../../api/employee'
import {
  RDM_INTAKE_MODE_LABEL,
  createRequirement,
  fetchFunctionPoints,
  fetchMenuTree,
  fetchProductOptions,
  fetchProjectPage,
  fetchRequirementDetail,
  fetchRequirementPage,
  simulateIntake,
  submitRequirement,
  updateRequirement,
  uploadAttachment,
  type RdmIntakeDecision,
  type RdmMenuTreeNode,
  type RdmProductOption,
  type RdmProjectListItem,
  type RdmRequirementForm,
  type RdmTargetRef,
} from '../../api/rdm'
import SimilarNotice from './components/SimilarNotice'
import { ACTION_LABEL_MAP } from '../Permission/types'
import {
  RDM_ANCHOR_TYPE,
  RDM_COMPLEXITY_LABEL,
  getRdmComplexityLabel,
  getRdmPriorityLabel,
  RDM_FLOW_VERSION,
  RDM_FLOW_VERSION_LABEL,
  RDM_PRIORITY,
  RDM_PRIORITY_LABEL,
  RDM_PRIORITY_SLA_DAYS,
  RDM_REQ_TYPE,
  RDM_REQ_TYPE_LABEL,
  RDM_REQUIREMENT_KIND,
  RDM_REQUIREMENT_KIND_LABEL,
  RDM_PROJECT_STATUS,
  RDM_STATUS,
  formatRdmReqNo,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 需求对象的三条路径（界面概念，提交时映射到 anchorType/anchorName） */
type AnchorKind = 'EXISTING' | 'NEW' | 'UNKNOWN'

const ANCHOR_KIND_LABEL: Record<AnchorKind, string> = {
  EXISTING: '針對已有功能',
  NEW: '新增菜單 / 新功能',
  UNKNOWN: '暫不確定位置',
}

/** 「新增」时建议同步的需求类型，只提示不改用户已选的值 */
const NEW_HINT_TEXT = '全新入口會連帶權限、菜單位置與數據口徑，產品受理時會補齊方案；此處只需你說清想要什麼。'

interface TargetValues {
  kind: AnchorKind
  menuPath?: (string | number)[]
  functionPoint?: string
  anchorName?: string
  anchorDesc?: string
  newSystemCode?: string
}

/**
 * 接口对象 → 界面对象（草稿续编回填，toTargetRef 的逆映射）。
 * <p>三条路径靠「有没有菜单 / 有没有定位对象名」反推，与提交时的落库口径一一对应。
 * <p>功能点无法还原：提交时 anchorName 缺失才会用功能点顶替 anchorName 落库，
 * 两者在库里已合并成一个值，回填到「具體位置」即可，不猜它原来属于哪一个。
 */
function fromTargetRef(t: RdmTargetRef): TargetValues {
  if (t.menuKey && t.systemCode) {
    return {
      kind: 'EXISTING',
      menuPath: [t.systemCode, t.menuKey],
      anchorName: t.anchorName ?? undefined,
      anchorDesc: t.anchorDesc ?? undefined,
    }
  }
  if (t.anchorName) {
    return {
      kind: 'NEW',
      anchorName: t.anchorName,
      newSystemCode: t.systemCode ?? undefined,
      anchorDesc: t.anchorDesc ?? undefined,
    }
  }
  return { kind: 'UNKNOWN', anchorDesc: t.anchorDesc ?? undefined }
}

interface FormValues {
  title: string
  description: string
  expectResult?: string
  targets: TargetValues[]
  expectDate?: dayjs.Dayjs
  assignMode: 'PM' | 'POOL'
  pmUserId?: number
  /** 業務驗收人（sys_user.id），默认提交人本人，可改选其他同事 */
  acceptorUserId?: number
  reqType: RdmReqType
  priority: RdmPriority
  complexity?: RdmComplexity
  businessValue?: string
  /** V3：流程版本（2=傳統整需求交付 / 3=分批並行交付） */
  flowVersion?: number
  /** V3：所属项目 */
  projectId?: number
  /** V3：需求种类 aggregate/execution */
  requirementKind?: string
  /** V3：结构化父需求（执行需求挂到聚合需求下） */
  structureParentReqId?: number
}

interface TargetRowProps {
  field: { key: number; name: number }
  form: FormInstance<FormValues>
  menuOptions: { value: string; label: string; children?: { value: string; label: string }[] }[]
  systemOptions: { value: string; label: string }[]
  canRemove: boolean
  onRemove: () => void
}

/**
 * 单个需求对象行。
 * <p>拆成组件的理由：功能点候选是按菜单拉取的异步数据，多条对象共用一个 state 会互相覆盖，
 * 让每行持有自己的候选状态最简单，也不会因某一行改了菜单就把别的行为重置。
 */
function TargetRow({ field, form, menuOptions, systemOptions, canRemove, onRemove }: TargetRowProps) {
  const name = field.name
  const kind = (Form.useWatch(['targets', name, 'kind'], form) ?? 'EXISTING') as AnchorKind
  const menuPath = Form.useWatch(['targets', name, 'menuPath'], form)
  const [functionPoints, setFunctionPoints] = useState<{ key: string; title: string }[]>([])

  useEffect(() => {
    const menuKey = menuPath?.[1] ? String(menuPath[1]) : undefined
    if (!menuKey) {
      setFunctionPoints([])
      return
    }
    fetchFunctionPoints(menuKey).then(setFunctionPoints).catch(() => setFunctionPoints([]))
  }, [menuPath])

  return (
    <div className="rdm-target-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <Form.Item name={[name, 'kind']} noStyle initialValue="EXISTING">
          <Segmented
            options={(Object.keys(ANCHOR_KIND_LABEL) as AnchorKind[]).map(key => ({
              value: key,
              label: ANCHOR_KIND_LABEL[key],
            }))}
          />
        </Form.Item>
        <div style={{ flex: 1 }} />
        {canRemove && (
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={onRemove}>
            刪除
          </Button>
        )}
      </div>

      {kind === 'EXISTING' && (
        <div className="rdm-target-fields">
          <Form.Item
            label="系統 / 菜單"
            name={[name, 'menuPath']}
            rules={[{ required: true, message: '請選擇所屬系統與菜單' }]}
          >
            <Cascader options={menuOptions} placeholder="例：廣告推薦系統 / 報表分析" showSearch />
          </Form.Item>
          <Form.Item label="功能點（該菜單已有的功能）" name={[name, 'functionPoint']}>
            <Select
              allowClear
              disabled={!menuPath?.[1]}
              placeholder={menuPath?.[1] ? (functionPoints.length ? '選擇功能點' : '該菜單暫無可選功能') : '先選系統 / 菜單'}
              options={functionPoints.map(fp => {
                const label = ACTION_LABEL_MAP[fp.key] ?? fp.title
                return { value: label, label }
              })}
            />
          </Form.Item>
          <Form.Item label="具體位置 / 按鈕名稱" name={[name, 'anchorName']}>
            <Input placeholder="例：報表右上角導出按鈕" />
          </Form.Item>
        </div>
      )}

      {kind === 'NEW' && (
        <div className="rdm-target-fields">
          <Form.Item
            label="擬新增的菜單 / 功能名稱"
            name={[name, 'anchorName']}
            rules={[{ required: true, message: '請寫出想要新增的入口名稱' }]}
          >
            <Input placeholder="例：門店自營活動報名後台" />
          </Form.Item>
          <Form.Item label="期望歸屬系統（選填）" name={[name, 'newSystemCode']}>
            <Select allowClear placeholder="不清楚可留空" options={systemOptions} />
          </Form.Item>
          <div style={{ gridColumn: '1 / -1' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {NEW_HINT_TEXT}
            </Typography.Text>
          </div>
        </div>
      )}

      {kind === 'UNKNOWN' && (
        <div className="rdm-target-fields">
          <div style={{ gridColumn: '1 / -1' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              可以先不填位置，產品經理受理時會與你確認；著急上線的話，把路徑寫在「現狀與痛點」里更快。
            </Typography.Text>
          </div>
        </div>
      )}

      <Form.Item label="補充說明（當前怎麼走到這個位置）" name={[name, 'anchorDesc']} style={{ marginBottom: 4 }}>
        <TextArea rows={2} placeholder="例：報表分析 → 選本月 → 點導出，只能拿到當月數據" />
      </Form.Item>
    </div>
  )
}

export default function RequirementSubmit() {
  const navigate = useNavigate()
  // 只接本批次新增的两条提示；其余繁中硬编码由 RDM 整模块 i18n 那一批统一处理
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [menuTree, setMenuTree] = useState<RdmMenuTreeNode[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  /** 業務驗收人候选（远程搜索，保留已选项 label 避免退化成 id） */
  const [acceptorOptions, setAcceptorOptions] = useState<{ value: number; label: string }[]>([])
  const acceptorSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** 已上传附件（含 Base64 dataUrl；首张图作为现状主图） */
  const [attachments, setAttachments] = useState<{
    name: string; fileType: string; fileSize: number; dataUrl: string
  }[]>([])
  const [uploading, setUploading] = useState(false)
  /** 服务端准入裁决（只读展示）：提交时服务端会重算一次 */
  const [decision, setDecision] = useState<RdmIntakeDecision | null>(null)
  const [decisionFailed, setDecisionFailed] = useState(false)
  /** V3：进行中的项目候选（流程版本=V3 时选所属项目） */
  const [projectOptions, setProjectOptions] = useState<RdmProjectListItem[]>([])
  /** V3：所选项目下的聚合需求候选（执行需求挂结构父需求） */
  const [aggregateOptions, setAggregateOptions] = useState<{ value: number; label: string }[]>([])

  /*
   * 草稿续编：带 ?id= 进来就是编辑自己那条草稿（服务端也只允许改草稿态）。
   * 之前「保存草稿」是个单向门——存完回不来，用户只能整张表单重填，
   * 于是草稿实际上等于丢弃。
   */
  const draftId = Number(searchParams.get('id') ?? 0)
  const isDraftEdit = Number.isInteger(draftId) && draftId > 0
  const [draftNo, setDraftNo] = useState<string | null>()
  const [draftLoaded, setDraftLoaded] = useState(!isDraftEdit)

  useEffect(() => {
    if (!isDraftEdit) return
    fetchRequirementDetail(draftId)
      .then(d => {
        if (!d) return
        if (d.status !== RDM_STATUS.DRAFT) {
          message.warning('僅草稿狀態可修改，已轉入需求詳情')
          navigate(`/rdm-detail?id=${draftId}`, { replace: true })
          return
        }
        // 延迟发号：草稿没有正式需求编号，不能把 null 当编号展示
        setDraftNo(d.reqNo ?? null)
        form.setFieldsValue({
          title: d.title,
          description: d.description ?? '',
          expectResult: d.expectResult ?? undefined,
          businessValue: d.businessValue ?? undefined,
          reqType: d.reqType as RdmReqType,
          priority: d.priority as RdmPriority,
          complexity: (d.complexity ?? undefined) as RdmComplexity | undefined,
          expectDate: d.expectDate ? dayjs(d.expectDate) : undefined,
          // 草稿阶段落库的是「意向 PM」，受理人要等审批通过才生效，回填必须读同一个字段
          pmUserId: d.intentPmUserId ?? undefined,
          assignMode: d.intentPmUserId ? 'PM' : 'POOL',
          acceptorUserId: d.acceptorUserId ?? undefined,
          targets: (d.targets ?? []).length > 0 ? d.targets.map(fromTargetRef) : [{ kind: 'EXISTING' } as TargetValues],
          // V3 分批交付字段回填（旧草稿无这些字段时保持 V2 默认）
          flowVersion: d.flowVersion ?? RDM_FLOW_VERSION.V2,
          projectId: d.projectId ?? undefined,
          requirementKind: (d.requirementKind ?? RDM_REQUIREMENT_KIND.EXECUTION) as string,
          structureParentReqId: d.structureParentReqId ?? undefined,
        })
        // 附件回显：fileUrl 存的就是原始 data URL，可原样再传回去
        setAttachments((d.attachments ?? []).map(a => ({
          name: a.fileName,
          fileType: a.fileType ?? '',
          fileSize: a.fileSize ?? 0,
          dataUrl: a.fileUrl ?? '',
        })))
        if (d.acceptorName) {
          setAcceptorOptions(prev => (prev.some(o => o.value === d.acceptorUserId)
            ? prev
            : [{ value: d.acceptorUserId as number, label: d.acceptorName as string }, ...prev]))
        }
        setDraftLoaded(true)
      })
      .catch(() => {
        // 取不到草稿不能装作空白新建：那样用户点保存会新建出第二条需求，原草稿还在
        message.error('草稿載入失敗，請從「我提的需求」重進')
        setDraftLoaded(true)
      })
  }, [isDraftEdit, draftId, form, navigate])

  const assignMode = Form.useWatch('assignMode', form)
  // 查重联动：标题与期望结果变化时提示相似需求（仅提示，不拦提交）
  const titleValue = Form.useWatch('title', form)
  const expectValue = Form.useWatch('expectResult', form)
  const pmUserId = Form.useWatch('pmUserId', form)
  /** V3 联动：流程版本 / 所属项目 / 需求种类 */
  const flowVersion = Form.useWatch('flowVersion', form)
  const projectIdValue = Form.useWatch('projectId', form)
  const requirementKindValue = Form.useWatch('requirementKind', form)
  const isV3 = flowVersion === RDM_FLOW_VERSION.V3

  /** 从其它页面带上下文进来时预填第一条对象（例：报表页右上角「提需求」） */
  const prefilledMenuPath = useMemo(() => {
    const menuKey = searchParams.get('menuKey')
    const systemCode = searchParams.get('systemCode')
    if (!menuKey || !systemCode) return undefined
    return [systemCode, menuKey]
  }, [searchParams])

  const prefillAnchorName = searchParams.get('anchorName') ?? undefined

  useEffect(() => {
    fetchMenuTree().then(setMenuTree).catch(() => setMenuTree([]))
    fetchProductOptions().then(setPmOptions).catch(() => setPmOptions([]))
  }, [])

  /** V3：切到分批交付时拉可用项目供选所属项目（后端不可用时降级为空）。
   *  后端无 'active' 状态，故不传 status，改为客户端过滤出仍在进行中的项目
   *  （筹备中 / 进行中 / 部分交付），排除全部交付与已关闭的项目。 */
  useEffect(() => {
    if (!isV3) return
    let cancelled = false
    const USABLE_PROJECT_STATUS: string[] = [
      RDM_PROJECT_STATUS.PREPARING,
      RDM_PROJECT_STATUS.IN_PROGRESS,
      RDM_PROJECT_STATUS.PARTIAL_DELIVERED,
    ]
    fetchProjectPage({ pageNo: 1, pageSize: 200 })
      .then(res => {
        if (cancelled) return
        const usable = (res.records ?? []).filter(p => USABLE_PROJECT_STATUS.includes(p.status))
        setProjectOptions(usable)
      })
      .catch(() => { if (!cancelled) setProjectOptions([]) })
    return () => { cancelled = true }
  }, [isV3])

  /** V3：选定项目后拉该项目下的聚合需求，供执行需求挂结构父需求 */
  useEffect(() => {
    if (!isV3 || !projectIdValue) { setAggregateOptions([]); return }
    let cancelled = false
    fetchRequirementPage({ page: 1, size: 200, projectId: projectIdValue, requirementKind: RDM_REQUIREMENT_KIND.AGGREGATE })
      .then(res => {
        if (cancelled) return
        // 后端若未支持种类过滤，前端再按 requirementKind + projectId 兜底过滤一次
        const rows = (res.records ?? []).filter(r =>
          (!r.requirementKind || r.requirementKind === RDM_REQUIREMENT_KIND.AGGREGATE) &&
          (r.projectId == null || r.projectId === projectIdValue))
        setAggregateOptions(rows.map(r => ({ value: r.id, label: `${formatRdmReqNo(r.reqNo)} · ${r.title}` })))
      })
      .catch(() => { if (!cancelled) setAggregateOptions([]) })
    return () => { cancelled = true }
  }, [isV3, projectIdValue])

  /** 業務驗收人默认选中提交人本人（按工号匹配到 sys_user.id），可改选他人 */
  useEffect(() => {
    if (!user?.empId || !draftLoaded) return
    // 草稿回填已带验收人时不再覆盖：否则「默认本人」会把用户上次指派的人冲掉
    if (form.getFieldValue('acceptorUserId')) return
    fetchEmployees({ page: 1, size: 20, keyword: user.empId, employmentStatus: 'active' })
      .then(res => {
        const me = (res.records ?? []).find(e => e.empId === user.empId) ?? res.records?.[0]
        if (!me) return
        form.setFieldValue('acceptorUserId', me.id)
        setAcceptorOptions(prev => (
          prev.some(o => o.value === me.id) ? prev : [{ value: me.id, label: `${me.name}（${me.empId}）` }, ...prev]
        ))
      })
      .catch(() => { /* 取不到本人就留空，驗收人可手輸姓名搜索補選 */ })
  }, [user?.empId, draftLoaded, form])

  /** 验收人远程搜索：按工号/姓名模糊查在职员工 */
  const handleAcceptorSearch = (keyword: string) => {
    if (acceptorSearchTimer.current) clearTimeout(acceptorSearchTimer.current)
    acceptorSearchTimer.current = setTimeout(() => {
      fetchEmployees({ page: 1, size: 30, keyword: keyword.trim() || undefined, employmentStatus: 'active' })
        .then(res => setAcceptorOptions(prev => {
          const map = new Map(prev.map(o => [o.value, o.label]))
          ;(res.records ?? []).forEach((e: EmployeeItem) => map.set(e.id, `${e.name}（${e.empId}${e.department ? ` · ${e.department}` : ''}）`))
          return [...map.entries()].map(([value, label]) => ({ value, label }))
        }))
        .catch(() => { /* 搜索失敗保留已有候選 */ })
    }, 300)
  }

  useEffect(() => {
    if (!prefilledMenuPath) return
    form.setFieldValue('targets', [{
      kind: 'EXISTING',
      menuPath: prefilledMenuPath,
      anchorName: prefillAnchorName,
    }])
  }, [prefilledMenuPath, prefillAnchorName, form])

  const menuOptions = useMemo(
    () => menuTree.map(sys => ({
      value: sys.key,
      label: sys.title,
      children: (sys.children ?? []).map(menu => ({ value: menu.key, label: menu.title })),
    })),
    [menuTree],
  )

  const systemOptions = useMemo(
    () => menuTree.map(sys => ({ value: sys.key, label: sys.title })),
    [menuTree],
  )

  const selectedPm = useMemo(
    () => pmOptions.find(p => p.userId === pmUserId),
    [pmOptions, pmUserId],
  )

  /** 菜单路径 → 可读名称（用于确认弹窗，不让用户看到裸 key） */
  const resolveMenuLabels = (path?: (string | number)[]) => {
    if (!path || path.length === 0) return { systemName: undefined as string | undefined, menuName: undefined as string | undefined }
    const sys = menuTree.find(s => s.key === String(path[0]))
    const menu = sys?.children?.find(m => m.key === String(path[1]))
    return { systemName: sys?.title, menuName: menu?.title }
  }

  /** 界面对象 → 接口对象（三条路径落回 anchorType/anchorName/anchorDesc） */
  const toTargetRef = (t?: TargetValues): RdmTargetRef => {
    const kind: AnchorKind = t?.kind ?? 'EXISTING'
    const { systemName, menuName } = resolveMenuLabels(t?.menuPath)
    if (kind === 'NEW') {
      return {
        anchorType: RDM_ANCHOR_TYPE.NONE,
        systemCode: t?.newSystemCode || undefined,
        systemName: systemOptions.find(s => s.value === t?.newSystemCode)?.label,
        anchorName: t?.anchorName ?? null,
        anchorDesc: [NEW_HINT_TEXT, t?.anchorDesc].filter(Boolean).join(' '),
      }
    }
    if (kind === 'UNKNOWN') {
      return {
        anchorType: RDM_ANCHOR_TYPE.NONE,
        anchorName: null,
        anchorDesc: t?.anchorDesc || '位置暫未確定，待產品受理時與提出人確認',
      }
    }
    return {
      // 定位粒度字段已删除：选了功能点即 FUNCTION，否则按菜单级 MENU 落库
      anchorType: t?.functionPoint ? RDM_ANCHOR_TYPE.FUNCTION : RDM_ANCHOR_TYPE.MENU,
      systemCode: t?.menuPath?.[0] ? String(t.menuPath[0]) : undefined,
      systemName,
      menuKey: t?.menuPath?.[1] ? String(t.menuPath[1]) : undefined,
      menuName,
      pagePath: menuName ? `/${menuName}` : undefined,
      anchorName: t?.anchorName ?? t?.functionPoint ?? null,
      anchorDesc: t?.anchorDesc,
      // 首张图片作为现状主图，跟随定位对象展示
      screenshotUrl: attachments.find(a => a.fileType.startsWith('image/'))?.dataUrl,
    }
  }

  /** 组装完整请求体（草稿与正式提交共用同一份，避免草稿丢字段） */
  const buildPayload = (values: FormValues): RdmRequirementForm => {
    const pm = pmOptions.find(p => p.userId === values.pmUserId)
    return {
      title: values.title?.trim(),
      reqType: values.reqType,
      priority: values.priority,
      complexity: values.complexity,
      expectDate: values.expectDate?.format('YYYY-MM-DD'),
      description: values.description,
      expectResult: values.expectResult,
      businessValue: values.businessValue,
      targets: (values.targets ?? []).map(toTargetRef),
      assignMode: values.assignMode,
      pmUserId: values.assignMode === 'PM' ? pm?.userId : undefined,
      pmName: values.assignMode === 'PM' ? pm?.name : undefined,
      // 业务验收人必须随请求送出：不传的话服务端一律回落成提交人本人，界面上选的人等于白选
      acceptorUserId: values.acceptorUserId,
      attachments: attachments.map(a => ({
        fileName: a.name,
        storagePath: a.dataUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
      })),
      // V3 分批交付字段：仅在选了 V3 时携带，V2 保持原有行为不变
      ...(values.flowVersion === RDM_FLOW_VERSION.V3 ? {
        flowVersion: RDM_FLOW_VERSION.V3,
        projectId: values.projectId,
        requirementKind: values.requirementKind ?? RDM_REQUIREMENT_KIND.EXECUTION,
        structureParentReqId: values.requirementKind === RDM_REQUIREMENT_KIND.EXECUTION
          ? values.structureParentReqId
          : undefined,
      } : {}),
    }
  }

  /** 对象摘要（确认弹窗与提醒用，避免出现「2 个对象」这种看不出是什么的计数） */
  const describeTargets = (targets?: TargetValues[]) => (targets ?? []).map(t => {
    const kind = t.kind ?? 'EXISTING'
    if (kind === 'NEW') return `新增：${t.anchorName || '未命名入口'}`
    if (kind === 'UNKNOWN') return '位置待定'
    const { menuName } = resolveMenuLabels(t.menuPath)
    return `${menuName ?? '未選菜單'} · ${t.anchorName || t.functionPoint || '菜單整體'}`
  })

  const reqTypeValue = Form.useWatch('reqType', form)
  const firstSystem = Form.useWatch(['targets', 0, 'menuPath'], form)?.[0]

  /**
   * 拉取当前人的准入裁决。换需求类型/主系统后重算，因为策略条件就含这两项。
   * <p>失败不假造成「已免审/已需审」：只提示提交时再按服务端结果处理。
   */
  useEffect(() => {
    let cancelled = false
    simulateIntake({ reqType: reqTypeValue, systemCode: firstSystem ? String(firstSystem) : undefined })
      .then(res => { if (!cancelled) { setDecision(res); setDecisionFailed(false) } })
      .catch(() => { if (!cancelled) { setDecision(null); setDecisionFailed(true) } })
    return () => { cancelled = true }
  }, [reqTypeValue, firstSystem])

  /** 上传一个文件到需求附件（失败已由请求层统一提示，这里只补兜底文案） */
  const handleUpload = async (file: File) => {
    if (attachments.length >= 5) {
      message.warning('最多上傳 5 個附件')
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadAttachment(file)
      setAttachments(prev => [...prev, {
        name: uploaded.name,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        dataUrl: uploaded.dataUrl,
      }])
      message.success('附件已上傳')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '附件上傳失敗')
    } finally {
      setUploading(false)
    }
  }

  /** 提交前二次确认（先校验后弹框） */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const pm = pmOptions.find(p => p.userId === values.pmUserId)
    const targetSummary = describeTargets(values.targets)

    Modal.confirm({
      title: '確認提交需求？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求標題：</span><b>{values.title}</b></div>
          <div className="confirm-info-row"><span>需求類型：</span><b>{RDM_REQ_TYPE_LABEL[values.reqType]}</b></div>
          <div className="confirm-info-row"><span>優先級：</span><b>{getRdmPriorityLabel(values.priority)}</b></div>
          <div className="confirm-info-row">
            <span>需求對象：</span>
            <b>{targetSummary.length > 0 ? targetSummary.join('；') : '暫未指定（產品受理時補齊）'}</b>
          </div>
          <div className="confirm-info-row">
            <span>受理路徑：</span>
            <b>{values.assignMode === 'PM' ? `指定產品經理（${pm?.name ?? '-'}）` : '提交技術部統一分配'}</b>
          </div>
          <div className="confirm-info-row">
            <span>審批要求：</span>
            <b>{decision
              ? `${RDM_INTAKE_MODE_LABEL[decision.mode]}（${decision.policyName || '默認策略'} · ${decision.policyVersion || 'v1'}）`
              : '由系統按部門與角色判定，提交後以服務端結果為準'}</b>
          </div>
          <div className="confirm-info-row">
            <span>業務驗收人：</span>
            <b>{acceptorOptions.find(o => o.value === values.acceptorUserId)?.label ?? '本人（提交人）'}</b>
          </div>
          {values.expectDate && (
            <div className="confirm-info-row"><span>期望完成：</span><b>{values.expectDate.format('YYYY-MM-DD')}</b></div>
          )}
          {attachments.length > 0 && (
            <div className="confirm-info-row"><span>附件：</span><b>{attachments.length} 個</b></div>
          )}
        </div>
      ),
      okText: '確認提交',
      cancelText: '返回修改',
      onOk: async () => {
        setSubmitting(true)
        try {
          const payload = buildPayload(values)
          let saved
          if (isDraftEdit) {
            // 草稿提交走「先存改动、再自助提交」：提交接口要按最新内容重新裁决准入，
            // 只调提交会把用户在编辑页改的内容丢掉
            await updateRequirement(draftId, payload)
            saved = await submitRequirement(draftId)
          } else {
            saved = await createRequirement(payload, 'submit')
          }
          message.success(
            saved.reqNo
              ? `需求已提交，編號 ${saved.reqNo}`
              // 延迟发号：需审批的提交本轮没有编号，必须把“什么时候会有”说清楚，不能报「編號 null」
              : t('rdm.submitApprovalPendingNoNumber'),
          )
          navigate(`/rdm-detail?id=${saved.id}&tab=activity`)
        } catch {
          // 失败提示由请求层统一弹出，这里保留用户已填内容不丢（不清空表单、不假装成功）
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  /**
   * 保存草稿：与正式提交发同一份完整内容。
   * <p>以前草稿只发标题/类型/优先级/描述并把 targets 清空，用户填的期望结果、附件、
   * 指定 PM 全丢，等于「保存草稿」是个会把表单打回原形的按钮。
   */
  const handleSaveDraft = async () => {
    const values = await form.validateFields(['title', 'description', 'reqType', 'priority'])
    setDraftSaving(true)
    try {
      const payload = buildPayload({ ...(form.getFieldsValue(true) as FormValues), ...values })
      if (isDraftEdit) {
        await updateRequirement(draftId, payload)
        message.success('草稿已更新，可繼續編輯或點「提交需求」送出')
      } else {
        await createRequirement(payload, 'draft')
        message.success('草稿已保存，可在「我提的需求」裡點「編輯」繼續填、「提交」送出')
      }
      navigate('/rdm-requirement?scope=mine')
    } catch {
      // 同上：请求层已统一提示，保留表单内容让用户能重试
    } finally {
      setDraftSaving(false)
    }
  }

  return (
    <div className="content-area">
      {/* ── 页面头部（统一组件）── */}
      <RdmFormHeader
        title={isDraftEdit ? '編輯需求草稿' : '提交需求'}
        backText={isDraftEdit ? '返回我的需求' : '返回工作台'}
        onBack={() => navigate(isDraftEdit ? '/rdm-requirement?scope=mine' : '/rdm-workbench')}
        meta={isDraftEdit
          ? draftNo
            ? `草稿 ${draftNo} · 修改後可繼續保存，或提交進入準入審批（提交時會按最新內容重新裁決）`
            : t('rdm.draftNoNumberYet')
          : '說清「現在怎麼做、哪兒不方便、想要什麼樣」即可提交；技術方案、排期與工時由產研在受理後補充'}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          reqType: RDM_REQ_TYPE.OPTIMIZE,
          priority: RDM_PRIORITY.P2,
          assignMode: 'POOL',
          targets: [{ kind: 'EXISTING' }],
          flowVersion: RDM_FLOW_VERSION.V2,
          requirementKind: RDM_REQUIREMENT_KIND.EXECUTION,
        }}
      >
        {/* ── ① 流程版本（V3 分批並行交付入口）── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6FFFB', color: '#13C2C2' }}><NodeIndexOutlined /></span>
            流程版本
            {/* 多句规则说明用 HelpPopover（可停留、有层次），禁止用 Tooltip 承载长文本 */}
            <HelpPopover
              title="流程版本怎麼選"
              ariaLabel="流程版本說明"
              content={'V2 為傳統整需求交付；V3 支持把大需求拆成聚合需求 + 執行需求，掛到項目下分批並行交付。'}
            />
          </div>
          <div className="rdm-more-settings-fields">
            <Form.Item label="交付流程" name="flowVersion" extra={isV3 ? '分批並行交付：可掛項目、區分聚合 / 執行需求' : '傳統整需求交付'}>
              <Select
                options={[
                  { value: RDM_FLOW_VERSION.V2, label: `${RDM_FLOW_VERSION_LABEL[RDM_FLOW_VERSION.V2]}（傳統整需求交付）` },
                  { value: RDM_FLOW_VERSION.V3, label: `${RDM_FLOW_VERSION_LABEL[RDM_FLOW_VERSION.V3]}（分批並行交付）` },
                ]}
              />
            </Form.Item>
            {isV3 && (
              <Form.Item label="所屬項目" name="projectId" rules={[{ required: true, message: '請選擇所屬項目' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="選擇進行中的項目"
                  notFoundContent="暫無可用項目"
                  options={projectOptions.map(p => ({ value: p.id, label: `${p.projectNo} · ${p.name}` }))}
                />
              </Form.Item>
            )}
          </div>
          {isV3 && (
            <>
              <Form.Item label="需求種類" name="requirementKind" rules={[{ required: true, message: '請選擇需求種類' }]}>
                <Radio.Group>
                  <Radio value={RDM_REQUIREMENT_KIND.AGGREGATE}>{RDM_REQUIREMENT_KIND_LABEL[RDM_REQUIREMENT_KIND.AGGREGATE]}</Radio>
                  <Radio value={RDM_REQUIREMENT_KIND.EXECUTION}>{RDM_REQUIREMENT_KIND_LABEL[RDM_REQUIREMENT_KIND.EXECUTION]}</Radio>
                </Radio.Group>
              </Form.Item>
              {requirementKindValue === RDM_REQUIREMENT_KIND.EXECUTION && (
                <Form.Item label="結構父需求" name="structureParentReqId" extra="執行需求掛到所選項目下的某個聚合需求，形成主子結構">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder={projectIdValue ? '選擇聚合父需求（可留空）' : '請先選擇所屬項目'}
                    disabled={!projectIdValue}
                    notFoundContent="該項目下暫無聚合需求"
                    options={aggregateOptions}
                  />
                </Form.Item>
              )}
            </>
          )}
        </div>
        {/* ── ① 需求内容（业务方唯一必须回答的部分）── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><FileTextOutlined /></span>
            需求內容
            <span className="rdm-todo-hint">只寫業務事實，不需要寫技術方案</span>
          </div>
          <Form.Item
            label="需求標題"
            name="title"
            rules={[{ required: true, message: '請填寫需求標題' }, { max: 80, message: '不超過 80 字' }]}
          >
            <Input placeholder="一句話說清要做什麼，例：推薦報表支持自定義時間區間導出" showCount maxLength={80} />
          </Form.Item>
          <SimilarNotice title={titleValue} expectText={expectValue} />
          <Form.Item
            label="現狀與痛點"
            name="description"
            rules={[{ required: true, message: '請描述當前是怎麼做的、遇到什麼問題' }]}
          >
            <TextArea rows={4} placeholder={'例：現在導出只能選「本月/上個月」兩個固定區間，跨月對帳要反覆切換導出再手動合併，財務每月多花 6 小時且容易錯。'} />
          </Form.Item>
          <Form.Item label="期望結果（做成什麼樣就滿足）" name="expectResult">
            <TextArea rows={3} placeholder="例：報表頁可自定義開始/結束日期，一次導出任意區間，文件名帶上區間信息。" />
          </Form.Item>
        </div>

        {/* ── ② 需求对象（可多个：已有功能 / 新增入口 / 暂不确定）── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><AimOutlined /></span>
            需求對象
            <HelpPopover
              title="需求對象怎麼填"
              ariaLabel="需求對象說明"
              content={'指明這條需求打在哪裡，產研可直達現場；跨菜單的需求可一次加多條。'}
            />
            <span className="rdm-todo-hint">可選多條；完全不清楚位置也能提交</span>
          </div>
          <Form.List name="targets">
            {(fields, { add, remove }) => (
              <>
                {fields.map(field => (
                  <TargetRow
                    key={field.key}
                    field={field}
                    form={form}
                    menuOptions={menuOptions}
                    systemOptions={systemOptions}
                    canRemove={fields.length > 1}
                    onRemove={() => remove(field.name)}
                  />
                ))}
                <Button
                  type="link"
                  icon={<PlusOutlined />}
                  style={{ padding: 0, marginBottom: 12 }}
                  onClick={() => add({ kind: 'EXISTING' })}
                >
                  再加一個需求對象
                </Button>
              </>
            )}
          </Form.List>
        </div>

        {/* ── ③ 受理与时间 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><NodeIndexOutlined /></span>
            受理路徑與時間
          </div>
          <div className="rdm-assign-card">
            <div
              className={`rdm-assign-option ${assignMode === 'POOL' ? 'active' : ''}`}
              onClick={() => form.setFieldValue('assignMode', 'POOL')}
            >
              <div className="rdm-assign-option-title">
                <TeamOutlined style={{ color: assignMode === 'POOL' ? '#E8720C' : '#8C8C8C' }} />
                提交技術部統一分配（推薦）
              </div>
              <div className="rdm-assign-option-desc">
                需求進入需求池，由技術部負責人瞭解後分發給對應產品經理，避免找錯人。
              </div>
            </div>
            <div
              className={`rdm-assign-option ${assignMode === 'PM' ? 'active' : ''}`}
              onClick={() => form.setFieldValue('assignMode', 'PM')}
            >
              <div className="rdm-assign-option-title">
                <CheckCircleOutlined style={{ color: assignMode === 'PM' ? '#E8720C' : '#8C8C8C' }} />
                我已知道對口的產品經理
              </div>
              <div className="rdm-assign-option-desc">直接指定受理人，跳過需求池人工分配，響應更快。</div>
            </div>
          </div>
          <Form.Item name="assignMode" hidden><Input /></Form.Item>
          {/* 产品/时间/验收人三字段并排（全局表单规范：每行 3 个字段） */}
          <div className="rdm-intake-fields">
            {assignMode === 'PM' && (
              <Form.Item
                label="產品經理"
                name="pmUserId"
                rules={[{ required: true, message: '請選擇產品經理' }]}
                extra={selectedPm ? `在途 ${selectedPm.activeCount} 個 / 容量 ${selectedPm.capacity} 個，負責域：${selectedPm.domains.join('、')}` : undefined}
              >
                <Select
                  placeholder="選擇產品經理"
                  showSearch
                  optionFilterProp="label"
                  options={pmOptions.map(pm => ({
                    value: pm.userId,
                    label: `${pm.name}（在途 ${pm.activeCount}/${pm.capacity} · ${pm.domains.join('/')}）`,
                  }))}
                />
              </Form.Item>
            )}
            <Form.Item label="期望完成時間" name="expectDate"
              extra="填業務硬期限即可；產研承諾時間以受理後的排期為準">
              <DatePicker style={{ width: '100%' }} placeholder="選填" minDate={dayjs()} />
            </Form.Item>
            <Form.Item label="業務驗收人" name="acceptorUserId"
              extra="默認為提交人本人，可改選他人；需求上線後由該同事在「需求驗收」逐條確認並打 1-5 分">
              <Select
                showSearch
                filterOption={false}
                onSearch={handleAcceptorSearch}
                onFocus={() => handleAcceptorSearch('')}
                options={acceptorOptions}
                placeholder="搜索姓名 / 工號選擇"
                notFoundContent={null}
              />
            </Form.Item>
          </div>
          {assignMode === 'PM' && selectedPm && (
            <div style={{ maxWidth: 360, marginBottom: 12 }}>
              <div className="rdm-load-bar">
                <div className="rdm-load-bar-inner" style={{ width: `${Math.min((selectedPm.activeCount / selectedPm.capacity) * 100, 100)}%` }} />
              </div>
            </div>
          )}

          {/*
            审批要求：只读展示服务端准入裁决（命中策略 + 版本 + 审批链），提交人不能选。
            拉不到裁决时不猜结论，只说明提交时以服务端结果为准（宁多审不漏审）。
          */}
          <div className="rdm-approval-card">
            <div className="rdm-approval-card-title">
              <SafetyCertificateOutlined style={{ color: '#E8720C' }} />
              審批要求（由系統按部門與角色判定，提交人無需選擇）
              {decision && (
                <Tag color={decision.needApproval ? 'processing' : 'success'} style={{ margin: 0 }}>
                  {RDM_INTAKE_MODE_LABEL[decision.mode]}
                </Tag>
              )}
              {!decision && <Tag style={{ margin: 0 }}>{decisionFailed ? '待服務端判定' : '載入中…'}</Tag>}
            </div>
            <div className="rdm-approval-card-body">
              {decision ? (
                decision.needApproval
                  ? (
                      <>
                        本單按「{decision.policyName || '默認策略'}」（版本 {decision.policyVersion || 'v1'}）處理：
                        {decision.approvalNodes?.length
                          ? `先送 ${decision.approvalNodes.join(' → ')}，通過後才到達技術部。`
                          : '該策略未配審批節點，會進入審批異常待辦，由技術負責人處理，不會自動放行。'}
                        {decision.abnormal ? '（審批節點缺失 → 異常待辦）' : ''}
                      </>
                    )
                  : (
                      <>
                        本單按「{decision.policyName || '默認策略'}」（版本 {decision.policyVersion || 'v1'}）免審直送技術部；
                        未指定產品經理時仍由技術負責人分派。
                      </>
                    )
              ) : (
                decisionFailed
                  ? '暫未取到準入裁決：提交時仍由服務端按你的部門與角色判定，不會因取不到裁決而放行。'
                  : '正在按你的部門與角色裁決本單要不要先經準入審批…'
              )}
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 6 }}>
              指定產品經理不等於免審批；要調整準入規則請到「需求配置 · 分發矩陣 · 準入策略」。
            </div>
          </div>
        </div>

        {/* ── ④ 更多设置（产研判断项，默认收起；都有安全默认值，收起也能提交）── */}
        <Collapse
          ghost
          items={[{
            key: 'more',
            label: <span style={{ fontSize: 13, fontWeight: 500, color: '#595959' }}>更多設置（需求類型、優先級、業務價值、附件）</span>,
            children: (
              <>
                {/* 三字段并排（全局表单规范：每行 3 个字段），固定宽度会把优先级长文案截断 */}
                <div className="rdm-more-settings-fields">
                  <Form.Item label="需求類型" name="reqType" rules={[{ required: true, message: '請選擇需求類型' }]}>
                    <Select
                      options={Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </Form.Item>
                  <Form.Item label="優先級" name="priority" rules={[{ required: true, message: '請選擇優先級' }]}>
                    <Select
                      labelRender={({ label, value }) => label ?? getRdmPriorityLabel(String(value ?? ''))}
                      options={Object.entries(RDM_PRIORITY_LABEL).map(([value, label]) => ({
                        value,
                        label: `${label}（產研承諾 ${RDM_PRIORITY_SLA_DAYS[value as RdmPriority]} 天內響應）`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item label="預期規模" name="complexity" extra="不確定可留空，由產品經理評估">
                    <Select
                      allowClear
                      placeholder="由產品評估"
                      labelRender={({ label, value }) => label ?? getRdmComplexityLabel(String(value ?? ''))}
                      options={Object.entries(RDM_COMPLEXITY_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </Form.Item>
                </div>
                <Form.Item label="業務價值（可量化最佳，用於產研排優先）" name="businessValue">
                  <TextArea rows={2} placeholder="例：每月節省財務與運營 6 人時；避免手工合併導致的口徑錯誤。" />
                </Form.Item>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Space size={12}>
                    <Upload
                      multiple
                      showUploadList={false}
                      beforeUpload={(file: RcFile) => { void handleUpload(file); return false }}
                    >
                      <Button icon={<CameraOutlined />} loading={uploading}>上傳現狀截圖 / 附件</Button>
                    </Upload>
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                      支持圖片與 pdf/doc/xls/ppt/zip，單個不超過 5MB，最多 5 個
                    </span>
                  </Space>
                  {attachments.length > 0 && (
                    <Space size={8} wrap>
                      {attachments.map((att, idx) => {
                        const isImage = att.fileType.startsWith('image/')
                        return (
                          <div key={`${att.name}-${idx}`} style={{
                            position: 'relative', border: '1px solid #e8eaed', borderRadius: 6,
                            padding: 6, background: '#FAFBFC', maxWidth: 180,
                          }}>
                            {isImage ? (
                              <img src={att.dataUrl} alt={att.name} style={{ width: 156, height: 88, objectFit: 'cover', borderRadius: 4 }} />
                            ) : (
                              <div style={{ width: 156, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#8C8C8C' }}>
                                {att.name}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 156 }}>
                              {att.name} · {(att.fileSize / 1024).toFixed(0)} KB
                            </div>
                            <Button
                              type="link"
                              size="small"
                              danger
                              style={{ position: 'absolute', top: 2, right: 2, padding: '0 4px' }}
                              onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            >
                              ×
                            </Button>
                          </div>
                        )
                      })}
                    </Space>
                  )}
                </Space>
              </>
            ),
          }]}
          style={{ marginBottom: 16, background: '#fff', borderRadius: 8, border: '1px solid #e8eaed' }}
        />
      </Form>

      {/* ── 底部操作栏 ── */}
      <div className="form-footer">
        <Button icon={<RollbackOutlined />} onClick={() => navigate('/rdm-workbench')}>取消</Button>
        <Button icon={<SaveOutlined />} loading={draftSaving} onClick={handleSaveDraft}>保存草稿</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>提交需求</Button>
      </div>
    </div>
  )
}
