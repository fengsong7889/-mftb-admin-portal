import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Checkbox, Collapse, Form, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  NotificationOutlined,
  PlusOutlined,
  PoweroffOutlined,
  SaveOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../../contexts/AuthContext'
import HelpPopover from '../../../components/HelpPopover'
import {
  deleteDailyReportRule,
  fetchDailyReportConfig,
  fetchDailyReportEmployeeOptions,
  fetchDailyReportReceiverPreview,
  fetchDailyReportRules,
  fetchDailyReportTemplates,
  saveDailyReportConfig,
  saveDailyReportRule,
  type DailyReportConfig,
  type DailyReportMessageFields,
  type DailyReportReceiverPreview,
  type DailyReportRule,
  type DailyReportTemplate,
} from '../../../api/rdmDailyReport'
import '../index.css'

/**
 * 固定版式下的三个内置场景：与「晨報/晚報/個人」默认模板一一对应。
 * 只提供只读的「查看樣式」入口——它们没有模板行，改不了也不需要改。
 */
const BUILTIN_LAYOUT_ENTRIES: Array<{
  type: 'group_morning' | 'group_evening' | 'personal'
  labelKey: string
}> = [
  { type: 'group_morning', labelKey: 'rdm.dailyRule.defaultMorningTpl' },
  { type: 'group_evening', labelKey: 'rdm.dailyRule.defaultEveningTpl' },
  { type: 'personal', labelKey: 'rdm.dailyRule.defaultPersonalTpl' },
]

/**
 * 项目行可勾选字段（顺序即页面展示顺序；label 走 i18n）。
 * <p>逾期/阻塞计数不在此列：它属异常角标，始终显示——否则「需關注」里只剩一个红灯、
 * 看不到严重程度，读者还得回去翻看板。
 */
const PROJECT_FIELDS: Array<{ key: keyof DailyReportMessageFields; labelKey: string }> = [
  { key: 'projectProductOwner', labelKey: 'rdm.dailyRule.msgFieldProjectProductOwner' },
  { key: 'projectDeliveryProgress', labelKey: 'rdm.dailyRule.msgFieldProjectDeliveryProgress' },
  { key: 'projectIterationCount', labelKey: 'rdm.dailyRule.msgFieldProjectIterationCount' },
  { key: 'projectPeriod', labelKey: 'rdm.dailyRule.msgFieldProjectPeriod' },
  { key: 'projectNextDelivery', labelKey: 'rdm.dailyRule.msgFieldProjectNextDelivery' },
]

/**
 * 迭代行可勾选字段。
 * <p>今日到期/逾期计数不在此列：同属异常角标，始终显示（只列有异常的迭代时，这是唯一说明
 * 「为什么列它」的信息）。
 */
const ITERATION_FIELDS: Array<{ key: keyof DailyReportMessageFields; labelKey: string }> = [
  { key: 'iterationStatus', labelKey: 'rdm.dailyRule.msgFieldIterationStatus' },
  { key: 'iterationOwner', labelKey: 'rdm.dailyRule.msgFieldIterationOwner' },
  { key: 'iterationProgress', labelKey: 'rdm.dailyRule.msgFieldIterationProgress' },
  { key: 'iterationReqTotal', labelKey: 'rdm.dailyRule.msgFieldIterationReqTotal' },
  { key: 'iterationPeriod', labelKey: 'rdm.dailyRule.msgFieldIterationPeriod' },
]

/**
 * 个人日报收件人的角色候选。
 *
 * <p>口径：收件人 = 角色推导 ∪ 追加名单 − 排除名单。角色全部取自项目主表已有的
 * 负责人字段，勾选后自动跟随、无需维护名单。
 *
 * <p>不纳入迭代负责人/任务负责人：rdm_iteration 与 rdm_task 只存 owner_name 姓名快照，
 * 没有 user_id，无法安全映射到钉钉 userId（重名会发错人）。
 */
const RECEIVER_ROLE_OPTIONS = [
  { value: 'pm', labelKey: 'rdm.dailyRule.rolePm' },
  { value: 'product_owner', labelKey: 'rdm.dailyRule.roleProductOwner' },
  { value: 'tech_lead', labelKey: 'rdm.dailyRule.roleTechLead' },
  { value: 'qa_lead', labelKey: 'rdm.dailyRule.roleQaLead' },
  { value: 'ui_designer', labelKey: 'rdm.dailyRule.roleUiDesigner' },
  { value: 'ops_lead', labelKey: 'rdm.dailyRule.roleOpsLead' },
  { value: 'project_member', labelKey: 'rdm.dailyRule.roleProjectMember' },
]

