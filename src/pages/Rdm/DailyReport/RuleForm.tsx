import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, Radio, Select, Space, Spin, Switch, TimePicker, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchDailyReportRules,
  fetchDailyReportTemplates,
  saveDailyReportRule,
  type DailyReportRuleForm as RuleFormValues,
  type DailyReportTemplate,
} from '../../../api/rdmDailyReport'
import { fetchIterations, fetchProjectPage, type RdmIterationItem, type RdmProjectListItem } from '../../../api/rdm'
import '../index.css'

/**
 * 表单模型：与接口 DTO 的唯一差别是 pushTime。
 * <p>antd TimePicker 的 value 必须是 dayjs 对象；若直接把接口返回的 "09:00" 字符串灌进去，
 * 控件内部会调 value.isValid() 而抛 `TypeError: date.isValid is not a function`，整页崩成错误屏
 * （浏览器验收实测）。因此表单层用 Dayjs，提交时再格式化成 HH:mm。
 */
type RuleFormModel = Omit<RuleFormValues, 'pushTime'> & { pushTime: Dayjs | null }

/**
 * 進度日報 > 推送配置 > 新增/編輯規則（独立页）。
 *
 * <p>为什么是独立页而不是弹窗：按 AGENTS.md §9.1「禁止用 Modal 承载新增表单」，
 * 且本表单含「项目 → 迭代」两级联动 + 模板选择 + 时间，弹窗里既局促又容易误点。
 *
 * <p>范围语义（用户明确要求的模型）：
 * <ul>
 *   <li>项目必选——推送以项目为载体，不选项目等于给全公司刷一遍；</li>
 *   <li>迭代可留空——留空 = 该项目<b>全部迭代</b>；选定则只推该迭代的需求；</li>
 *   <li>同一项目可建多条规则（先推整个项目、另建一条只盯某个迭代），互不覆盖。</li>
 * </ul>
 */
