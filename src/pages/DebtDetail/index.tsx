import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button, Table, Tag, Progress, Popconfirm, message, Modal, Form, Select, InputNumber, DatePicker, Input } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  FileTextOutlined,
  ProfileOutlined,
  WalletOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { isBackendUnavailable } from '../../api/request'
import type { DebtRepaymentRecord } from '../../utils/approvalStore'
import { addDebtRepayment, removeDebtRepayment } from '../../utils/approvalStore'
import {
  addFinDebtRepayment,
  deleteFinDebtRepayment,
  fetchFinDebtDetail,
} from '../../api/finance'
import type { DebtRepaymentPayload, FinDebtBill, FinDebtRepayment } from '../../api/finance'
import { getAllDebtBills } from '../DebtReconcile/mockBills'

/** 格式化金額（千分位 + 兩位小數） */
const fmtAmt = (val: number) => val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 保留兩位小數 */
const r2 = (n: number) => Math.round(n * 100) / 100

/* ---- 數字加載動畫（遵循數據指標統計卡標準 12.1） ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(r2(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

function AnimatedAmount({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{fmtAmt(animated)}</>
}

/* ---- 進度條動畫 Hook：從 0 漸增到目標百分比 ---- */
function useAnimatedProgress(target: number, duration = 1400) {
  const [percent, setPercent] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setPercent(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    // 延遲 300ms 啟動，等待頁面渲染完成
    const timer = setTimeout(() => {
      rafRef.current = requestAnimationFrame(animate)
    }, 300)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])
  return percent
}

/** 賬單狀態展示映射（label 為 i18n key） */
const statusMeta: Record<string, { labelKey: string; color: string }> = {
  unsettled: { labelKey: 'debtReconcile.statusUnsettled', color: 'error' },
  settled: { labelKey: 'debtReconcile.statusSettled', color: 'success' },
  transferred: { labelKey: 'debtReconcile.statusTransferred', color: 'processing' },
}

/** 賬單來源展示映射（label 為 i18n key，與欠款對賬列表配色一致） */
const sourceTagMap: Record<string, { labelKey: string; color: string }> = {
  recharge: { labelKey: 'debtReconcile.sourceRecharge', color: 'blue' },
  merge: { labelKey: 'debtReconcile.sourceMerge', color: 'purple' },
}

/** 還款渠道 Tag 配色 */
const channelColorMap: Record<string, string> = {
  推廣金扣款: 'blue',
  營業額扣款: 'orange',
  對公轉賬: 'green',
  轉移結算: 'purple',
}

/** 詳情頁區塊容器（全局統一：白底 + 圓角 8 + 陰影） */
const sectionStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 四列信息網格（全局統一：標籤在上、值在下） */
const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px',
}

/** 標籤值展示項（全局統一：標籤在上、值在下） */
function InfoItem({ label, value, valueStyle }: { label: string; value: React.ReactNode; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#262626', fontWeight: 500, ...valueStyle }}>{value}</div>
    </div>
  )
}

/** 版塊標題（全局統一：左側色條 + 圖標 + 虛線分隔，支持右側操作區） */
function SectionTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
      paddingBottom: 12, borderBottom: '1px dashed rgba(0,0,0,0.08)',
    }}>
      <div style={{ width: 6, height: 20, borderRadius: 3, background: '#E8720C' }} />
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#E8720C' }}>{icon}</span>
        {title}
      </h3>
      {extra && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{extra}</div>}
    </div>
  )
}

/** 還款明細行（後端記錄帶 id，本地降級記錄僅有 key） */
type RepaymentRow = DebtRepaymentRecord & { id?: number }

/** 還款明細转表格行（本地記錄保留原 key，便於降級刪除定位） */
function toRows(repayments?: FinDebtRepayment[]): RepaymentRow[] {
  return (repayments ?? []).map((r, i) => {
    const localKey = (r as { key?: string }).key
    return { ...r, key: localKey || String(r.id ?? `repay_${i}`) }
  })
}

/** 新增扣款渠道選項（轉移結算由商戶合併自动生成，不可手动選擇） */
const repayChannelOptions = [
  { label: '推廣金扣款', value: '推廣金扣款' },
  { label: '營業額扣款', value: '營業額扣款' },
  { label: '對公轉賬', value: '對公轉賬' },
]

/** 新增扣款表單 */
interface RepayFormValues {
  date?: Dayjs
  channel: string
  amount: number
  remark?: string
}

