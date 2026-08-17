import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, Select, Radio, Button, Upload, message, InputNumber, Tag, Tooltip, Table, Switch, ConfigProvider, Modal, type UploadFile } from 'antd'
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
  QuestionCircleOutlined,
  PlusOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { submitRechargeApply } from '../../api/finance'
import type { RechargeApplyPayload } from '../../api/finance'
import { fetchStoreBdOptions, fetchStoresByGroupCode } from '../../api/store'
import type { OptionItem } from '../../api/types'
import { isWorkflowEnabled, isDirectExec } from '../../utils/workflowEnabled'

/** 集團选项 */
const groupOptions = [
  { label: '20261298121911 - 亞述集團', value: '20261298121911', name: '亞述集團' },
  { label: '20261298121912 - 廣州酒家', value: '20261298121912', name: '廣州酒家' },
  { label: '20261298121913 - 海底撈', value: '20261298121913', name: '海底撈' },
]

/** 實收賬戶充值方式（labelKey 為 i18n key） */
const actualPayOptions = [
  { labelKey: 'accountBalance.settlementCorporate', value: 'corporate' },
  { labelKey: 'accountBalance.settlementMixed', value: 'mixed' },
  { labelKey: 'accountBalance.settlementRevenue', value: 'revenue' },
]

/** 業務類型 → 可選業務頻道（labelKey 為 i18n key） */
const businessChannelMap: Record<string, { labelKey: string; value: string }[]> = {
  delivery: [
    { labelKey: 'accountBalance.channelFoodTakeout', value: 'foodTakeout' },
    { labelKey: 'accountBalance.channelSupermarket', value: 'supermarket' },
  ],
  store: [
    { labelKey: 'accountBalance.channelGroupBuyStore', value: 'groupBuyStore' },
  ],
}

/** 扣款門店行 */
interface DeductStoreRow {
  key: string
  storeId: string
  storeLabel: string
  amount: number
}

/** 数字金额转中文大写 */
function amountToChinese(num: number): string {
  if (!num || num <= 0) return ''
  const digits = ['零', '壹', '貳', '叁', '肆', '伍', '陸', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '萬', '億']
  const intPart = Math.floor(num)
  const decPart = Math.round((num - intPart) * 100)
  const jiao = Math.floor(decPart / 10)
  const fen = decPart % 10

  let result = ''
  const intStr = String(intPart)
  const groups: number[][] = []
  for (let i = intStr.length; i > 0; i -= 4) {
    groups.unshift(intStr.slice(Math.max(0, i - 4), i).split('').map(Number))
  }
  groups.forEach((group, gi) => {
    let groupStr = ''
    let zeroFlag = false
    group.forEach((d, di) => {
      if (d === 0) { zeroFlag = true; return }
      if (zeroFlag) { groupStr += '零'; zeroFlag = false }
      groupStr += digits[d] + units[group.length - 1 - di]
    })
    if (groupStr) result += groupStr + bigUnits[groups.length - 1 - gi]
  })
  result += '元'
  if (jiao > 0) result += digits[jiao] + '角'
  if (fen > 0) result += digits[fen] + '分'
  return result
}

