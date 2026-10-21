import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Checkbox, Form, Input, Radio, Select, Space, Spin, Switch, TimePicker, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchDailyReportRules,
  fetchDailyReportTemplates,
  fetchDailyReportConfig,
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

/** 迭代候选按所选项目收敛：未选项目时显示全部；已选项目时保留该项目迭代与未挂项目迭代 */
function iterationResultsForProject(list: RdmIterationItem[], projectId?: number | null): RdmIterationItem[] {
  return list.filter(i => projectId == null || i.projectId == null || i.projectId === projectId)
}

/**
 * 進度日報 > 推送配置 > 新增/編輯規則（独立页）。
 *
 * <p>为什么是独立页而不是弹窗：按 AGENTS.md §9.1「禁止用 Modal 承载新增表单」，
 * 且本表单含「项目 → 迭代」两级联动 + 模板选择 + 时间，弹窗里既局促又容易误点。
 *
 * <p>范围语义（用户明确要求的模型）：
 * <ul>
 *   <li>不指定迭代时项目必选——不选项目等于给全公司刷一遍；</li>
 *   <li>迭代可留空——留空 = 该项目<b>全部迭代</b>；选定则只推该迭代的需求；</li>
 *   <li><b>紧急修复迭代可不挂项目</b>（迭代排期已允许），因此先选迭代不再要求先选项目；
 *       迭代挂了项目就自动带出项目，迭代未挂项目则项目留空、不做必填校验；</li>
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
  /** 当前搜索命中的迭代候选（最多 20 条，远程搜索） */
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  /** 已选迭代的完整快照：搜索结果刷新后不在列表里也要能显示并参与项目联动 */
  const [pickedIteration, setPickedIteration] = useState<RdmIterationItem | null>(null)
  const [templates, setTemplates] = useState<DailyReportTemplate[]>([])
  /** 消息模式：fixed 时模板选择不参与渲染，必须置灰并说明，避免“选了模板却没生效” */
  const [messageMode, setMessageMode] = useState<string>('fixed')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)
  const [iterationLoading, setIterationLoading] = useState(false)
  const iterationSearchTimer = useRef<number | null>(null)

  const projectIds = Form.useWatch('projectIds', form)
  const allProjects = Form.useWatch('allProjects', form)
  const iterationCode = Form.useWatch('iterationCode', form)
  const contentType = Form.useWatch('contentType', form)
  const singleProjectId = projectIds?.length === 1 ? projectIds[0] : undefined

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

  /** 远程搜索迭代：输入关键词后才回 20 条，未输入时加载最近的 20 条供直接选择 */
  const loadIterations = useCallback(async (keyword?: string, pid?: number | null) => {
    setIterationLoading(true)
    try {
      setIterations(await fetchIterations(keyword, 20, pid))
    } catch {
      setIterations([])
    } finally {
      setIterationLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadIterations()
  }, [loadIterations])

  /** 输入防抖 300ms：避免每敲一个字都打一次接口 */
  const handleIterationSearch = (keyword: string) => {
    if (iterationSearchTimer.current != null) {
      window.clearTimeout(iterationSearchTimer.current)
    }
    iterationSearchTimer.current = window.setTimeout(() => {
      void loadIterations(keyword, singleProjectId)
    }, 300)
  }

  useEffect(() => () => {
    if (iterationSearchTimer.current != null) {
      window.clearTimeout(iterationSearchTimer.current)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [tpls, rules, cfg] = await Promise.all([
          fetchDailyReportTemplates(),
          editId ? fetchDailyReportRules() : Promise.resolve([]),
          fetchDailyReportConfig(),
        ])
        setTemplates(tpls)
        setMessageMode(cfg.messageMode ?? 'fixed')
        if (editId) {
          const rule = rules.find(r => r.id === editId)
          if (!rule) {
            message.error(t('rdm.dailyRule.ruleNotFound'))
            navigate('/rdm-daily-report-rules', { replace: true })
            return
          }
          const ruleProjectIds = rule.projectIds?.length
            ? rule.projectIds
            : (rule.projectId != null ? [rule.projectId] : [])
          form.setFieldsValue({
            id: rule.id,
            name: rule.name,
            projectIds: ruleProjectIds,
            allProjects: ruleProjectIds.length === 0 && !rule.iterationCode,
            iterationCode: rule.iterationCode ?? null,
            pushTime: rule.pushTime ? dayjs(rule.pushTime, 'HH:mm') : null,
            contentType: rule.contentType,
            groupTemplateKey: rule.groupTemplateKey ?? null,
            personalTemplateKey: rule.personalTemplateKey ?? null,
            enabled: rule.enabled,
            remark: rule.remark ?? undefined,
          })
          // 编辑态补一次项目候选，避免下拉里只有第一页项目
          if (ruleProjectIds.length > 0 && !projects.some(p => ruleProjectIds.includes(p.id))) {
            void loadProjects(rule.projectName ?? undefined)
          }
          // 已选迭代可能不在最近 20 条里：按编码回查一次并钉住，保证回显与项目联动不被搜索刷新冲掉
          if (rule.iterationCode) {
            const hits = await fetchIterations(rule.iterationCode, 20, rule.projectId)
            const picked: RdmIterationItem = hits.find(i => i.code === rule.iterationCode) ?? {
              id: -1,
              code: rule.iterationCode,
              name: rule.iterationName ?? '',
              projectId: rule.projectId,
              projectName: rule.projectName,
            }
            setPickedIteration(picked)
            setIterations(prev => prev.some(i => i.code === picked.code) ? prev : [picked, ...prev])
          }
        } else {
          form.setFieldsValue({
            contentType: 'morning',
            pushTime: dayjs('09:00', 'HH:mm'),
            enabled: true,
            name: '',
            projectIds: [],
            allProjects: false,
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

  const projectOptions = useMemo(() => {
    const base = projects.map(p => ({ value: p.id, label: p.projectNo ? `${p.projectNo} ${p.name}` : p.name }))
    const selected = projectIds ?? []
    const missing = selected.filter(id => !base.some(o => o.value === id))
      .map(id => {
        const it = iterations.find(i => i.projectId === id)
          ?? (pickedIteration?.projectId === id ? pickedIteration : null)
        return { value: id, label: it?.projectName ?? `#${id}` }
      })
    return [...base, ...missing]
  }, [projects, projectIds, iterations, pickedIteration])

  /** 当前选中迭代（用于判断是否挂了项目、以及项目是否必填） */
  const selectedIteration = useMemo(() => {
    if (!iterationCode) {
      return null
    }
    return iterations.find(i => i.code === iterationCode)
      ?? (pickedIteration?.code === iterationCode ? pickedIteration : null)
  }, [iterations, iterationCode, pickedIteration])

  /**
   * 迭代候选：
   * <ul>
   *   <li>未选项目时列出全部迭代——先选迭代是合法路径；</li>
   *   <li>已选项目时列出该项目迭代 + 未挂项目的迭代（紧急修复），保证 hotfix 也能被选中；</li>
   *   <li>标签上标出「未掛項目」，避免同名迭代选错。</li>
   * </ul>
   */
  const iterationOptions = useMemo(() => {
    const list = iterationResultsForProject(iterations, singleProjectId)
    // 已选迭代不在本次搜索结果里时也要保留，否则下拉会回退成原始 code
    if (pickedIteration && !list.some(i => i.code === pickedIteration.code)) {
      list.unshift(pickedIteration)
    }
    return list.map(i => ({
      value: i.code,
      label: `${i.code}${i.name ? ' ' + i.name : ''}`
        + (i.projectId == null ? `（${t('rdm.iteration.noProject')}）`
          : singleProjectId == null && i.projectName ? `（${i.projectName}）` : ''),
    }))
  }, [iterations, pickedIteration, singleProjectId, t])

  /**
   * 选迭代后回填项目：迭代挂了项目就自动带出；迭代未挂项目（紧急修复）则清空项目，
   * 与后端口径一致——规则以迭代为范围，不再挂项目。
   */
  const handleIterationChange = (code?: string) => {
    if (!code) {
      setPickedIteration(null)
      return
    }
    const it = iterations.find(i => i.code === code)
      ?? (pickedIteration?.code === code ? pickedIteration : undefined)
    if (!it) {
      return
    }
    setPickedIteration(it)
    if (it.projectId != null) {
      form.setFieldsValue({ projectIds: [it.projectId], allProjects: false })
    } else {
      form.setFieldsValue({ projectIds: [], allProjects: false })
    }
  }

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
    const ids = v.allProjects ? [] : (v.projectIds ?? [])
    if (!v.allProjects && ids.length === 0 && !v.iterationCode) {
      message.warning(t('rdm.dailyRule.targetRequired'))
      return
    }
    setSaving(true)
    try {
      await saveDailyReportRule({
        id: editId ?? undefined,
        name: v.name,
        projectId: ids.length === 1 ? ids[0] : null,
        projectIds: ids,
        allProjects: Boolean(v.allProjects),
        iterationCode: ids.length > 1 || v.allProjects ? null : (v.iterationCode || null),
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
            {selectedIteration && selectedIteration.projectId == null && (
              <Alert type="info" showIcon style={{ marginBottom: 16 }}
                message={t('rdm.dailyRule.unboundIterationHint')} />
            )}
            {/* 「全部在途項目」是總開關：獨立成行；勾選即推送所有在途項目，下方所屬項目與指定迭代隨之鎖定 */}
            <Form.Item name="allProjects" valuePropName="checked" style={{ marginBottom: 16 }}>
              <Checkbox onChange={e => {
                if (e.target.checked) {
                  setPickedIteration(null)
                  form.setFieldsValue({ projectIds: [], iterationCode: null })
                }
              }}>
                {t('rdm.dailyRule.allProjects')}
              </Checkbox>
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item name="projectIds" label={t('rdm.dailyRule.fieldProject')}
                extra={t('rdm.dailyRule.projectOptionalHint')}>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  showSearch allowClear
                  disabled={allProjects}
                  placeholder={t('rdm.dailyRule.projectPlaceholder')}
                  filterOption={false} onSearch={kw => void loadProjects(kw)}
                  notFoundContent={searching ? <Spin size="small" /> : t('rdm.dailyRule.noProjectMatch')}
                  options={projectOptions}
                  onChange={(values: number[]) => {
                    setPickedIteration(null)
                    form.setFieldsValue({ iterationCode: null })
                    // 只有恰好一个项目时才允许指定迭代；多项目/全部项目必须看全部
                    void loadIterations(undefined, values.length === 1 ? values[0] : null)
                  }}
                />
              </Form.Item>
              <Form.Item name="iterationCode" label={t('rdm.dailyRule.fieldIteration')}
                extra={allProjects
                  ? t('rdm.dailyRule.iterationMultiHint')
                  : (projectIds?.length ?? 0) > 1
                    ? t('rdm.dailyRule.iterationMultiHint')
                    : t('rdm.dailyRule.iterationHint')}>
                <Select allowClear showSearch filterOption={false}
                  disabled={allProjects || (projectIds?.length ?? 0) > 1}
                  onSearch={handleIterationSearch} loading={iterationLoading}
                  placeholder={allProjects
                    ? t('rdm.dailyRule.iterationPickSingleProject')
                    : (projectIds?.length ?? 0) > 1
                      ? t('rdm.dailyRule.iterationPickSingleProject')
                      : t('rdm.dailyRule.iterationSearchPlaceholder')}
                  options={iterationOptions} onChange={handleIterationChange}
                  notFoundContent={iterationLoading
                    ? <Spin size="small" /> : t('rdm.dailyRule.noIterationFound')} />
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
                <Select allowClear options={groupOptions} placeholder={t('rdm.dailyRule.useDefault')}
                  disabled={messageMode !== 'template'} />
              </Form.Item>
              <Form.Item name="personalTemplateKey" label={t('rdm.dailyRule.fieldPersonalTpl')}>
                <Select allowClear options={personalOptions} placeholder={t('rdm.dailyRule.useDefault')}
                  disabled={messageMode !== 'template'} />
              </Form.Item>
            </div>
            {messageMode !== 'template' && (
              <Alert type="info" showIcon style={{ marginBottom: 12 }}
                message={t('rdm.dailyRule.fixedModeTemplateHint')} />
            )}
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
