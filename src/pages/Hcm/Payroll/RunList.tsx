/**
 * 薪酬核算批次（/hcm-payroll-run）
 *
 * 一个批次 = 一个城市一个工资月。流程固定为 建批 → 试算 → 锁定：
 * 试算可反复做，锁定后不可重算（已发工资不能因后续调薪而变数）。
 * 缺薪酬标准会整批拒绝，页面把服务端给出的缺失清单原样展示，不做二次包装。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AccountBookOutlined,
  CalculatorOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  calculatePayrollRun,
  createPayrollRun,
  deletePayrollRun,
  listPayrollRuns,
  lockPayrollRun,
  type PayrollRun,
} from '../../../api/payroll'

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CALCULATED: 'blue',
  LOCKED: 'green',
}

interface Filters { period?: Dayjs; cityCode?: string; status?: string }
interface CreateFormValues { period: Dayjs; cityCode: string; remark?: string }

export default function HcmPayrollRunList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<PayrollRun[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<Filters>({})
  const [form] = Form.useForm<Filters>()
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<CreateFormValues>()
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listPayrollRuns({
        page,
        size: pageSize,
        period: filters.period ? filters.period.format('YYYY-MM') : undefined,
        cityCode: filters.cityCode,
        status: filters.status,
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
    void loadData()
  }, [loadData])

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    setCreating(true)
    try {
      await createPayrollRun({
        period: values.period.format('YYYY-MM'),
        cityCode: values.cityCode.trim(),
        remark: values.remark,
      })
      message.success(t('payroll.run.createSuccess'))
      setCreateOpen(false)
      createForm.resetFields()
      void loadData()
    } finally {
      setCreating(false)
    }
  }

  const handleCalculate = async (record: PayrollRun) => {
    setBusyId(record.id as number)
    try {
      const run = await calculatePayrollRun(record.id as number)
      if (run?.warnings) {
        Modal.info({
          title: t('payroll.run.warningTitle'),
          content: <div style={{ whiteSpace: 'pre-wrap' }}>{run.warnings}</div>,
          okText: t('common.confirm'),
        })
      } else {
        message.success(t('payroll.run.calculateSuccess'))
      }
      void loadData()
    } finally {
      setBusyId(null)
    }
  }

  const handleLock = (record: PayrollRun) => {
    Modal.confirm({
      title: t('payroll.run.lockConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('payroll.run.period')}：</span><b>{record.period}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.run.cityCode')}：</span><b>{record.cityCode}</b></div>
          <div className="confirm-info-row"><span>{t('payroll.run.lockHint')}</span></div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await lockPayrollRun(record.id as number)
        message.success(t('payroll.run.lockSuccess'))
        void loadData()
      },
    })
  }

  const handleDelete = (record: PayrollRun) => {
    Modal.confirm({
      title: t('payroll.run.deleteConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deletePayrollRun(record.id as number)
        message.success(t('payroll.run.deleteSuccess'))
        void loadData()
      },
    })
  }

  const columnMeta = useMemo(() => ([
    { key: 'period', title: t('payroll.run.period') },
    { key: 'cityCode', title: t('payroll.run.cityCode') },
    { key: 'currency', title: t('payroll.component.currency') },
    { key: 'status', title: t('hcmOrg.status') },
    { key: 'calculatedAt', title: t('payroll.run.calculatedAt') },
    { key: 'action', title: t('common.action') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('hcm-payroll-run', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<PayrollRun> = [
    { key: 'period', title: t('payroll.run.period'), dataIndex: 'period', width: 120 },
    { key: 'cityCode', title: t('payroll.run.cityCode'), dataIndex: 'cityCode', width: 120 },
    { key: 'currency', title: t('payroll.component.currency'), dataIndex: 'currency', width: 100 },
    {
      key: 'status', title: t('hcmOrg.status'), dataIndex: 'status', width: 130,
      render: (value: string) => (
        <Tag color={STATUS_COLOR[value] ?? 'default'}>
          {t(`payroll.run.status.${value}`, { defaultValue: value })}
        </Tag>
      ),
    },
    {
      key: 'calculatedAt', title: t('payroll.run.calculatedAt'), dataIndex: 'calculatedAt', width: 190,
      render: (value: string | null) => value || '-',
    },
    {
      key: 'action', title: t('common.action'), width: 320, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button
            type="link" size="small" icon={<CalculatorOutlined />}
            disabled={record.status === 'LOCKED'}
            loading={busyId === record.id}
            onClick={() => handleCalculate(record)}
          >
            {t('payroll.run.calculate')}
          </Button>
          <Button
            type="link" size="small" icon={<LockOutlined />}
            disabled={record.status !== 'CALCULATED'}
            onClick={() => handleLock(record)}
          >
            {t('payroll.run.lock')}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/hcm-payroll-run-detail?id=${record.id}`)}>
            {t('payroll.run.payslips')}
          </Button>
          {record.warnings ? (
            <Tooltip title={record.warnings}>
              <Button type="link" size="small">{t('payroll.run.warning')}</Button>
            </Tooltip>
          ) : null}
          <Button
            type="link" size="small" danger
            disabled={record.status !== 'DRAFT'}
            onClick={() => handleDelete(record)}
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="vertical" onFinish={() => {
          setPage(1)
          setFilters(form.getFieldsValue())
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item name="period" label={t('payroll.run.period')} style={{ marginBottom: 0 }}>
              <DatePicker picker="month" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="cityCode" label={t('payroll.run.cityCode')} style={{ marginBottom: 0 }}>
              <Input placeholder="4403" allowClear />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} style={{ marginBottom: 0 }}>
              <Select
                allowClear placeholder={t('hcmOrg.all')}
                options={['DRAFT', 'CALCULATED', 'LOCKED'].map((value) => ({
                  value, label: t(`payroll.run.status.${value}`),
                }))}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <div className="search-actions" style={{ paddingTop: 26 }}>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
                <Button icon={<ReloadOutlined />} onClick={() => {
                  form.resetFields()
                  setPage(1)
                  setFilters({})
                }}>{t('common.reset')}</Button>
              </div>
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            <AccountBookOutlined /> {t('payroll.run.flowHint')}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('payroll.run.add')}
          </Button>
          {configComponent}
        </div>
      </div>

      <Table<PayrollRun>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns) as ColumnsType<PayrollRun>}
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

      <Modal
        title={t('payroll.run.add')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('payroll.run.createHint')}
        />
        <Form form={createForm} layout="vertical">
          <Form.Item name="period" label={t('payroll.run.period')} rules={[{ required: true, message: t('payroll.run.periodRequired') }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cityCode" label={t('payroll.run.cityCode')} rules={[{ required: true, message: t('payroll.run.cityRequired') }]} extra={t('payroll.run.cityHint')}>
            <Input maxLength={16} placeholder="4403" />
          </Form.Item>
          <Form.Item name="remark" label={t('hcmOrg.remark')}>
            <Input maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