/** 默认收件角色与后端默认值保持一致，升级当天发送行为不变 */
const DEFAULT_RECEIVER_ROLES = ['pm', 'product_owner']

/** 稳定的空数组引用：作为 useWatch 的兜底值，避免每次渲染新建数组拖垮 useEffect 依赖 */
const EMPTY_USER_IDS: number[] = []

/** 收件来源 → i18n 键（预览明细用）；extra 表示来自追加名单 */
const RECEIVER_SOURCE_LABEL_KEYS: Record<string, string> = {
  pm: 'rdm.dailyRule.rolePm',
  product_owner: 'rdm.dailyRule.roleProductOwner',
  tech_lead: 'rdm.dailyRule.roleTechLead',
  qa_lead: 'rdm.dailyRule.roleQaLead',
  ui_designer: 'rdm.dailyRule.roleUiDesigner',
  ops_lead: 'rdm.dailyRule.roleOpsLead',
  project_member: 'rdm.dailyRule.roleProjectMember',
  extra: 'rdm.dailyRule.sourceExtra',
}

/** 收件人候选选项：接口返回的 value 是字符串，这里统一转成数字以匹配 number[] 字段 */
type ReceiverOption = { value: number; label: string }

/**
 * 進度日報 > 推送配置。
 *
 * <p>两层结构：顶部是**全局开关与默认模板**（总闸，对所有规则生效），下方是**多条推送规则**。
 * 为什么规则是项目/迭代维度：实际用法是「A 產品盯 A 項目下的 B1 迭代、B 產品盯 B 項目下的 C1 迭代、
 * W 項目經理盯整個 W 項目」——目标、时间、模板都不同，单条全局配置无法表达。
 * 迭代排期允许紧急修复（hotfix）不挂项目，因此规则的目标也可能是「未挂项目的迭代」，此时项目列为空。
 *
 * <p>规则的新增/编辑走独立页（{@link RuleForm}）：按 AGENTS.md §9.1，表单不得用 Modal 承载，
 * 且规则字段包含项目/迭代两级联动，窄弹窗里操作体验很差。
 */