export default function DailyReportRuleForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-daily-report-rule:edit')
  const editId = params.get('id') ? Number(params.get('id')) : null
  const isDetail = params.get('mode') === 'detail'
  const readOnly = !canEdit || isDetail

  const [form] = Form.useForm<RuleFormModel>()
  const [projects, setProjects] = useState<RdmProjectListItem[]>([])
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  const [templates, setTemplates] = useState<DailyReportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)

  const projectId = Form.useWatch('projectId', form)
  const contentType = Form.useWatch('contentType', form)

  const loadProjects = useCallback(async (keyword?: string) => {
    setSearching(true)
    try {
      const res = await fetchProjectPage({ pageNo: 1, pageSize: 50, keyword })
      setProjects(res.records ?? [])
    } catch {
      setProjects([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [tpls, its, rules] = await Promise.all([
          fetchDailyReportTemplates(),
          fetchIterations(),
          editId ? fetchDailyReportRules() : Promise.resolve([]),
        ])
        setTemplates(tpls)
        setIterations(its)
        if (editId) {
          const rule = rules.find(r => r.id === editId)
          if (!rule) {
            message.error(t('rdm.dailyRule.ruleNotFound'))
            navigate('/rdm-daily-report-rules', { replace: true })
            return
          }
          form.setFieldsValue({
            id: rule.id,
            name: rule.name,
            projectId: rule.projectId,
            iterationCode: rule.iterationCode ?? null,
            pushTime: rule.pushTime ? dayjs(rule.pushTime, 'HH:mm') : null,
            contentType: rule.contentType,
            groupTemplateKey: rule.groupTemplateKey ?? null,
            personalTemplateKey: rule.personalTemplateKey ?? null,
            enabled: rule.enabled,
            remark: rule.remark ?? undefined,
          })
          // 编辑态补一次项目候选，避免下拉里只有第一页项目
          if (!projects.some(p => p.id === rule.projectId)) {
            void loadProjects(rule.projectNo ?? undefined)
          }
        } else {
          form.setFieldsValue({
            contentType: 'morning',
            pushTime: dayjs('09:00', 'HH:mm'),
            enabled: true,
            name: '',
            iterationCode: null,
          })
        }
      } catch (e) {
        message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.loadFailed'))
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  /** 迭代候选按所选项目收敛：选项目前不可选迭代，避免把别的项目的迭代配进来 */
  const iterationOptions = useMemo(
    () => iterations
      .filter(i => projectId != null && i.projectId === projectId)
      .map(i => ({ value: i.code, label: `${i.code}${i.name ? ' ' + i.name : ''}` })),
    [iterations, projectId])

  const groupOptions = useMemo(
    () => templates
      .filter(x => x.channel === 'group' && x.enabled
        && (x.reportType === 'any' || x.reportType === (contentType === 'evening' ? 'evening' : 'morning')))
      .map(x => ({ value: x.templateKey, label: x.name })),
    [templates, contentType])
  const personalOptions = useMemo(
    () => templates.filter(x => x.channel === 'personal' && x.enabled)
      .map(x => ({ value: x.templateKey, label: x.name })),
    [templates])

  const handleSave = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await saveDailyReportRule({
        id: editId ?? undefined,
        name: v.name,
        projectId: v.projectId,
        iterationCode: v.iterationCode || null,
        pushTime: v.pushTime ? v.pushTime.format('HH:mm') : '',
        contentType: v.contentType,
        groupTemplateKey: v.groupTemplateKey || null,
        personalTemplateKey: v.personalTemplateKey || null,
        enabled: v.enabled,
        remark: v.remark,
      })
      message.success(t('rdm.dailyRule.saved'))
      navigate('/rdm-daily-report-rules')
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部：橙色渐变动画条 + 返回 + 标题（form-page-style §2） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/rdm-daily-report-rules')}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}>
            {t('rdm.dailyRule.back')}
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {isDetail ? t('rdm.dailyRule.formTitleDetail')
              : editId ? t('rdm.dailyRule.formTitleEdit') : t('rdm.dailyRule.formTitleNew')}
          </h2>
        </div>
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" disabled={readOnly}>
          <div style={cardStyle}>
            <CardTitle text={t('rdm.dailyRule.sectionTarget')} hint={t('rdm.dailyRule.sectionTargetHint')} />
            <Form.Item name="name" label={t('rdm.dailyRule.fieldName')}
              rules={[{ required: true, message: t('rdm.dailyRule.nameRequired') }]}>
              <Input maxLength={100} showCount placeholder={t('rdm.dailyRule.namePlaceholder')} />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item name="projectId" label={t('rdm.dailyRule.fieldProject')}
                rules={[{ required: true, message: t('rdm.dailyRule.projectRequired') }]}>
                <Select
                  showSearch allowClear={false} placeholder={t('rdm.dailyRule.projectPlaceholder')}
                  filterOption={false} onSearch={kw => void loadProjects(kw)}
                  notFoundContent={searching ? <Spin size="small" /> : t('rdm.dailyRule.noProjectMatch')}
                  options={projects.map(p => ({ value: p.id, label: p.projectNo ? `${p.projectNo} ${p.name}` : p.name }))}
                  onChange={() => form.setFieldsValue({ iterationCode: null })}
                />
              </Form.Item>
              <Form.Item name="iterationCode" label={t('rdm.dailyRule.fieldIteration')}
                extra={t('rdm.dailyRule.iterationHint')}>
                <Select allowClear placeholder={t('rdm.dailyRule.allIterations')}
                  disabled={projectId == null} options={iterationOptions}
                  notFoundContent={projectId == null ? t('rdm.dailyRule.pickProjectFirst') : t('rdm.dailyRule.noIteration')} />
              </Form.Item>
            </div>
          </div>

          <div style={cardStyle}>
            <CardTitle text={t('rdm.dailyRule.sectionSchedule')} hint={t('rdm.dailyRule.sectionScheduleHint')} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item name="pushTime" label={t('rdm.dailyRule.fieldPushTime')}
                rules={[{ required: true, message: t('rdm.dailyRule.pushTimeRequired') }]}>
                <TimePicker format="HH:mm" minuteStep={5} allowClear={false} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="contentType" label={t('rdm.dailyRule.fieldContentType')}
                rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio.Button value="morning">{t('rdm.dailyRule.typeMorning')}</Radio.Button>
                  <Radio.Button value="evening">{t('rdm.dailyRule.typeEvening')}</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item name="groupTemplateKey" label={t('rdm.dailyRule.fieldGroupTpl')}>
                <Select allowClear options={groupOptions} placeholder={t('rdm.dailyRule.useDefault')} />
              </Form.Item>
              <Form.Item name="personalTemplateKey" label={t('rdm.dailyRule.fieldPersonalTpl')}>
                <Select allowClear options={personalOptions} placeholder={t('rdm.dailyRule.useDefault')} />
              </Form.Item>
            </div>
            <Space size={24} wrap>
              <Form.Item name="enabled" label={t('rdm.dailyRule.fieldEnabled')} valuePropName="checked"
                style={{ marginBottom: 0 }}>
                <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
              </Form.Item>
            </Space>
            <Form.Item name="remark" label={t('rdm.dailyRule.fieldRemark')} style={{ marginTop: 16, marginBottom: 0 }}>
              <Input.TextArea rows={2} maxLength={500} showCount />
            </Form.Item>
          </div>
        </Form>
      </Spin>

      {!readOnly && (
        <div className="form-footer">
          <Button onClick={() => navigate('/rdm-daily-report-rules')}>{t('rdm.dailyRule.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            {t('rdm.dailyRule.save')}
          </Button>
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

function CardTitle({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: '#e6f7ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <SettingOutlined style={{ fontSize: 14, color: '#1890ff' }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {hint && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{hint}</span>}
    </div>
  )
}
