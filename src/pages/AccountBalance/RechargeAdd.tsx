import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, Select, Radio, Button, message, InputNumber, Tag, Tooltip, Table, Switch, ConfigProvider, Modal, type UploadFile } from 'antd'
import {
  SendOutlined,
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
import { fetchMerchantGroupOptions } from '../../api/merchantGroup'
import type { OptionItem } from '../../api/types'
import { isWorkflowEnabled } from '../../utils/workflowEnabled'
import { amountToChinese } from './components/shared'
import CertificateUploader from './components/CertificateUploader'
import SuccessModal from './components/SuccessModal'
import SectionCard from './components/SectionCard'
import FormPageHeader from './components/FormPageHeader'

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

export default function RechargeAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || ''
  const fromParam = searchParams.get('from') || ''

  /** 返回地址：从流程中心进入则返回流程中心，否则返回账户余额 */
  const backTarget = fromParam === 'process-center' ? '/process-center' : '/account-balance'
  const goBack = useCallback(() => navigate(backTarget), [navigate, backTarget])

  /** 从流程中心进入时，集团字段可编辑 */
  const isFromProcessCenter = fromParam === 'process-center'

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

  /** 集团搜索选项（从流程中心进入时使用） */
  const [groupSearchOptions, setGroupSearchOptions] = useState<OptionItem[]>([])
  const [groupSearchLoading, setGroupSearchLoading] = useState(false)

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

  /** 集团搜索回调（从流程中心进入时启用） */
  const handleGroupSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setGroupSearchOptions([]); return }
    setGroupSearchLoading(true)
    try {
      const opts = await fetchMerchantGroupOptions(keyword.trim())
      setGroupSearchOptions(opts || [])
    } catch { setGroupSearchOptions([]) }
    finally { setGroupSearchLoading(false) }
  }, [])

  /** 集团选择变更（从流程中心进入时启用） */
  const handleGroupChange = useCallback((value: string) => {
    const opt = groupSearchOptions.find(o => o.value === value)
    if (opt) {
      form.setFieldsValue({ groupId: value, groupName: opt.label })
    }
  }, [groupSearchOptions, form])

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

  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <FormPageHeader
        title={t('accountBalance.rechargePageTitle')}
        tag={<Tag style={{ fontSize: 11, color: '#52C41A', borderColor: '#52C41A' }}>{t('accountBalance.rechargeApplyTag')}</Tag>}
        onBack={goBack}
      />

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
        <SectionCard icon={<AccountBookOutlined style={{ fontSize: 14, color: '#1890ff' }} />} title={t('accountBalance.basicInfo')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('common:colGroupId')} name="groupId" rules={[{ required: true, message: t('accountBalance.selectGroup') }]}>
              {isFromProcessCenter ? (
                <Select
                  showSearch
                  allowClear
                  placeholder={t('accountBalance.selectGroup')}
                  filterOption={false}
                  onSearch={handleGroupSearch}
                  onChange={handleGroupChange}
                  loading={groupSearchLoading}
                  notFoundContent={t('common.noData')}
                  options={groupSearchOptions}
                />
              ) : (
                <Input disabled addonAfter={groupNameParam || t('accountBalance.showAfterSelectGroup')} />
              )}
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
        </SectionCard>

        {/* 充值金额 */}
        <SectionCard
          icon={<DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
          iconBg="#fff7e6" iconColor="#fa8c16"
          title={t('accountBalance.rechargeAmountSection')}
          tag={<Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.amountConfigTag')}</Tag>}
        >

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
        </SectionCard>

        {/* 凭证上传 */}
        <SectionCard
          icon={<FileProtectOutlined style={{ fontSize: 14, color: '#722ed1' }} />}
          iconBg="#f9f0ff" iconColor="#722ed1"
          title={t('accountBalance.relatedVoucher')}
          tag={<Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.voucherUploadTag')}</Tag>}
          extraEnd={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('accountBalance.supportFormat')}</span>}
        >
          <Form.Item label={t('accountBalance.contractVoucher')} required>
            <CertificateUploader files={contractFiles} setFiles={setContractFiles} />
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('accountBalance.voucherLimitHint')}
            </div>
          </Form.Item>

          <Form.Item label={t('accountBalance.paymentVoucher')} required style={{ marginBottom: 0 }}>
            <CertificateUploader files={paymentFiles} setFiles={setPaymentFiles} />
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('accountBalance.voucherLimitHint')}
            </div>
          </Form.Item>
        </SectionCard>

        {/* 备注信息 */}
        <SectionCard icon={<EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />} title={t('accountBalance.remarkInfo')}>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              placeholder={t('accountBalance.rechargeRemarkPlaceholder')}
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </SectionCard>
      </Form>

      {/* 底部操作按鈕（取消/提交申請） */}
      <div className="form-footer">
        <Button onClick={() => navigate('/account-balance')}>{t('common:cancel')}</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          {t('accountBalance.submitApply')}
        </Button>
      </div>

      <SuccessModal visible={successVisible} flowNo={submittedFlowNo} onBack={goBack} />
    </div>
  )
}
