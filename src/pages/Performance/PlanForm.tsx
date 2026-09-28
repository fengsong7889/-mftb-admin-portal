import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  CYCLE_STATUS, type PerfCycle, type PerfLaunchPreview, type PerfPlanLaunchPayload,
  type PerfTemplate, fetchPerfCycles, fetchPerfScopeOptions, fetchPerfTemplates, launchPerfPlan,
  parseGradeScheme, previewPerfLaunch, sortGrades,
} from '../../api/hrPerformance'
import { PERF_CYCLE_PATH, PERF_PLAN_PATH, CYCLE_TYPE_LABEL_KEY, planDetailPath } from './meta'

interface FormValues {
  name: string
  cycleId: number
  templateId: number
  deptIds: number[]
  positionLevels?: string[]
  selfRange: [Dayjs, Dayjs]
  supRange: [Dayjs, Dayjs]
  calibEnd: Dayjs
  summary?: string
}

/**
 * 发起考核计划：圈定范围后必须先跑「範圍預覽」，看到命中人数与无评估人清单才允许发起。
 * <p>
 * 评估人由服务端按部门负责人「同部门唯一同名」自动指派，歧义一律落待指派，
 * 预览里给出原因，HR 可在计划详情改派——不允许按姓名跨部门猜人。
 */