export default function DailyReportRules() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-daily-report-rule:edit')

  const [rows, setRows] = useState<DailyReportRule[]>([])
  const [templates, setTemplates] = useState<DailyReportTemplate[]>([])
  const [config, setConfig] = useState<DailyReportConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfgDirty, setCfgDirty] = useState(false)
  /** 收件人候选：远程搜索与按 ID 回显共用同一个列表 */
  const [employeeOptions, setEmployeeOptions] = useState<ReceiverOption[]>([])
  const [employeeSearching, setEmployeeSearching] = useState(false)
  /** 收件人预览：口径由服务端统一裁决，前端不本地估算 */
  const [receiverPreview, setReceiverPreview] = useState<DailyReportReceiverPreview | null>(null)
  const employeeSearchTimer = useRef<number | null>(null)
  const [form] = Form.useForm()
  /** 字段开关只在固定框架下生效；切到自定义模板时整组置灰，避免改了没效果还以为生效 */
  const messageMode = Form.useWatch('messageMode', form)
  /**
   * 总闸的实时状态。群报/个人只是总闸下面的渠道，不是三个并列通知项：
   * 总闸关闭时两个渠道开关一律置灰（后端本来就会整体拦截，前端要让人看得出来）。
   */
  const masterEnabled = Form.useWatch('enabled', form) ?? config?.enabled ?? true
  /** 收件人设定只对「個人」渠道有意义：关闭个人渠道时置灰，但不清空已配的值 */
  const personalEnabled = Form.useWatch('personalEnabled', form) ?? config?.personalEnabled ?? true
  const receiverRoles = Form.useWatch<string[]>('receiverRoles', form) ?? DEFAULT_RECEIVER_ROLES
  const extraReceiverUserIds = Form.useWatch<number[]>('extraReceiverUserIds', form) ?? EMPTY_USER_IDS
  const excludeReceiverUserIds = Form.useWatch<number[]>('excludeReceiverUserIds', form) ?? EMPTY_USER_IDS

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rules, tpls, cfg] = await Promise.all([
        fetchDailyReportRules(),
        fetchDailyReportTemplates(),
        fetchDailyReportConfig(),
      ])
      setRows(rules)
      setTemplates(tpls)
      setConfig(cfg)
      form.setFieldsValue({
        enabled: cfg.enabled,
        groupEnabled: cfg.groupEnabled,
        personalEnabled: cfg.personalEnabled,
        receiverRoles: cfg.receiverRoles ?? DEFAULT_RECEIVER_ROLES,
        extraReceiverUserIds: cfg.extraReceiverUserIds ?? [],
        excludeReceiverUserIds: cfg.excludeReceiverUserIds ?? [],
        morningTemplateKey: cfg.morningTemplateKey ?? undefined,
        eveningTemplateKey: cfg.eveningTemplateKey ?? undefined,
        personalTemplateKey: cfg.personalTemplateKey ?? undefined,
        boardLinkValidDays: cfg.boardLinkValidDays,
        boardShowRequirements: cfg.boardShowRequirements,
        boardShowOwners: cfg.boardShowOwners,
        boardShowUnassigned: cfg.boardShowUnassigned,
        messageMode: cfg.messageMode,
        messageFields: cfg.messageFields,
        quietPolicy: cfg.quietPolicy ?? 'brief',
      })
      // 已选员工回显：多选框拿不到 label 会把 userId 渲染成裸数字，管理员无法确认选的是谁
      const presetIds = [...(cfg.extraReceiverUserIds ?? []), ...(cfg.excludeReceiverUserIds ?? [])]
      if (presetIds.length > 0) {
        try {
          const list = await fetchDailyReportEmployeeOptions('', presetIds)
          setEmployeeOptions(list
            .map(o => ({ value: Number(o.value), label: o.label }))
            .filter(o => Number.isFinite(o.value)))
        } catch {
          // 回显失败不阻断配置页：用户仍可重新搜索选择
        }
      }
      setCfgDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    void load()
  }, [load])

  const groupMorning = useMemo(
    () => templates.filter(x => x.channel === 'group' && x.reportType === 'morning' && x.enabled)
      .map(x => ({ label: x.name, value: x.templateKey })), [templates])
  const groupEvening = useMemo(
    () => templates.filter(x => x.channel === 'group' && x.reportType === 'evening' && x.enabled)
      .map(x => ({ label: x.name, value: x.templateKey })), [templates])
  const personalOptions = useMemo(
    () => templates.filter(x => x.channel === 'personal' && x.enabled)
      .map(x => ({ label: x.name, value: x.templateKey })), [templates])
  /**
   * 收件人预览：跟随角色/追加/排除变化重新拉取（300ms 防抖，避免连续勾选打爆接口）。
   *
   * <p>口径必须由服务端统一裁决：前端另算一套必然与实发漂移，出现「预览 10 人、实发 8 人」。
   * 未选规则时后端按「全部在途項目」估算，因此预览条上要写明范围。
   */
  useEffect(() => {
    if (!config) return
    const timer = window.setTimeout(() => {
      fetchDailyReportReceiverPreview()
        .then(setReceiverPreview)
        .catch(() => setReceiverPreview(null))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [config, receiverRoles, extraReceiverUserIds, excludeReceiverUserIds])

  /** 组件卸载时清掉搜索防抖定时器，避免对已卸载组件 setState */
  useEffect(() => () => {
    if (employeeSearchTimer.current != null) {
      window.clearTimeout(employeeSearchTimer.current)
    }
  }, [])

  /**
   * 员工远程搜索：走日报模块自己的 employee-options。
   * <p>不用 EmployeeSelect：它依赖 /api/employees，只被授予日报菜单的用户会 403，
   * 而组件会静默吞错，表现为「下拉里搜不到人」而不是报错。
   */
  const handleEmployeeSearch = (keyword: string) => {
    if (employeeSearchTimer.current != null) {
      window.clearTimeout(employeeSearchTimer.current)
    }
    const kw = keyword.trim()
    if (!kw) return
    employeeSearchTimer.current = window.setTimeout(async () => {
      setEmployeeSearching(true)
      try {
        const list = await fetchDailyReportEmployeeOptions(kw)
        setEmployeeOptions(prev => {
          // 合并而非覆盖：已选中的人必须留在候选里，否则选中项会从下拉里消失
          const merged = [...prev]
          for (const opt of list) {
            const value = Number(opt.value)
            if (Number.isFinite(value) && !merged.some(o => o.value === value)) {
              merged.push({ value, label: opt.label })
            }
          }
          return merged
        })
      } catch {
        // request.ts 已统一提示，这里不重复弹
      } finally {
        setEmployeeSearching(false)
      }
    }, 300)
  }

  /** 收件人明细：纯展示，用 Modal.info 而非二次确认样式 */
  const showReceiverDetail = () => {
    const data = receiverPreview?.receivers ?? []
    Modal.info({
      title: t('rdm.dailyRule.receiverDetailTitle'),
      width: 760,
      content: (
        <Table
          size="small"
          rowKey="userId"
          pagination={false}
          scroll={{ y: 360 }}
          dataSource={data}
          columns={[
            {
              title: t('rdm.dailyRule.receiverColName'), dataIndex: 'userName', width: 120,
              render: (v: string | null) => v || '-',
            },
            {
              title: t('rdm.dailyRule.receiverColEmpId'), dataIndex: 'empId', width: 110,
              render: (v: string | null) => v || '-',
            },
            {
              title: t('rdm.dailyRule.receiverColSources'), dataIndex: 'sources', width: 220,
              render: (v: string[]) => (v ?? []).map(s => {
                const key = RECEIVER_SOURCE_LABEL_KEYS[s]
                return key ? t(key) : s
              }).join('、') || '-',
            },
            {
              title: t('rdm.dailyRule.receiverColProjectCount'), dataIndex: 'projectCount', width: 100,
              render: (v: number) => t('rdm.dailyRule.receiverColProjectCountValue', { count: v }),
            },
            {
              title: t('rdm.dailyRule.receiverColDingtalk'), dataIndex: 'dingtalkBound', width: 120,
              render: (v: boolean) => (v
                ? <Tag color="green">{t('rdm.dailyRule.receiverBound')}</Tag>
                : <Tag color="orange">{t('rdm.dailyRule.receiverUnbound')}</Tag>),
            },
          ]}
        />
      ),
    })
  }

  const handleSaveConfig = async () => {
    const v = await form.validateFields()
    setSavingCfg(true)
    try {
      const next = await saveDailyReportConfig({
        enabled: v.enabled,
        groupEnabled: v.groupEnabled,
        personalEnabled: v.personalEnabled,
        receiverRoles: v.receiverRoles ?? [],
        extraReceiverUserIds: v.extraReceiverUserIds ?? [],
        excludeReceiverUserIds: v.excludeReceiverUserIds ?? [],
        /*
         * 模板键一律从 store 读，不取 validateFields 的返回值：
         * fixed 模式下三个模板下拉是条件不渲染的，若从校验结果里取会得到 undefined，
         * 保存后就把用户之前选的自定义模板清成 null，切回模板模式时选择悄悄丢失。
         */
        morningTemplateKey: form.getFieldValue('morningTemplateKey') ?? null,
        eveningTemplateKey: form.getFieldValue('eveningTemplateKey') ?? null,
        personalTemplateKey: form.getFieldValue('personalTemplateKey') ?? null,
        boardLinkValidDays: v.boardLinkValidDays,
        boardShowRequirements: v.boardShowRequirements,
        boardShowOwners: v.boardShowOwners,
        boardShowUnassigned: v.boardShowUnassigned,
        messageMode: v.messageMode,
        messageFields: v.messageFields,
        quietPolicy: v.quietPolicy,
      })
      setConfig(next)
      setCfgDirty(false)
      message.success(t('rdm.dailyRule.globalSaved'))
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.saveFailed'))
    } finally {
      setSavingCfg(false)
    }
  }

  const handleToggle = async (row: DailyReportRule, enabled: boolean) => {
    try {
      await saveDailyReportRule({
        id: row.id, name: row.name, projectId: row.projectId, projectIds: row.projectIds ?? [],
        iterationCode: row.iterationCode,
        pushTime: row.pushTime, contentType: row.contentType, groupTemplateKey: row.groupTemplateKey,
        personalTemplateKey: row.personalTemplateKey, enabled, remark: row.remark ?? undefined,
      })
      message.success(enabled ? t('rdm.dailyRule.ruleEnabled') : t('rdm.dailyRule.ruleDisabled'))
      void load()
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.toggleFailed'))
    }
  }

  const handleDelete = (row: DailyReportRule) => {
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('rdm.dailyRule.deleteTitle'),
      content: t('rdm.dailyRule.deleteContent', { name: row.name }),
      okText: t('rdm.dailyRule.confirmOk'),
      cancelText: t('rdm.dailyRule.confirmCancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDailyReportRule(row.id)
          message.success(t('rdm.dailyRule.deleted'))
          void load()
        } catch (e) {
          message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.deleteFailed'))
        }
      },
    })
  }

  const columns: TableColumnsType<DailyReportRule> = [
    {
      title: t('rdm.dailyRule.colName'), dataIndex: 'name', key: 'name', width: 200,
      render: (v: string, r) => (
        <Space size={4} wrap>
          <span style={{ fontWeight: 600 }}>{v}</span>
          {!r.enabled && <Tag>{t('rdm.dailyRule.disabledTag')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('rdm.dailyRule.colTarget'), key: 'target', width: 300,
      render: (_, r) => {
        const multi = (r.projectIds?.length ?? 0) > 1
        const all = r.projectId == null && !multi && !r.iterationCode
        const iterationOnly = r.projectId == null && !multi && Boolean(r.iterationCode)
        return (
          <Space size={4} wrap>
            {all
              ? <Tag color="geekblue">{t('rdm.dailyRule.allProjects')}</Tag>
              : <span>{r.projectSummary
                ?? (r.projectId == null
                  ? t('rdm.iteration.noProject')
                  : `${r.projectNo ? r.projectNo + ' ' : ''}${r.projectName ?? '#' + r.projectId}`)}</span>}
            {!all && !iterationOnly && (
              <Tag color={r.iterationCode ? 'blue' : 'default'}>
                {r.iterationCode ? (r.iterationName || r.iterationCode) : t('rdm.dailyRule.allIterations')}
              </Tag>
            )}
          </Space>
        )
      },
    },
    { title: t('rdm.dailyRule.colTime'), dataIndex: 'pushTime', key: 'pushTime', width: 100 },
    {
      title: t('rdm.dailyRule.colContentType'), dataIndex: 'contentType', key: 'contentType', width: 110,
      render: (v: string) => <Tag color={v === 'evening' ? 'purple' : 'gold'}>
        {v === 'evening' ? t('rdm.dailyRule.typeEvening') : t('rdm.dailyRule.typeMorning')}
      </Tag>,
    },
    {
      title: t('rdm.dailyRule.colTemplate'), key: 'tpl', width: 220,
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {(r.groupTemplateKey || t('rdm.dailyRule.useDefault'))} / {(r.personalTemplateKey || t('rdm.dailyRule.useDefault'))}
        </span>
      ),
    },
    {
      title: t('rdm.dailyRule.colEnabled'), dataIndex: 'enabled', key: 'enabled', width: 90,
      render: (v: boolean, r) => (
        <Switch size="small" checked={v} disabled={!canEdit} onChange={c => void handleToggle(r, c)} />
      ),
    },
    {
      title: t('rdm.dailyRule.colActions'), key: 'actions', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => navigate(`/rdm-daily-report-rule-form?id=${r.id}`)}>
            {canEdit ? t('rdm.dailyRule.edit') : t('rdm.dailyRule.view')}
          </Button>
          {canEdit && (
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>
              {t('rdm.dailyRule.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyRule.hint')} />

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyRule.loadFailed')}
          description={error} action={<Button size="small" onClick={() => void load()}>{t('rdm.dailyRule.retry')}</Button>} />
      )}

      {/* 全局开关与默认模板：对所有规则生效的总闸 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SettingOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('rdm.dailyRule.globalTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.globalHint')}</span>
        </div>
        <Form form={form} layout="vertical" disabled={!canEdit} onValuesChange={() => setCfgDirty(true)}>
          {/* 第一层：总闸。单独成行，不再与两个渠道开关平铺成三列 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '12px 16px', borderRadius: 8,
            background: masterEnabled ? '#fff7f0' : '#fafafa',
            border: `1px solid ${masterEnabled ? '#ffe7d1' : '#f0f0f0'}`,
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <PoweroffOutlined style={{ fontSize: 16, color: masterEnabled ? '#e8720c' : '#bfbfbf' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: masterEnabled ? '#262626' : '#8c8c8c' }}>
                    {t('rdm.dailyRule.masterSwitch')}
                  </span>
                  <Tag color={masterEnabled ? 'volcano' : 'default'} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                    {t('rdm.dailyRule.masterBadge')}
                  </Tag>
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                  {t('rdm.dailyRule.masterDesc')}
                </div>
              </div>
            </div>
            <Form.Item name="enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
            </Form.Item>
          </div>

          {/* 第二层：推送渠道。左侧竖线挂到总闸下面，总闸关闭时整块置灰并禁用 */}
          <div style={{
            marginLeft: 20, paddingLeft: 20, borderLeft: '2px solid #f0f0f0',
            opacity: masterEnabled ? 1 : 0.45,
            transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('rdm.dailyRule.channelTitle')}</span>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.channelHint')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {([
                { name: 'groupEnabled', label: t('rdm.dailyRule.groupSwitch') },
                { name: 'personalEnabled', label: t('rdm.dailyRule.personalSwitch') },
              ] as const).map(item => (
                <div key={item.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '8px 12px', borderRadius: 6, background: '#fafafa',
                }}>
                  <span style={{ fontSize: 13, color: '#262626' }}>{item.label}</span>
                  <Form.Item name={item.name} valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch disabled={!masterEnabled || !canEdit}
                      checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
                  </Form.Item>
                </div>
              ))}
            </div>

            {/*
              個人渠道的收件人設定：嵌在「渠道」区块内部表示从属「個人」，
              個人关掉时整块置灰但不清值（与总闸/渠道的两级语义一致）。
              阶段一：仅界面，预览人数为本地示意值，保存不提交这三个字段。
            */}
            <div style={{
              marginTop: 12, padding: '14px 16px', borderRadius: 8,
              background: '#fafafa', border: '1px solid #f0f0f0',
              opacity: personalEnabled ? 1 : 0.55,
              transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <TeamOutlined style={{ fontSize: 14, color: personalEnabled ? '#e8720c' : '#bfbfbf' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: personalEnabled ? '#262626' : '#8c8c8c' }}>
                  {t('rdm.dailyRule.receiverTitle')}
                </span>
                <HelpPopover
                  title={t('rdm.dailyRule.receiverHelpTitle')}
                  ariaLabel={t('rdm.dailyRule.receiverHelpAria')}
                  placement="bottomRight"
                  width={420}
                  content={[
                    { tone: 'info', label: t('rdm.dailyRule.receiverHelpRoleLabel'), body: t('rdm.dailyRule.receiverHelpRoleBody') },
                    { tone: 'warn', label: t('rdm.dailyRule.receiverHelpExtraLabel'), body: t('rdm.dailyRule.receiverHelpExtraBody') },
                    { tone: 'neutral', label: t('rdm.dailyRule.receiverHelpExcludeLabel'), body: t('rdm.dailyRule.receiverHelpExcludeBody') },
                    { tone: 'danger', label: t('rdm.dailyRule.receiverHelpUnboundLabel'), body: t('rdm.dailyRule.receiverHelpUnboundBody') },
                  ]}
                />
                <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.receiverScopeHint')}</span>
              </div>

              <Form.Item name="receiverRoles" style={{ marginBottom: 6 }}>
                <Checkbox.Group disabled={!personalEnabled} style={{ width: '100%' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px 10px' }}>
                    {RECEIVER_ROLE_OPTIONS.map(option => (
                      <Checkbox key={option.value} value={option.value} style={{ fontSize: 13, marginInlineEnd: 0 }}>
                        {t(option.labelKey)}
                      </Checkbox>
                    ))}
                  </div>
                </Checkbox.Group>
              </Form.Item>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 14 }}>
                {t('rdm.dailyRule.receiverRoleHint')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <Form.Item name="extraReceiverUserIds" label={t('rdm.dailyRule.receiverExtraLabel')} style={{ marginBottom: 8 }}>
                  <Select
                    mode="multiple" allowClear showSearch filterOption={false}
                    disabled={!personalEnabled}
                    placeholder={t('rdm.dailyRule.receiverSearchPlaceholder')}
                    loading={employeeSearching}
                    onSearch={handleEmployeeSearch}
                    options={employeeOptions}
                    notFoundContent={employeeSearching ? <Spin size="small" /> : undefined}
                  />
                </Form.Item>
                <Form.Item name="excludeReceiverUserIds" label={t('rdm.dailyRule.receiverExcludeLabel')} style={{ marginBottom: 8 }}>
                  <Select
                    mode="multiple" allowClear showSearch filterOption={false}
                    disabled={!personalEnabled}
                    placeholder={t('rdm.dailyRule.receiverSearchPlaceholder')}
                    loading={employeeSearching}
                    onSearch={handleEmployeeSearch}
                    options={employeeOptions}
                    notFoundContent={employeeSearching ? <Spin size="small" /> : undefined}
                  />
                </Form.Item>
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 10 }}>
                {t('rdm.dailyRule.receiverExtraExcludeHint')}
              </div>

              {/*
                收件人預覽：口径由服务端统一裁决（角色 ∪ 追加 − 排除，再剔除未绑定钉钉）。
                未选规则时按「全部在途項目」估算，因此必须写明范围，避免被当成某条规则的结果。
              */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '8px 12px', borderRadius: 6,
                background: (receiverPreview?.unbound ?? 0) > 0 ? '#fff7e6' : '#f6ffed',
                border: `1px solid ${(receiverPreview?.unbound ?? 0) > 0 ? '#ffe7d1' : '#b7eb8f'}`,
              }}>
                {receiverPreview ? (
                  <span style={{ fontSize: 12, color: '#595959' }}>
                    {t('rdm.dailyRule.receiverPreviewSendingPrefix')}
                    <b style={{ color: '#e8720c' }}>{receiverPreview.total}</b>
                    {t('rdm.dailyRule.receiverPreviewSendingSuffix')}
                    {receiverPreview.unbound > 0 && (
                      <>
                        {t('rdm.dailyRule.receiverPreviewUnboundPrefix')}
                        <b style={{ color: '#fa8c16' }}>{receiverPreview.unbound}</b>
                        {t('rdm.dailyRule.receiverPreviewUnboundSuffix')}
                      </>
                    )}
                    <span style={{ color: '#bfbfbf' }}>{t('rdm.dailyRule.receiverPreviewScope')}</span>
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.receiverPreviewComputing')}</span>
                )}
                <Button type="link" size="small" style={{ marginLeft: 'auto', padding: 0 }}
                  disabled={!personalEnabled || !receiverPreview?.receivers.length}
                  onClick={showReceiverDetail}>
                  {t('rdm.dailyRule.receiverViewDetail')}
                </Button>
              </div>
            </div>
          </div>

          {/*
            看板與連結：樣式固定（前端寫死），這裡只調展示參數。
            不提供皮膚/自定義 CSS 入口：一旦可改樣式，多渠道轉發後就沒有可信的統一模板。
          */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <LinkOutlined style={{ color: '#e8720c' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                {t('rdm.dailyRule.boardTitle')}
              </span>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.boardHint')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item name="boardLinkValidDays" label={t('rdm.dailyRule.boardValidDays')}
                rules={[{ required: true, message: t('rdm.dailyRule.boardValidDaysRequired') }]}>
                <InputNumber min={1} max={90} precision={0} style={{ width: '100%' }}
                  addonAfter={t('rdm.dailyRule.boardValidDaysUnit')} />
              </Form.Item>
              <Form.Item name="boardShowRequirements" label={t('rdm.dailyRule.boardShowRequirements')}
                valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
              </Form.Item>
              <Form.Item name="boardShowOwners" label={t('rdm.dailyRule.boardShowOwners')}
                valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
              </Form.Item>
              <Form.Item name="boardShowUnassigned" label={t('rdm.dailyRule.boardShowUnassigned')}
                valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
              </Form.Item>
            </div>
          </div>

          {/*
            钉钉消息：层级框架（汇总行 → 项目 → 迭代 → 未挂项目迭代 → 查看链接）由后端写死，
            这里只决定每行带哪几个字段。不自造“拖拽排序/自定义层级”：一旦能改框架，
            同一个日报在不同群里就无法形成稳定的阅读习惯。
          */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <NotificationOutlined style={{ color: '#e8720c' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>
                {t('rdm.dailyRule.msgTitle')}
              </span>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.msgHint')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
              <Form.Item name="messageMode" label={t('rdm.dailyRule.msgMode')} style={{ marginBottom: 8 }}>
                <Select options={[
                  { label: t('rdm.dailyRule.msgModeFixed'), value: 'fixed' },
                  { label: t('rdm.dailyRule.msgModeTemplate'), value: 'template' },
                ]} />
              </Form.Item>
              {/*
                降噪是「阅读习惯」级开关，不是自由配置：只给三档，不提供表达式/时间窗等细节，
                否则「今天为什么没发」会变成一件需要看配置才能解释的事。
                仅对定时推送生效；手动触发与预览照常发完整内容（用户主动要看）。
              */}
              <Form.Item name="quietPolicy" label={t('rdm.dailyRule.quietPolicy')} style={{ marginBottom: 8 }}>
                <Select options={[
                  { label: t('rdm.dailyRule.quietFull'), value: 'full' },
                  { label: t('rdm.dailyRule.quietBrief'), value: 'brief' },
                  { label: t('rdm.dailyRule.quietSkip'), value: 'skip' },
                ]} />
              </Form.Item>
            </div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 10 }}>
              {messageMode === 'template'
                ? t('rdm.dailyRule.msgTemplateNote')
                : t('rdm.dailyRule.msgFrameworkNote')}
            </div>
            {/*
              模板选择必须与消息模式联动：
              fixed 下 renderGroupFixed / renderPersonalFixed 直接生成正文，模板键完全不参与渲染，
              再让用户选「晨報默認模板」就是一份永远不生效的配置，还会让人以为改模板能改内容。
              所以 fixed 时把三个下拉换成三张「查看樣式」入口，template 时才出现下拉。
              注意：fixed 分支只做条件渲染、不清空表单值，切回 template 时原选择仍在。
            */}
            {messageMode === 'template' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                <Form.Item name="morningTemplateKey" label={t('rdm.dailyRule.defaultMorningTpl')}>
                  <Select allowClear options={groupMorning} placeholder={t('rdm.dailyRule.useDefault')} />
                </Form.Item>
                <Form.Item name="eveningTemplateKey" label={t('rdm.dailyRule.defaultEveningTpl')}>
                  <Select allowClear options={groupEvening} placeholder={t('rdm.dailyRule.useDefault')} />
                </Form.Item>
                <Form.Item name="personalTemplateKey" label={t('rdm.dailyRule.defaultPersonalTpl')} style={{ marginBottom: 8 }}>
                  <Select allowClear options={personalOptions} placeholder={t('rdm.dailyRule.useDefault')} />
                </Form.Item>
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16,
                marginBottom: 10, padding: '10px 12px', borderRadius: 8,
                background: '#f0f6ff', border: '1px solid #d6e4ff',
              }}>
                {BUILTIN_LAYOUT_ENTRIES.map(item => (
                  <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#595959' }}>{t(item.labelKey)}</span>
                    <Button size="small" icon={<EyeOutlined />}
                      onClick={() => navigate(`/rdm-daily-report-template-builtin?type=${item.type}`)}>
                      {t('rdm.dailyRule.viewBuiltinStyle')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 10 }}>
              {t('rdm.dailyRule.quietHint')}
            </div>
            {/*
              字段开关收进「進階」折叠区：固定版式的默认值就是推荐值（需关注项目 + 交付进度 + 负责人），
              绝大多数人不需要调；把它们平铺在主表单里，只会让「只能选不能配」的承诺名存实亡。
              已保存的历史配置仍然生效，不因折叠而重置。
            */}
            <Collapse
              ghost
              size="small"
              style={{ marginBottom: 4 }}
              items={[{
                key: 'messageFields',
                label: (
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                    {t('rdm.dailyRule.msgAdvanced')}
                  </span>
                ),
                children: (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>
                        {t('rdm.dailyRule.msgProjectFields')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px 12px' }}>
                        {PROJECT_FIELDS.map(f => (
                          <Form.Item key={f.key} name={['messageFields', f.key]} valuePropName="checked"
                            style={{ marginBottom: 0 }}>
                            <Checkbox disabled={messageMode === 'template'}>{t(f.labelKey)}</Checkbox>
                          </Form.Item>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 2 }}>
                        {t('rdm.dailyRule.msgIterationFields')}
                      </div>
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                        {t('rdm.dailyRule.msgIterationScope')}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px 12px' }}>
                        {ITERATION_FIELDS.map(f => (
                          <Form.Item key={f.key} name={['messageFields', f.key]} valuePropName="checked"
                            style={{ marginBottom: 0 }}>
                            <Checkbox disabled={messageMode === 'template'}>{t(f.labelKey)}</Checkbox>
                          </Form.Item>
                        ))}
                      </div>
                    </div>
                  </div>
                ),
              }]}
            />
          </div>
        </Form>
        {canEdit && (
          <div style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<SaveOutlined />} loading={savingCfg} disabled={!cfgDirty}
              onClick={() => void handleSaveConfig()}>
              {t('rdm.dailyRule.saveGlobal')}
            </Button>
          </div>
        )}
        {config && !config.enabled && (
          <Alert type="warning" showIcon style={{ marginTop: 12 }} message={t('rdm.dailyRule.masterOffHint')} />
        )}
      </div>

      {/* 规则列表 */}
      <div style={{ ...cardStyle, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {t('rdm.dailyRule.rulesTitle')}
            <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginLeft: 8 }}>
              {t('rdm.dailyRule.rulesCount', { count: rows.length })}
            </span>
          </span>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-daily-report-rule-form')}>
              {t('rdm.dailyRule.newRule')}
            </Button>
          )}
        </div>
        <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows}
          pagination={false} scroll={{ x: 1100 }} />
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}
