/**
 * 交付項驗收（分批交付 V3）
 *
 * 与需求级验收（AcceptanceForm）彻底分离：以「交付項」为粒度逐项签署，走
 * `/rdm/delivery-item/{id}/acceptance` 新契约。所有口径与后端 RdmAcceptanceRecordService 一字对齐，
 * 前端只做「把规则说清 + 优雅呈现后端 message」，绝不自行放宽：
 *
 * 1. 验收类型 product/business 由「已签记录 + 路径」推导（业务验收前必须先有产品验收 pass），
 *    前端不让用户随意切换，避免绕过顺序；
 * 2. 阶段：产品验收恒 pre_release；业务验收按路径 A=pre_release / B=post_release；
 * 3. 签署身份来自认证主体（B.8），页面展示被指定的产品/业务验收人，只有本人可签；
 * 4. 四眼：产品签署人 ≠ 业务签署人（后端强制）；
 * 5. 业务验收必须给 1-5 分正式满意度（B.7），产品评分可选；
 * 6. 业务验收 conditional 必须带结构化整改条件（condition/deadline/owner 每条齐全，B.5）；
 * 7. scopeVersion 以交付项当前范围版本为权威回填（B.6），expectedVersion 回传读取到的 version（乐观锁）；
 * 8. 结论门禁只认 pass —— 产品验收 conditional 不建立「产品验收通过」事实。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert, Button, DatePicker, Descriptions, Input, Modal, Radio, Rate,
  Select, Space, Spin, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import HelpPopover from '@/components/HelpPopover'
import {
  fetchDeliveryItemDetail, fetchAcceptanceRecords, submitAcceptanceRecord,
  type RdmDeliveryItemDetail, type RdmAcceptanceRecordListItem,
  type RdmAcceptanceRecordSubmitForm,
} from '@/api/rdm'
import {
  RDM_ACCEPTANCE_TYPE, RDM_ACCEPTANCE_TYPE_LABEL, RDM_ACCEPTANCE_PATH_LABEL,
  RDM_ACCEPT_STAGE, RDM_ACCEPT_STAGE_LABEL,
  RDM_ACCEPT_RESULT, RDM_ACCEPT_RESULT_LABEL, RDM_ACCEPT_RESULT_COLOR,
  RDM_DELIVERY_ITEM_STATUS_LABEL, RDM_DELIVERY_ITEM_STATUS_COLOR,
  RDM_SCORE_TIERS,
  RDM_TEST_ENV_LABEL,
} from '@/constants/rdm'
import './index.css'

const { TextArea } = Input

/** 结构化整改条件（业务验收 conditional 必填，逐条含 条件/期限/责任人） */
interface ConditionRow {
  condition: string
  deadline: string
  owner: string
}

/** 验收结论选项（与后端白名单 pass/conditional/fail 一致） */
const CONCLUSION_OPTIONS = [
  { value: RDM_ACCEPT_RESULT.PASS, label: '驗收通過' },
  { value: RDM_ACCEPT_RESULT.CONDITIONAL, label: '有條件通過' },
  { value: RDM_ACCEPT_RESULT.FAIL, label: '驗收不通過' },
]

const TEST_ENV_OPTIONS = Object.entries(RDM_TEST_ENV_LABEL).map(([value, label]) => ({ value, label }))

