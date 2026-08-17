import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, Select, Button, Upload, message, InputNumber, Tag, Table, ConfigProvider, Modal, type UploadFile } from 'antd'
import {
  ArrowLeftOutlined,
  SendOutlined,
  UploadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  AccountBookOutlined,
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
import { fetchFinAccounts, fetchFinDebts, submitMergeApply } from '../../api/finance'
import type { FinAccount, MergeApplyPayload } from '../../api/finance'
import { fetchStoresByGroupCode, fetchStoreBds } from '../../api/store'
import type { OptionItem } from '../../api/types'
import { isWorkflowEnabled, isDirectExec } from '../../utils/workflowEnabled'
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

/** 品牌選項（labelKey 為 i18n key） */
const brandOptions = [
  { labelKey: 'accountBalance.brandFlashBee', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
]

/** 賬戶狀態文案/顏色映射（labelKey 為 i18n key） */
const accountStatusMap: Record<string, { labelKey: string; color: string }> = {
  normal: { labelKey: 'accountBalance.statusNormal', color: 'green' },
  frozen: { labelKey: 'accountBalance.statusFrozen', color: 'red' },
  mergeFrozen: { labelKey: 'accountBalance.statusMergeFrozen', color: 'orange' },
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [sourceBrand, setSourceBrand] = useState<string | undefined>(undefined)
  const [sourceGroupId, setSourceGroupId] = useState<string | undefined>(undefined)
  const [targetBrand, setTargetBrand] = useState<string | undefined>(undefined)
  const [targetGroupId, setTargetGroupId] = useState<string | undefined>(undefined)
  const [certificateFiles, setCertificateFiles] = useState<UploadFile[]>([])
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

  /** 翻譯後的品牌選項 */
  const tBrandOptions = brandOptions.map(o => 'labelKey' in o ? { label: t(o.labelKey || ''), value: o.value } : o)

  /** 集團選項：非正常狀態賬戶標註狀態且不可選 */
  const toGroupOption = (a: FinAccount) => ({
    label: `${a.groupId} - ${a.groupName}${a.status !== 'normal' ? `（${t(accountStatusMap[a.status]?.labelKey || '') || a.status}）` : ''}`,
    value: a.groupId,
    disabled: a.status !== 'normal',
  })

  const sourceGroupOptions = sourceBrand ? accounts.map(toGroupOption) : []

  /** 存續集團選項：全品牌可選，value 用「集團ID|品牌」保證唯一，品牌在選中後由「所屬品牌」字段展示 */
  const toTargetOption = (a: FinAccount) => ({
    label: `${a.groupId} - ${a.groupName}${a.status !== 'normal' ? `（${t(accountStatusMap[a.status]?.labelKey || '') || a.status}）` : ''}`,
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
      message.warning(t('accountBalance.selectSurvivingGroupFirst'))
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
      if (!sourceGroupId) { message.warning(t('accountBalance.selectCancelGroup')); return }
      if (!targetGroupId) { message.warning(t('accountBalance.selectSurvivingGroup')); return }
      // 欠款償還門店校驗
      if (sourceDebtAmount > 0) {
        if (repayRows.length === 0) { message.warning(t('accountBalance.addRepayStore')); return }
        const emptyStore = repayRows.find(r => !r.storeId)
        if (emptyStore) { message.warning(t('accountBalance.selectAllRepayStores')); return }
        const emptyAmount = repayRows.find(r => !r.amount || r.amount <= 0)
        if (emptyAmount) { message.warning(t('accountBalance.fillAllRepayAmounts')); return }
        // 欠款償還金額校驗：必須恰好等於欠款總額
        const repayTotal = repayRows.reduce((sum, r) => sum + r.amount, 0)
        if (repayTotal === 0) { message.warning(t('accountBalance.fillRepayAmount')); return }
        if (repayTotal < sourceDebtAmount) {
          message.warning(t('accountBalance.repayBelowDebt', { repayTotal: repayTotal.toLocaleString(), debtAmount: sourceDebtAmount.toLocaleString(), diff: (sourceDebtAmount - repayTotal).toLocaleString() }))
          return
        }
        if (repayTotal > sourceDebtAmount) {
          message.warning(t('accountBalance.repayAboveDebt', { repayTotal: repayTotal.toLocaleString(), debtAmount: sourceDebtAmount.toLocaleString(), diff: (repayTotal - sourceDebtAmount).toLocaleString() }))
          return
        }
      }
      if (certificateFiles.length === 0) { message.warning(t('accountBalance.uploadCertificate')); return }
      // ====== 二次確認彈窗 ======
      const approvalEnabled = isWorkflowEnabled('merge')
      const sourceName = sourceAccount?.groupName || ''
      const targetName = targetAccount?.groupName || ''
      Modal.confirm({
        title: t('accountBalance.confirmSubmitTitle'),
        icon: (
          <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
        ),
        centered: true,
        className: 'custom-confirm-modal',
        width: 520,
        okText: t('common:confirmSubmit'),
        cancelText: t('common:cancel'),
        content: (
          <div>
            <div className="confirm-info-card">
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.cancelGroup')}</span>
              <span className="confirm-info-value">{sourceName}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.survivingGroup')}</span>
              <span className="confirm-info-value">{targetName}</span>
            </div>
            {sourceVirtualBalance > 0 && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.virtualBalance')}</span>
              <span className="confirm-info-value highlight">MOP {sourceVirtualBalance.toLocaleString()}</span>
            </div>}
            {sourceDebtAmount > 0 && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.debtAmount')}</span>
              <span className="confirm-info-value danger">MOP {sourceDebtAmount.toLocaleString()}</span>
            </div>}
            </div>
            {!approvalEnabled && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: 'linear-gradient(135deg, #FFF1F0, #FFFAF0)',
                border: '1.5px solid #FF7A45',
                fontSize: 13, color: '#CF1322', lineHeight: 1.6, fontWeight: 500,
              }}>
                ⚡ 當前合併審批流程已停用，確認後將直接執行合併，無需審批。
              </div>
            )}
          </div>
        ),
        onOk: async () => {
          try {
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
            const flowNo = await submitMergeApply(payload)
            setSubmittedFlowNo(flowNo)
            setCountdown(5)
            // 等待確認彈窗完全關閉後再顯示成功彈窗
            setTimeout(() => setSuccessVisible(true), 350)
          } catch (err) {
            message.error(err instanceof Error && err.message ? err.message : t('accountBalance.submitFailed'))
          }
        },
      })
    } catch (err) {
      // 表單校驗未通過時 antd 已在字段標紅；財務接口為靜默請求，後端業務錯誤需在此提示
      if (!(err && typeof err === 'object' && 'errorFields' in err)) {
        message.error(err instanceof Error && err.message ? err.message : t('accountBalance.submitFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** 文件上傳校驗 */
  const beforeUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!validTypes.includes(file.type)) { message.error(t('accountBalance.onlyFormatError')); return Upload.LIST_IGNORE }
    if (file.size > 5 * 1024 * 1024) { message.error(t('accountBalance.fileSizeExceed')); return Upload.LIST_IGNORE }
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
            <span>{t('accountBalance.upload')}</span>
          </div>
        </Upload>
      )}
    </div>
  )

  /** 償還門店表格列 */
  const repayColumns = [
    {
      title: t('common:colStoreId') + '/' + t('common:colStoreName'), dataIndex: 'storeLabel', width: 240,
      render: (_: string, record: RepayStoreRow) => (
        <Select placeholder={repayStoreOptions.length ? t('accountBalance.selectSurvivingStore') : t('accountBalance.noStoreInSurviving')} options={repayStoreOptions} showSearch allowClear
          value={record.storeId || undefined}
          onChange={(v) => handleUpdateRepayRow(record.key, 'storeId', v || '')}
          filterOption={(input, option) => (option?.label ?? '').includes(input)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: t('common:colBd'), dataIndex: 'bd', width: 120, align: 'center' as const,
      render: (val: string) => val
        ? <Tag color="blue" style={{ fontSize: 12 }}>{val}</Tag>
        : <span style={{ color: '#BFBFBF', fontSize: 12 }}>{t('accountBalance.showBdAfterSelectStore')}</span>,
    },
    {
      title: t('accountBalance.repayAmountLabel'), dataIndex: 'amount', width: 160, align: 'center' as const,
      render: (val: number, record: RepayStoreRow) => (
        <InputNumber
          placeholder={t('accountBalance.enterAmount')}
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
      title: t('common:colAction'), width: 80, align: 'center' as const,
      render: (_: unknown, record: RepayStoreRow) => (
        <Button type="link" danger size="small"
          onClick={() => handleRemoveRepayRow(record.key)}
        >{t('accountBalance.deleteAction')}</Button>
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
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#722ED1' }}>{t('accountBalance.mergePageTitle')}</h2>
              <Tag color="purple" style={{ fontSize: 11 }}>{t('accountBalance.mergeApplyTag')}</Tag>
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
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.cancelGroup')}</span>
            <Tag color="red" style={{ marginLeft: 0, fontSize: 11 }}>{t('accountBalance.cancelGroupClosing')}</Tag>
            <Tag color="blue" style={{ marginLeft: 0, fontSize: 11 }}>{t('accountBalance.groupSelectTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('common:colBrand')} name="sourceBrand" rules={[{ required: true, message: t('accountBalance.selectSourceBrand') }]}>
              <Select placeholder={t('accountBalance.selectBrand')} options={tBrandOptions} allowClear
                onChange={(val) => {
                  setSourceBrand(val)
                  setSourceGroupId(undefined)
                  setTargetGroupId(undefined)
                  setTargetBrand(undefined)
                  form.setFieldsValue({ sourceGroupId: undefined, targetGroupId: undefined })
                }}
              />
            </Form.Item>
            <Form.Item label={t('accountBalance.cancelGroup')} name="sourceGroupId" rules={[{ required: true, message: t('accountBalance.selectCancelGroup') }]}>
              <Select placeholder={sourceBrand ? t('accountBalance.selectClosingGroup') : t('accountBalance.selectBrandFirst')} options={sourceGroupOptions}
                showSearch allowClear disabled={!sourceBrand}
                onChange={(val) => { setSourceGroupId(val); setTargetGroupId(undefined); setTargetBrand(undefined); form.setFieldsValue({ targetGroupId: undefined }) }}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label={t('accountBalance.accountStatusLabel')}>
              {sourceGroupId
                ? <Tag color={accountStatusMap[sourceAccount?.status || 'normal']?.color || 'green'}>
                    {t(accountStatusMap[sourceAccount?.status || 'normal']?.labelKey || '') || '正常'}
                  </Tag>
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>{t('accountBalance.showAfterSelectGroup')}</span>}
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
                <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>{t('accountBalance.cancelGroupVirtualBalance')}</div>
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
                <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>{t('accountBalance.cancelGroupDebt')}</div>
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
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.survivingGroup')}</span>
            <Tag color="green" style={{ marginLeft: 0, fontSize: 11 }}>{t('accountBalance.receiveAssets')}</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('accountBalance.receiveAssetsDesc')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('accountBalance.survivingGroup')} name="targetGroupId" rules={[{ required: true, message: t('accountBalance.selectSurvivingGroup') }]}>
              <Select placeholder={sourceGroupId ? t('accountBalance.selectReceivingGroup') : t('accountBalance.selectCancelGroupFirst')} options={targetGroupOptions}
                showSearch allowClear disabled={!sourceGroupId}
                onChange={(val?: string) => {
                  const [gid, gbrand] = (val || '').split('|')
                  setTargetGroupId(gid || undefined)
                  setTargetBrand(gbrand || undefined)
                }}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label={t('common:colBrand')}>
              {targetGroupId
                ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <BrandTag value={targetBrand || 'mFood'} />
                    {targetBrand && sourceBrand && targetBrand !== sourceBrand && (
                      <span style={{ color: '#FAAD14', fontSize: 12 }}>
                        <ExclamationCircleOutlined style={{ marginRight: 4 }} />{t('accountBalance.brandMismatchWarn')}
                      </span>
                    )}
                  </span>
                )
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>{t('accountBalance.showAfterSelectGroup')}</span>}
            </Form.Item>
            <Form.Item label={t('accountBalance.accountStatusLabel')}>
              {targetGroupId
                ? <Tag color={accountStatusMap[targetAccount?.status || 'normal']?.color || 'green'}>
                    {t(accountStatusMap[targetAccount?.status || 'normal']?.labelKey || '') || '正常'}
                  </Tag>
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>{t('accountBalance.showAfterSelectGroup')}</span>}
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
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.debtRepayment')}</span>
              <Tag color="red" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.debtAmountTag', { amount: sourceDebtAmount.toLocaleString() })}</Tag>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('accountBalance.debtRepayHint')}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
              <Button type="primary" size="small" icon={<PlusOutlined />}
                onClick={() => handleAddRepayRow()}
                style={{ borderRadius: 6 }}
              >{t('accountBalance.addStore')}</Button>
            </div>

            <ConfigProvider componentSize="middle">
            <Table rowKey="key" bordered pagination={false}
              dataSource={repayRows}
              columns={repayColumns}
              locale={{ emptyText: t('accountBalance.emptyRepayStores') }}
            />
            </ConfigProvider>

            {repayRows.length > 0 && (() => {
              const repayTotal = repayRows.reduce((sum, r) => sum + r.amount, 0)
              const diff = sourceDebtAmount - repayTotal
              return (
                <div style={{ marginTop: 12, textAlign: 'right', fontSize: 13, color: '#262626' }}>
                  {t('accountBalance.allocatedRepayAmount')}<span style={{ fontWeight: 600, color: '#E8720C' }}>
                    MOP {repayTotal.toLocaleString()}
                  </span>
                  {diff > 0 && (
                    <span style={{ color: '#ff4d4f', marginLeft: 12, fontSize: 12 }}>
                      {t('accountBalance.unallocated', { amount: diff.toLocaleString() })}
                    </span>
                  )}
                  {diff < 0 && (
                    <span style={{ color: '#ff4d4f', marginLeft: 12, fontSize: 12 }}>
                      {t('accountBalance.overAllocated', { amount: Math.abs(diff).toLocaleString() })}
                    </span>
                  )}
                  {diff === 0 && (
                    <span style={{ color: '#52C41A', marginLeft: 12, fontSize: 12 }}>
                      {t('accountBalance.allAllocated')}
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
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.relatedVoucher')}</span>
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.voucherUploadTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('accountBalance.supportFormat')}</span>
          </div>
          <Form.Item label={t('accountBalance.relatedVoucher')} required style={{ marginBottom: 0 }}>
            {renderFileList()}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('accountBalance.voucherLimitHint')}
            </div>
          </Form.Item>
        </div>

        {/* ====== 备注信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.remarkInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={4} maxLength={200} showCount
              placeholder={t('accountBalance.mergeRemarkPlaceholder')} style={{ borderRadius: 8 }} />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作按钮 */}
      <div className="form-footer">
        <Button onClick={() => navigate('/account-balance')}>{t('common:cancel')}</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>{t('accountBalance.submitApply')}</Button>
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
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>{t('accountBalance.submitSuccessTitle')}</h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              {submittedFlowNo && !isDirectExec(submittedFlowNo) && (
                <>{t('accountBalance.flowNoLabel')}<span style={{ color: '#E8720C', fontWeight: 500 }}>{submittedFlowNo}</span><br /></>
              )}
              {isDirectExec(submittedFlowNo)
                ? '✅ 已直接執行合併（未經審批）'
                : t('accountBalance.submitSuccessDesc')
              }
            </p>
            <Button type="primary" size="large" onClick={() => navigate('/account-balance')}
              style={{ minWidth: 120, height: 40, borderRadius: 8 }}>
              {t('accountBalance.backToList')}{countdown > 0 && ` (${countdown}s)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
