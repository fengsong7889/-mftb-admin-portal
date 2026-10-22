import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Form, Input, Select, Switch, Tag, Tooltip, message } from 'antd'
import { ArrowLeftOutlined, EyeOutlined, FileTextOutlined, LinkOutlined, SaveOutlined } from '@ant-design/icons'
import { useAuth } from '../../../contexts/AuthContext'
import DailyReportBoardPreviewModal from '../../../components/DailyReportBoardPreviewModal'
import DingTalkCardPreview from './DingTalkCardPreview'
import {
  fetchDailyReportTemplates,
  previewDailyReport,
  saveDailyReportTemplate,
  type DailyReportPreviewResult,
  type DailyReportTemplate,
} from '../../../api/rdmDailyReport'
import '../index.css'

/** 占位符说明：占位符 + 它到底取的是哪份数据（配置的人必须能看懂，否则等于没写文档） */
interface PlaceholderDoc { key: string; descKey: string }

const GROUP_PLACEHOLDERS: PlaceholderDoc[] = [
  { key: '{{reportDate}}', descKey: 'phReportDate' },
  { key: '{{reportTypeLabel}}', descKey: 'phReportTypeLabel' },
  { key: '{{projectCount}}', descKey: 'phProjectCount' },
  { key: '{{todayDueCount}}', descKey: 'phTodayDueCount' },
  { key: '{{overdueCount}}', descKey: 'phOverdueCount' },
  { key: '{{riskCount}}', descKey: 'phRiskCount' },
  { key: '{{normalProjectCount}}', descKey: 'phNormalProjectCount' },
  { key: '{{todayDoneCount}}', descKey: 'phTodayDoneCount' },
  { key: '{{todayReleasedCount}}', descKey: 'phTodayReleasedCount' },
  { key: '{{todayChangedCount}}', descKey: 'phTodayChangedCount' },
  { key: '{{tomorrowDueCount}}', descKey: 'phTomorrowDueCount' },
  { key: '{{projectBlock}}', descKey: 'phProjectBlock' },
  { key: '{{riskBlock}}', descKey: 'phRiskBlock' },
  { key: '{{detailUrl}}', descKey: 'phDetailUrl' },
]

const PERSONAL_PLACEHOLDERS: PlaceholderDoc[] = [
  { key: '{{reportDate}}', descKey: 'phReportDate' },
  { key: '{{reportTypeLabel}}', descKey: 'phReportTypeLabel' },
  { key: '{{userName}}', descKey: 'phUserName' },
  { key: '{{myProjectCount}}', descKey: 'phMyProjectCount' },
  { key: '{{myTodoCount}}', descKey: 'phMyTodoCount' },
  { key: '{{myOverdueCount}}', descKey: 'phMyOverdueCount' },
  { key: '{{myTodayDueCount}}', descKey: 'phMyTodayDueCount' },
  { key: '{{myRequirementCount}}', descKey: 'phMyRequirementCount' },
  { key: '{{myRequirementDoneCount}}', descKey: 'phMyRequirementDoneCount' },
  { key: '{{myDeliveryCount}}', descKey: 'phMyDeliveryCount' },
  { key: '{{myDeliveryDoneCount}}', descKey: 'phMyDeliveryDoneCount' },
  { key: '{{myRemainingCount}}', descKey: 'phMyRemainingCount' },
  { key: '{{myProjectBlock}}', descKey: 'phMyProjectBlock' },
  { key: '{{detailUrl}}', descKey: 'phDetailUrl' },
]

/**
 * 進度日報 > 模板配置 > 新增/編輯模板（独立页）。
 *
 * <p>为什么是独立页：按 AGENTS.md §9.1「禁止用 Modal 承载新增表单」。本页有三块内容
 * （基本信息、正文编辑器、占位符说明表），抽屉/弹窗放不下，且正文需要长时间编辑。
 *
 * <p>占位符说明为什么要逐项列「取数口径」：配置的人如果不知道 {{overdueCount}} 到底是
 * 「逾期项目数」还是「逾期交付项数」，写出来的文案就会与数字不符——这种错不会报错，
 * 只会在群里被人质疑「你们系统数字不对」。
 */
