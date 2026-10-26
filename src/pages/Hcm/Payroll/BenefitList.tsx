/**
 * 福利參保（/hcm-payroll-benefit）
 *
 * 一页两页签：参保方案（费率与基数上下限）与人员参保（谁参加了哪个方案）。
 * 不拆成两个一级菜单：这两步是同一个业务动作的前后半段，拆开后侧边栏会出现两条互相依赖的入口。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import {
  JURISDICTION_OPTIONS,
  PLAN_TYPE_OPTIONS,
  deleteBenefitPlan,
  deleteEnrollment,
  listBenefitPlans,
  listEnrollments,
  updateBenefitPlan,
  type PayrollBenefitPlan,
  type PayrollEnrollment,
} from '@/api/payroll'

const PLAN_TYPE_COLOR: Record<string, string> = {
  SOCIAL_INSURANCE: 'blue',
  HOUSING_FUND: 'purple',
  MEDICAL: 'cyan',
  GROUP_LIFE: 'gold',
  OTHER: 'default',
}

type PlanFilters = { keyword?: string; planType?: string; jurisdiction?: string; status?: number }
type EnrollmentFilters = { employmentId?: number; planId?: number; asOf?: dayjs.Dayjs; activeOnly?: boolean }

export default function HcmPayrollBenefitList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const employmentIdFromQuery = params.get('employmentId') ? Number(params.get('employmentId')) : undefined
  const [activeTab, setActiveTab] = useState(params.get('tab') === 'enrollment' ? 'enrollment' : 'plan')

  /* ---------- 方案 ---------- */
  const [plans, setPlans] = useState<PayrollBenefitPlan[]>([])
  const [planTotal, setPlanTotal] = useState(0)
  const [planLoading, setPlanLoading] = useState(false)
  const [planPage, setPlanPage] = useState(1)
  const [planPageSize, setPlanPageSize] = useState(20)
  const [planFilters, setPlanFilters] = useState<PlanFilters>({})
  const [planForm] = Form.useForm<PlanFilters>()

  const loadPlans = useCallback(async () => {
    setPlanLoading(true)
    try {
      const res = await listBenefitPlans({ page: planPage, size: planPageSize, ...planFilters })
      setPlans(res.records ?? [])
      setPlanTotal(res.total ?? 0)
    } catch {
      setPlans([])
    } finally {
      setPlanLoading(false)
    }
  }, [planPage, planPageSize, planFilters])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  /* ---------- 人員參保 ---------- */
  const [rows, setRows] = useState<PayrollEnrollment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<EnrollmentFilters>({
    employmentId: employmentIdFromQuery,
    activeOnly: true,
  })
  const [form] = Form.useForm<EnrollmentFilters>()

  const loadEnrollments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listEnrollments({
        page,
        size: pageSize,
        employmentId: filters.employmentId,
        planId: filters.planId,
        asOf: filters.asOf ? filters.asOf.format('YYYY-MM-DD') : undefined,
        activeOnly: filters.activeOnly,
      })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => {
    if (activeTab === 'enrollment') void loadEnrollments()
  }, [activeTab, loadEnrollments])

  const handleDeletePlan = (record: PayrollBenefitPlan) => {
    Modal.confirm({
      title: t('payroll.benefit.deletePlanConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('payroll.benefit.code')}：</span><b>{record.code}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.benefit.name')}：</span><b>{record.name}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteBenefitPlan(record.id as number)
        message.success(t('payroll.benefit.deletePlanSuccess'))
        void loadPlans()
      },
    })
  }

  const handleTogglePlan = (record: PayrollBenefitPlan) => {
    const nextStatus = record.status === 1 ? 0 : 1
    const actionText = nextStatus === 1 ? t('hcmOrg.enable') : t('hcmOrg.disable')
    Modal.confirm({
      title: t('hcmOrg.toggleConfirm', { action: actionText }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateBenefitPlan(record.id as number, { ...record, status: nextStatus })
        message.success(t('hcmOrg.toggleSuccess', { action: actionText }))
        void loadPlans()
      },
    })
  }

  const handleDeleteEnrollment = (record: PayrollEnrollment) => {
    Modal.confirm({
      title: t('payroll.enrollment.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('payroll.enrollment.person')}：</span><b>{record.personName || record.employmentId}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.enrollment.plan')}：</span><b>{record.planName || record.planId}</b></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteEnrollment(record.id as number)
        message.success(t('payroll.enrollment.deleteSuccess'))
        void loadEnrollments()
      },
    })
  }

  const planColumnMeta = useMemo(() => ([
    { key: 'code', title: t('payroll.benefit.code') },
    { key: 'name', title: t('payroll.benefit.name') },
    { key: 'planType', title: t('payroll.benefit.planType') },
    { key: 'jurisdiction', title: t('payroll.benefit.jurisdiction') },
    { key: 'ratio', title: t('payroll.benefit.ratio') },
    { key: 'baseRange', title: t('payroll.benefit.baseRange') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const planColumnsConfig = useColumnConfig('hcm-payroll-benefit-plan', planColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const planColumns: ColumnsType<PayrollBenefitPlan> = [
    { key: 'code', title: t('payroll.benefit.code'), dataIndex: 'code', width: 140 },
    { key: 'name', title: t('payroll.benefit.name'), dataIndex: 'name' },
    {
      key: 'planType', title: t('payroll.benefit.planType'), dataIndex: 'planType', width: 130,
      render: (value: string) => (
        <Tag color={PLAN_TYPE_COLOR[value] ?? 'default'}>
          {PLAN_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value}
        </Tag>
      ),
    },
    {
      key: 'jurisdiction', title: t('payroll.benefit.jurisdiction'), dataIndex: 'jurisdiction', width: 110,
      render: (value: string) => JURISDICTION_OPTIONS.find((item) => item.value === value)?.label ?? value,
    },
    {
      key: 'ratio', title: t('payroll.benefit.ratio'), width: 180,
      render: (_, record) => (
        <span>
          {t('payroll.benefit.employerShort')} {(Number(record.employerRatio) * 100).toFixed(2)}%
          {' / '}
          {t('payroll.benefit.employeeShort')} {(Number(record.employeeRatio) * 100).toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'baseRange', title: t('payroll.benefit.baseRange'), width: 190,
      render: (_, record) => (
        <span>
          {record.minBase ?? '-'} ~ {record.maxBase ?? '-'} {record.currency}
        </span>
      ),
    },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="green">{t('hcmOrg.enabled')}</Tag>
        : <Tag color="default">{t('hcmOrg.disabled')}</Tag>),
    },
    {
      key: 'action', title: t('common.action'), width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-payroll-benefit-plan-form?id=${record.id}`)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" onClick={() => handleTogglePlan(record)}>
            {record.status === 1 ? t('hcmOrg.disable') : t('hcmOrg.enable')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDeletePlan(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  const enrollmentColumnMeta = useMemo(() => ([
    { key: 'personName', title: t('payroll.enrollment.person') },
    { key: 'planName', title: t('payroll.enrollment.plan') },
    { key: 'baseAmount', title: t('payroll.enrollment.baseAmount') },
    { key: 'employeeAmount', title: t('payroll.enrollment.employeeAmount') },
    { key: 'employerAmount', title: t('payroll.enrollment.employerAmount') },
    { key: 'period', title: t('payroll.enrollment.period') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const enrollmentColumnsConfig = useColumnConfig('hcm-payroll-benefit-enrollment', enrollmentColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const enrollmentColumns: ColumnsType<PayrollEnrollment> = [
    {
      key: 'personName', title: t('payroll.enrollment.person'), width: 180,
      render: (_, record) => (
        <span>
          {record.personName || '-'}
          {record.personNo ? <span style={{ color: '#8c8c8c' }}>（{record.personNo}）</span> : null}
        </span>
      ),
    },
    {
      key: 'planName', title: t('payroll.enrollment.plan'), width: 200,
      render: (_, record) => (
        <span>
          {record.planName || '-'}
          {record.planType ? (
            <Tag style={{ marginLeft: 8 }} color={PLAN_TYPE_COLOR[record.planType] ?? 'default'}>
              {PLAN_TYPE_OPTIONS.find((item) => item.value === record.planType)?.label ?? record.planType}
            </Tag>
          ) : null}
        </span>
      ),
    },
    { key: 'baseAmount', title: t('payroll.enrollment.baseAmount'), width: 150,
      render: (_, record) => `${record.baseAmount} ${record.currency ?? ''}` },
    { key: 'employeeAmount', title: t('payroll.enrollment.employeeAmount'), dataIndex: 'employeeAmount', width: 140 },
    { key: 'employerAmount', title: t('payroll.enrollment.employerAmount'), dataIndex: 'employerAmount', width: 140 },
    {
      key: 'period', title: t('payroll.enrollment.period'), width: 220,
      render: (_, record) => (
        <span>
          {record.effectiveFrom} ~ {record.effectiveTo || <Tag color="blue">{t('payroll.standard.current')}</Tag>}
        </span>
      ),
    },
    {
      key: 'action', title: t('common.action'), width: 150, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button
            type="link" size="small"
            onClick={() => navigate(`/hcm-payroll-enrollment-form?id=${record.id}&employmentId=${record.employmentId}`)}
          >
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteEnrollment(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'plan',
            label: <span><SafetyCertificateOutlined /> {t('payroll.benefit.planTab')}</span>,
            children: (
              <>
                <div className="search-section">
                  <Form form={planForm} layout="vertical" onFinish={() => {
                    setPlanPage(1)
                    setPlanFilters(planForm.getFieldsValue())
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
                      <Form.Item name="keyword" label={t('hcmOrg.keyword')} style={{ marginBottom: 0 }}>
                        <Input placeholder={t('payroll.benefit.keywordPlaceholder')} allowClear />
                      </Form.Item>
                      <Form.Item name="planType" label={t('payroll.benefit.planType')} style={{ marginBottom: 0 }}>
                        <Select allowClear placeholder={t('hcmOrg.all')} options={[...PLAN_TYPE_OPTIONS]} />
                      </Form.Item>
                      <Form.Item name="jurisdiction" label={t('payroll.benefit.jurisdiction')} style={{ marginBottom: 0 }}>
                        <Select allowClear placeholder={t('hcmOrg.all')} options={[...JURISDICTION_OPTIONS]} />
                      </Form.Item>
                      <Form.Item style={{ marginBottom: 0 }}>
                        <div className="search-actions" style={{ paddingTop: 26 }}>
                          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
                          <Button icon={<ReloadOutlined />} onClick={() => {
                            planForm.resetFields()
                            setPlanPage(1)
                            setPlanFilters({})
                          }}>{t('common.reset')}</Button>
                        </div>
                      </Form.Item>
                    </div>
                  </Form>
                </div>

                <div className="action-section">
                  <div className="action-section-left" />
                  <div className="action-section-right">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/hcm-payroll-benefit-plan-form')}>
                      {t('payroll.benefit.addPlan')}
                    </Button>
                    {planColumnsConfig.configComponent}
                  </div>
                </div>

                <Table<PayrollBenefitPlan>
                  rowKey="id"
                  size="middle"
                  loading={planLoading}
                  columns={planColumnsConfig.applyConfig(planColumns) as ColumnsType<PayrollBenefitPlan>}
                  dataSource={plans}
                  scroll={{ x: 'max-content' }}
                  pagination={{
                    current: planPage,
                    pageSize: planPageSize,
                    total: planTotal,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (count) => t('common.total', { count }),
                    onChange: (nextPage, nextSize) => {
                      setPlanPage(nextSize !== planPageSize ? 1 : nextPage)
                      setPlanPageSize(nextSize || 20)
                    },
                  }}
                />
              </>
            ),
          },
          {
            key: 'enrollment',
            label: t('payroll.enrollment.tab'),
            children: (
              <>
                <div className="search-section">
                  <Form form={form} layout="vertical" initialValues={{ employmentId: employmentIdFromQuery, activeOnly: true }} onFinish={() => {
                    const values = form.getFieldsValue()
                    setPage(1)
                    setFilters({ ...values, employmentId: values.employmentId ? Number(values.employmentId) : undefined })
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
                      <Form.Item name="employmentId" label={t('payroll.enrollment.employmentId')}>
                        <Input type="number" placeholder={t('payroll.enrollment.employmentIdHint')} allowClear />
                      </Form.Item>
                      <Form.Item name="planId" label={t('payroll.enrollment.plan')}>
                        <Select
                          allowClear showSearch optionFilterProp="label"
                          placeholder={t('hcmOrg.all')}
                          options={plans.map((item) => ({ value: item.id as number, label: `${item.name}（${item.code}）` }))}
                        />
                      </Form.Item>
                      <Form.Item name="asOf" label={t('payroll.standard.asOf')}>
                        <DatePicker style={{ width: '100%' }} placeholder={t('payroll.standard.asOfHint')} />
                      </Form.Item>
                      <Form.Item style={{ marginBottom: 0 }}>
                        <div className="search-actions" style={{ paddingTop: 26 }}>
                          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
                          <Button icon={<ReloadOutlined />} onClick={() => {
                            form.resetFields()
                            setPage(1)
                            setFilters({ activeOnly: true })
                          }}>{t('common.reset')}</Button>
                        </div>
                      </Form.Item>
                    </div>
                  </Form>
                </div>

                <div className="action-section">
                  <div className="action-section-left">
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('payroll.enrollment.addHint')}</span>
                  </div>
                  <div className="action-section-right">
                    <Button
                      type="primary" icon={<PlusOutlined />}
                      onClick={() => {
                        const employmentId = filters.employmentId
                        navigate(`/hcm-payroll-enrollment-form${employmentId ? `?employmentId=${employmentId}` : ''}`)
                      }}
                    >
                      {t('payroll.enrollment.add')}
                    </Button>
                    {enrollmentColumnsConfig.configComponent}
                  </div>
                </div>

                <Table<PayrollEnrollment>
                  rowKey="id"
                  size="middle"
                  loading={loading}
                  columns={enrollmentColumnsConfig.applyConfig(enrollmentColumns) as ColumnsType<PayrollEnrollment>}
                  dataSource={rows}
                  scroll={{ x: 'max-content' }}
                  pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (count) => t('common.total', { count }),
                    onChange: (nextPage, nextSize) => {
                      setPage(nextSize !== pageSize ? 1 : nextPage)
                      setPageSize(nextSize || 20)
                    },
                  }}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  )
}
