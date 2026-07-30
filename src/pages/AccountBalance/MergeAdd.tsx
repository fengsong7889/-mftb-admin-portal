import { useState, useEffect, useRef } from 'react'
import { Form, Input, Select, Button, Upload, message, InputNumber, Tag, Table } from 'antd'
import {
  ArrowLeftOutlined,
  SendOutlined,
  UploadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  AccountBookOutlined,
  DollarOutlined,
  FileProtectOutlined,
  EditOutlined,
  MergeCellsOutlined,
  WalletOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  PayCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { addApprovalRecord, generateFlowNo, formatNow } from '../../utils/approvalStore'
import BrandTag from '../../components/BrandTag'

/* ---- 數字動畫 Hook（遵循數據指標統計卡標準） ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

function AnimatedNumber({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const animated = useCountUp(value)
  return <>{prefix}{animated.toLocaleString()}{suffix}</>
}

/** 品牌選項 */
const brandOptions = [
  { label: '閃蜂', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
]

/** 集團選項（Mock） */
const allGroupOptions = [
  { label: '20261298121911 - 亞述集團', value: '20261298121911', name: '亞述集團', brand: 'mFood' },
  { label: '20261298121912 - 廣州酒家', value: '20261298121912', name: '廣州酒家', brand: 'mFood' },
  { label: '20261298121913 - 海底撈', value: '20261298121913', name: '海底撈', brand: 'mFood' },
  { label: '20261298121914 - 閃蜂科技', value: '20261298121914', name: '閃蜂科技', brand: 'flashBee' },
  { label: '20261298121915 - 金龍餐飲', value: '20261298121915', name: '金龍餐飲', brand: 'flashBee' },
]

/** 門店選項（Mock，含歸屬BD） */
const storeOptions = [
  { label: '廣州酒店天河廣場1號店(1234567890)', value: '1234567890', bd: '關山月(001)' },
  { label: '廣州酒店越秀領展2號店(2345678910)', value: '2345678910', bd: '古月(002)' },
  { label: '廣州酒店琶洲保利3號店(3456789012)', value: '3456789012', bd: '浩遠(003)' },
  { label: '廣州酒店白雲萬達4號店(4567890123)', value: '4567890123', bd: '關山月(001)' },
]

/** 償還門店行 */
interface RepayStoreRow {
  key: string
  storeId: string
  storeLabel: string
  amount: number
  bd: string
}

export default function MergeAdd() {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [sourceBrand, setSourceBrand] = useState<string | undefined>(undefined)
  const [sourceGroupId, setSourceGroupId] = useState<string | undefined>(undefined)
  const [targetBrand, setTargetBrand] = useState<string | undefined>(undefined)
  const [targetGroupId, setTargetGroupId] = useState<string | undefined>(undefined)
  const [certificateFiles, setCertificateFiles] = useState<any[]>([])
  const [repayRows, setRepayRows] = useState<RepayStoreRow[]>([])
  const [pendingStoreId, setPendingStoreId] = useState<string | undefined>(undefined)
  const [pendingAmount, setPendingAmount] = useState<number | undefined>(undefined)
  const [showAddRow, setShowAddRow] = useState(false)
  const [successVisible, setSuccessVisible] = useState(false)
  const [countdown, setCountdown] = useState(5)

  /** Mock 餘額數據 */
  const sourceVirtualBalance = sourceGroupId ? 128560.50 : 0
  const sourceDebtAmount = sourceGroupId ? 15800.00 : 0

  /** 根據品牌過濾集團選項 */
  const sourceGroupOptions = sourceBrand
    ? allGroupOptions.filter(o => o.brand === sourceBrand).map(o => ({ label: o.label, value: o.value }))
    : []

  const targetGroupOptions = (sourceBrand && sourceGroupId)
    ? allGroupOptions.filter(o => o.brand === sourceBrand && o.value !== sourceGroupId).map(o => ({ label: o.label, value: o.value }))
    : []

  /** 提交成功倒計時 */
  useEffect(() => {
    if (!successVisible) return
    if (countdown <= 0) {
      setSuccessVisible(false)
      navigate('/account-balance')
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [successVisible, countdown, navigate])

  /** 添加償還門店行 */
  const handleAddRepayRow = () => {
    if (!pendingStoreId || !pendingAmount || pendingAmount <= 0) {
      message.warning('請選擇門店並填寫償還金額')
      return
    }
    const storeOpt = storeOptions.find(s => s.value === pendingStoreId)
    const newRow: RepayStoreRow = {
      key: pendingStoreId,
      storeId: pendingStoreId,
      storeLabel: storeOpt?.label || pendingStoreId,
      amount: pendingAmount,
      bd: storeOpt?.bd || '',
    }
    setRepayRows(prev => [...prev, newRow])
    setPendingStoreId(undefined)
    setPendingAmount(undefined)
    setShowAddRow(false)
  }

  /** 刪除償還門店行 */
  const handleRemoveRepayRow = (key: string) => {
    setRepayRows(prev => prev.filter(r => r.key !== key))
  }

  /** 提交 */
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      if (!sourceGroupId) { message.warning('請選擇註銷集團'); return }
      if (!targetGroupId) { message.warning('請選擇存續集團'); return }
      // 欠款償還金額校驗：必須恰好等於欠款總額
      if (sourceDebtAmount > 0) {
        const repayTotal = repayRows.reduce((sum, r) => sum + r.amount, 0)
        if (repayTotal === 0) { message.warning('請添加欠款償還門店並填寫償還金額'); return }
        if (repayTotal < sourceDebtAmount) {
          message.warning(`償還金額合計 MOP ${repayTotal.toLocaleString()} 低於欠款總額 MOP ${sourceDebtAmount.toLocaleString()}，請補足差額 MOP ${(sourceDebtAmount - repayTotal).toLocaleString()}`)
          return
        }
        if (repayTotal > sourceDebtAmount) {
          message.warning(`償還金額合計 MOP ${repayTotal.toLocaleString()} 超出欠款總額 MOP ${sourceDebtAmount.toLocaleString()}，請減少超出部分 MOP ${(repayTotal - sourceDebtAmount).toLocaleString()}`)
          return
        }
      }
      if (certificateFiles.length === 0) { message.warning('請上傳相關憑證'); return }
      // 提交審批記錄
      const sourceGroup = allGroupOptions.find(g => g.value === sourceGroupId)
      const targetGroup = allGroupOptions.find(g => g.value === targetGroupId)
      addApprovalRecord({
        key: `custom_${Date.now()}`,
        groupId: sourceGroupId,
        groupName: sourceGroup?.name || '',
        brand: sourceBrand || 'mFood',
        flowNo: generateFlowNo('merge'),
        approvalType: 'merge',
        applicant: '朱棣(002)',
        applyTime: formatNow(),
        bizApprover: '朱元璋(001)',
        bizApproveTime: '--',
        bizApproveStatus: 'pending',
        opsApprover: '--',
        opsApproveTime: '--',
        opsApproveStatus: 'pending',
        finApprover: '--',
        finApproveTime: '--',
        finApproveStatus: 'pending',
        flowStatus: 'pending',
        rejectReason: '',
        extra: {
          sourceGroupId,
          sourceGroupName: sourceGroup?.name || '',
          sourceVirtualBalance,
          sourceDebtAmount,
          targetGroupId,
          targetGroupName: targetGroup?.name || '',
          repayStores: repayRows.map(r => ({ storeId: r.storeId, storeLabel: r.storeLabel, bd: r.bd, amount: r.amount })),
          remark: form.getFieldValue('remark') || '',
        },
      })
      setCountdown(5)
      setSuccessVisible(true)
    } catch {
      // 表單校驗未通過
    }
  }

  /** 文件上傳校驗 */
  const beforeUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!validTypes.includes(file.type)) { message.error('僅支持 jpeg/jpg/png/PDF 格式'); return Upload.LIST_IGNORE }
    if (file.size > 5 * 1024 * 1024) { message.error('文件大小不能超過 5MB'); return Upload.LIST_IGNORE }
    return false
  }

  /** 渲染文件列表 */
  const renderFileList = () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {certificateFiles.map((file) => (
        <div key={file.uid} style={{
          width: 88, height: 88, border: '1px solid #e8e8e8', borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', background: '#fafafa',
        }}>
          {file.name?.endsWith('.pdf')
            ? <FilePdfOutlined style={{ fontSize: 28, color: '#E53935' }} />
            : <FileImageOutlined style={{ fontSize: 28, color: '#1976D2' }} />
          }
          <span style={{ fontSize: 10, color: '#999', marginTop: 4, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          <Button type="text" size="small" danger
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setCertificateFiles(certificateFiles.filter(f => f.uid !== file.uid))}
          >×</Button>
        </div>
      ))}
      {certificateFiles.length < 5 && (
        <Upload accept=".png,.jpg,.jpeg,.pdf" showUploadList={false} beforeUpload={beforeUpload}
          onChange={(info) => {
            if (info.file.status !== 'removed') {
              setCertificateFiles([...certificateFiles, { uid: info.file.uid, name: info.file.name }])
            }
          }}
        >
          <div style={{
            width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa', transition: 'all 0.3s',
          }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = '#E8720C'; el.style.background = '#fff7e6'; el.style.color = '#E8720C' }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = '#d9d9d9'; el.style.background = '#fafafa'; el.style.color = '#999' }}
          >
            <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: 'inherit' }} />
            <span>上傳</span>
          </div>
        </Upload>
      )}
    </div>
  )

  /** 償還門店表格列 */
  const repayColumns = [
    {
      title: '門店ID/名稱', dataIndex: 'storeLabel', width: 240,
      render: (val: string, record: RepayStoreRow) =>
        record.key === '__pending__' ? (
          <Select placeholder="請選擇門店" options={storeOptions} showSearch allowClear value={pendingStoreId || undefined}
            filterOption={(input, option) => (option?.label ?? '').includes(input)}
            onChange={(v) => {
              setPendingStoreId(v)
              if (v && pendingAmount && pendingAmount > 0) {
                setTimeout(() => handleAddRepayRow(), 100)
              }
            }}
            style={{ width: '100%' }} size="small"
          />
        ) : <span>{val}</span>,
    },
    {
      title: '歸屬BD', dataIndex: 'bd', width: 120, align: 'center' as const,
      render: (val: string, record: RepayStoreRow) =>
        record.key === '__pending__' ? (
          pendingStoreId
            ? <Tag color="blue" style={{ fontSize: 12 }}>{storeOptions.find(s => s.value === pendingStoreId)?.bd || '--'}</Tag>
            : <span style={{ color: '#BFBFBF', fontSize: 12 }}>選擇門店後帶出</span>
        ) : <Tag color="blue" style={{ fontSize: 12 }}>{val}</Tag>,
    },
    {
      title: '償還金額', dataIndex: 'amount', width: 160, align: 'center' as const,
      render: (val: number, record: RepayStoreRow) =>
        record.key === '__pending__' ? (
          <InputNumber placeholder="請輸入金額" min={0} precision={2} size="small"
            value={pendingAmount} addonAfter="MOP"
            onChange={(v) => {
              setPendingAmount(v || undefined)
              if (pendingStoreId && v && v > 0) {
                setTimeout(() => handleAddRepayRow(), 100)
              }
            }}
            style={{ width: '100%' }}
          />
        ) : <span>{val?.toLocaleString()} MOP</span>,
    },
    {
      title: '操作', width: 80, align: 'center' as const,
      render: (_: unknown, record: RepayStoreRow) => (
        <Button type="link" danger size="small"
          onClick={() => {
            if (record.key === '__pending__') { setShowAddRow(false); setPendingStoreId(undefined); setPendingAmount(undefined) }
            else handleRemoveRepayRow(record.key)
          }}
        >刪除</Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/account-balance')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#722ED1' }}>商戶合併</h2>
              <Tag color="purple" style={{ fontSize: 11 }}>合併申請</Tag>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        {/* ====== 註銷集團（即將關閉） ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MergeCellsOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>註銷集團</span>
            <Tag color="red" style={{ marginLeft: 0, fontSize: 11 }}>即將關閉</Tag>
            <Tag color="blue" style={{ marginLeft: 0, fontSize: 11 }}>集團選擇</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="所屬品牌" name="sourceBrand" rules={[{ required: true, message: '請選擇所屬品牌' }]}>
              <Select placeholder="請選擇品牌" options={brandOptions} allowClear
                onChange={(val) => {
                  setSourceBrand(val)
                  setSourceGroupId(undefined)
                  setTargetGroupId(undefined)
                  setTargetBrand(undefined)
                  form.setFieldsValue({ sourceGroupId: undefined, targetGroupId: undefined })
                }}
              />
            </Form.Item>
            <Form.Item label="註銷集團" name="sourceGroupId" rules={[{ required: true, message: '請選擇註銷集團' }]}>
              <Select placeholder={sourceBrand ? '請選擇即將關閉的集團' : '請先選擇品牌'} options={sourceGroupOptions}
                showSearch allowClear disabled={!sourceBrand}
                onChange={(val) => { setSourceGroupId(val); setTargetGroupId(undefined); form.setFieldsValue({ targetGroupId: undefined }) }}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label="賬戶狀態">
              {sourceGroupId ? <Tag color="green">正常</Tag> : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
            </Form.Item>
          </div>

          {/* 餘額 + 欠款卡片 */}
          {sourceGroupId && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
              <div
                style={{
                  padding: '12px', borderRadius: 10, background: '#E6F7FF',
                  border: '1px solid #1890ff22', textAlign: 'center',
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ fontSize: 16, color: '#1890ff', marginBottom: 4 }}><WalletOutlined /></div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                  <AnimatedNumber value={sourceVirtualBalance} prefix="MOP " />
                </div>
                <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>註銷集團 · 虛擬賬戶餘額（將轉入存續集團）</div>
              </div>
              <div
                style={{
                  padding: '12px', borderRadius: 10,
                  background: sourceDebtAmount > 0 ? '#FFF1F0' : '#F6FFED',
                  border: `1px solid ${sourceDebtAmount > 0 ? '#ff4d4f22' : '#52c41a22'}`,
                  textAlign: 'center',
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                  position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ fontSize: 16, color: sourceDebtAmount > 0 ? '#ff4d4f' : '#52c41a', marginBottom: 4 }}>
                  {sourceDebtAmount > 0 ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: sourceDebtAmount > 0 ? '#ff4d4f' : '#52c41a' }}>
                  <AnimatedNumber value={sourceDebtAmount} prefix="MOP " />
                </div>
                <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>註銷集團 · 欠款金額（需分配至存續集團門店償還）</div>
              </div>
            </div>
          )}
        </div>

        {/* ====== 存續集團（接收資產） ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AccountBookOutlined style={{ fontSize: 14, color: '#722ed1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>存續集團</span>
            <Tag color="green" style={{ marginLeft: 0, fontSize: 11 }}>接收資產</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>接收註銷集團的全部資產與餘額，僅展示與註銷集團所屬品牌一致的集團</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="存續集團" name="targetGroupId" rules={[{ required: true, message: '請選擇存續集團' }]}>
              <Select placeholder={sourceGroupId ? '請選擇接收資產的集團' : '請先選擇註銷集團'} options={targetGroupOptions}
                showSearch allowClear disabled={!sourceGroupId}
                onChange={(val) => { setTargetGroupId(val); const g = allGroupOptions.find(o => o.value === val); setTargetBrand(g?.brand) }}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label="所屬品牌">
              {targetGroupId ? <BrandTag value={targetBrand || sourceBrand || 'mFood'} /> : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
            </Form.Item>
            <Form.Item label="賬戶狀態">
              {targetGroupId ? <Tag color="green">正常</Tag> : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
            </Form.Item>
          </div>
        </div>

        {/* ====== 欠款償還（僅有欠款時展示） ====== */}
        {sourceGroupId && sourceDebtAmount > 0 && (
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff1f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PayCircleOutlined style={{ fontSize: 14, color: '#ff4d4f' }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>欠款償還</span>
              <Tag color="red" style={{ marginLeft: 4, fontSize: 11 }}>欠款 MOP {sourceDebtAmount.toLocaleString()}</Tag>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>註銷集團存在欠款，請選擇存續集團下的門店進行欠款償還分配</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
              <Button type="primary" size="small" icon={<PlusOutlined />}
                onClick={() => setShowAddRow(true)} disabled={showAddRow}
                style={{ borderRadius: 6 }}
              >添加門店</Button>
            </div>

            <Table rowKey="key" size="small" bordered pagination={false}
              dataSource={[...repayRows, ...(showAddRow ? [{ key: '__pending__', storeId: '__pending__', storeLabel: '', amount: 0, bd: '' }] : [])]}
              columns={repayColumns}
              locale={{ emptyText: '暫無償還門店，請點擊「添加門店」' }}
            />

            {repayRows.length > 0 && (() => {
              const repayTotal = repayRows.reduce((sum, r) => sum + r.amount, 0)
              const diff = sourceDebtAmount - repayTotal
              return (
                <div style={{ marginTop: 12, textAlign: 'right', fontSize: 13, color: '#262626' }}>
                  已分配償還金額：<span style={{ fontWeight: 600, color: '#E8720C' }}>
                    MOP {repayTotal.toLocaleString()}
                  </span>
                  {diff > 0 && (
                    <span style={{ color: '#ff4d4f', marginLeft: 12, fontSize: 12 }}>
                      尚有 MOP {diff.toLocaleString()} 未分配
                    </span>
                  )}
                  {diff < 0 && (
                    <span style={{ color: '#ff4d4f', marginLeft: 12, fontSize: 12 }}>
                      超出 MOP {Math.abs(diff).toLocaleString()}，請調整
                    </span>
                  )}
                  {diff === 0 && (
                    <span style={{ color: '#52C41A', marginLeft: 12, fontSize: 12 }}>
                      ✓ 已全部分配完畢
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ====== 相关凭证 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileProtectOutlined style={{ fontSize: 14, color: '#722ed1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>相關憑證</span>
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>憑證上傳</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>支持 jpeg/jpg/png/PDF</span>
          </div>
          <Form.Item label="相關憑證" required style={{ marginBottom: 0 }}>
            {renderFileList()}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              限 jpeg/jpg/png/PDF 格式，5MB 內，最多可上傳 5 份
            </div>
          </Form.Item>
        </div>

        {/* ====== 备注信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>備註信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={4} maxLength={200} showCount
              placeholder="本次合併相關說明，限制200字！" style={{ borderRadius: 8 }} />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作按钮 */}
      <div className="form-footer">
        <Button onClick={() => navigate('/account-balance')}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} onClick={handleSubmit}>提交申請</Button>
      </div>

      {/* ====== 提交成功彈窗 ====== */}
      {successVisible && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '32px 28px', width: 400, textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 20px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #52C41A, #73D13D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(82,196,26,0.3)',
            }}>
              <span style={{ fontSize: 32, color: '#fff' }}>✓</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>提交成功</h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              該流程已經進入審批，可到<span style={{ color: '#E8720C', fontWeight: 500 }}>審批中心</span>菜單查看審批進度
            </p>
            <Button type="primary" size="large" onClick={() => navigate('/account-balance')}
              style={{ minWidth: 120, height: 40, borderRadius: 8 }}>
              返回列表{countdown > 0 && ` (${countdown}s)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