export default function DebtDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const billNoParam = searchParams.get('billNo') || ''

  /** 後端不可用時按賬單編號定位本地欠款單（未匹配時取第一條演示） */
  const fallbackBill = useCallback((): FinDebtBill | null => {
    const all = getAllDebtBills()
    return all.find(b => b.billNo === billNoParam) || all[0] || null
  }, [billNoParam])

  const [bill, setBill] = useState<FinDebtBill | null>(null)
  const [data, setData] = useState<RepaymentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addForm] = Form.useForm<RepayFormValues>()

  /** 加載欠款單詳情（後端優先，不可用時降級本地） */
  const loadBill = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchFinDebtDetail(billNoParam).catch(() => null)
      const target = res || fallbackBill()
      setBill(target)
      setData(toRows(target?.repayments))
    } finally {
      setLoading(false)
    }
  }, [billNoParam, fallbackBill])

  useEffect(() => {
    void loadBill()
  }, [loadBill])

  /** 還款進度百分比 */
  const progressPercent = bill && bill.debtTotal > 0
    ? Math.round((bill.paidAmount / bill.debtTotal) * 100)
    : 0

  /** 進度條動畫（從 0 漸增） */
  const animatedPercent = useAnimatedProgress(progressPercent)

  /** 删除還款記錄（後端優先，不可用時降級本地） */
  const handleDelete = async (record: RepaymentRow) => {
    if (!bill) return
    const removeLocal = () => {
      const updated = removeDebtRepayment(bill.billNo, record.key)
      if (updated) {
        setBill(updated)
        setData(toRows(updated.repayments))
      } else {
        setData(prev => prev.filter(r => r.key !== record.key))
      }
    }
    try {
      if (record.id) {
        await deleteFinDebtRepayment(record.id)
        await loadBill()
      } else {
        removeLocal()
      }
      message.success(t('debtDetail.deleteSuccess'))
    } catch (err) {
      if (!isBackendUnavailable(err)) {
        message.error(err instanceof Error ? err.message : t('debtDetail.deleteFailed'))
        return
      }
      removeLocal()
      message.success(t('debtDetail.deleteSuccess'))
    }
  }

  /** 提交新增還款 */
  const handleAddSubmit = async () => {
    if (!bill) return
    let values: RepayFormValues
    try {
      values = await addForm.validateFields()
    } catch {
      return
    }
    const amount = r2(Number(values.amount))
    if (amount > bill.remainAmount) {
      message.error(t('debtDetail.amountExceedRemain', { amount: fmtAmt(bill.remainAmount) }))
      return
    }
    const date = (values.date || dayjs()).format('YYYY-MM-DD')
    const payload: DebtRepaymentPayload = {
      date,
      channel: values.channel,
      amount,
      remark: values.remark?.trim() || undefined,
    }
    /** 後端不可用時寫入本地（靜態演示賬單僅更新當前頁面） */
    const addLocal = () => {
      const operator = user ? `${user.name}(${user.empId})` : '--'
      const operateTime = dayjs().format('YYYY-MM-DD HH:mm:ss')
      const repayment = {
        date,
        channel: payload.channel,
        amount,
        remark: payload.remark || '',
        operator,
        operateTime,
        canDelete: true,
      }
      const updated = addDebtRepayment(bill.billNo, repayment)
      if (updated) {
        setBill(updated)
        setData(toRows(updated.repayments))
        return
      }
      const remainAmount = r2(Math.max(0, bill.remainAmount - amount))
      setData(prev => [...prev, { ...repayment, key: `repay_${Date.now()}` }])
      setBill({
        ...bill,
        paidAmount: r2(bill.paidAmount + amount),
        remainAmount,
        status: remainAmount <= 0 ? 'settled' : 'unsettled',
      })
    }
    setSubmitting(true)
    try {
      try {
        await addFinDebtRepayment(bill.billNo, payload)
        await loadBill()
      } catch (err) {
        if (!isBackendUnavailable(err)) throw err
        addLocal()
      }
      message.success(t('debtDetail.addSuccess'))
      setAddOpen(false)
      addForm.resetFields()
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('debtDetail.addFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  /** 列配置元數據 */
  const columnMeta = useMemo(() => [
    { key: 'date', title: t('debtDetail.colRepayDate') },
    { key: 'channel', title: t('debtDetail.colRepayChannel') },
    { key: 'amount', title: t('debtDetail.colRepayAmount') },
    { key: 'remark', title: t('debtDetail.colRemarkShort') },
    { key: 'operator', title: t('debtDetail.colOperator') },
    { key: 'operateTime', title: t('debtDetail.colOperateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('debt-detail', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<RepaymentRow> = [
    { title: t('debtDetail.colRepayDate'), dataIndex: 'date', key: 'date', width: 120 },
    {
      title: t('debtDetail.colRepayChannel'), dataIndex: 'channel', key: 'channel', width: 130,
      render: (v: string) => <Tag color={channelColorMap[v] || 'default'}>{v}</Tag>,
    },
    {
      title: t('debtDetail.colRepayAmount'), dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    { title: t('debtDetail.colRemarkShort'), dataIndex: 'remark', key: 'remark', width: 380 },
    { title: t('debtDetail.colOperator'), dataIndex: 'operator', key: 'operator', width: 110 },
    { title: t('debtDetail.colOperateTime'), dataIndex: 'operateTime', key: 'operateTime', width: 180, render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-' },
    {
      title: t('common.colAction'), key: 'action', width: 80, align: 'center',
      render: (_, record) => (
        record.canDelete ? (
          <Popconfirm title={t('debtDetail.deleteConfirm')} onConfirm={() => handleDelete(record)} okText={t('debtDetail.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('debtDetail.delete')}</Button>
          </Popconfirm>
        ) : (
          <span style={{ color: '#999' }}>--</span>
        )
      ),
    },
  ]

  if (!bill) {
    return (
      <div>
        <div style={sectionStyle}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/debt-reconcile')}>{t('common.back')}</Button>
          <span style={{ marginLeft: 16, color: '#8C8C8C' }}>{loading ? t('common.loading') : t('debtDetail.notFound')}</span>
        </div>
      </div>
    )
  }

  const status = statusMeta[bill.status] || { labelKey: '', color: 'default' }
  const sourceTag = sourceTagMap[bill.source] || { labelKey: '', color: 'default' }

  return (
    <div>
      {/* 頂部導航欄（全局詳情頁統一規範：紫色頂條 + 橙色返回；無編輯頁，不展示編輯按鈕） */}
      <DetailPageHeader
        title={t('debtDetail.pageTitle')}
        tags={
          <Tag color={status.color} style={{ margin: 0, fontSize: 12, padding: '2px 10px', borderRadius: 4, fontWeight: 500 }}>
            {t(status.labelKey)}
          </Tag>
        }
        onBack={() => navigate('/debt-reconcile')}
      />

      {/* 欠款單信息 */}
      <div style={sectionStyle}>
        <SectionTitle icon={<FileTextOutlined />} title={t('debtDetail.billInfoTitle')} />
        <div style={gridStyle}>
          <InfoItem label={t('debtReconcile.colBillNo')} value={bill.billNo} valueStyle={{ fontWeight: 600 }} />
          <InfoItem label={t('common.colBatchNo')} value={bill.batchNo} />
          <InfoItem label={t('common.colFlowNo')} value={bill.flowNo === 'DIRECT-EXEC' ? '未經審批' : bill.flowNo} />
          <InfoItem label={t('debtReconcile.colSource')} value={<Tag color={sourceTag.color} style={{ margin: 0 }}>{t(sourceTag.labelKey)}</Tag>} />
          <InfoItem label={t('common.colGroupId')} value={bill.groupId} />
          <InfoItem label={t('common.colGroupName')} value={bill.groupName} />
          <InfoItem label={t('common.colBrand')} value={<BrandTag value={bill.brand} />} />
          <InfoItem label={t('common.colStoreId')} value={bill.storeId} />
          <InfoItem label={t('common.colStoreName')} value={bill.storeName} />
          <InfoItem label={t('common.colChannel')} value={bill.channel} />
          <InfoItem label={t('common.colBd')} value={bill.bd || '--'} />
          <InfoItem label={t('debtReconcile.colLoanDate')} value={bill.loanDate} />
        </div>

        {/* 還款進度（帶動畫） */}
        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', margin: '20px 0' }} />
        <div className="debt-detail-progress-card" style={{ marginBottom: 16 }}>
          <div className="debt-detail-progress-bar">
            <span className="debt-detail-progress-label">{t('debtDetail.progressLabel')}</span>
            <Progress
              percent={animatedPercent}
              strokeColor={{ from: '#52C41A', to: '#73D13D' }}
              trailColor="#E8E8E8"
              showInfo={true}
              format={(p) => `${p}%`}
              className="debt-detail-progress"
              size={['100%', 12]}
            />
          </div>
        </div>

        {/* 三組關鍵指標（遵循 12.1 數據指標統計卡標準） */}
        <div className="debt-detail-stat-cards" key={`stats-${bill.billNo}`}>
          <div
            className="debt-detail-stat-card"
            style={{ background: '#FFF7E6', borderColor: 'rgba(232,114,12,0.13)' }}
          >
            <WalletOutlined style={{ fontSize: 20, color: '#E8720C' }} />
            <span className="debt-detail-stat-value" style={{ color: '#E8720C' }}>
              <AnimatedAmount value={bill.debtTotal} />
            </span>
            <span className="debt-detail-stat-label">{t('debtDetail.statDebtTotal')}</span>
          </div>
          <div
            className="debt-detail-stat-card"
            style={{ background: '#F6FFED', borderColor: 'rgba(82,196,26,0.13)' }}
          >
            <CheckCircleOutlined style={{ fontSize: 20, color: '#52C41A' }} />
            <span className="debt-detail-stat-value" style={{ color: '#52C41A' }}>
              <AnimatedAmount value={bill.paidAmount} />
            </span>
            <span className="debt-detail-stat-label">{t('debtDetail.statPaidAmount')}</span>
          </div>
          <div
            className="debt-detail-stat-card"
            style={{
              background: bill.remainAmount > 0 ? '#FFEBEE' : '#F6FFED',
              borderColor: bill.remainAmount > 0 ? 'rgba(255,77,79,0.13)' : 'rgba(82,196,26,0.13)',
            }}
          >
            <ClockCircleOutlined style={{ fontSize: 20, color: bill.remainAmount > 0 ? '#FF4D4F' : '#52C41A' }} />
            <span className="debt-detail-stat-value" style={{ color: bill.remainAmount > 0 ? '#FF4D4F' : '#52C41A' }}>
              <AnimatedAmount value={bill.remainAmount} />
            </span>
            <span className="debt-detail-stat-label">{t('debtDetail.statRemainAmount')}</span>
          </div>
        </div>
      </div>

      {/* 還款明細 */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <SectionTitle
          icon={<ProfileOutlined />}
          title={t('debtDetail.repayListTitle')}
          extra={
            <>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={bill.status === 'transferred' || bill.remainAmount <= 0}
                onClick={() => {
                  addForm.resetFields()
                  addForm.setFieldsValue({ date: dayjs() })
                  setAddOpen(true)
                }}
              >
                {t('debtDetail.addRepay')}
              </Button>
              {configComponent}
            </>
          }
        />
        <Table<RepaymentRow>
          columns={applyConfig(columns)}
          dataSource={data}
          loading={loading}
          pagination={false}
          size="middle"
          bordered={false}
          scroll={{ x: 1120 }}
        />
      </div>

      {/* 新增還款彈窗 */}
      <Modal
        title={t('debtDetail.addRepay')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAddSubmit}
        confirmLoading={submitting}
        okText={t('debtDetail.submit')}
        cancelText={t('common.cancel')}
        destroyOnClose
        width={520}
      >
        <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 16 }}>
          {t('debtDetail.remainAmountPrefix')}
          <span style={{ color: '#FF4D4F', fontWeight: 600 }}>{fmtAmt(bill.remainAmount)}</span>
        </div>
        <Form form={addForm} layout="vertical" requiredMark={false}>
          <Form.Item label={t('debtDetail.repayDateLabel')} name="date" rules={[{ required: true, message: t('debtDetail.selectRepayDate') }]}>
            <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} placeholder={t('debtDetail.selectRepayDate')} />
          </Form.Item>
          <Form.Item label={t('debtDetail.repayChannelLabel')} name="channel" rules={[{ required: true, message: t('debtDetail.selectRepayChannel') }]}>
            <Select placeholder={t('debtDetail.selectRepayChannel')} options={repayChannelOptions} />
          </Form.Item>
          <Form.Item
            label={t('debtDetail.repayAmountLabel')}
            name="amount"
            rules={[
              { required: true, message: t('debtDetail.inputRepayAmount') },
              {
                validator: (_, value) =>
                  value === undefined || value === null || Number(value) <= 0
                    ? Promise.reject(new Error(t('debtDetail.amountGreaterZero')))
                    : Number(value) > bill.remainAmount
                      ? Promise.reject(new Error(t('debtDetail.amountExceedRemain', { amount: fmtAmt(bill.remainAmount) })))
                      : Promise.resolve(),
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder={t('debtDetail.inputRepayAmount')}
              min={0.01}
              max={bill.remainAmount}
              precision={2}
              step={100}
            />
          </Form.Item>
          <Form.Item label={t('debtDetail.remarkLabel')} name="remark">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder={t('debtDetail.remarkPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )

}