export default function DailyReportTemplateForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-daily-report-template:edit')

  const editKey = params.get('key')
  const cloneFrom = params.get('cloneFrom')
  const isDetail = params.get('mode') === 'detail'
  const readOnly = !canEdit || isDetail

  const [form] = Form.useForm()
  const [source, setSource] = useState<DailyReportTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<DailyReportPreviewResult | null>(null)
  /** 看板预览弹窗：与预览链接同一个地址，不再跳新窗口 */
  const [boardOpen, setBoardOpen] = useState(false)
  /** 原始 Markdown：默认收起，只在需要复制/排查渲染差异时展开 */
  const [showRaw, setShowRaw] = useState(false)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)

  const channel = Form.useWatch('channel', form)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await fetchDailyReportTemplates()
      const found = editKey ? all.find(x => x.templateKey === editKey) : null
      const cloned = cloneFrom ? all.find(x => x.templateKey === cloneFrom) : null
      const src = found ?? cloned ?? null
      setSource(src)
      if (found) {
        form.setFieldsValue({
          name: found.name, channel: found.channel, reportType: found.reportType,
          titleTpl: found.titleTpl, contentTpl: found.contentTpl,
          enabled: found.enabled, remark: found.remark ?? undefined,
        })
      } else if (cloned) {
        form.setFieldsValue({
          name: `${cloned.name}（${t('rdm.dailyTemplate.copySuffix')}）`,
          channel: cloned.channel, reportType: cloned.reportType,
          titleTpl: cloned.titleTpl, contentTpl: cloned.contentTpl,
          enabled: true, remark: cloned.remark ?? undefined,
        })
      } else {
        form.setFieldsValue({
          channel: 'group', reportType: 'morning', enabled: true, titleTpl: '', contentTpl: '', name: '',
        })
      }
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [editKey, cloneFrom, form, t])

  useEffect(() => {
    void load()
  }, [load])

  const placeholders = channel === 'personal' ? PERSONAL_PLACEHOLDERS : GROUP_PLACEHOLDERS

  /** 在正文光标处插入占位符（没有光标信息时追加到末尾） */
  const insertPlaceholder = (ph: string) => {
    const text = (form.getFieldValue('contentTpl') as string | undefined) ?? ''
    const el = contentRef.current
    const pos = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length
    form.setFieldsValue({ contentTpl: text.slice(0, pos) + ph + text.slice(pos) })
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(pos + ph.length, pos + ph.length)
      }
    })
  }

  const handlePreview = async () => {
    const v = form.getFieldsValue()
    if (!v.contentTpl) {
      message.warning(t('rdm.dailyTemplate.previewNeedContent'))
      return
    }
    setPreviewing(true)
    try {
      setPreview(await previewDailyReport({
        reportType: v.reportType === 'evening' ? 'evening' : 'morning',
        channel: v.channel,
        titleTpl: v.titleTpl,
        contentTpl: v.contentTpl,
      }))
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.previewFailed'))
    } finally {
      setPreviewing(false)
    }
  }

  /** 打开预览链接对应的免登看板：与真实推送同一个地址，编辑时就能验证链接落地页 */
  const openPreviewLink = () => {
    if (!preview?.detailUrl) return
    setBoardOpen(true)
  }

  const handleSave = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await saveDailyReportTemplate({
        templateKey: editKey ?? undefined,
        name: v.name,
        channel: source ? undefined : v.channel,
        reportType: source ? undefined : v.reportType,
        titleTpl: v.titleTpl,
        contentTpl: v.contentTpl,
        enabled: v.enabled,
        remark: v.remark,
      })
      message.success(t('rdm.dailyTemplate.saved'))
      navigate('/rdm-daily-report-templates')
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/rdm-daily-report-templates')}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}>
            {t('rdm.dailyTemplate.back')}
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {isDetail ? t('rdm.dailyTemplate.formTitleDetail')
              : editKey ? t('rdm.dailyTemplate.formTitleEdit')
                : cloneFrom ? t('rdm.dailyTemplate.formTitleClone') : t('rdm.dailyTemplate.formTitleNew')}
          </h2>
          {source?.preset && <Tag color="blue">{t('rdm.dailyTemplate.preset')}</Tag>}
        </div>
      </div>

      {source?.preset && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyTemplate.presetEditHint')} />
      )}

      <Form form={form} layout="vertical" disabled={readOnly || loading}>
        <div style={cardStyle}>
          <CardTitle text={t('rdm.dailyTemplate.sectionBasic')} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
            <Form.Item name="name" label={t('rdm.dailyTemplate.fieldName')}
              rules={[{ required: true, message: t('rdm.dailyTemplate.nameRequired') }]}>
              <Input maxLength={100} showCount placeholder={t('rdm.dailyTemplate.namePlaceholder')} />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Form.Item name="channel" label={t('rdm.dailyTemplate.fieldChannel')} rules={[{ required: true }]}>
                <Select disabled={!!source} options={[
                  { label: t('rdm.dailyTemplate.channelGroup'), value: 'group' },
                  { label: t('rdm.dailyTemplate.channelPersonal'), value: 'personal' },
                ]} />
              </Form.Item>
              <Form.Item name="reportType" label={t('rdm.dailyTemplate.fieldReportType')} rules={[{ required: true }]}>
                <Select disabled={!!source} options={[
                  { label: t('rdm.dailyTemplate.typeMorning'), value: 'morning' },
                  { label: t('rdm.dailyTemplate.typeEvening'), value: 'evening' },
                  { label: t('rdm.dailyTemplate.typeAny'), value: 'any' },
                ]} />
              </Form.Item>
              <Form.Item name="enabled" label={t('rdm.dailyTemplate.fieldEnabled')} valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
          </div>
          <Form.Item name="titleTpl" label={t('rdm.dailyTemplate.fieldTitle')} style={{ marginBottom: 0 }}
            rules={[{ required: true, message: t('rdm.dailyTemplate.titleRequired') }]}>
            <Input maxLength={200} showCount placeholder={t('rdm.dailyTemplate.titlePlaceholder')} />
          </Form.Item>
        </div>

        <div style={cardStyle}>
          <CardTitle text={t('rdm.dailyTemplate.sectionContent')} hint={t('rdm.dailyTemplate.sectionContentHint')} />
          {/*
            可用占位符紧贴正文上方：一排多个、悬停看口径、点击插入光标处。
            放在正文下方或做成两列表格时，配置的人要来回滚动对照，写错占位符是高频错误。
          */}
          <div className="tpl-placeholder-panel">
            <div className="tpl-placeholder-head">
              <span>{t('rdm.dailyTemplate.availablePlaceholders')}</span>
              <span className="tpl-placeholder-tip">{t('rdm.dailyTemplate.placeholderInsertHint')}</span>
            </div>
            <div className="tpl-placeholder-list">
              {placeholders.map(p => (
                <Tooltip key={p.key} title={t(`rdm.dailyTemplate.${p.descKey}`)}>
                  <button type="button" className="tpl-placeholder-chip" disabled={readOnly}
                    onClick={() => insertPlaceholder(p.key)}>
                    {p.key}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
          <Form.Item name="contentTpl" label={t('rdm.dailyTemplate.fieldContent')}
            rules={[{ required: true, message: t('rdm.dailyTemplate.contentRequired') }]}>
            <Input.TextArea
              ref={el => { contentRef.current = el ? (el.resizableTextArea?.textArea as HTMLTextAreaElement) : null }}
              rows={14} maxLength={8000} showCount
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              placeholder={t('rdm.dailyTemplate.contentPlaceholder')} />
          </Form.Item>
          <Form.Item name="remark" label={t('rdm.dailyTemplate.fieldRemark')} style={{ marginBottom: 0 }}>
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
        </div>
      </Form>

      {preview && (
        <div style={cardStyle}>
          <CardTitle text={t('rdm.dailyTemplate.previewResult')} hint={t('rdm.dailyTemplate.previewHint')} />
          {preview.unknownPlaceholders.length > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 8 }}
              message={t('rdm.dailyTemplate.unknownPlaceholders', { list: preview.unknownPlaceholders.join(', ') })} />
          )}
          {preview.messageMode === 'fixed' && (
            <Alert type="info" showIcon style={{ marginBottom: 8 }}
              message={t('rdm.dailyTemplate.previewFixedModeHint')} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t('rdm.dailyTemplate.previewCardTitle')}</div>
            <Button type="link" size="small" onClick={() => setShowRaw(v => !v)}>
              {showRaw ? t('rdm.dailyTemplate.previewRawHide') : t('rdm.dailyTemplate.previewRawShow')}
            </Button>
          </div>
          {/* 卡片效果按真机尺寸预览：固定版式带按钮，自定义模板是纯文字气泡 */}
          <DingTalkCardPreview
            title={preview.title}
            content={preview.content}
            mode={preview.messageMode === 'template' ? 'template' : 'fixed'}
            buttonText={preview.messageMode === 'template' ? undefined : t('rdm.dailyTemplate.previewButton')}
            timeText="09:00"
          />
          {showRaw && (
            <pre style={{
              background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12, marginTop: 10,
              fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 360, overflow: 'auto',
            }}>
              {preview.content}
            </pre>
          )}
          {preview.detailUrl && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Button icon={<LinkOutlined />} onClick={openPreviewLink}>
                {t('rdm.dailyTemplate.viewBoard')}
              </Button>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                {t('rdm.dailyTemplate.previewOpenBoardHint')}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="form-footer">
        <Button onClick={() => navigate('/rdm-daily-report-templates')}>{t('rdm.dailyTemplate.cancel')}</Button>
        <Button icon={<EyeOutlined />} loading={previewing} onClick={() => void handlePreview()}>
          {t('rdm.dailyTemplate.preview')}
        </Button>
        {!readOnly && (
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            {t('rdm.dailyTemplate.save')}
          </Button>
        )}
      </div>

      <DailyReportBoardPreviewModal
        open={boardOpen}
        url={preview?.detailUrl}
        onClose={() => setBoardOpen(false)}
      />
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

function CardTitle({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: '#fff7e6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {hint && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{hint}</span>}
    </div>
  )
}
