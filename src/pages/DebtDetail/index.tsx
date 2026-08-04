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
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
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

/** 賬單狀態展示映射 */
const statusMeta: Record<string, { label: string; color: string }> = {
  unsettled: { label: '未結清', color: 'error' },
  settled: { label: '已結清', color: 'success' },
  transferred: { label: '已轉結', color: 'processing' },
}

/** 賬單來源展示映射（與欠款對賬列表配色一致） */
const sourceTagMap: Record<string, { label: string; color: string }> = {
  recharge: { label: '充值營業額扣款', color: 'blue' },
  merge: { label: '合併欠款轉入', color: 'purple' },
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
      message.success('删除成功')
    } catch (err) {
      if (!isBackendUnavailable(err)) {
        message.error(err instanceof Error ? err.message : '删除失敗')
        return
      }
      removeLocal()
      message.success('删除成功')
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
      message.error(`還款金額不能超過剩餘待還 ${fmtAmt(bill.remainAmount)}`)
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
      message.success('新增還款成功')
      setAddOpen(false)
      addForm.resetFields()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '新增還款失敗')
    } finally {
      setSubmitting(false)
    }
  }

  /** 列配置元數據 */
  const columnMeta = useMemo(() => [
    { key: 'date', title: '還款日期' },
    { key: 'channel', title: '還款渠道' },
    { key: 'amount', title: '還款金額' },
    { key: 'remark', title: '備註' },
    { key: 'operator', title: '操作人' },
    { key: 'operateTime', title: '操作時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('debt-detail', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<RepaymentRow> = [
    { title: '還款日期', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: '還款渠道', dataIndex: 'channel', key: 'channel', width: 130,
      render: (v: string) => <Tag color={channelColorMap[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '還款金額', dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 380 },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 110 },
    { title: '操作時間', dataIndex: 'operateTime', key: 'operateTime', width: 170 },
    {
      title: '操作', key: 'action', width: 80, align: 'center',
      render: (_, record) => (
        record.canDelete ? (
          <Popconfirm title="確認刪除該還款記錄？" onConfirm={() => handleDelete(record)} okText="確認" cancelText="取消">
            <Button type="link" size="small" danger>刪除</Button>
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
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/debt-reconcile')}>返回</Button>
          <span style={{ marginLeft: 16, color: '#8C8C8C' }}>{loading ? '加載中...' : '未找到對應欠款單'}</span>
        </div>
      </div>
    )
  }

  const status = statusMeta[bill.status] || { label: bill.status, color: 'default' }
  const sourceTag = sourceTagMap[bill.source] || { label: bill.source, color: 'default' }

  return (
    <div>
      {/* 頂部導航欄（全局詳情頁統一樣式） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        {/* 頂部漸變裝飾線 */}
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/debt-reconcile')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}
            >
              返回
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#262626' }}>還款信息</h2>
              <Tag color={status.color} style={{ margin: 0, fontSize: 12, padding: '2px 10px', borderRadius: 4, fontWeight: 500 }}>
                {status.label}
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {/* 欠款單信息 */}
      <div style={sectionStyle}>
        <SectionTitle icon={<FileTextOutlined />} title="欠款單信息" />
        <div style={gridStyle}>
          <InfoItem label="賬單編號" value={bill.billNo} valueStyle={{ fontWeight: 600 }} />
          <InfoItem label="關聯批次號" value={bill.batchNo} />
          <InfoItem label="流程編號" value={bill.flowNo} />
          <InfoItem label="賬單來源" value={<Tag color={sourceTag.color} style={{ margin: 0 }}>{sourceTag.label}</Tag>} />
          <InfoItem label="集團ID" value={bill.groupId} />
          <InfoItem label="集團名稱" value={bill.groupName} />
          <InfoItem label="所屬品牌" value={<BrandTag value={bill.brand} />} />
          <InfoItem label="門店ID" value={bill.storeId} />
          <InfoItem label="門店名稱" value={bill.storeName} />
          <InfoItem label="業務頻道" value={bill.channel} />
          <InfoItem label="歸屬BD" value={bill.bd || '--'} />
          <InfoItem label="借款日期" value={bill.loanDate} />
        </div>

        {/* 還款進度（帶動畫） */}
        <div style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', margin: '20px 0' }} />
        <div className="debt-detail-progress-card" style={{ marginBottom: 16 }}>
          <div className="debt-detail-progress-bar">
            <span className="debt-detail-progress-label">還款進度</span>
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
            <span className="debt-detail-stat-label">欠款總額</span>
          </div>
          <div
            className="debt-detail-stat-card"
            style={{ background: '#F6FFED', borderColor: 'rgba(82,196,26,0.13)' }}
          >
            <CheckCircleOutlined style={{ fontSize: 20, color: '#52C41A' }} />
            <span className="debt-detail-stat-value" style={{ color: '#52C41A' }}>
              <AnimatedAmount value={bill.paidAmount} />
            </span>
            <span className="debt-detail-stat-label">已還金額</span>
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
            <span className="debt-detail-stat-label">剩餘待還</span>
          </div>
        </div>
      </div>

      {/* 還款明細 */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <SectionTitle
          icon={<ProfileOutlined />}
          title="還款明細"
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
                新增還款
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
        title="新增還款"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAddSubmit}
        confirmLoading={submitting}
        okText="提交"
        cancelText="取消"
        destroyOnClose
        width={520}
      >
        <div style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 16 }}>
          剩餘待還：
          <span style={{ color: '#FF4D4F', fontWeight: 600 }}>{fmtAmt(bill.remainAmount)}</span>
        </div>
        <Form form={addForm} layout="vertical" requiredMark={false}>
          <Form.Item label="還款日期" name="date" rules={[{ required: true, message: '請選擇還款日期' }]}>
            <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} placeholder="請選擇還款日期" />
          </Form.Item>
          <Form.Item label="還款渠道" name="channel" rules={[{ required: true, message: '請選擇還款渠道' }]}>
            <Select placeholder="請選擇還款渠道" options={repayChannelOptions} />
          </Form.Item>
          <Form.Item
            label="還款金額"
            name="amount"
            rules={[
              { required: true, message: '請輸入還款金額' },
              {
                validator: (_, value) =>
                  value === undefined || value === null || Number(value) <= 0
                    ? Promise.reject(new Error('還款金額必須大於 0'))
                    : Number(value) > bill.remainAmount
                      ? Promise.reject(new Error(`還款金額不能超過剩餘待還 ${fmtAmt(bill.remainAmount)}`))
                      : Promise.resolve(),
              },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="請輸入還款金額"
              min={0.01}
              max={bill.remainAmount}
              precision={2}
              step={100}
            />
          </Form.Item>
          <Form.Item label="備註" name="remark">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="請輸入備註（選填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
