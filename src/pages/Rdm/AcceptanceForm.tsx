/**
 * 业务验收 —— 用例化验收（M3）
 *
 * 设计口径：验收不能只勾一个"通过/不通过"，否则返工时没人说得清到底哪条没满足。
 * 因此本页以「验收用例」为主体：
 * 1. 用例来源优先取 PRD 的验收标准（可一键导入），保证业务验的就是产品承诺的；
 * 2. 每条用例单独给结论与实际结果，不通过必须定严重度；
 * 3. 结论由用例自动约束：有致命/严重缺陷就不允许"通过/有条件通过"（防带病上线）；
 * 4. 有条件通过的遗留事项可一键转后续需求，避免"口头答应下次改"；
 * 5. 历次验收记录直接展示第几次验收，attempt>1 即返工，责任链清晰。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Checkbox, Image, Input, Modal, Radio, Rate, Select, Space, Tag, Tooltip, Upload, message } from 'antd'
import {
  AimOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  HistoryOutlined,
  ImportOutlined,
  PictureOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import EvidenceThumb from './components/CaseEvidenceThumb'
import HelpPopover from '../../components/HelpPopover'
import DeliveryItemAcceptanceForm from './DeliveryItemAcceptanceForm'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RequirementStageBar from './components/RequirementStageBar'
import { PriorityTag, StatusTag, TypeTag } from './components/Tags'
import {
  fetchAcceptanceHistory,
  fetchRequirementDetail,
  submitAcceptance,
  uploadAttachment,
  type RdmAcceptanceCaseForm,
  type RdmAcceptanceEvidencePayload,
  type RdmAcceptanceRecord,
  type RdmRequirementDetail,
} from '../../api/rdm'
import {
  RDM_ACCEPT_RESULT,
  RDM_ACCEPT_STAGE,
  RDM_ACCEPT_STAGE_LABEL,
  RDM_CASE_RESULT,
  RDM_CASE_RESULT_LABEL,
  RDM_DEFECT_SEVERITY,
  RDM_DEFECT_SEVERITY_LABEL,
  RDM_SCORE_TIERS,
  RDM_TEST_ENV_LABEL,
  RDM_STATUS_LABEL,
  RDM_STATUS,
  type RdmAcceptResult,
  type RdmAcceptStage,
  type RdmCaseResult,
  type RdmStatus,
  type RdmTestEnv,
} from '../../constants/rdm'
import './index.css'
import {
  canSelectResult,
  draftIssuesText,
  statCases,
  validateAcceptance,
} from './acceptanceRules'

const { TextArea } = Input

/** 验收结论选项（可选范围会被用例结果反向约束） */
const RESULT_OPTIONS = [
  { value: RDM_ACCEPT_RESULT.PASS, label: '驗收通過', desc: '全部檢查項通過，可正式上線交付' },
  { value: RDM_ACCEPT_RESULT.CONDITIONAL, label: '有條件通過', desc: '僅允許一般/輕微遺留問題，且必須轉後續需求跟蹤' },
  { value: RDM_ACCEPT_RESULT.FAIL, label: '驗收不通過', desc: '退回研發修復，計入該需求的返工次數' },
]

/** 用例结论选项（行内下拉） */
const CASE_RESULT_OPTIONS = Object.entries(RDM_CASE_RESULT_LABEL).map(([value, label]) => ({ value, label }))

/** 缺陷严重度选项（颜色语义化） */
const SEVERITY_OPTIONS = Object.entries(RDM_DEFECT_SEVERITY_LABEL).map(([value, label]) => ({ value, label }))

/** 单条用例证据上限：与后端 RdmRequirementServiceImpl.MAX_CASE_EVIDENCES 同口径，前端先拦一次免得白跑 */
const MAX_CASE_EVIDENCES = 6
/** 单张证据体积上限（MB）：与上传接口一致 */
const MAX_EVIDENCE_MB = 5

