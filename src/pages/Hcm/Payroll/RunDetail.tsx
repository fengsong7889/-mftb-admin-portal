/**
 * 核算批次详情与工资单（/hcm-payroll-run-detail?id=xxx）
 *
 * 一张表看全批人，点开抽屉看单人明细（应发 / 个人社保 / 雇主社保 / 个税）。
 * 锁定后整批只读，页面不提供任何改数入口——工资单一经锁定就是凭证。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Descriptions, Drawer, Modal, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AccountBookOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  calculatePayrollRun,
  getPayrollRun,
  getPayslipDetail,
  listPayslips,
  lockPayrollRun,
  type PayrollPayslip,
  type PayrollPayslipDetail,
  type PayrollRun,
} from '../../../api/payroll'
import { CardTitle, FormHeader, cardStyle } from '../Organization/shared'

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CALCULATED: 'blue',
  LOCKED: 'green',
}

export default function HcmPayrollRunDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const runId = params.get('id') ? Number(params.get('id')) : null

  const [run, setRun] = useState<PayrollRun | null>(null)
  const [rows, setRows] = useState<PayrollPayslip[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detail, setDetail] = useState<PayrollPayslipDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadRun = useCallback(async () => {
    if (!runId) return
    setRun(await getPayrollRun(runId))
  }, [runId])

  const loadPayslips = useCallback(async () => {
    if (!runId) return
    setLoading(true)
    try {
      const res = await listPayslips(runId, { page, size: pageSize })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [runId, page, pageSize])

  useEffect(() => {
    void loadRun()
    void loadPayslips()
  }, [loadRun, loadPayslips])

  const openDetail = async (record: PayrollPayslip) => {
    const res = await getPayslipDetail(record.id as number)
    setDetail(res)
    setDetailOpen(true)
  }

  const handleCalculate = async () => {
    if (!runId) return
    setBusy(true)
    try {
      const next = await calculatePayrollRun(runId)
      if (next?.warnings) {
        Modal.info({ title: t('payroll.run.warningTitle'), content: next.warnings })
      } else {
        message.success(t('payroll.run.calculateSuccess'))
      }
      await loadRun()
      await loadPayslips()
    } finally {
      setBusy(false)
    }
  }

  const handleLock = async () => {
    if (!runId) return
    setBusy(true)
    try {
      await lockPayrollRun(runId)
      message.success(t('payroll.run.lockSuccess'))
      await loadRun()
      await loadPayslips()
    } finally {
      setBusy(false)
    }
  }

  const columns: ColumnsType<PayrollPayslip> = [
    {
      key: 'person', title: t('payroll.enrollment.person'), width: 200,
      render: (_, record) => (
        <span>
          {record.personName || '-'}
          {record.personNo ? <span style={{ color: '#8c8c8c' }}>（{record.personNo}）</span> : null}
        </span>
      ),
    },
    { key: 'employmentNo', title: t('hcmPerson.employmentNo'), dataIndex: 'employmentNo', width: 150,
      render: (value: string) => value || '-' },
    {
      key: 'grossAmount', title: t('payroll.run.gross'), width: 140,
      render: (_, record) => `${record.grossAmount} ${record.currency ?? ''}`,
    },
    { key: 'deductionAmount', title: t('payroll.run.deduction'), dataIndex: 'deductionAmount', width: 130 },
    { key: 'taxAmount', title: t('payroll.run.tax'), dataIndex: 'taxAmount', width: 110 },
    { key: 'employerCostAmount', title: t('payroll.run.employerCost'), dataIndex: 'employerCostAmount', width: 140 },
    {
      key: 'netAmount', title: t('payroll.run.net'), dataIndex: 'netAmount', width: 140,
      render: (value: string) => <b>{value}</b>,
    },
    {
      key: 'action', title: t('common.action'), width: 110, fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => openDetail(record)}>
          {t('payroll.run.viewDetail')}
        </Button>
      ),
    },
  ]

  const itemColumns: ColumnsType<PayrollPayslipDetail['items'][number]> = [
    { key: 'itemName', title: t('payroll.run.itemName'), dataIndex: 'itemName' },
    {
      key: 'itemType', title: t('payroll.run.itemType'), dataIndex: 'itemType', width: 170,
      render: (value: string) => t(`payroll.run.itemTypeMap.${value}`, { defaultValue: value }),
    },
    {
      key: 'taxable', title: t('payroll.component.taxable'), dataIndex: 'taxable', width: 100,
      render: (value: number) => (value === 1
        ? <Tag color="blue">{t('payroll.component.taxableYes')}</Tag>
        : <Tag>{t('payroll.component.taxableNo')}</Tag>),
    },
    { key: 'amount', title: t('payroll.run.amount'), dataIndex: 'amount', width: 150 },
  ]

  if (!runId) {
    return (
      <div className="content-area">
        <Alert type="warning" showIcon message={t('payroll.run.missingId')} />
      </div>
    )
  }

  return (
    <div className="content-area">
      <FormHeader
        title={t('payroll.run.detailTitle')}
        onBack={() => navigate('/hcm-payroll-run')}
        extra={(
          <>
            <Button
              icon={<AccountBookOutlined />}
              loading={busy}
              disabled={run?.status === 'LOCKED'}
              onClick={handleCalculate}
            >
              {t('payroll.run.calculate')}
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={run?.status !== 'CALCULATED'}
              onClick={handleLock}
            >
              {t('payroll.run.lock')}
            </Button>
          </>
        )}
      />

      <div style={cardStyle}>
        <CardTitle icon={<AccountBookOutlined />} title={t('payroll.run.summary')} />
        <Descriptions size="small" column={3} bordered>
          <Descriptions.Item label={t('payroll.run.period')}>{run?.period ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('payroll.run.cityCode')}>{run?.cityCode ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('payroll.component.currency')}>{run?.currency ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hcmOrg.status')}>
            <Tag color={STATUS_COLOR[run?.status ?? ''] ?? 'default'}>
              {t(`payroll.run.status.${run?.status}`, { defaultValue: run?.status })}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('payroll.run.calculatedAt')}>{run?.calculatedAt || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('payroll.run.lockedAt')}>{run?.lockedAt || '-'}</Descriptions.Item>
        </Descriptions>
        {run?.warnings ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={t('payroll.run.warningTitle')}
            description={<div style={{ whiteSpace: 'pre-wrap' }}>{run.warnings}</div>}
          />
        ) : null}
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <CardTitle icon={<AccountBookOutlined />} title={t('payroll.run.payslipSection')} />
        <Table<PayrollPayslip>
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
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
      </div>

      <Drawer
        title={t('payroll.run.payslipDetailTitle')}
        width={720}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail ? (
          <>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label={t('payroll.enrollment.person')}>
                {detail.payslip.personName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('hcmPerson.employmentNo')}>
                {detail.payslip.employmentNo || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('payroll.run.gross')}>
                {detail.payslip.grossAmount} {detail.payslip.currency}
              </Descriptions.Item>
              <Descriptions.Item label={t('payroll.run.deduction')}>
                {detail.payslip.deductionAmount}
              </Descriptions.Item>
              <Descriptions.Item label={t('payroll.run.taxableBase')}>
                {detail.payslip.taxableBase}
              </Descriptions.Item>
              <Descriptions.Item label={t('payroll.run.tax')}>{detail.payslip.taxAmount}</Descriptions.Item>
              <Descriptions.Item label={t('payroll.run.employerCost')}>
                {detail.payslip.employerCostAmount}
              </Descriptions.Item>
              <Descriptions.Item label={t('payroll.run.net')}>
                <b>{detail.payslip.netAmount}</b>
              </Descriptions.Item>
            </Descriptions>
            <Table
              style={{ marginTop: 16 }}
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={detail.items}
              pagination={false}
            />
          </>
        ) : null}
      </Drawer>
    </div>
  )
}
