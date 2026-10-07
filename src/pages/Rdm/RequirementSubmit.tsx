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
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Cascader,
  Collapse,
  DatePicker,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
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
  InfoCircleOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import {
  RDM_INTAKE_MODE_LABEL,
  createRequirement,
  fetchFunctionPoints,
  fetchMenuTree,
  fetchProductOptions,
  simulateIntake,
  uploadAttachment,
  type RdmIntakeDecision,
  type RdmMenuTreeNode,
  type RdmProductOption,
  type RdmRequirementForm,
  type RdmTargetRef,
} from '../../api/rdm'
import SimilarNotice from './components/SimilarNotice'
import {
  RDM_ANCHOR_LABEL,
  RDM_ANCHOR_TYPE,
  RDM_COMPLEXITY_LABEL,
  RDM_PRIORITY,
  RDM_PRIORITY_LABEL,
  RDM_PRIORITY_SLA_DAYS,
  RDM_REQ_TYPE,
  RDM_REQ_TYPE_LABEL,
  type RdmAnchorType,
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

/** 「已有功能」可选的定位粒度（不含 NONE：NONE 走「新增/暂不确定」两条） */
const GRANULARITY_OPTIONS = (Object.keys(RDM_ANCHOR_LABEL) as RdmAnchorType[])
  .filter(key => key !== RDM_ANCHOR_TYPE.NONE)

/** 「新增」时建议同步的需求类型，只提示不改用户已选的值 */
const NEW_HINT_TEXT = '全新入口會连带權限、菜單位置與數據口徑，產品受理時會補齊方案；此處只需你說清想要什麼。'

interface TargetValues {
  kind: AnchorKind
  menuPath?: (string | number)[]
  granularity?: RdmAnchorType
  functionPoint?: string
  anchorName?: string
  anchorDesc?: string
  newSystemCode?: string
}

interface FormValues {
  title: string
  description: string
  expectResult?: string
  targets: TargetValues[]
  expectDate?: dayjs.Dayjs
  assignMode: 'PM' | 'POOL'
  pmUserId?: number
  reqType: RdmReqType
  priority: RdmPriority
  complexity?: RdmComplexity
  businessValue?: string
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
            <Cascader style={{ width: 300 }} options={menuOptions} placeholder="例：廣告推薦系統 / 報表分析" showSearch />
          </Form.Item>
          <Form.Item label="定位粒度" name={[name, 'granularity']} initialValue={RDM_ANCHOR_TYPE.MENU}>
            <Select
              style={{ width: 150 }}
              options={GRANULARITY_OPTIONS.map(key => ({ value: key, label: RDM_ANCHOR_LABEL[key] }))}
            />
          </Form.Item>
          <Form.Item label="功能點（歷史提過的位置）" name={[name, 'functionPoint']}>
            <Select
              style={{ width: 220 }}
              allowClear
              disabled={functionPoints.length === 0}
              placeholder={functionPoints.length ? '選擇已有功能點' : '該菜單暫無功能點清單'}
              options={functionPoints.map(fp => ({ value: fp.title, label: fp.title }))}
            />
          </Form.Item>
          <Form.Item label="具體位置 / 按鈕名稱" name={[name, 'anchorName']}>
            <Input style={{ width: 220 }} placeholder="例：報表右上角導出按鈕" />
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
            <Input style={{ width: 280 }} placeholder="例：門店自營活動報名後台" />
          </Form.Item>
          <Form.Item label="期望歸屬系統（選填）" name={[name, 'newSystemCode']}>
            <Select style={{ width: 220 }} allowClear placeholder="不清楚可留空" options={systemOptions} />
          </Form.Item>
          <div style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {NEW_HINT_TEXT}
            </Typography.Text>
          </div>
        </div>
      )}

      {kind === 'UNKNOWN' && (
        <div className="rdm-target-fields">
          <div style={{ width: '100%' }}>
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
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm<FormValues>()
  const [menuTree, setMenuTree] = useState<RdmMenuTreeNode[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)
  /** 已上传附件（含 Base64 dataUrl；首张图作为现状主图） */
  const [attachments, setAttachments] = useState<{
    name: string; fileType: string; fileSize: number; dataUrl: string
  }[]>([])
  const [uploading, setUploading] = useState(false)
  /** 服务端准入裁决（只读展示）：提交时服务端会重算一次 */
  const [decision, setDecision] = useState<RdmIntakeDecision | null>(null)
  const [decisionFailed, setDecisionFailed] = useState(false)

  const assignMode = Form.useWatch('assignMode', form)
  // 查重联动：标题与期望结果变化时提示相似需求（仅提示，不拦提交）
  const titleValue = Form.useWatch('title', form)
  const expectValue = Form.useWatch('expectResult', form)
  const pmUserId = Form.useWatch('pmUserId', form)

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

  useEffect(() => {
    if (!prefilledMenuPath) return
    form.setFieldValue('targets', [{
      kind: 'EXISTING',
      granularity: RDM_ANCHOR_TYPE.MENU,
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
      anchorType: t?.granularity ?? RDM_ANCHOR_TYPE.MENU,
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
      attachments: attachments.map(a => ({
        fileName: a.name,
        storagePath: a.dataUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
      })),
    }
  }

  /** 对象摘要（确认弹窗与提醒用，避免出现「2 个对象」这种看不出是什么的计数） */
  const describeTargets = (targets?: TargetValues[]) => (targets ?? []).map(t => {
    const kind = t.kind ?? 'EXISTING'
    if (kind === 'NEW') return `新增：${t.anchorName || '未命名入口'}`
    if (kind === 'UNKNOWN') return '位置待定'
    const { menuName } = resolveMenuLabels(t.menuPath)
    return `${menuName ?? '未選菜單'} · ${t.anchorName || t.functionPoint || RDM_ANCHOR_LABEL[t.granularity ?? RDM_ANCHOR_TYPE.MENU]}`
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
          <div className="confirm-info-row"><span>優先級：</span><b>{RDM_PRIORITY_LABEL[values.priority]}</b></div>
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
            <span>業務驗收人：</span><b>本人（提交人）</b>
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
          const created = await createRequirement(buildPayload(values), 'submit')
          message.success(`需求已提交，編號 ${created.reqNo}`)
          navigate(`/rdm-detail?id=${created.id}`)
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
      await createRequirement(buildPayload({ ...(form.getFieldsValue(true) as FormValues), ...values }), 'draft')
      message.success('草稿已保存，可在「我提的需求」裡點「提交」送出（草稿回填編輯尚未提供，修改內容請重新填寫）')
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
        title="提交需求"
        backText="返回工作台"
        onBack={() => navigate('/rdm-workbench')}
        meta="說清「現在怎麼做、哪兒不方便、想要什麼樣」即可提交；技術方案、排期與工時由產研在受理後補充"
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          reqType: RDM_REQ_TYPE.OPTIMIZE,
          priority: RDM_PRIORITY.P2,
          assignMode: 'POOL',
          targets: [{ kind: 'EXISTING', granularity: RDM_ANCHOR_TYPE.MENU }],
        }}
      >
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
            <Tooltip title="指明這條需求打在哪裡，產研可直達現場；跨菜單的需求可一次加多條">
              <InfoCircleOutlined style={{ color: '#8C8C8C', fontSize: 12 }} />
            </Tooltip>
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
                  onClick={() => add({ kind: 'EXISTING', granularity: RDM_ANCHOR_TYPE.MENU })}
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
          {assignMode === 'PM' && (
            <Form.Item
              label="產品經理"
              name="pmUserId"
              rules={[{ required: true, message: '請選擇產品經理' }]}
              style={{ marginTop: 12 }}
              extra={selectedPm ? `當前在途需求 ${selectedPm.activeCount} 個 / 容量 ${selectedPm.capacity} 個，負責域：${selectedPm.domains.join('、')}` : undefined}
            >
              <Select
                style={{ width: 360 }}
                placeholder="選擇產品經理"
                options={pmOptions.map(pm => ({
                  value: pm.userId,
                  label: `${pm.name}（在途 ${pm.activeCount}/${pm.capacity} · ${pm.domains.join('/')}）`,
                }))}
              />
            </Form.Item>
          )}
          {assignMode === 'PM' && selectedPm && (
            <div style={{ maxWidth: 360, marginBottom: 12 }}>
              <div className="rdm-load-bar">
                <div className="rdm-load-bar-inner" style={{ width: `${Math.min((selectedPm.activeCount / selectedPm.capacity) * 100, 100)}%` }} />
              </div>
            </div>
          )}
          <Space size={24} style={{ marginTop: 4 }} align="start">
            <Form.Item label="期望完成時間" name="expectDate" style={{ marginBottom: 12 }}
              extra="填業務硬期限即可；產研承諾時間以受理後的排期為準">
              <DatePicker style={{ width: 180 }} placeholder="選填" minDate={dayjs()} />
            </Form.Item>
            <Form.Item label="業務驗收人" style={{ marginBottom: 12 }}
              extra="默認為提交人本人；需求上線後由該同事在「需求驗收」逐條確認並打 1-5 分">
              <Input style={{ width: 200 }} value="本人（提交人）" disabled />
            </Form.Item>
          </Space>

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
                <Space size={12} style={{ flexWrap: 'wrap' }}>
                  <Form.Item label="需求類型" name="reqType" rules={[{ required: true, message: '請選擇需求類型' }]}>
                    <Select
                      style={{ width: 180 }}
                      options={Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </Form.Item>
                  <Form.Item label="優先級" name="priority" rules={[{ required: true, message: '請選擇優先級' }]}>
                    <Select
                      style={{ width: 240 }}
                      options={Object.entries(RDM_PRIORITY_LABEL).map(([value, label]) => ({
                        value,
                        label: `${label}（產研承諾 ${RDM_PRIORITY_SLA_DAYS[value as RdmPriority]} 天內響應）`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item label="預期規模" name="complexity" extra="不確定可留空，由產品經理評估">
                    <Select
                      style={{ width: 160 }}
                      allowClear
                      placeholder="由產品評估"
                      options={Object.entries(RDM_COMPLEXITY_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </Form.Item>
                </Space>
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