export default function AcceptanceForm() {
  const [searchParams] = useSearchParams()
  /**
   * V3 分批交付：入口带 deliveryItemId 时走「交付項驗收」新契约
   * （/rdm/delivery-item/{id}/acceptance），与需求级验收彻底分离。
   * <p>分发组件只调 useSearchParams 一个 hook，两条分支各自是独立组件，
   * 保证 hooks 调用顺序稳定（不在同一组件里条件性提前 return 打断 hook 序列）。
   */
  const deliveryItemId = Number(searchParams.get('deliveryItemId') ?? 0)
  if (deliveryItemId) return <DeliveryItemAcceptanceForm />
  return <RequirementAcceptanceForm />
}

/** 需求级业务验收（用例化验收，M3）—— 走 /rdm/requirement/{id}/acceptance 旧契约 */
function RequirementAcceptanceForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = Number(searchParams.get('id') ?? 0)
  /**
   * 回详情页时落回用户离开时的那个页签。
   * <p>验收入口有两处（处理条的「業務驗收」按钮、「驗收與發布」页签内），
   * 写死 tab 会让从处理条进来的人被丢到验收页签，找不到刚才看的进度条。
   */
  const backTab = searchParams.get('tab') ?? 'gate'
  /**
   * 来源感知返回：从验收中心列表进来就返回列表，从需求详情进来就回详情。
   * <p>只认 rdm-acceptance 一个合法来源（白名单），拼错/伪造一律回落详情页，
   * 不得让 URL 参数把用户丢到没来过的页面。
   */
  const fromAcceptanceList = searchParams.get('from') === 'rdm-acceptance'

  const [detail, setDetail] = useState<RdmRequirementDetail | null>(null)
  const [history, setHistory] = useState<RdmAcceptanceRecord[]>([])
  const [cases, setCases] = useState<RdmAcceptanceCaseForm[]>([])
  const [result, setResult] = useState<RdmAcceptResult>(RDM_ACCEPT_RESULT.PASS)
  /** 满意度不预置分数：预置 5 分会让「必填满意度」校验永远提前满足，等于替业务方打分 */
  const [score, setScore] = useState<number | undefined>()
  const [testEnv, setTestEnv] = useState<RdmTestEnv>()
  const [issues, setIssues] = useState('')
  const [opinion, setOpinion] = useState('')
  const [createFollowUp, setCreateFollowUp] = useState(true)
  const [followUpTitle, setFollowUpTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** 正在上传证据的用例下标：只给对应卡片转圈，不让整页按钮都进入 loading */
  const [uploadingCase, setUploadingCase] = useState<number | null>(null)
  /** 被展开查看用例明细的验收记录 id */
  const [expandedHistory, setExpandedHistory] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    if (!id) return
    const [data, records] = await Promise.all([
      fetchRequirementDetail(id),
      fetchAcceptanceHistory(id),
    ])
    setDetail(data)
    setHistory(records)
    /*
     * 用例不再从 PRD 验收标准或 QA 测试用例自动带入：业务验收人看不懂技术化的用例，
     * 塞一堆他判不了的条目只会逼他闭眼勾「通過」，验收退化成盖章。
     * 改为空白起步，由验收人对照上方「需求與期望對照」自己写要验什么。
     */
    setCases([])
  }, [id])

  useEffect(() => { void load() }, [load])

  /** 用例统计与结论约束统一走纯函数层（与后端落库同一套规则） */
  const stat = useMemo(() => statCases(cases), [cases])

  /**
   * 验收阶段（阶段 4）：由状态推导，与后端 resolveAcceptanceStage 同一口径。
   * <p>上线前预验收回答“质量能不能上线”，上线后业务验收回答“上线后真解决了吗”，
   * 后者才是 1-5 分满意度的正式口径。
   */
  const stage = detail?.status === RDM_STATUS.UAT_PENDING || detail?.status === RDM_STATUS.TEST_PASSED
    ? RDM_ACCEPT_STAGE.PRE_RELEASE
    : detail?.status === RDM_STATUS.RELEASED || detail?.status === RDM_STATUS.VERIFIED
      ? RDM_ACCEPT_STAGE.POST_RELEASE
      : null
  const isPostRelease = stage === RDM_ACCEPT_STAGE.POST_RELEASE

  /**
   * 是否处于可提交验收的状态。
   * <p>后端会拒其他状态的提交，但只靠后端拦会让验收人填完一整页才报错，页面先把状态说清。
   */
  const canAccept = stage !== null

  /** 第几次验收（attempt）：按阶段各自计数，与后端 nextAcceptanceAttempt 一致 */
  const attempt = history.filter(h => (h.stage ?? RDM_ACCEPT_STAGE.PRE_RELEASE) === stage).length + 1

  /** 结论可选性：由用例结果反向决定，避免把「有條件通過」当成绕过缺陷的后门 */
  const resultDisabled = useMemo(() => ({
    [RDM_ACCEPT_RESULT.PASS]: !canSelectResult(RDM_ACCEPT_RESULT.PASS, stat),
    [RDM_ACCEPT_RESULT.CONDITIONAL]: !canSelectResult(RDM_ACCEPT_RESULT.CONDITIONAL, stat),
    [RDM_ACCEPT_RESULT.FAIL]: !canSelectResult(RDM_ACCEPT_RESULT.FAIL, stat),
  }), [stat])

  const updateCase = (index: number, patch: Partial<RdmAcceptanceCaseForm>) => {
    setCases(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  /** 提交前校验（顺序：表单校验 → 二次确认 → 调接口） */
  const validate = (): boolean => {
    // 满意度不预选后必须真由验收人给分，否则质量因子会退化成常量
    // 上线后业务验收无论结论如何都必须打分（目标⑦：强制 1-5 分）
    if ((isPostRelease || result !== RDM_ACCEPT_RESULT.FAIL) && !score) {
      message.warning(isPostRelease
        ? '上線後業務驗收必須給 1-5 分滿意度評分'
        : '請給出交付滿意度評分（驗收通過/有條件通過必須打分）')
      return false
    }
    const error = validateAcceptance({
      ...stat,
      hasEmptyTitle: cases.some(c => !c.title.trim()),
      result,
      testEnv,
      issues,
      createFollowUp,
      followUpTitle,
    })
    if (error) {
      message.warning(error)
      return false
    }
    return true
  }

  const handleSubmit = () => {
    if (!canAccept) {
      // 不因状态而隐藏入口时，至少要说清为什么不能交，不能让用户填完一整页才被后端拒
      message.warning('該需求當前狀態不接受驗收結論（上線前在「待業務驗收」，上線後在「已上線/已驗證」）')
      return
    }
    if (!validate()) return
    const label = RESULT_OPTIONS.find(o => o.value === result)?.label ?? result
    Modal.confirm({
      title: '確認提交驗收結論？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求編號：</span><b>{detail?.reqNo}</b></div>
          <div className="confirm-info-row"><span>需求標題：</span><b>{detail?.title}</b></div>
          <div className="confirm-info-row"><span>本次驗收：</span><b>{RDM_ACCEPT_STAGE_LABEL[stage as RdmAcceptStage] ?? '-'} 第 {attempt} 次{attempt > 1 ? '（返工復驗）' : ''}</b></div>
          <div className="confirm-info-row"><span>驗收環境：</span><b>{envLabel}</b></div>
          <div className="confirm-info-row"><span>驗收結論：</span><b>{label}</b></div>
          <div className="confirm-info-row"><span>檢查項：</span><b>{stat.passed}/{stat.total} 通過，缺陷 {stat.defects} 個（致命/嚴重 {stat.blocking}）</b></div>
          <div className="confirm-info-row"><span>滿意度：</span><b>{score} / 5</b></div>
          {issues && <div className="confirm-info-row"><span>問題/遺留：</span><b>{issues}</b></div>}
          {result === RDM_ACCEPT_RESULT.CONDITIONAL && createFollowUp && (
            <div className="confirm-info-row"><span>轉後續需求：</span><b>{followUpTitle}</b></div>
          )}
          {result === RDM_ACCEPT_RESULT.FAIL && !isPostRelease && (
            <div className="confirm-info-row"><span>狀態影響：</span><b>需求退回「開發中」並通知研發負責人</b></div>
          )}
          {result === RDM_ACCEPT_RESULT.FAIL && isPostRelease && (
            <div className="confirm-info-row"><span>狀態影響：</span><b>已上線不退狀態，必須轉後續需求承接遺留問題</b></div>
          )}
        </div>
      ),
      okText: '確認提交',
      cancelText: '返回修改',
      onOk: async () => {
        setSubmitting(true)
        try {
          await submitAcceptance(id, {
            result,
            score,
            caseTotal: stat.total,
            casePass: stat.passed,
            issues: issues || undefined,
            opinion: opinion || undefined,
            testEnv,
            cases: cases.flatMap(c => (c.result ? [{ ...c, title: c.title.trim(), result: c.result }] : [])),
            // 上线后不通过必须转后续需求（后端同样强制），勾选项在界面上直接锁定避免反复报错
            createFollowUp: result === RDM_ACCEPT_RESULT.CONDITIONAL || (isPostRelease && result === RDM_ACCEPT_RESULT.FAIL)
              ? true
              : undefined,
            followUpTitle: (result === RDM_ACCEPT_RESULT.CONDITIONAL || (isPostRelease && result === RDM_ACCEPT_RESULT.FAIL))
              && followUpTitle.trim() ? followUpTitle.trim() : undefined,
          })
          message.success('驗收結論已提交')
          navigate(fromAcceptanceList ? '/rdm-acceptance' : `/rdm-detail?id=${id}&tab=${backTab}`)
        } catch {
          message.error('提交失敗，請重試')
          throw new Error('acceptance submit failed')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  /** 本次提交若是退回，它是该需求第几次验收不通过（与提示文案直接挂钩，不写死数字） */
  const failTimes = history.filter(h => h.result === RDM_ACCEPT_RESULT.FAIL).length + 1
  const envLabel = testEnv ? RDM_TEST_ENV_LABEL[testEnv] : '-'

  if (!detail) {
    return (
      <div className="content-area">
        <div style={{ padding: 60, textAlign: 'center', color: '#8C8C8C' }}>
          {id ? '載入中…' : '未指定需求，請從待驗收列表進入'}
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => navigate('/rdm-acceptance')}>返回待驗收列表</Button>
          </div>
        </div>
      </div>
    )
  }

  /** 用例卡片的结论变更：通过时清空缺陷严重度，避免统计口径出现"通过但有缺陷"的脏数据 */
  const updateCaseResult = (index: number, val?: string) => {
    const prevResult = cases[index]?.result
    updateCase(index, {
      result: val,
      severity: val === RDM_CASE_RESULT.PASS ? undefined : (prevResult === RDM_CASE_RESULT.PASS ? RDM_DEFECT_SEVERITY.MINOR : undefined),
    })
  }

  /**
   * 上传用例证据。
   * <p>前端只拦明显超限的（条数/体积），类型与 magic bytes 的权威校验在后端上传接口；
   * 后端拒收时 request.ts 已统一弹原因，这里不双弹。
   */
  const handleUploadEvidence = async (index: number, file: File) => {
    const current = cases[index]?.evidences ?? []
    if (current.length >= MAX_CASE_EVIDENCES) {
      message.warning(t('rdm.acceptance.evidenceLimitWarn', { count: MAX_CASE_EVIDENCES }))
      return
    }
    if (file.size > MAX_EVIDENCE_MB * 1024 * 1024) {
      message.warning(t('rdm.acceptance.evidenceTooLargeWarn', { size: MAX_EVIDENCE_MB }))
      return
    }
    setUploadingCase(index)
    try {
      const uploaded = await uploadAttachment(file)
      const payload: RdmAcceptanceEvidencePayload = {
        name: uploaded.name,
        type: uploaded.fileType,
        size: uploaded.fileSize,
        dataUrl: uploaded.dataUrl,
      }
      updateCase(index, { evidences: [...current, payload] })
    } catch {
      // 失败原因已由 request.ts 弹出，保持当前已上传列表不变即可
    } finally {
      setUploadingCase(null)
    }
  }

  const handleRemoveEvidence = (index: number, evidenceIndex: number) => {
    const current = cases[index]?.evidences ?? []
    updateCase(index, { evidences: current.filter((_, ei) => ei !== evidenceIndex) })
  }

  return (
    <div className="content-area">
      {/* ── 头部（统一组件；只读标签放 badge，不放操作按鈕）── */}
      <RdmFormHeader
        title="業務驗收"
        backText={fromAcceptanceList ? t('rdm.acceptance.backToList') : t('rdm.acceptance.backToDetail')}
        onBack={() => navigate(fromAcceptanceList ? '/rdm-acceptance' : `/rdm-detail?id=${detail.id}&tab=${backTab}`)}
        badge={(
          <>
            <Tag color={attempt > 1 ? 'error' : 'green'} style={{ margin: 0 }}>第 {attempt} 次驗收{attempt > 1 ? ' · 返工復驗' : ''}</Tag>
            <TypeTag reqType={detail.reqType} />
            <PriorityTag priority={detail.priority} />
            <StatusTag status={detail.status} overdue={detail.overdueFlag ?? false} />
          </>
        )}
        meta={(
          <>
            {detail.reqNo} · 提出人 {detail.submitterName} · 產品經理 {detail.pmName ?? '-'}
            {detail.versionNo ? ` · 關聯版本 ${detail.versionNo}` : ' · 尚未關聯版本'}
          </>
        )}
      />

      {/* 状态不可验收时先把原因顶到脸上，而不是让人填完整页 */}
      {!canAccept && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="當前需求不在「待業務驗收」狀態"
          description={(
            <span>
              狀態為「{RDM_STATUS_LABEL[detail.status as RdmStatus] ?? detail.status}」，只能查看歷次驗收記錄；
              需求退回開發並重新提交測試後才會再次出現可填寫的驗收單。
            </span>
          )}
        />
      )}

      {/* ── 当初的需求与期望（帮助验收人对照） ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><AimOutlined /></span>
          需求與期望對照
          <span className="rdm-card-title-split" />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 8 }}>{detail.title}</div>
        <div className="rdm-desc-block">{detail.description}</div>
        {detail.expectResult && (
          <>
            <div style={{ fontSize: 12, color: '#8C8C8C', margin: '10px 0 6px' }}>當初的期望結果</div>
            <div className="rdm-desc-block">{detail.expectResult}</div>
          </>
        )}
        <RequirementStageBar status={detail.status} overdue={detail.overdueFlag ?? false} />
      </div>

      {/* ── 验收检查项（卡片流：每条一项一张卡，长文本完整可见） ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><CheckCircleOutlined /></span>
          {t('rdm.acceptance.caseCardTitle')}
          {/* 检查项全由验收人自己写，就得告诉他写成什么样才可判；长说明走 HelpPopover（§问号说明规范） */}
          <HelpPopover
            title={t('rdm.acceptance.caseHowToTitle')}
            ariaLabel="驗收檢查項寫法說明"
            placement="bottomLeft"
            width={420}
            content={[
              { tone: 'info', label: t('rdm.acceptance.caseHowToRuleLabel'), body: t('rdm.acceptance.caseHowToRuleBody') },
              { tone: 'success', label: t('rdm.acceptance.caseHowToExpectLabel'), body: t('rdm.acceptance.caseHowToExpectBody') },
              { tone: 'warn', label: t('rdm.acceptance.caseHowToJudgeLabel'), body: t('rdm.acceptance.caseHowToJudgeBody') },
            ]}
          />
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            通過 {stat.passed}/{stat.total}
            {stat.defects > 0 && <span style={{ color: '#CF1322', marginLeft: 8 }}>缺陷 {stat.defects}（致命/嚴重 {stat.blocking}）</span>}
          </span>
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            style={{ marginLeft: 12 }}
            onClick={() => setCases(prev => [...prev, { title: '', expect: '' }])}
          >
            {t('rdm.acceptance.addCase')}
          </Button>
        </div>
        {cases.length === 0 ? (
          <div className="rdm-case-empty">{t('rdm.acceptance.caseEmpty')}</div>
        ) : cases.map((c, i) => (
          <div key={i} className="rdm-case-card">
            <div className="rdm-case-head">
              <span className="rdm-case-no">{i + 1}</span>
              <span className="rdm-case-inline-field">
                <span className="rdm-case-field-label">{t('rdm.acceptance.resultField')}</span>
                <Select
                  style={{ width: 110 }}
                  value={c.result}
                  placeholder={t('rdm.acceptance.resultUnjudged')}
                  onChange={val => updateCaseResult(i, val)}
                  options={CASE_RESULT_OPTIONS}
                />
              </span>
              {!!c.result && c.result !== RDM_CASE_RESULT.PASS && (
                <span className="rdm-case-inline-field">
                  <span className="rdm-case-field-label">{t('rdm.acceptance.severityField')}</span>
                  <Select
                    style={{ width: 100 }}
                    value={c.severity}
                    placeholder={t('rdm.acceptance.severityRequired')}
                    status={c.severity ? undefined : 'error'}
                    onChange={val => updateCase(i, { severity: val })}
                    options={SEVERITY_OPTIONS}
                  />
                </span>
              )}
              <span className="rdm-case-head-tail" />
              <Button type="link" size="small" danger onClick={() => setCases(prev => prev.filter((_, idx) => idx !== i))}>
                {t('common.delete')}
              </Button>
            </div>
            <div className="rdm-case-field">
              <div className="rdm-case-field-label">{t('rdm.acceptance.caseField')}</div>
              <TextArea
                value={c.title}
                autoSize={{ minRows: 1, maxRows: 6 }}
                maxLength={200}
                placeholder={t('rdm.acceptance.caseTitlePlaceholder')}
                onChange={e => updateCase(i, { title: e.target.value })}
              />
            </div>
            <div className="rdm-case-fields-grid">
              <div className="rdm-case-field">
                <div className="rdm-case-field-label">{t('rdm.acceptance.expectField')}</div>
                {/* 不用 autoSize：它会把高度交给组件计算、拿掉手动拖拽把手；
                    预期口径经常是一段长文本，给固定初始高 + 纵向可拖让用户自己拉高看全 */}
                <TextArea
                  value={c.expect}
                  rows={3}
                  maxLength={300}
                  style={{ resize: 'vertical' }}
                  placeholder={t('rdm.acceptance.expectPlaceholder')}
                  onChange={e => updateCase(i, { expect: e.target.value })}
                />
              </div>
              <div className="rdm-case-field">
                <div className="rdm-case-field-label">{t('rdm.acceptance.actualField')}</div>
                <TextArea
                  value={c.actual}
                  rows={3}
                  maxLength={300}
                  style={{ resize: 'vertical' }}
                  placeholder={t('rdm.acceptance.actualPlaceholder')}
                  onChange={e => updateCase(i, { actual: e.target.value })}
                />
              </div>
            </div>
            {/* 证据区：待提交的图 dataUrl 还在内存里，直接渲染缩略图，不需要回后端取 */}
            <div className="rdm-case-field">
              <div className="rdm-case-field-label">{t('rdm.acceptance.evidenceCaseField')}</div>
              <div className="rdm-case-evidence-row">
                {(c.evidences ?? []).map((ev, ei) => (
                  <span key={ei} className="rdm-case-evidence-item">
                    {ev.type.startsWith('image/') ? (
                      <Image
                        src={ev.dataUrl}
                        width={56}
                        height={56}
                        alt={ev.name}
                        style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #e8eaed' }}
                      />
                    ) : (
                      <a href={ev.dataUrl} download={ev.name} style={{ fontSize: 12 }}>{ev.name}</a>
                    )}
                    <Tooltip title={t('common.delete')}>
                      <Button
                        type="text"
                        size="small"
                        danger
                        aria-label={`${t('common.delete')}：${ev.name}`}
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemoveEvidence(i, ei)}
                      />
                    </Tooltip>
                  </span>
                ))}
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={file => { void handleUploadEvidence(i, file); return false }}
                >
                  <Button
                    size="small"
                    icon={<PictureOutlined />}
                    loading={uploadingCase === i}
                    disabled={(c.evidences?.length ?? 0) >= MAX_CASE_EVIDENCES}
                  >
                    {t('rdm.acceptance.evidenceUpload')}
                  </Button>
                </Upload>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 结论 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><SendOutlined /></span>
          驗收結論與評價
          <span className="rdm-card-title-split" />
        </div>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Radio.Group
            value={result}
            onChange={e => {
              const next = e.target.value as RdmAcceptResult
              setResult(next)
              if (next === RDM_ACCEPT_RESULT.PASS) setIssues('')
            }}
            optionType="button"
            buttonStyle="solid"
            options={RESULT_OPTIONS.map(o => ({
              value: o.value,
              label: resultDisabled[o.value] ? (
                <Tooltip title={o.value === RDM_ACCEPT_RESULT.PASS ? '存在未通過的檢查項' : '存在致命/嚴重缺陷，或沒有需要遺留的問題'}>
                  {o.label}
                </Tooltip>
              ) : o.label,
              disabled: resultDisabled[o.value],
            }))}
          />
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            {RESULT_OPTIONS.find(o => o.value === result)?.desc}
          </div>

          <Space size={24} wrap align="end">
            <span>
              <span style={{ fontSize: 13, color: '#595959', marginRight: 8 }}>驗收環境</span>
              <Select
                style={{ width: 160 }}
                placeholder="必選"
                value={testEnv}
                onChange={setTestEnv}
                options={Object.entries(RDM_TEST_ENV_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </span>
            {/* inline-flex 锁同行：antd Rate 渲染为块级 ul，不包一层会把说明挤到下一行 */}
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#595959', marginRight: 8 }}>交付滿意度</span>
              <Rate
                value={score}
                onChange={setScore}
                tooltips={RDM_SCORE_TIERS.map(x => `${t(x.short)}：${t(x.desc)}`)}
              />
              {/* 每档口径常驻显示在星星右侧：光靠悬停的话，业务方打完分就忘了自己为什么选 3 分 */}
              <span style={{ fontSize: 12, color: score ? '#E8720C' : '#8C8C8C', marginLeft: 10 }}>
                {score
                  ? `${score} 分 · ${t(RDM_SCORE_TIERS[score - 1].short)}：${t(RDM_SCORE_TIERS[score - 1].desc)}`
                  : t('rdm.acceptance.scoreHintUnrated')}
              </span>
            </span>
          </Space>

          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>
              問題/遺留事項{result !== RDM_ACCEPT_RESULT.PASS ? '（必填）' : '（選填）'}
            </div>
            <TextArea rows={3} value={issues} onChange={e => setIssues(e.target.value)} placeholder="例：導出超過 90 天區間時提示不明確，建議下個版本補充。" />
            {stat.defects > 0 && result !== RDM_ACCEPT_RESULT.FAIL && (
              <Button
                type="link"
                size="small"
                icon={<ImportOutlined />}
                style={{ paddingLeft: 0, marginTop: 4 }}
                onClick={() => setIssues(draftIssuesText(cases))}
              >
                把 {stat.defects} 條未通過的檢查項填入問題描述
              </Button>
            )}
          </div>

          {result === RDM_ACCEPT_RESULT.CONDITIONAL && (
            <div className="rdm-followup-box">
              <Checkbox checked={createFollowUp} onChange={e => setCreateFollowUp(e.target.checked)}>
                將遺留問題轉為後續需求（Recommend，避免只口頭答應）
              </Checkbox>
              {createFollowUp && (
                <Input
                  style={{ marginTop: 8, maxWidth: 560 }}
                  value={followUpTitle}
                  maxLength={200}
                  placeholder={`例：${detail.title} — 遺留問題跟進`}
                  onChange={e => setFollowUpTitle(e.target.value)}
                />
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>驗收意見（將進入需求檔案）</div>
            <TextArea rows={2} value={opinion} onChange={e => setOpinion(e.target.value)} placeholder="例：功能符合預期，業務側確認可用，同意上線。" />
          </div>

          {result === RDM_ACCEPT_RESULT.FAIL && (
            <Alert
              type="error"
              showIcon
              icon={<CloseCircleOutlined />}
              message={`提交後需求將退回「開發中」，系統會通知研發負責人與產品經理，並計入該需求的返工次數（第 ${failTimes} 次驗收退回）。`}
            />
          )}
        </Space>
      </div>

      {/* ── 历次验收（返工链路） ── */}
      {history.length > 0 && (
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><HistoryOutlined /></span>
            曆次驗收記錄
            <span className="rdm-card-title-split" />
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>返工不是追責，而是讓「一次通過率」有真實分母</span>
          </div>
          {history.map(h => (
            <div key={h.id} className="rdm-acceptance-history">
              <Tag color={h.result === RDM_ACCEPT_RESULT.FAIL ? 'error' : h.result === RDM_ACCEPT_RESULT.CONDITIONAL ? 'warning' : 'success'} style={{ margin: 0 }}>
                第 {h.attempt} 次 · {RESULT_OPTIONS.find(o => o.value === h.result)?.label ?? h.result}
              </Tag>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: '#262626' }}>{h.acceptorName ?? '-'}</span>
                <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                  {h.acceptTime ? dayjs(h.acceptTime).format('MM-DD HH:mm') : ''}
                  {h.testEnv ? ` · ${RDM_TEST_ENV_LABEL[h.testEnv as RdmTestEnv] ?? h.testEnv}` : ''}
                  {h.caseTotal != null ? ` · 檢查項 ${h.casePass ?? 0}/${h.caseTotal}` : ''}
                  {h.score != null ? ` · 滿意度 ${h.score}/5` : ''}
                </span>
                {(h.issues || h.opinion) && (
                  <div style={{ fontSize: 12, color: '#595959', marginTop: 2 }}>{h.issues ?? h.opinion}</div>
                )}
                {h.followUpReqNo && (
                  <div style={{ fontSize: 12, color: '#1890FF', marginTop: 2 }}>遺留事項已轉後續需求：{h.followUpReqNo}</div>
                )}
                {/* 用例明细默认折叠：返工链上的全部用例一次性展开会掉信息密度，
                    而证据正文由 EvidenceThumb 按 index 懒取，展开也不会自动拉图 */}
                {!!h.cases?.length && (
                  <div style={{ marginTop: 4 }}>
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingLeft: 0, fontSize: 12 }}
                      onClick={() => setExpandedHistory(prev => ({ ...prev, [h.id]: !prev[h.id] }))}
                    >
                      {expandedHistory[h.id]
                        ? t('rdm.acceptance.historyCaseCollapse')
                        : t('rdm.acceptance.historyCaseToggle', { count: h.cases.length })}
                    </Button>
                    {expandedHistory[h.id] && (
                      <div className="rdm-history-cases">
                        {h.cases.map(cs => (
                          <div key={cs.id} className="rdm-history-case">
                            <span className="rdm-case-no">{cs.seq}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#262626' }}>{cs.title}</div>
                              {cs.actual && (
                                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>
                                  {t('rdm.acceptance.actualField')}：{cs.actual}
                                </div>
                              )}
                              {!!cs.evidences?.length && (
                                <div className="rdm-case-evidence-row" style={{ marginTop: 4 }}>
                                  {cs.evidences.map(ev => (
                                    <EvidenceThumb key={ev.index} reqId={id} caseId={cs.id} meta={ev} />
                                  ))}
                                </div>
                              )}
                            </span>
                            <Tag
                              color={cs.result === RDM_CASE_RESULT.PASS ? 'success' : cs.result === RDM_CASE_RESULT.FAIL ? 'error' : 'warning'}
                              style={{ margin: 0, flexShrink: 0 }}
                            >
                              {/* 落库结论可能是历史枚举外的值，查不到时直显原文而不是报错 */}
                              {RDM_CASE_RESULT_LABEL[cs.result as RdmCaseResult] ?? cs.result}
                            </Tag>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 底部操作栏 ── */}
      <div className="form-footer">
        <Button onClick={() => navigate(`/rdm-detail?id=${detail.id}&tab=${backTab}`)}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} disabled={!canAccept} onClick={handleSubmit}>
          提交驗收結論
        </Button>
      </div>
    </div>
  )
}
