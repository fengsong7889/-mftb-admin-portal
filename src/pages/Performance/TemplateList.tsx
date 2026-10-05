import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import {
  CYCLE_TYPE, type PerfGradeRule, type PerfIndicator, type PerfTemplate,
  type PerfTemplatePayload, createPerfTemplate, fetchPerfTemplate, fetchPerfTemplates, updatePerfTemplate,
  matchGrade, parseGradeScheme, sortGrades,
} from '../../api/hrPerformance'
import {
  CYCLE_TYPE_LABEL_KEY, CYCLE_TYPE_ORDER, GRADE_LABEL_KEY, GRADE_ORDER, INDICATOR_TYPE_LABEL_KEY,
  INDICATOR_TYPE_ORDER, PERF_MENU,
} from './meta'

interface FormValues {
  name: string
  applyCycleType?: string
  weightSum: number
  status: boolean
  remark?: string
  grades: PerfGradeRule[]
  indicators: PerfIndicator[]
}

/** 指标行默认值（新加一行时给一个可用权重，避免合计永远对不上） */
const blankIndicator = (): PerfIndicator => ({
  name: '', indicatorType: INDICATOR_TYPE_ORDER[0], weight: 0, targetDesc: '', scoringDesc: '',
})

const blankGrade = (code: string, minScore: number): PerfGradeRule => ({ code, minScore })

/**
 * 考核模板与指标配置（周期與計劃菜单下的第二张台账）。
 * <p>
 * 权重合计与等级下限由服务端二次校验，这里给即时反馈：
 * 权重不合计/等级下限重复都会让发起计划或结果映射出错，宁可挡住也别让 HR 白填。
 */
