import { useState, useEffect, useRef } from 'react'
import { Form, Input, Select, Button, Upload, message, InputNumber, Tag, Table, ConfigProvider } from 'antd'
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
import { fetchFinAccounts, fetchFinDebts, submitMergeApply, withFinanceFallback } from '../../api/finance'
import type { FinAccount, MergeApplyPayload } from '../../api/finance'
import { fetchStoresByGroupCode, fetchStoreBds } from '../../api/store'
import type { OptionItem } from '../../api/types'
import { mockSubmitApproval } from '../../api/mock/financeMock'
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

/** 賬戶狀態文案/顏色映射 */
const accountStatusMap: Record<string, { label: string; color: string }> = {
  normal: { label: '正常', color: 'green' },
  frozen: { label: '凍結', color: 'red' },
  mergeFrozen: { label: '合併凍結', color: 'orange' },
}

/** 從門店選項文案末尾提取門店編碼，如「珠海前山分店(MD00007)」-> MD00007 */
function storeCodeOf(label: string): string {
  return label.match(/\(([A-Za-z0-9_-]+)\)\s*$/)?.[1] || label
}

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
  const [successVisible, setSuccessVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [countdown, setCountdown] = useState(5)

  /** 同品牌推廣金賬戶列表（註銷集團選項/餘額/狀態均由此派生） */
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  /** 全部品牌推廣金賬戶列表（存續集團可跨品牌選擇） */
  const [allAccounts, setAllAccounts] = useState<FinAccount[]>([])
  /** 註銷集團未結清欠款合計 */
  const [sourceDebtAmount, setSourceDebtAmount] = useState(0)
  /** 存續集團下門店選項（償還門店候選） */
  const [repayStoreOptions, setRepayStoreOptions] = useState<OptionItem[]>([])

  // 按品牌加載推廣金賬戶列表
  useEffect(() => {
    if (!sourceBrand) {
      setAccounts([])
      return
    }
    fetchFinAccounts({ page: 1, size: 500, brand: sourceBrand })
      .then(res => setAccounts(res.records || []))
      .catch(() => setAccounts([]))
  }, [sourceBrand])

  // 加載全部品牌賬戶列表（供存續集團跨品牌選擇）
  useEffect(() => {
    fetchFinAccounts({ page: 1, size: 500 })
      .then(res => setAllAccounts(res.records || []))
      .catch(() => setAllAccounts([]))
  }, [])

  // 註銷集團切換後加載未結清欠款合計
  useEffect(() => {
    if (!sourceGroupId) {
      setSourceDebtAmount(0)
      return
    }
    fetchFinDebts({ page: 1, size: 500, groupId: sourceGroupId, brand: sourceBrand, status: 'unsettled' })
      .then(res => {
        const total = (res.records || [])
          .filter(b => b.groupId === sourceGroupId)
          .reduce((sum, b) => sum + (Number(b.remainAmount) || 0), 0)
        setSourceDebtAmount(total)
      })
      .catch(() => setSourceDebtAmount(0))
  }, [sourceGroupId, sourceBrand])

  // 存續集團切換後加載其名下門店選項（按存續集團自身品牌），並重置已選償還門店
  useEffect(() => {
    setRepayRows([])
    if (!targetGroupId) {
      setRepayStoreOptions([])
      return
    }
    fetchStoresByGroupCode(targetGroupId, targetBrand)
      .then(list => setRepayStoreOptions(list || []))
      .catch(() => setRepayStoreOptions([]))
  }, [targetGroupId, targetBrand])

  /** 註銷集團賬戶（虛擬餘額/狀態） */
  const sourceAccount = accounts.find(a => a.groupId === sourceGroupId)
  const sourceVirtualBalance = Number(sourceAccount?.virtualBalance) || 0
  /** 已選存續集團賬戶（賬戶按集團+品牌隔離，需同時匹配品牌） */
  const targetAccount = allAccounts.find(a => a.groupId === targetGroupId && a.brand === targetBrand)

  /** 集團選項：非正常狀態賬戶標註狀態且不可選 */
  const toGroupOption = (a: FinAccount) => ({
    label: `${a.groupId} - ${a.groupName}${a.status !== 'normal' ? `（${accountStatusMap[a.status]?.label || a.status}）` : ''}`,
    value: a.groupId,
    disabled: a.status !== 'normal',
  })

  const sourceGroupOptions = sourceBrand ? accounts.map(toGroupOption) : []

  /** 存續集團選項：全品牌可選，value 用「集團ID|品牌」保證唯一，品牌在選中後由「所屬品牌」字段展示 */
  const toTargetOption = (a: FinAccount) => ({
    label: `${a.groupId} - ${a.groupName}${a.status !== 'normal' ? `（${accountStatusMap[a.status]?.label || a.status}）` : ''}`,
    value: `${a.groupId}|${a.brand}`,
    disabled: a.status !== 'normal',
  })

  const targetGroupOptions = (sourceBrand && sourceGroupId)
    ? allAccounts.filter(a => a.groupId !== sourceGroupId).map(toTargetOption)
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

  /** 添加償還門店行（直接添加空行） */
  const handleAddRepayRow = () => {
    if (!targetGroupId) {
      message.warning('請先選擇存續集團')
      return
    }
    setRepayRows(prev => [...prev, { key: `new_${Date.now()}`, storeId: '', storeLabel: '', amount: 0, bd: '' }])
  }

  /** 更新償還門店行（選擇門店後異步帶出該門店綁定的BD） */
  const handleUpdateRepayRow = (key: string, field: keyof RepayStoreRow, value: string | number) => {
    setRepayRows(prev => prev.map(r => {
      if (r.key !== key) return r
      if (field === 'storeId') {
        const opt = repayStoreOptions.find(s => s.value === value)
        return { ...r, storeId: value as string, storeLabel: opt?.label || value as string, bd: '' }
      }
      return { ...r, [field]: value }
    }))
    if (field === 'storeId' && value) {
      fetchStoreBds(Number(value))
        .then(list => {
          const bd = (list || []).map(b => `${b.bdName || b.bdEmpId}(${b.bdEmpId})`).join('、') || '--'
          setRepayRows(prev => prev.map(r => (r.key === key ? { ...r, bd } : r)))
        })
        .catch(() => {
          setRepayRows(prev => prev.map(r => (r.key === key ? { ...r, bd: '--' } : r)))
        })
    }
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
      // 欠款償還門店校驗
      if (sourceDebtAmount > 0) {
        if (repayRows.length === 0) { message.warning('請添加欠款償還門店'); return }
        const emptyStore = repayRows.find(r => !r.storeId)
        if (emptyStore) { message.warning('請為所有償還門店選擇門店'); return }
        const emptyAmount = repayRows.find(r => !r.amount || r.amount <= 0)
        if (emptyAmount) { message.warning('請為所有償還門店填寫金額'); return }
        // 欠款償還金額校驗：必須恰好等於欠款總額
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
      const payload: MergeApplyPayload = {
        sourceGroupId,
        sourceGroupName: sourceAccount?.groupName || '',
        brand: sourceBrand || 'mFood',
        sourceVirtualBalance,
        sourceDebtAmount,
        targetGroupId,
        targetGroupName: targetAccount?.groupName || '',
        repayStores: repayRows.map(r => ({ storeId: storeCodeOf(r.storeLabel), storeLabel: r.storeLabel, bd: r.bd, amount: r.amount })),
        remark: form.getFieldValue('remark') || '',
      }
      setSubmitting(true)
      const flowNo = await withFinanceFallback(
        () => submitMergeApply(payload),
        () => mockSubmitApproval({
          approvalType: 'merge',
          groupId: sourceGroupId,
          groupName: sourceAccount?.groupName || '',
          brand: sourceBrand || 'mFood',
          extra: { ...payload },
        }),
      )
      setSubmittedFlowNo(flowNo)
      setCountdown(5)
      setSuccessVisible(true)
    } catch (err) {
      // 表單校驗未通過時 antd 已在字段標紅；財務接口為靜默請求，後端業務錯誤需在此提示
      if (!(err && typeof err === 'object' && 'errorFields' in err)) {
        message.error(err instanceof Error && err.message ? err.message : '提交失敗，請稍後重試')
      }
    } finally {
      setSubmitting(false)
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
      render: (_: string, record: RepayStoreRow) => (
        <Select placeholder={repayStoreOptions.length ? '請選擇門店' : '存續集團下暫無門店'} options={repayStoreOptions} showSearch allowClear
          value={record.storeId || undefined}
          onChange={(v) => handleUpdateRepayRow(record.key, 'storeId', v || '')}
          filterOption={(input, option) => (option?.label ?? '').includes(input)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '歸屬BD', dataIndex: 'bd', width: 120, align: 'center' as const,
      render: (val: string) => val
        ? <Tag color="blue" style={{ fontSize: 12 }}>{val}</Tag>
        : <span style={{ color: '#BFBFBF', fontSize: 12 }}>選擇門店後帶出</span>,
    },
    {
      title: '償還金額', dataIndex: 'amount', width: 160, align: 'center' as const,
      render: (val: number, record: RepayStoreRow) => (
        <InputNumber
          placeholder="請輸入金額"
          value={val || undefined}
          min={0}
          precision={2}
          addonAfter="MOP"
          style={{ width: '100%' }}
          onChange={(v) => handleUpdateRepayRow(record.key, 'amount', v ?? 0)}
        />
      ),
    },
    {
      title: '操作', width: 80, align: 'center' as const,
      render: (_: unknown, record: RepayStoreRow) => (
        <Button type="link" danger size="small"
          onClick={() => handleRemoveRepayRow(record.key)}
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
                onChange={(val) => { setSourceGroupId(val); setTargetGroupId(undefined); setTargetBrand(undefined); form.setFieldsValue({ targetGroupId: undefined }) }}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label="賬戶狀態">
              {sourceGroupId
                ? <Tag color={accountStatusMap[sourceAccount?.status || 'normal']?.color || 'green'}>
                    {accountStatusMap[sourceAccount?.status || 'normal']?.label || '正常'}
                  </Tag>
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
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
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>接收註銷集團的全部資產與餘額，可選擇任意品牌的集團</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="存續集團" name="targetGroupId" rules={[{ required: true, message: '請選擇存續集團' }]}>
              <Select placeholder={sourceGroupId ? '請選擇接收資產的集團' : '請先選擇註銷集團'} options={targetGroupOptions}
                showSearch allowClear disabled={!sourceGroupId}
                onChange={(val?: string) => {
                  const [gid, gbrand] = (val || '').split('|')
                  setTargetGroupId(gid || undefined)
                  setTargetBrand(gbrand || undefined)
                }}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label="所屬品牌">
              {targetGroupId
                ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <BrandTag value={targetBrand || 'mFood'} />
                    {targetBrand && sourceBrand && targetBrand !== sourceBrand && (
                      <span style={{ color: '#FAAD14', fontSize: 12 }}>
                        <ExclamationCircleOutlined style={{ marginRight: 4 }} />與註銷集團品牌不一致，請確認後再提交
                      </span>
                    )}
                  </span>
                )
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
            </Form.Item>
            <Form.Item label="賬戶狀態">
              {targetGroupId
                ? <Tag color={accountStatusMap[targetAccount?.status || 'normal']?.color || 'green'}>
                    {accountStatusMap[targetAccount?.status || 'normal']?.label || '正常'}
                  </Tag>
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
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
                onClick={() => handleAddRepayRow()}
                style={{ borderRadius: 6 }}
              >添加門店</Button>
            </div>

            <ConfigProvider componentSize="middle">
            <Table rowKey="key" bordered pagination={false}
              dataSource={repayRows}
              columns={repayColumns}
              locale={{ emptyText: '暫無償還門店，請點擊「添加門店」' }}
            />
            </ConfigProvider>

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
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>提交申請</Button>
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
              {submittedFlowNo && (
                <>流程編號：<span style={{ color: '#E8720C', fontWeight: 500 }}>{submittedFlowNo}</span><br /></>
              )}
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