/**
 * 根据扩展名判定证据类型（仅用于展示与结构化存储，不作安全校验）。
 * <p>验收人是业务/产品同学，界面不暴露 JSON：用户只贴链接，类型与包装结构由前端组装。
 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i
function evidenceTypeOf(url: string): 'screenshot' | 'link' {
  return IMAGE_EXT_RE.test(url) ? 'screenshot' : 'link'
}

export default function DeliveryItemAcceptanceForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const deliveryItemId = Number(searchParams.get('deliveryItemId') ?? 0)
  const backTab = searchParams.get('tab') ?? 'gate'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RdmDeliveryItemDetail | null>(null)
  const [records, setRecords] = useState<RdmAcceptanceRecordListItem[]>([])

  // 表单状态
  const [conclusion, setConclusion] = useState<string>('')
  const [score, setScore] = useState<number | undefined>()
  const [testEnv, setTestEnv] = useState<string | undefined>()
  const [buildId, setBuildId] = useState('')
  const [opinion, setOpinion] = useState('')
  /** 验收证据：用户只贴链接，提交时由前端组装成后端要的 evidenceJson，不让业务方手写 JSON */
  const [evidenceLinks, setEvidenceLinks] = useState<string[]>([''])
  const [conditions, setConditions] = useState<ConditionRow[]>([{ condition: '', deadline: '', owner: '' }])
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!deliveryItemId) { setError('未指定交付項'); setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const [d, recs] = await Promise.all([
        fetchDeliveryItemDetail(deliveryItemId),
        fetchAcceptanceRecords(deliveryItemId, { pageSize: 100 }).then(r => r.records ?? []).catch(() => [] as RdmAcceptanceRecordListItem[]),
      ])
      setDetail(d)
      setRecords(recs)
    } catch {
      setError('交付項驗收載入失敗')
    } finally {
      setLoading(false)
    }
  }, [deliveryItemId])

  useEffect(() => { void load() }, [load])

  /**
   * 由已签记录 + 路径推导本次验收类型与阶段（不让用户随意切换，避免绕过后端顺序/四眼门禁）。
   * <p>业务验收前必须先有产品验收 pass；产品验收恒 pre_release，业务验收按路径决定阶段。
   */
  const derived = useMemo(() => {
    const hasProductPass = records.some(
      r => r.acceptanceType === RDM_ACCEPTANCE_TYPE.PRODUCT && r.conclusion === RDM_ACCEPT_RESULT.PASS,
    )
    const acceptanceType = hasProductPass ? RDM_ACCEPTANCE_TYPE.BUSINESS : RDM_ACCEPTANCE_TYPE.PRODUCT
    const isPathB = detail?.acceptancePath === 'B'
    const stage = acceptanceType === RDM_ACCEPTANCE_TYPE.PRODUCT
      ? RDM_ACCEPT_STAGE.PRE_RELEASE
      : (isPathB ? RDM_ACCEPT_STAGE.POST_RELEASE : RDM_ACCEPT_STAGE.PRE_RELEASE)
    return { acceptanceType, stage, hasProductPass, isPathB }
  }, [records, detail?.acceptancePath])

  const isBusiness = derived.acceptanceType === RDM_ACCEPTANCE_TYPE.BUSINESS
  /** 业务验收 conditional 必须带结构化条件；产品验收 conditional 不建立通过事实（门禁只认 pass） */
  const needStructuredConditions = isBusiness && conclusion === RDM_ACCEPT_RESULT.CONDITIONAL

  const productSigner = useMemo(
    () => records.find(r => r.acceptanceType === RDM_ACCEPTANCE_TYPE.PRODUCT && r.conclusion === RDM_ACCEPT_RESULT.PASS)?.signerUserName,
    [records],
  )

  const updateCondition = (index: number, patch: Partial<ConditionRow>) => {
    setConditions(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const updateEvidenceLink = (index: number, value: string) => {
    setEvidenceLinks(prev => prev.map((u, i) => (i === index ? value : u)))
  }

  /** 非空证据行（去首尾空白） */
  const cleanEvidenceLinks = () => evidenceLinks.map(u => u.trim()).filter(Boolean)

  /** 提交前本地校验（不放宽后端门禁，只把「一定会被后端拒」的空值提前拦下） */
  const validate = (): string | null => {
    // 不預設「驗收通過」：預設通過等於系統替驗收人做了決策
    if (!conclusion) return t('rdm.acceptance.selectConclusion')
    if (isBusiness && (score == null || score < 1 || score > 5)) {
      return '業務驗收必須給 1-5 分正式滿意度評分'
    }
    if (needStructuredConditions) {
      const valid = conditions.filter(c => c.condition.trim() && c.deadline.trim() && c.owner.trim())
      if (valid.length === 0) return '有條件通過必須至少填寫一條整改條件（條件/期限/責任人齊全）'
      if (valid.length !== conditions.length) return '每條整改條件都必須含 條件/期限/責任人，請補全或刪除空行'
    }
    // UX 校验（不是安全边界）：拦下明显不是链接的内容，避免存进去一条日后看不出是什么的证据
    const badLink = cleanEvidenceLinks().find(u => !/^https?:\/\//i.test(u))
    if (badLink) return t('rdm.acceptance.evidenceInvalidUrl', { value: badLink.slice(0, 30) })
    return null
  }

  const handleSubmit = () => {
    if (!detail) return
    const err = validate()
    if (err) { message.warning(err); return }
    const cleanConditions = conditions.filter(c => c.condition.trim() && c.deadline.trim() && c.owner.trim())
    const evidence = cleanEvidenceLinks()
    Modal.confirm({
      title: '確認提交交付項驗收結論？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>交付項：</span><b>{detail.itemNo} {detail.title}</b></div>
          <div className="confirm-info-row"><span>驗收類型：</span><b>{RDM_ACCEPTANCE_TYPE_LABEL[derived.acceptanceType] ?? derived.acceptanceType}</b></div>
          <div className="confirm-info-row"><span>驗收階段：</span><b>{RDM_ACCEPT_STAGE_LABEL[derived.stage] ?? derived.stage}</b></div>
          <div className="confirm-info-row"><span>範圍版本：</span><b>v{detail.scopeVersion}</b></div>
          <div className="confirm-info-row"><span>驗收結論：</span><b>{RDM_ACCEPT_RESULT_LABEL[conclusion as keyof typeof RDM_ACCEPT_RESULT_LABEL] ?? conclusion}</b></div>
          {isBusiness && <div className="confirm-info-row"><span>滿意度：</span><b>{score} / 5</b></div>}
          {needStructuredConditions && (
            <div className="confirm-info-row"><span>整改條件：</span><b>{cleanConditions.length} 條</b></div>
          )}
        </div>
      ),
      okText: '確認提交',
      cancelText: '返回修改',
      onOk: async () => {
        setSubmitting(true)
        try {
          const payload: RdmAcceptanceRecordSubmitForm = {
            acceptanceType: derived.acceptanceType,
            stage: derived.stage,
            conclusion,
            // scopeVersion 以交付项当前范围版本为权威回填（B.6），与后端不一致即拒
            scopeVersion: detail.scopeVersion,
            testEnv: testEnv || undefined,
            buildId: buildId.trim() || undefined,
            opinion: opinion.trim() || undefined,
            // 后端只存不解析，结构由前端统一组装：用户永不需要接触 JSON
            evidenceJson: evidence.length ? JSON.stringify(evidence.map(url => ({ type: evidenceTypeOf(url), url }))) : undefined,
            // 业务验收必须评分；产品评分可选（仅在有值时回传）
            score: isBusiness ? score : (score ?? undefined),
            conditionsJson: needStructuredConditions ? JSON.stringify(cleanConditions) : undefined,
            expectedVersion: detail.version,
          }
          await submitAcceptanceRecord(deliveryItemId, payload)
          message.success('交付項驗收結論已提交')
          navigate(`/rdm-acceptance?tab=${backTab}`)
        } catch {
          // request.ts 已统一弹后端返回的失败原因（四眼/顺序/证据/评分门禁），此处不覆盖、不双弹
          throw new Error('delivery-item acceptance submit failed')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  if (loading) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="載入中…" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="content-area">
        <Alert
          type="error"
          showIcon
          message={error || '交付項不存在'}
          action={<Button size="small" onClick={() => navigate(-1)}>返回</Button>}
        />
      </div>
    )
  }

  const statusColor = RDM_DELIVERY_ITEM_STATUS_COLOR[detail.status] ?? 'default'
  const statusLabel = RDM_DELIVERY_ITEM_STATUS_LABEL[detail.status] ?? detail.status

  const recordColumns: TableColumnsType<RdmAcceptanceRecordListItem> = [
    { title: '記錄號', dataIndex: 'recordNo', key: 'recordNo', width: 150 },
    {
      title: '類型', dataIndex: 'acceptanceType', key: 'acceptanceType', width: 100,
      render: (v: string) => <Tag color={v === RDM_ACCEPTANCE_TYPE.BUSINESS ? 'gold' : 'processing'} style={{ margin: 0 }}>{RDM_ACCEPTANCE_TYPE_LABEL[v] ?? v}</Tag>,
    },
    { title: '階段', dataIndex: 'stage', key: 'stage', width: 130, render: (v: string) => RDM_ACCEPT_STAGE_LABEL[v as keyof typeof RDM_ACCEPT_STAGE_LABEL] ?? v },
    {
      title: '結論', dataIndex: 'conclusion', key: 'conclusion', width: 110,
      render: (v: string) => <Tag color={RDM_ACCEPT_RESULT_COLOR[v as keyof typeof RDM_ACCEPT_RESULT_COLOR] ?? 'default'} style={{ margin: 0 }}>{RDM_ACCEPT_RESULT_LABEL[v as keyof typeof RDM_ACCEPT_RESULT_LABEL] ?? v}</Tag>,
    },
    { title: '滿意度', dataIndex: 'score', key: 'score', width: 90, render: (v: number | null) => (v ? `${v} / 5` : '-') },
    { title: '簽署人', dataIndex: 'signerUserName', key: 'signerUserName', width: 110, render: (v: string) => v || '-' },
    { title: '輪次', dataIndex: 'roundNo', key: 'roundNo', width: 70 },
    { title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
  ]

  return (
    <div className="content-area">
      <RdmFormHeader
        title="交付項驗收"
        backText="返回驗收清單"
        onBack={() => navigate(`/rdm-acceptance?tab=${backTab}`)}
        badge={(
          <>
            <Tag color={isBusiness ? 'gold' : 'processing'} style={{ margin: 0 }}>
              {RDM_ACCEPTANCE_TYPE_LABEL[derived.acceptanceType] ?? derived.acceptanceType}
            </Tag>
            <Tag color={statusColor} style={{ margin: 0 }}>{statusLabel}</Tag>
          </>
        )}
        meta={`${detail.itemNo} · 需求 ${detail.reqNo} · ${RDM_ACCEPTANCE_PATH_LABEL[detail.acceptancePath] ?? detail.acceptancePath} · 範圍 v${detail.scopeVersion}`}
      />

      {/* ── 交付項與驗收口徑 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          交付項與驗收口徑
          <HelpPopover
            ariaLabel="交付項驗收口徑說明"
            title="交付項驗收口徑（分批交付 V3）"
            content={[
              { tone: 'info', label: '類型與階段由系統推導', body: '業務驗收前必須先有產品驗收 pass；產品驗收恒為上線前，業務驗收按路徑 A=上線前 / B=上線後。不可手工繞過順序。' },
              { tone: 'warn', label: '簽署身份與四眼', body: `簽署人來自登入身份，只有被指定的驗收人可簽。產品驗收人：${detail.productAcceptorUserName || '-'}；業務驗收人：${detail.bizAcceptorUserName || '-'}。產品簽署人 ≠ 業務簽署人（管理員亦不得代簽/自批）。` },
              { tone: 'danger', label: '硬門禁', body: '測試未通過、範圍版本不一致、路徑 B 未開放、業務未評分、conditional 缺結構化條件等，後端會直接拒絕並回明確原因，前端不會放寬。' },
            ]}
          />
          <span className="rdm-card-title-split" />
        </div>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="交付項">{detail.title}</Descriptions.Item>
          <Descriptions.Item label="所屬需求">{detail.reqTitle}（{detail.reqNo}）</Descriptions.Item>
          <Descriptions.Item label="驗收路徑">{RDM_ACCEPTANCE_PATH_LABEL[detail.acceptancePath] ?? detail.acceptancePath}</Descriptions.Item>
          <Descriptions.Item label="當前狀態"><Tag color={statusColor} style={{ margin: 0 }}>{statusLabel}</Tag></Descriptions.Item>
          <Descriptions.Item label="本次驗收類型">{RDM_ACCEPTANCE_TYPE_LABEL[derived.acceptanceType] ?? derived.acceptanceType}</Descriptions.Item>
          <Descriptions.Item label="本次驗收階段">{RDM_ACCEPT_STAGE_LABEL[derived.stage] ?? derived.stage}</Descriptions.Item>
          <Descriptions.Item label="產品驗收人">{detail.productAcceptorUserName || '-'}</Descriptions.Item>
          <Descriptions.Item label="業務驗收人">{detail.bizAcceptorUserName || '-'}</Descriptions.Item>
        </Descriptions>
        {isBusiness && productSigner && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message={`產品驗收已由「${productSigner}」簽署通過；四眼要求本次業務驗收必須由另一人簽署（不得為 ${productSigner}）。`}
          />
        )}
        {!isBusiness && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="尚未有產品驗收通過記錄，本次為產品驗收。結論只有「通過」才會建立產品驗收事實（有條件通過不算通過，無法解鎖業務驗收）。"
          />
        )}
      </div>

      {/* ── 驗收結論與評價 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          驗收結論與評價
          <span className="rdm-card-title-split" />
        </div>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Radio.Group
            value={conclusion}
            onChange={e => setConclusion(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={CONCLUSION_OPTIONS}
          />

          <Space size={24} wrap align="end">
            <span>
              <span style={{ fontSize: 13, color: '#595959', marginRight: 8 }}>驗收環境</span>
              <Select
                style={{ width: 160 }}
                placeholder="選填"
                allowClear
                value={testEnv}
                onChange={setTestEnv}
                options={TEST_ENV_OPTIONS}
              />
            </span>
            <span>
              <span style={{ fontSize: 13, color: '#595959', marginRight: 8 }}>構建標識</span>
              <Input style={{ width: 200 }} value={buildId} maxLength={120} placeholder="選填，例：build-a-1" onChange={e => setBuildId(e.target.value)} />
              <HelpPopover
                title={t('rdm.acceptance.buildIdHelpTitle')}
                ariaLabel="構建標識說明"
                content={t('rdm.acceptance.buildIdHelpBody')}
              />
            </span>
            {/* inline-flex 锁同行：antd Rate 渲染为块级 ul，不包一层会把说明挤到下一行 */}
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#595959', marginRight: 8 }}>
                交付滿意度{isBusiness ? '（業務驗收必填）' : '（選填）'}
              </span>
              <Rate
                value={score}
                onChange={setScore}
                tooltips={RDM_SCORE_TIERS.map(x => `${t(x.short)}：${t(x.desc)}`)}
              />
              {/* 与需求验收同口径：每档含义常驻在星星右侧，不只悬停才有 */}
              <span style={{ fontSize: 12, color: score ? '#E8720C' : '#8C8C8C', marginLeft: 10 }}>
                {score
                  ? `${score} 分 · ${t(RDM_SCORE_TIERS[score - 1].short)}：${t(RDM_SCORE_TIERS[score - 1].desc)}`
                  : t('rdm.acceptance.scoreHintUnrated')}
              </span>
            </span>
          </Space>

          {needStructuredConditions && (
            <div className="rdm-followup-box">
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
                結構化整改條件（業務驗收有條件通過必填，每條含 條件/期限/責任人）
              </div>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {conditions.map((c, i) => (
                  <Space key={i} size={8} align="center" wrap>
                    <Input
                      style={{ width: 320 }} value={c.condition} maxLength={200} placeholder="條件：要整改什麼"
                      onChange={e => updateCondition(i, { condition: e.target.value })}
                    />
                    <DatePicker
                      placeholder="期限"
                      value={c.deadline ? dayjs(c.deadline) : null}
                      onChange={d => updateCondition(i, { deadline: d ? d.format('YYYY-MM-DD') : '' })}
                    />
                    <Input
                      style={{ width: 160 }} value={c.owner} maxLength={60} placeholder="責任人"
                      onChange={e => updateCondition(i, { owner: e.target.value })}
                    />
                    <Button
                      type="link" danger icon={<DeleteOutlined />} disabled={conditions.length === 1}
                      onClick={() => setConditions(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      刪除
                    </Button>
                  </Space>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => setConditions(prev => [...prev, { condition: '', deadline: '', owner: '' }])}>
                  新增條件
                </Button>
              </Space>
            </div>
          )}

          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>驗收意見（選填）</div>
            <TextArea rows={2} value={opinion} onChange={e => setOpinion(e.target.value)} placeholder="例：功能符合交付項範圍，業務側確認可用。" />
          </div>

          {/* 证据录入：用户只贴链接，JSON 结构由前端组装——业务/产品验收人不应被要求懂技术格式 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: '#595959' }}>{t('rdm.acceptance.evidenceField')}</span>
              <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 6 }}>{t('rdm.acceptance.evidenceHint')}</span>
              <HelpPopover
                title={t('rdm.acceptance.evidenceHelpTitle')}
                ariaLabel="驗收證據填寫說明"
                width={400}
                content={[
                  { tone: 'info', label: t('rdm.acceptance.evidenceHelpWhatLabel'), body: t('rdm.acceptance.evidenceHelpWhatBody') },
                  { tone: 'neutral', label: t('rdm.acceptance.evidenceHelpHowLabel'), body: t('rdm.acceptance.evidenceHelpHowBody') },
                ]}
              />
            </div>
            {evidenceLinks.map((url, i) => (
              <div key={i} className="rdm-evidence-row">
                <Input
                  style={{ flex: 1 }}
                  value={url}
                  maxLength={500}
                  placeholder={i === 0 ? t('rdm.acceptance.evidenceFirstPlaceholder') : t('rdm.acceptance.evidenceMorePlaceholder')}
                  onChange={e => updateEvidenceLink(i, e.target.value)}
                />
                {!!url.trim() && (
                  <Tag color={evidenceTypeOf(url) === 'screenshot' ? 'blue' : 'default'} style={{ margin: 0, flexShrink: 0 }}>
                    {evidenceTypeOf(url) === 'screenshot' ? t('rdm.acceptance.evidenceTypeScreenshot') : t('rdm.acceptance.evidenceTypeLink')}
                  </Tag>
                )}
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={evidenceLinks.length === 1}
                  onClick={() => setEvidenceLinks(prev => prev.filter((_, idx) => idx !== i))}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ))}
            <Button type="link" size="small" icon={<PlusOutlined />} style={{ paddingLeft: 0 }} onClick={() => setEvidenceLinks(prev => [...prev, ''])}>
              {t('rdm.acceptance.evidenceAdd')}
            </Button>
          </div>
        </Space>
      </div>

      {/* ── 歷次驗收記錄 ── */}
      <div className="rdm-card">
        <div className="rdm-card-title">
          歷次驗收記錄
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>
            {records.length === 0 ? '尚無驗收記錄' : `共 ${records.length} 條`}
          </span>
        </div>
        <Table<RdmAcceptanceRecordListItem>
          rowKey="id"
          size="small"
          columns={recordColumns}
          dataSource={records}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: '尚無驗收記錄' }}
        />
      </div>

      {/* ── 底部操作栏 ── */}
      <div className="form-footer">
        <Button onClick={() => navigate(`/rdm-acceptance?tab=${backTab}`)}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          提交驗收結論
        </Button>
      </div>
    </div>
  )
}