export default function RechargeAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || ''

  const [form] = Form.useForm()
  const [businessType, setBusinessType] = useState('delivery')
  const [isActual, setIsActual] = useState(true)
  const [payMethod, setPayMethod] = useState('corporate')
  const [virtualAmount, setVirtualAmount] = useState<number>(0)
  const [bankAmount, setBankAmount] = useState<number>(0)
  const [revenueAmount, setRevenueAmount] = useState<number>(0)
  const [deductRows, setDeductRows] = useState<DeductStoreRow[]>([])
  const [contractFiles, setContractFiles] = useState<UploadFile[]>([])
  const [paymentFiles, setPaymentFiles] = useState<UploadFile[]>([])
  const [successVisible, setSuccessVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [countdown, setCountdown] = useState(5)
  /** 翻譯後的選項 */
  const tActualPayOptions = actualPayOptions.map(o => ({ label: t(o.labelKey), value: o.value }))
  const tBusinessChannelMap = useMemo(() => {
    const result: Record<string, { label: string; value: string }[]> = {}
    Object.entries(businessChannelMap).forEach(([key, channels]) => {
      result[key] = channels.map(c => ({ label: t(c.labelKey), value: c.value }))
    })
    return result
  }, [t])

  // 歸屬BD選項：集團下門店已綁定的BD（門店管理菜單綁定）
  const [bdOptions, setBdOptions] = useState<OptionItem[]>([])
  // 扣款門店選項：當前集團下的門店列表
  const [deductStoreOptions, setDeductStoreOptions] = useState<OptionItem[]>([])

  // 按集團ID加載門店綁定的BD選項 & 集團下門店列表
  useEffect(() => {
    if (!groupIdParam) return
    fetchStoreBdOptions(groupIdParam)
      .then(list => setBdOptions(list || []))
      .catch(() => setBdOptions([]))
    fetchStoresByGroupCode(groupIdParam, brandParam)
      .then(list => setDeductStoreOptions(list || []))
      .catch(() => setDeductStoreOptions([]))
  }, [groupIdParam, brandParam])

  /** 實收賬戶充值合計 */
  const actualTotal = useMemo(() => {
    let total = 0
    if (payMethod === 'corporate' || payMethod === 'mixed') total += bankAmount
    if (payMethod === 'mixed' || payMethod === 'revenue') total += revenueAmount
    return total
  }, [payMethod, bankAmount, revenueAmount])

  /** 優惠金額 = 虛擬賬戶充值金額 - 實收賬戶充值金額 */
  const discountAmount = useMemo(() => {
    const diff = virtualAmount - actualTotal
    return diff > 0 ? diff : 0
  }, [virtualAmount, actualTotal])

  // 提交成功彈窗倒計時
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

  /** 新增扣款門店行（直接添加空行，用户随时编辑） */
  const handleAddDeductRow = () => {
    setDeductRows([...deductRows, { key: `new_${Date.now()}`, storeId: '', storeLabel: '', amount: 0 }])
  }

  /** 更新扣款門店行 */
  const handleUpdateDeductRow = (key: string, field: keyof DeductStoreRow, value: string | number) => {
    setDeductRows(prev => prev.map(r => {
      if (r.key !== key) return r
      if (field === 'storeId') {
        const opt = deductStoreOptions.find(o => o.value === value)
        return { ...r, storeId: value as string, storeLabel: opt?.label || value as string }
      }
      return { ...r, [field]: value }
    }))
  }

  /** 刪除扣款門店行 */
  const handleRemoveDeductRow = (key: string) => {
    setDeductRows(deductRows.filter(r => r.key !== key))
  }

  /** 提交申請 */
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      if (!virtualAmount || virtualAmount <= 0) {
        message.warning(t('accountBalance.fillVirtualAmount'))
        return
      }
      if (isActual) {
        if ((payMethod === 'corporate' || payMethod === 'mixed') && (!bankAmount || bankAmount <= 0)) {
          message.warning(t('accountBalance.fillBankAmount'))
          return
        }
        if (payMethod === 'mixed' || payMethod === 'revenue') {
          if (!revenueAmount || revenueAmount <= 0) {
            message.warning(t('accountBalance.fillRevenueAmount'))
            return
          }
          if (deductRows.length === 0) {
            message.warning(t('accountBalance.addDeductStore'))
            return
          }
          const emptyStore = deductRows.find(r => !r.storeId)
          if (emptyStore) {
            message.warning(t('accountBalance.selectAllDeductStores'))
            return
          }
          const emptyAmount = deductRows.find(r => !r.amount || r.amount <= 0)
          if (emptyAmount) {
            message.warning(t('accountBalance.fillAllDeductAmounts'))
            return
          }
          // 扣款门店去重校验
          const storeIds = deductRows.map(r => r.storeId).filter(Boolean)
          if (new Set(storeIds).size !== storeIds.length) {
            message.warning(t('accountBalance.duplicateDeductStore'))
            return
          }
          // 扣款门店合计金额必须等于营业额扣款金额
          const deductTotal = deductRows.reduce((sum, r) => sum + (r.amount || 0), 0)
          if (Math.abs(deductTotal - revenueAmount) > 0.01) {
            message.warning(t('accountBalance.deductTotalNotEqualRevenue'))
            return
          }
        }
        // 营业额支付：营业额支付金额不能大于虚拟账户充值金额
        if (payMethod === 'revenue' && revenueAmount > virtualAmount) {
          message.warning(t('accountBalance.revenueExceedVirtual'))
          return
        }
        // 混合支付：银行转账 + 营业额扣款不能大于虚拟账户充值金额
        if (payMethod === 'mixed' && (bankAmount + revenueAmount) > virtualAmount) {
          message.warning(t('accountBalance.mixedTotalExceedVirtual'))
          return
        }
        // 对公转账：银行转账金额不能大于虚拟账户充值金额
        if (payMethod === 'corporate' && bankAmount > virtualAmount) {
          message.warning(t('accountBalance.bankExceedVirtual'))
          return
        }
      }
      if (contractFiles.length === 0) {
        message.warning(t('accountBalance.uploadContractVoucher'))
        return
      }
      if (paymentFiles.length === 0) {
        message.warning(t('accountBalance.uploadPaymentVoucher'))
        return
      }
      // ====== 二次確認彈窗 ======
      const approvalEnabled = isWorkflowEnabled('recharge')
      const group = groupOptions.find(g => g.value === groupIdParam)
      const payMethodLabel = payMethod === 'corporate' ? t('accountBalance.settlementCorporate') : payMethod === 'mixed' ? t('accountBalance.settlementMixed') : t('accountBalance.settlementRevenue')
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
              <span className="confirm-info-label">{t('common:colGroupName')}</span>
              <span className="confirm-info-value">{group?.name || groupNameParam}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('common:colBrand')}</span>
              <span className="confirm-info-value">{brandParam}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.virtualAmount')}</span>
              <span className="confirm-info-value highlight">MOP {virtualAmount.toLocaleString()}</span>
            </div>
            {isActual && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.settlementMethod')}</span>
              <span className="confirm-info-value">{payMethodLabel}</span>
            </div>}
            {isActual && (payMethod === 'corporate' || payMethod === 'mixed') && bankAmount > 0 && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.bankTransfer')}</span>
              <span className="confirm-info-value">MOP {bankAmount.toLocaleString()}</span>
            </div>}
            {isActual && (payMethod === 'mixed' || payMethod === 'revenue') && revenueAmount > 0 && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.revenueDeduction')}</span>
              <span className="confirm-info-value">MOP {revenueAmount.toLocaleString()}</span>
            </div>}
            </div>
            {!approvalEnabled && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: 'linear-gradient(135deg, #FFF1F0, #FFFAF0)',
                border: '1.5px solid #FF7A45',
                fontSize: 13, color: '#CF1322', lineHeight: 1.6, fontWeight: 500,
              }}>
                ⚡ 當前充值審批流程已停用，確認後將直接充值到賬，無需審批。
              </div>
            )}
          </div>
        ),
        onOk: async () => {
          try {
            const payload: RechargeApplyPayload = {
              groupId: groupIdParam,
              groupName: group?.name || groupNameParam || '',
              brand: brandParam || 'flashBee',
              businessType,
              businessChannelLabel: (businessChannelMap[businessType] || []).find(o => o.value === form.getFieldValue('businessChannel'))?.labelKey ? t((businessChannelMap[businessType] || []).find(o => o.value === form.getFieldValue('businessChannel'))!.labelKey) : '--',
              isActual,
              payMethod,
              virtualAmount,
              actualTotal,
              discountAmount,
              bankAmount: isActual && (payMethod === 'corporate' || payMethod === 'mixed') ? bankAmount : 0,
              revenueAmount: isActual && (payMethod === 'mixed' || payMethod === 'revenue') ? revenueAmount : 0,
              deductStores: deductRows.map(r => ({ storeId: r.storeId, storeLabel: r.storeLabel, amount: r.amount })),
              bd: (() => {
                const bdVal = form.getFieldValue('bd')
                return bdOptions.find(o => o.value === bdVal)?.label || bdVal || '--'
              })(),
              remark: form.getFieldValue('remark') || '',
            }
            const flowNo = await submitRechargeApply(payload)
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
      // 表单校验未通过时 antd 已在字段标红；财务接口为静默请求，后端业务错误需在此提示
      if (!(err && typeof err === 'object' && 'errorFields' in err)) {
        message.error(err instanceof Error && err.message ? err.message : t('accountBalance.submitFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** 文件上传前校验 */
  const beforeUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      message.error(t('accountBalance.onlyFormatError'))
      return Upload.LIST_IGNORE
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error(t('accountBalance.fileSizeExceed'))
      return Upload.LIST_IGNORE
    }
    return false
  }

  /** 渲染文件列表 */
  const renderFileList = (files: UploadFile[], setFiles: (f: UploadFile[]) => void) => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {files.map((file) => (
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
            onClick={() => setFiles(files.filter(f => f.uid !== file.uid))}
          >×</Button>
        </div>
      ))}
      {files.length < 5 && (
        <Upload
          accept=".png,.jpg,.jpeg,.pdf"
          showUploadList={false}
          beforeUpload={beforeUpload}
          onChange={(info) => {
            if (info.file.status !== 'removed') {
              setFiles([...files, { uid: info.file.uid, name: info.file.name }])
            }
          }}
        >
          <div style={{
            width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa',
            transition: 'all 0.3s',
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

  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
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
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('accountBalance.rechargePageTitle')}</h2>
              <Tag color="blue" style={{ fontSize: 11 }}>{t('accountBalance.rechargeApplyTag')}</Tag>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical"
        initialValues={{
          groupId: groupIdParam || undefined,
          groupName: groupNameParam || undefined,
          brand: brandParam || 'mFood',
          businessType: 'delivery',
          businessChannel: 'foodTakeout',
          isActual: true,
        }}
      >
        {/* 基础信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AccountBookOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.basicInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('common:colGroupId')} name="groupId" rules={[{ required: true, message: t('accountBalance.selectGroup') }]}>
              <Input disabled addonAfter={groupNameParam || t('accountBalance.showAfterSelectGroup')} />
            </Form.Item>
            <Form.Item label={t('common:colBrand')}>
              <BrandTag value={brandParam || 'mFood'} />
            </Form.Item>
            <Form.Item label={t('accountBalance.accountStatusLabel')}>
              <Tag color="green">{t('accountBalance.statusNormal')}</Tag>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('accountBalance.bizTypeLabel')} name="businessType" rules={[{ required: true, message: t('accountBalance.selectBizType') }]}>
              <Radio.Group
                onChange={(e) => {
                  const type = e.target.value
                  setBusinessType(type)
                  form.setFieldsValue({ businessChannel: businessChannelMap[type][0].value })
                }}
              >
                <Radio value="delivery">{t('accountBalance.bizDelivery')}</Radio>
                <Radio value="store">{t('accountBalance.bizStore')}</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item label={t('common:colChannel')} name="businessChannel" rules={[{ required: true, message: t('accountBalance.selectBusinessChannel') }]}>
              <Radio.Group>
                {tBusinessChannelMap[businessType].map(opt => (
                  <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
                ))}
              </Radio.Group>
            </Form.Item>
          </div>
        </div>

        {/* 充值金额 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.rechargeAmountSection')}</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.amountConfigTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 虛擬賬戶充值 + 歸屬BD 並排 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', marginBottom: 16 }}>
            <Form.Item
              label={
                <span>
                  {t('accountBalance.virtualRechargeLabel')}
                  <span style={{ fontSize: 12, color: '#E53935', marginLeft: 4 }}>*</span>
                  <span style={{ fontSize: 11, color: '#E53935', fontWeight: 400, marginLeft: 8 }}>{t('accountBalance.bdPerformanceWarn')}</span>
                </span>
              }
              required
              style={{ marginBottom: 0 }}
            >
              <InputNumber
                placeholder={t('accountBalance.enterRechargeAmount')}
                min={0}
                precision={2}
                value={virtualAmount || undefined}
                onChange={(v) => setVirtualAmount(v || 0)}
                style={{ width: '100%' }}
                addonAfter="MOP"
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(v?.replace(/,/g, '') || 0)}
              />
              {virtualAmount > 0 && (
                <span style={{ color: '#E8720C', fontSize: 12, fontWeight: 500, marginTop: 4, display: 'block' }}>{amountToChinese(virtualAmount)}</span>
              )}
            </Form.Item>
            <Form.Item label={t('accountBalance.belongBdLabel')} name="bd" style={{ marginBottom: 0 }}>
              <Select
                placeholder={bdOptions.length ? t('accountBalance.selectBdOrNone') : t('accountBalance.noBdBoundGroup')}
                options={bdOptions}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: '#262626' }}>
              {t('accountBalance.isActualLabel')}
              <Tooltip title={
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  <div>{t('accountBalance.isActualOnDesc')}</div>
                  <div>{t('accountBalance.isActualOffDesc')}</div>
                </div>
              }>
                <QuestionCircleOutlined style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 6, cursor: 'help' }} />
              </Tooltip>
            </span>
            <Switch
              checked={isActual}
              checkedChildren={t('accountBalance.switchYes')}
              unCheckedChildren={t('accountBalance.switchNo')}
              onChange={(checked) => setIsActual(checked)}
            />
          </div>

          {isActual && (
            <>
              {/* 實收賬戶充值 */}
              <div style={{
                borderRadius: 8, padding: '16px 20px', marginBottom: 16,
                background: '#FAFAFA', border: '1px solid #f0f0f0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('accountBalance.actualAccountRecharge')}</span>
                  <Select
                    options={tActualPayOptions}
                    value={payMethod}
                    onChange={setPayMethod}
                    style={{ width: 180 }}
                  />
                  {(payMethod === 'mixed' || payMethod === 'revenue') && (
                    <span style={{ fontSize: 12, color: '#E53935' }}>
                      {t('accountBalance.autoRechargeWarn')}
                    </span>
                  )}
                </div>

                {/* 混合支付：銀行轉賬 + 營業額扣款 並排 */}
                {payMethod === 'mixed' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 8 }}>
                        {t('accountBalance.bankTransfer')} <span style={{ color: '#E53935' }}>*</span>
                      </div>
                      <InputNumber
                        placeholder={t('accountBalance.enterBankAmount')}
                        min={0}
                        precision={2}
                        value={bankAmount || undefined}
                        onChange={(v) => setBankAmount(v || 0)}
                        style={{ width: '100%' }}
                        addonAfter="MOP"
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                      />
                      {bankAmount > 0 && (
                        <span style={{ color: '#1890ff', fontSize: 12, fontWeight: 500, marginTop: 4, display: 'block' }}>{amountToChinese(bankAmount)}</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 8 }}>
                        {t('accountBalance.revenueDeduction')} <span style={{ color: '#E53935' }}>*</span>
                      </div>
                      <InputNumber
                        placeholder={t('accountBalance.enterRevenueAmount')}
                        min={0}
                        precision={2}
                        value={revenueAmount || undefined}
                        onChange={(v) => setRevenueAmount(v || 0)}
                        style={{ width: '100%' }}
                        addonAfter="MOP"
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                      />
                      {revenueAmount > 0 && (
                        <span style={{ color: '#722ed1', fontSize: 12, fontWeight: 500, marginTop: 4, display: 'block' }}>{amountToChinese(revenueAmount)}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 對公轉賬：僅銀行轉賬 */}
                {payMethod === 'corporate' && (
                  <div style={{ marginBottom: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 8 }}>
                      {t('accountBalance.bankTransfer')} <span style={{ color: '#E53935' }}>*</span>
                    </div>
                    <InputNumber
                      placeholder={t('accountBalance.enterBankAmount')}
                      min={0}
                      precision={2}
                      value={bankAmount || undefined}
                      onChange={(v) => setBankAmount(v || 0)}
                      style={{ width: 280 }}
                      addonAfter="MOP"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                    />
                    {bankAmount > 0 && (
                      <span style={{ color: '#1890ff', fontSize: 12, fontWeight: 500, marginTop: 4, display: 'block' }}>{amountToChinese(bankAmount)}</span>
                    )}
                  </div>
                )}

                {/* 營業額支付：僅營業額扣款 */}
                {payMethod === 'revenue' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 8 }}>
                      {t('accountBalance.revenueDeduction')} <span style={{ color: '#E53935' }}>*</span>
                    </div>
                    <InputNumber
                      placeholder={t('accountBalance.enterRevenueAmount')}
                      min={0}
                      precision={2}
                      value={revenueAmount || undefined}
                      onChange={(v) => setRevenueAmount(v || 0)}
                      style={{ width: 280 }}
                      addonAfter="MOP"
                      formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                    />
                    {revenueAmount > 0 && (
                      <span style={{ color: '#722ed1', fontSize: 12, fontWeight: 500, marginTop: 4, display: 'block' }}>{amountToChinese(revenueAmount)}</span>
                    )}
                  </div>
                )}

                {/* 優惠金額展示 */}
                {discountAmount > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                    padding: '10px 20px', marginBottom: 16, borderRadius: 8,
                    background: 'linear-gradient(135deg, #f6ffed, #e8f5e9)',
                    border: '1px solid #52c41a22',
                  }}>
                    <span style={{ fontSize: 13, color: '#595959' }}>{t('accountBalance.discountAmountLabel')}</span>
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                      {t('accountBalance.virtualMinusActual', { virtual: virtualAmount.toLocaleString(), actual: actualTotal.toLocaleString() })}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#52C41A' }}>MOP {discountAmount.toLocaleString()}</span>
                  </div>
                )}
                
                {/* 扣款門店（混合支付 & 營業額支付） */}
                {(payMethod === 'mixed' || payMethod === 'revenue') && (
                  <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

                    {/* 扣款門店 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.deductStoreSection')}</span>
                      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                      <Button type="primary" size="small" icon={<PlusOutlined />}
                        style={{ borderRadius: 6 }}
                        onClick={() => handleAddDeductRow()}
                      >{t('accountBalance.addStore')}</Button>
                    </div>
                    <ConfigProvider componentSize="middle">
                    <Table
                      rowKey="key"
                      dataSource={deductRows}
                      pagination={false}
                      bordered
                      columns={[
                        {
                          title: t('common:colStoreId') + '/' + t('common:colStoreName'),
                          dataIndex: 'storeLabel',
                          width: 240,
                          render: (_: string, record: DeductStoreRow) => (
                            <Select
                              placeholder={t('accountBalance.searchStoreByIdOrName')}
                              options={deductStoreOptions}
                              value={record.storeId || undefined}
                              onChange={(v) => handleUpdateDeductRow(record.key, 'storeId', v || '')}
                              showSearch
                              allowClear
                              style={{ width: '100%' }}
                              filterOption={(input, option) => (option?.label ?? '').includes(input)}
                            />
                          ),
                        },
                        {
                          title: t('accountBalance.deductAmountLabel'),
                          dataIndex: 'amount',
                          width: 180,
                          align: 'center',
                          render: (val: number, record: DeductStoreRow) => (
                            <InputNumber
                              placeholder={t('accountBalance.enterDeductAmount')}
                              value={val || undefined}
                              min={0}
                              precision={2}
                              addonAfter="MOP"
                              style={{ width: '100%' }}
                              onChange={(v) => handleUpdateDeductRow(record.key, 'amount', v ?? 0)}
                            />
                          ),
                        },
                        {
                          title: t('common:colAction'),
                          width: 80,
                          align: 'center',
                          render: (_: unknown, record: DeductStoreRow) => (
                            <Button type="link" danger size="small" onClick={() => handleRemoveDeductRow(record.key)}>{t('accountBalance.deleteAction')}</Button>
                          ),
                        },
                      ]}
                    />
                    </ConfigProvider>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 凭证上传 */}
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
          <Form.Item label={t('accountBalance.contractVoucher')} required>
            {renderFileList(contractFiles, setContractFiles)}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('accountBalance.voucherLimitHint')}
            </div>
          </Form.Item>

          <Form.Item label={t('accountBalance.paymentVoucher')} required style={{ marginBottom: 0 }}>
            {renderFileList(paymentFiles, setPaymentFiles)}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('accountBalance.voucherLimitHint')}
            </div>
          </Form.Item>
        </div>

        {/* 备注信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('accountBalance.remarkInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              placeholder={t('accountBalance.rechargeRemarkPlaceholder')}
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作按鈕（取消/提交申請） */}
      <div className="form-footer">
        <Button onClick={() => navigate('/account-balance')}>{t('common:cancel')}</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          {t('accountBalance.submitApply')}
        </Button>
      </div>

      {/* ====== 提交成功彈窗 ====== */}
      {successVisible && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '32px 28px',
            width: 400, textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #52C41A, #73D13D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(82,196,26,0.3)',
            }}>
              <span style={{ fontSize: 32, color: '#fff' }}>✓</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
              {t('accountBalance.submitSuccessTitle')}
            </h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              {submittedFlowNo && !isDirectExec(submittedFlowNo) && (
                <>{t('accountBalance.flowNoLabel')}<span style={{ color: '#E8720C', fontWeight: 500 }}>{submittedFlowNo}</span><br /></>
              )}
              {isDirectExec(submittedFlowNo)
                ? '✅ 已直接充值到賬（未經審批）'
                : t('accountBalance.submitSuccessDesc')
              }
            </p>
            <Button
              type="primary"
              size="large"
              onClick={() => navigate('/account-balance')}
              style={{ minWidth: 120, height: 40, borderRadius: 8 }}
            >
              {t('accountBalance.backToList')}{countdown > 0 && ` (${countdown}s)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