export default function PerfPlanForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [cycles, setCycles] = useState<PerfCycle[]>([])
  const [templates, setTemplates] = useState<PerfTemplate[]>([])
  const [departments, setDepartments] = useState<Array<{ id: number; name: string; parentId: number | null; leader: string }>>([])
  const [positionLevels, setPositionLevels] = useState<string[]>([])
  const [preview, setPreview] = useState<PerfLaunchPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    fetchPerfCycles({ page: 1, size: 100 })
      .then(res => setCycles((res.records || []).filter(c => c.status === CYCLE_STATUS.PUBLISHED)))
      .catch(() => undefined)
    fetchPerfTemplates({ page: 1, size: 100 })
      .then(res => setTemplates((res.records || []).filter(tm => tm.status === 1)))
      .catch(() => undefined)
    fetchPerfScopeOptions()
      .then(res => {
        setDepartments(res.departments || [])
        setPositionLevels(res.positionLevels || [])
      })
      .catch(() => undefined)
  }, [])

  /** 部门下拉带上级名，避免同名子部门无法区分 */
  const deptOptions = useMemo(() => {
    const nameById = new Map(departments.map(d => [d.id, d.name]))
    return departments.map(d => ({
      value: d.id,
      label: d.parentId && nameById.has(d.parentId) ? `${nameById.get(d.parentId)} / ${d.name}` : d.name,
    }))
  }, [departments])

  const buildPayload = (values: FormValues): PerfPlanLaunchPayload => ({
    cycleId: values.cycleId,
    templateId: values.templateId,
    name: values.name.trim(),
    deptIds: values.deptIds,
    positionLevels: values.positionLevels?.length ? values.positionLevels : undefined,
    selfStart: values.selfRange[0].format('YYYY-MM-DD'),
    selfEnd: values.selfRange[1].format('YYYY-MM-DD'),
    supStart: values.supRange[0].format('YYYY-MM-DD'),
    supEnd: values.supRange[1].format('YYYY-MM-DD'),
    calibEnd: values.calibEnd.format('YYYY-MM-DD'),
    summary: values.summary?.trim(),
  })

  /** 周期结束后自动排窗口：自评 10 天 → 上级评 10 天 → 校准 5 天，避免手填错位 */
  const applyWindowPreset = useCallback((cycle?: PerfCycle) => {
    if (!cycle?.periodEnd) return
    const start = dayjs(cycle.periodEnd).add(1, 'day')
    form.setFieldsValue({
      selfRange: [start, start.add(9, 'day')],
      supRange: [start.add(10, 'day'), start.add(19, 'day')],
      calibEnd: start.add(24, 'day'),
    })
  }, [form])

  const runPreview = async () => {
    const values = await form.validateFields()
    setPreviewing(true)
    try {
      const res = await previewPerfLaunch(buildPayload(values))
      setPreview(res)
      if (!res.total) message.warning(t('hrPerf.previewEmpty'))
      else if (res.unassigned) message.warning(t('hrPerf.previewUnassigned', { count: res.unassigned }))
      else message.success(t('hrPerf.previewOk'))
    } catch {
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  /** 二次确认：把命中人数与待指派缺口写在同一句话里，避免“先发再说” */
  const handleLaunch = () => {
    form.validateFields().then(values => {
      const unassigned = preview?.unassigned ?? 0
      Modal.confirm({
        title: t('hrPerf.launchConfirmTitle'),
        content: unassigned
          ? t('hrPerf.launchConfirmUnassigned', { total: preview?.total ?? 0, count: unassigned })
          : t('hrPerf.launchConfirm', { total: preview?.total ?? 0 }),
        okText: t('common.confirm'),
        onOk: async () => {
          setLaunching(true)
          try {
            const plan = await launchPerfPlan(buildPayload(values))
            message.success(t('hrPerf.planLaunched'))
            navigate(planDetailPath(plan.id as number))
          } catch {
            // 请求层已提示（范围内无在职员工 / 模板适用周期类型不符等）
          } finally {
            setLaunching(false)
          }
        },
      })
    })
  }

  const previewColumns = useMemo<TableColumnsType<PerfLaunchPreview['unassignedList'][number]>>(() => [
    { title: t('hrPerf.employee'), dataIndex: 'empName', key: 'empName', width: 140 },
    { title: t('hrPerf.department'), dataIndex: 'deptName', key: 'deptName', width: 160, render: (v: string) => v || '-' },
    { title: t('hrPerf.unassignedReason'), dataIndex: 'reason', key: 'reason' },
  ], [t])

  const typeLabel = (code?: string | null) => (code && CYCLE_TYPE_LABEL_KEY[code] ? t(CYCLE_TYPE_LABEL_KEY[code]) : (code || t('hrPerf.anyCycleType')))

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrPerf.launchPlan')}
        onBack={() => navigate(PERF_PLAN_PATH)}
        extra={<span style={{ color: '#8C8C8C' }}>{t('hrPerf.launchHeaderTip')}</span>}
      />

      <Card>
        <Form form={form} layout="vertical" onValuesChange={changed => {
          setPreview(null)
          if ('cycleId' in changed) {
            applyWindowPreset(cycles.find(c => c.id === changed.cycleId))
          }
        }}>
          <Space size={24} wrap style={{ width: '100%' }}>
            <Form.Item label={t('hrPerf.cycle')} name="cycleId" rules={[{ required: true, message: t('hrPerf.cycleRequired') }]}
              style={{ minWidth: 280 }}>
              <Select showSearch optionFilterProp="label" placeholder={t('hrPerf.onlyPublishedCycle')}
                options={cycles.map(c => ({ value: c.id as number, label: `${c.name}（${c.code}）` }))} />
            </Form.Item>
            <Form.Item label={t('hrPerf.template')} name="templateId" rules={[{ required: true, message: t('hrPerf.templateRequired') }]}
              style={{ minWidth: 280 }}>
              <Select showSearch optionFilterProp="label" placeholder={t('hrPerf.onlyEnabledTemplate')}
                options={templates.map(tm => ({
                  value: tm.id as number,
                  label: `${tm.name}（${typeLabel(tm.applyCycleType)}｜${t('hrPerf.gradeCount', { count: sortGrades(parseGradeScheme(tm.gradeScheme)).length })}）`,
                }))} />
            </Form.Item>
            <Form.Item label={t('hrPerf.planName')} name="name" rules={[{ required: true, message: t('hrPerf.planNameRequired') }]}
              style={{ minWidth: 300 }}>
              <Input maxLength={64} placeholder={t('hrPerf.planNamePlaceholder')} />
            </Form.Item>
          </Space>

          <Form.Item label={t('hrPerf.scopeDepts')} name="deptIds" rules={[{ required: true, message: t('hrPerf.scopeDeptsRequired') }]}
            extra={t('hrPerf.scopeDeptsTip')}>
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" maxTagCount="responsive"
              placeholder={t('hrPerf.scopeDeptsPlaceholder')} options={deptOptions} />
          </Form.Item>

          <Form.Item label={t('hrPerf.positionLevels')} name="positionLevels" extra={t('hrPerf.positionLevelsTip')}>
            <Select mode="multiple" allowClear maxTagCount="responsive" placeholder={t('hrPerf.positionLevelsPlaceholder')}
              options={positionLevels.map(v => ({ value: v, label: v }))} />
          </Form.Item>

          <Space size={24} wrap>
            <Form.Item label={t('hrPerf.selfWindow')} name="selfRange" rules={[{ required: true, message: t('hrPerf.windowRequired') }]}>
              <DatePicker.RangePicker />
            </Form.Item>
            <Form.Item label={t('hrPerf.supWindow')} name="supRange" rules={[{ required: true, message: t('hrPerf.windowRequired') }]}>
              <DatePicker.RangePicker />
            </Form.Item>
            <Form.Item label={t('hrPerf.calibEnd')} name="calibEnd" rules={[{ required: true, message: t('hrPerf.windowRequired') }]}>
              <DatePicker />
            </Form.Item>
          </Space>

          <Form.Item label={t('hrPerf.planSummary')} name="summary">
            <Input.TextArea rows={2} maxLength={500} showCount placeholder={t('hrPerf.planSummaryPlaceholder')} />
          </Form.Item>

          <Space size={12}>
            <Button onClick={runPreview} loading={previewing}>{t('hrPerf.previewScope')}</Button>
            <Button type="primary" disabled={!preview || !preview.total} loading={launching} onClick={handleLaunch}>
              {t('hrPerf.launchPlan')}
            </Button>
            {!preview && <Typography.Text type="secondary">{t('hrPerf.previewRequiredTip')}</Typography.Text>}
          </Space>
        </Form>
      </Card>

      {preview && (
        <Card style={{ marginTop: 12 }} title={t('hrPerf.previewResult')}>
          <Alert type={preview.unassigned ? 'warning' : 'success'} showIcon style={{ marginBottom: 12 }}
            message={t('hrPerf.previewSummary', { total: preview.total, count: preview.unassigned })} />
          {preview.unassignedList?.length > 0 && (
            <Table
              size="small"
              rowKey="userId"
              columns={previewColumns}
              dataSource={preview.unassignedList}
              pagination={false}
              scroll={{ y: 260 }}
            />
          )}
          <div style={{ marginTop: 12 }}>
            <Tag color="blue">{t('hrPerf.backToCycles')}</Tag>
            <Button type="link" size="small" onClick={() => navigate(PERF_CYCLE_PATH)}>{t('hrPerf.cycleLedger')}</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