export default function PerfTemplateList() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission(`${PERF_MENU.ADMIN}:create`)
  const canEdit = hasPermission(`${PERF_MENU.ADMIN}:edit`)

  const [rows, setRows] = useState<PerfTemplate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [keyword, setKeyword] = useState<string>()
  const [input, setInput] = useState('')
  const [searchForm] = Form.useForm<{ keyword: string }>()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PerfTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<FormValues>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPerfTemplates({ page, size, keyword: keyword || undefined })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, keyword])

  useEffect(() => { load() }, [load])

  const typeLabel = (code?: string | null) => (!code ? t('hrPerf.anyCycleType')
    : (CYCLE_TYPE_LABEL_KEY[code] ? t(CYCLE_TYPE_LABEL_KEY[code]) : code))
  const gradeText = (code: string) => (GRADE_LABEL_KEY[code] ? t(GRADE_LABEL_KEY[code]) : code)

  /** 客户端即时口径：权重合计 + 等级下限唯一（服务端仍是最终真值） */
  const weightCheck = Form.useWatch('indicators', form)
  const weightSumExpect = Form.useWatch('weightSum', form)
  const gradeWatch = Form.useWatch('grades', form)
  const weightDiff = useMemo(() => {
    const sum = (weightCheck || []).reduce((acc, i) => acc + (Number(i?.weight) || 0), 0)
    return { sum, expect: Number(weightSumExpect) || 0, ok: sum === (Number(weightSumExpect) || 0) }
  }, [weightCheck, weightSumExpect])
  const gradeIssue = useMemo(() => {
    const list = (gradeWatch || []).filter(g => g && g.code)
    const codes = new Set<string>()
    const scores = new Set<number>()
    for (const g of list) {
      if (codes.has(g.code)) return t('hrPerf.duplicateGrade', { code: g.code })
      codes.add(g.code)
      const min = Number(g.minScore)
      if (scores.has(min)) return t('hrPerf.duplicateMinScore', { score: min })
      scores.add(min)
    }
    return ''
  }, [gradeWatch, t])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({
      weightSum: 100,
      status: true,
      applyCycleType: CYCLE_TYPE.QUARTER,
      grades: [blankGrade('S', 90), blankGrade('A', 80), blankGrade('B', 60)],
      indicators: [blankIndicator()],
    })
    setOpen(true)
  }

  const openEdit = async (row: PerfTemplate) => {
    if (!row.id) return
    try {
      const full = await fetchPerfTemplate(row.id)
      setEditing(full)
      form.setFieldsValue({
        name: full.name,
        applyCycleType: full.applyCycleType || undefined,
        weightSum: full.weightSum,
        status: full.status !== 0,
        remark: full.remark || undefined,
        grades: sortGrades(parseGradeScheme(full.gradeScheme)),
        indicators: (full.indicators || []).map(i => ({ ...i })),
      })
      setOpen(true)
    } catch {
      // 请求层已统一提示
    }
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const payload: PerfTemplatePayload = {
      name: values.name.trim(),
      applyCycleType: values.applyCycleType || undefined,
      weightSum: values.weightSum,
      status: values.status ? 1 : 0,
      remark: values.remark?.trim(),
      grades: (values.grades || []).filter(g => g && g.code),
      indicators: (values.indicators || []).map((i, idx) => ({ ...i, sortOrder: idx + 1 })),
    }
    setSaving(true)
    try {
      if (editing?.id) await updatePerfTemplate(editing.id, payload)
      else await createPerfTemplate(payload)
      message.success(t('hrPerf.templateSaved'))
      setOpen(false)
      load()
    } catch {
      // 请求层已提示（权重不合计/指标被计划引用不可减少等）
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<TableColumnsType<PerfTemplate>>(() => [
    { title: t('hrPerf.templateName'), dataIndex: 'name', key: 'name', width: 220, fixed: 'left' },
    {
      title: t('hrPerf.cycleType'), dataIndex: 'applyCycleType', key: 'applyCycleType', width: 110,
      render: (v: string) => <Tag color="cyan">{typeLabel(v)}</Tag>,
    },
    { title: t('hrPerf.weightSum'), dataIndex: 'weightSum', key: 'weightSum', width: 100 },
    {
      title: t('hrPerf.indicatorCount'), key: 'indicatorCount', width: 110,
      render: (_, r) => (r.indicators?.length ?? 0),
    },
    {
      title: t('hrPerf.gradeScheme'), key: 'grades', width: 260,
      render: (_, r) => sortGrades(parseGradeScheme(r.gradeScheme))
        .map(g => <Tag key={g.code} color="purple">{`${gradeText(g.code)} ≥ ${g.minScore}`}</Tag>),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (v: number) => (v === 0 ? <Tag>{t('hrPerf.disabled')}</Tag> : <Tag color="success">{t('hrPerf.enabled')}</Tag>),
    },
    { title: t('common.colRemark'), dataIndex: 'remark', key: 'remark', width: 180, render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 110, fixed: 'right',
      render: (_, r) => (canEdit
        ? <Button type="link" size="small" onClick={() => openEdit(r)}>{t('common.edit')}</Button>
        : <Typography.Text type="secondary">-</Typography.Text>),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, canEdit, typeLabel, gradeText])

  const { configComponent, applyConfig } = useColumnConfig('hr-perf-template',
    columns.map(c => ({ key: String(c.key), title: String(c.title) })),
    [{ key: 'action', visible: true, locked: 'tail' }])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={searchForm} layout="inline" onFinish={() => { setKeyword(input.trim() || undefined); setPage(1) }}>
          <Form.Item label={t('common.search')} name="keyword">
            <Input placeholder={t('hrPerf.templateKeywordPlaceholder')} allowClear style={{ width: 220 }}
              onChange={e => setInput(e.target.value)} onPressEnter={() => { setKeyword(input.trim() || undefined); setPage(1) }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                searchForm.resetFields(); setInput(''); setKeyword(undefined); setPage(1)
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section" style={{ marginTop: 8 }}>
        <div className="action-section-left">
          <Typography.Text type="secondary">{t('hrPerf.templateTip')}</Typography.Text>
        </div>
        <div className="action-section-right">
          {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('hrPerf.newTemplate')}</Button>}
          {configComponent}
        </div>
      </div>

      <Table<PerfTemplate>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (c) => t('common.total', { count: c }),
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />

      <Modal title={editing ? t('hrPerf.editTemplate') : t('hrPerf.newTemplate')} open={open}
        onCancel={() => setOpen(false)} onOk={handleSave} confirmLoading={saving} width={1040} destroyOnClose>
        <Form form={form} layout="vertical">
          <Space size={16} wrap>
            <Form.Item label={t('hrPerf.templateName')} name="name"
              rules={[{ required: true, message: t('hrPerf.templateNameRequired') }]} style={{ minWidth: 260 }}>
              <Input maxLength={64} placeholder={t('hrPerf.templateNamePlaceholder')} />
            </Form.Item>
            <Form.Item label={t('hrPerf.cycleType')} name="applyCycleType" style={{ minWidth: 160 }}>
              <Select allowClear placeholder={t('hrPerf.anyCycleType')}
                options={CYCLE_TYPE_ORDER.map(code => ({ value: code, label: typeLabel(code) }))} />
            </Form.Item>
            <Form.Item label={t('hrPerf.weightSum')} name="weightSum"
              rules={[{ required: true, message: t('hrPerf.weightSumRequired') }]} style={{ width: 130 }}>
              <InputNumber min={1} max={1000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('hrPerf.enabled')} name="status" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          {!weightDiff.ok && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message={t('hrPerf.weightMismatch', { sum: weightDiff.sum, expect: weightDiff.expect })} />
          )}
          {gradeIssue && (
            <Alert type="error" showIcon style={{ marginBottom: 12 }} message={gradeIssue} />
          )}

          <Typography.Text strong>{t('hrPerf.indicators')}</Typography.Text>
          <Form.List name="indicators">
            {(fields, { add, remove }) => (
              <>
                <Table
                  size="small"
                  style={{ margin: '8px 0 16px' }}
                  rowKey={f => String(f.key)}
                  pagination={false}
                  dataSource={fields}
                  columns={[
                    {
                      title: t('hrPerf.indicator'), width: 170,
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'name']} noStyle rules={[{ required: true, message: t('hrPerf.indicatorNameRequired') }]}>
                          <Input maxLength={128} placeholder={t('hrPerf.indicatorNamePlaceholder')} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.indicatorType'), width: 120,
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'indicatorType']} noStyle>
                          <Select allowClear placeholder={t('common.pleaseSelect')}
                            options={INDICATOR_TYPE_ORDER.map(code => ({
                              value: code, label: INDICATOR_TYPE_LABEL_KEY[code] ? t(INDICATOR_TYPE_LABEL_KEY[code]) : code,
                            }))} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.weight'), width: 100,
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'weight']} noStyle rules={[{ required: true, message: t('hrPerf.weightRequired') }]}>
                          <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.targetDesc'),
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'targetDesc']} noStyle>
                          <Input maxLength={500} placeholder={t('hrPerf.targetDescPlaceholder')} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.scoringDesc'),
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'scoringDesc']} noStyle>
                          <Input maxLength={500} placeholder={t('hrPerf.scoringDescPlaceholder')} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('common.colAction'), width: 60,
                      render: (_, f) => (
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}
                          onClick={() => remove(f.name)} aria-label={t('common.delete')} />
                      ),
                    },
                  ]}
                />
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add(blankIndicator())}>
                  {t('hrPerf.addIndicator')}
                </Button>
              </>
            )}
          </Form.List>

          <Typography.Text strong style={{ marginTop: 16, display: 'block' }}>{t('hrPerf.gradeScheme')}</Typography.Text>
          <Typography.Text type="secondary">{t('hrPerf.gradeSchemeTip')}</Typography.Text>
          <Form.List name="grades">
            {(fields, { add, remove }) => (
              <>
                <Table
                  size="small"
                  style={{ margin: '8px 0' }}
                  rowKey={f => String(f.key)}
                  pagination={false}
                  dataSource={fields}
                  columns={[
                    {
                      title: t('hrPerf.grade'), width: 180,
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'code']} noStyle rules={[{ required: true, message: t('hrPerf.gradeRequired') }]}>
                          <Select showSearch placeholder={t('hrPerf.gradePlaceholder')}
                            options={GRADE_ORDER.map(code => ({ value: code, label: gradeText(code) }))} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.minScore'), width: 160,
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'minScore']} noStyle rules={[{ required: true, message: t('hrPerf.minScoreRequired') }]}>
                          <InputNumber min={0} max={100} style={{ width: '100%' }} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.ratio'), width: 160,
                      render: (_, f) => (
                        <Form.Item name={[f.name, 'ratio']} noStyle>
                          <InputNumber min={0} max={100} style={{ width: '100%' }}
                            placeholder={t('hrPerf.ratioPlaceholder')} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: t('hrPerf.matchPreview'),
                      render: () => {
                        // 取一个样例得分预览映射结果，让 HR 看到“等级下限”怎么生效
                        const sample = matchGrade(form.getFieldValue('grades') || [], 85)
                        return <Tag color="gold">{t('hrPerf.matchPreviewTip', { score: 85, grade: sample ? gradeText(sample) : '-' })}</Tag>
                      },
                    },
                    {
                      title: t('common.colAction'), width: 60,
                      render: (_, f) => (
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}
                          onClick={() => remove(f.name)} aria-label={t('common.delete')} />
                      ),
                    },
                  ]}
                />
                <Button type="dashed" block icon={<PlusOutlined />}
                  onClick={() => add(blankGrade('C', 40))}>
                  {t('hrPerf.addGrade')}
                </Button>
              </>
            )}
          </Form.List>

          <Form.Item label={t('common.colRemark')} name="remark" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
