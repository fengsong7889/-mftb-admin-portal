import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, Select, Radio, Button, message, InputNumber, Tag, Popover, Modal, type UploadFile } from 'antd'
import {
  AccountBookOutlined,
  DollarOutlined,
  FileProtectOutlined,
  EditOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import BrandTag from '../../components/BrandTag'
import { fetchFinAccounts, fetchFinBatches, submitDeductApply, fetchFinRiskConfig } from '../../api/finance'
import type { DeductApplyPayload, FinRiskRow } from '../../api/finance'
import { fetchStoresByGroupCode, fetchStoreBds } from '../../api/store'
import type { OptionItem } from '../../api/types'
import { isWorkflowEnabled, isDirectExec } from '../../utils/workflowEnabled'
import { amountToChinese } from './components/shared'
import { useAccountFormCommon } from './components/useAccountFormCommon'
import { showConfirmSubmit, handleFormSubmitError } from './components/ConfirmSubmitModal'
import MOPAmountInput from './components/MOPAmountInput'
import FormFooter from './components/FormFooter'
import CertificateUploader from './components/CertificateUploader'
import SuccessModal from './components/SuccessModal'
import SectionCard from './components/SectionCard'
import FormPageHeader from './components/FormPageHeader'
import BalanceCard from './components/BalanceCard'

/** 扣款方式選項（labelKey 為 i18n key） */
const _deductMethodOptions = [
  { labelKey: 'accountBalance.deductMethodConsume', value: 'consume' },
  { labelKey: 'accountBalance.deductMethodBatch', value: 'batch' },
  { labelKey: 'accountBalance.deductMethodAccount', value: 'account' },
]

/** 業務頻道選項（labelKey 為 i18n key） */
const businessChannelOptions = [
  { labelKey: 'accountBalance.channelFoodTakeout', value: 'foodTakeout' },
  { labelKey: 'accountBalance.channelSupermarket', value: 'supermarket' },
  { labelKey: 'accountBalance.channelGroupBuyStore', value: 'groupBuyStore' },
]

/** 消費類型選項（labelKey 為 i18n key） */
const consumeTypeOptions = [
  { labelKey: 'accountBalance.consumePosRepair', value: 'posRepair' },
  { labelKey: 'accountBalance.consumeBusAd', value: 'busAd' },
  { labelKey: 'accountBalance.consumeDeptStore', value: 'deptStore' },
  { labelKey: 'accountBalance.consumeRevitalize', value: 'revitalize' },
  { labelKey: 'accountBalance.consumeBasicPlan', value: 'basicPlan' },
  { labelKey: 'accountBalance.consumeMachineInspect', value: 'machineInspect' },
  { labelKey: 'accountBalance.consumeMachineRepair', value: 'machineRepair' },
  { labelKey: 'accountBalance.consumeGoldPlan', value: 'goldPlan' },
  { labelKey: 'accountBalance.consumeSelectPlan', value: 'selectPlan' },
  { labelKey: 'accountBalance.consumeFreeEntry', value: 'freeEntry' },
  { labelKey: 'accountBalance.consumeEnterprisePlan', value: 'enterprisePlan' },
  { labelKey: 'accountBalance.consumeUpgradePlan', value: 'upgradePlan' },
  { labelKey: 'accountBalance.consumeGroupPlan', value: 'groupPlan' },
  { labelKey: 'accountBalance.consumeXiaohongshuAd', value: 'xiaohongshuAd' },
  { labelKey: 'accountBalance.consumeProPlan', value: 'proPlan' },
]

/** 充值批次選項（批次號 + 可扣金額 + 結算方式） */
interface BatchOption {
  label: string
  value: string
  deductible: number
  settlement: string
}

/** 結算方式映射（值為 i18n key） */
const settlementKeyMap: Record<string, string> = {
  corporate: 'accountBalance.settlementCorporate',
  mixed: 'accountBalance.settlementMixed',
  revenue: 'accountBalance.settlementRevenue',
}



export default function DeductAdd() {
  const { t } = useTranslation()
  const common = useAccountFormCommon()
  const { groupIdParam, groupNameParam, brandParam, goBack, isFromProcessCenter,
    groupSearchOptions, groupSearchLoading, handleGroupSearch,
    certificateFiles, setCertificateFiles,
    successVisible, setSuccessVisible, submitting, setSubmitting,
    submittedFlowNo, setSubmittedFlowNo } = common

  const [form] = Form.useForm()
  const [deductMethod, setDeductMethod] = useState('consume')
  const [selectedBatch, setSelectedBatch] = useState<string | undefined>(undefined)
  /** 集團虛擬賬戶餘額（數據庫讀取） */
  const [sourceVirtualBalance, setSourceVirtualBalance] = useState(0)
  /** 門店選項：該集團下且品牌相同的門店 */
  const [storeOptions, setStoreOptions] = useState<OptionItem[]>([])

  /** 歸屬BD選項：所選門店綁定的BD */
  const [bdOptions, setBdOptions] = useState<OptionItem[]>([])
  /** 充值批次選項：該集團的充值批次 */
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([])
  const [deductAmount, setDeductAmount] = useState<number>(0)
  /** 集團風控信息（消費扣款可用額度提示） */
  const [riskRow, setRiskRow] = useState<FinRiskRow | null>(null)

  /** 翻譯後的選項陣列（供 Select 使用） */
  const tBusinessChannelOptions = businessChannelOptions.map(o => ({ label: t(o.labelKey), value: o.value }))
  const tConsumeTypeOptions = consumeTypeOptions.map(o => ({ label: t(o.labelKey), value: o.value }))

  /** 當前批次的可扣金額 */
  const currentBatch = batchOptions.find(b => b.value === selectedBatch)

  // 加載虛擬賬戶餘額（按集團+品牌定位賬戶）
  useEffect(() => {
    if (!groupIdParam) return
    fetchFinAccounts({ page: 1, size: 1, groupId: groupIdParam, brand: brandParam })
      .then(res => setSourceVirtualBalance(Number(res.records?.[0]?.virtualBalance) || 0))
      .catch(() => setSourceVirtualBalance(0))
  }, [groupIdParam, brandParam])

  // 加載集團風控信息（消費扣款受限時展示可用額度）
  useEffect(() => {
    if (!groupIdParam) return
    fetchFinRiskConfig(groupIdParam, brandParam)
      .then(setRiskRow)
      .catch(() => setRiskRow(null))
  }, [groupIdParam, brandParam])

  // 加載門店選項（集團下且資產品牌與集團一致）
  useEffect(() => {
    if (!groupIdParam) return
    fetchStoresByGroupCode(groupIdParam, brandParam)
      .then(list => setStoreOptions(list || []))
      .catch(() => setStoreOptions([]))
  }, [groupIdParam, brandParam])

  /** 集团选择变更（从流程中心进入时启用） */
  const handleGroupChange = useCallback((value: string) => {
    const opt = groupSearchOptions.find(o => o.value === value)
    if (opt) {
      form.setFieldsValue({ groupId: value, groupName: opt.label })
    }
  }, [groupSearchOptions, form])

  // 加載充值批次選項（數據庫充值批次，可扣金額=虛擬充值金額）
  useEffect(() => {
    if (!groupIdParam) return
    fetchFinBatches({ page: 1, size: 200, groupId: groupIdParam, brand: brandParam, batchType: 'recharge' })
      .then(res => {
        const options = (res.records || []).map(b => ({
          label: b.batchNo,
          value: b.batchNo,
          deductible: Number(b.virtualAmount) || 0,
          settlement: String(b.extra?.payMethod || ''),
        }))
        setBatchOptions(options)
      })
      .catch(() => setBatchOptions([]))
  }, [groupIdParam, brandParam])

  /** 選擇門店後：重置歸屬BD，並加載該門店綁定的BD選項 */
  const handleStoreChange = (storeId?: string) => {
    form.setFieldValue('consumeBd', undefined)
    setBdOptions([])
    if (!storeId) return
    fetchStoreBds(Number(storeId))
      .then(list => setBdOptions((list || []).map(b => ({
        value: b.bdEmpId,
        label: `${b.bdName || b.bdEmpId}(${b.bdEmpId})`,
      }))))
      .catch(() => setBdOptions([]))
  }

  /** 提交申請 */
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      if (!deductAmount || deductAmount <= 0) {
        message.warning(t('accountBalance.fillDeductAmount'))
        return
      }
      if (deductMethod === 'batch' && currentBatch && deductAmount > currentBatch.deductible) {
        message.warning(t('accountBalance.amountExceedDeductible'))
        return
      }
      if (certificateFiles.length === 0) {
        message.warning(t('accountBalance.uploadCertificate'))
        return
      }
      // ====== 二次確認彈窗 ======
      const approvalEnabled = isWorkflowEnabled('deduct')
      const consumeStoreId = form.getFieldValue('consumeStore')
      const consumeStoreOpt = storeOptions.find(s => s.value === consumeStoreId)
      const consumeTypeVal = form.getFieldValue('consumeType')
      const consumeChannelVal = form.getFieldValue('consumeChannel')
      const consumeBdVal = form.getFieldValue('consumeBd')
      const deductMethodLabel = deductMethod === 'consume' ? t('accountBalance.deductConsume') : deductMethod === 'batch' ? t('accountBalance.deductBatch') : t('accountBalance.deductAccount')
      showConfirmSubmit(t, {
        infoRows: (
          <>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('common:colGroupName')}</span>
              <span className="confirm-info-value">{groupNameParam}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.deductAmountLabel')}</span>
              <span className="confirm-info-value danger">MOP {deductAmount.toLocaleString()}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.deductMethodLabel')}</span>
              <span className="confirm-info-value">{deductMethodLabel}</span>
            </div>
            {deductMethod === 'consume' && consumeStoreOpt && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.consumeStoreLabel')}</span>
              <span className="confirm-info-value">{consumeStoreOpt.label}</span>
            </div>}
            {deductMethod === 'batch' && selectedBatch && <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.batchNo')}</span>
              <span className="confirm-info-value">{selectedBatch}</span>
            </div>}
          </>
        ),
        approvalEnabled,
        directExecDesc: '當前扣款審批流程已停用，確認後將直接執行扣款，無需審批。',
        onConfirm: async () => {
          try {
            const payload: DeductApplyPayload = {
              groupId: groupIdParam,
              groupName: groupNameParam,
              brand: brandParam,
              deductMethod,
              deductAmount,
              virtualBalance: sourceVirtualBalance,
              consumeChannel: businessChannelOptions.find(c => c.value === consumeChannelVal)?.labelKey ? t(businessChannelOptions.find(c => c.value === consumeChannelVal)!.labelKey) : '',
              consumeStore: consumeStoreOpt?.label || '',
              consumeType: consumeTypeOptions.find(o => o.value === consumeTypeVal)?.labelKey ? t(consumeTypeOptions.find(o => o.value === consumeTypeVal)!.labelKey) : '',
              consumeBd: bdOptions.find(o => o.value === consumeBdVal)?.label || consumeBdVal || '--',
              batchNo: deductMethod === 'batch' ? (selectedBatch || '') : '',
              batchDeductible: deductMethod === 'batch' ? (currentBatch?.deductible || 0) : 0,
              batchSettlement: deductMethod === 'batch' ? (settlementKeyMap[currentBatch?.settlement || ''] ? t(settlementKeyMap[currentBatch?.settlement || '']) : '') : '',
              remark: form.getFieldValue('remark') || '',
            }
            const flowNo = await submitDeductApply(payload)
            setSubmittedFlowNo(flowNo)
            setTimeout(() => setSuccessVisible(true), 350)
          } catch (err) {
            message.error(err instanceof Error && err.message ? err.message : t('accountBalance.submitFailed'))
          }
        },
      })
    } catch (err) {
      handleFormSubmitError(err, t('accountBalance.submitFailed'), message.error)
    } finally {
      setSubmitting(false)
    }
  }
  


  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <FormPageHeader
        title={t('accountBalance.deductPageTitle')}
        tag={<Tag style={{ fontSize: 11, color: '#FF4D4F', borderColor: '#FF4D4F' }}>{t('accountBalance.deductApplyTag')}</Tag>}
        onBack={goBack}
      />

      <Form form={form} layout="vertical"
        initialValues={{
          groupId: groupIdParam,
          groupName: groupNameParam,
          deductMethod: 'consume',
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
                <Input disabled addonAfter={groupNameParam} />
              )}
            </Form.Item>
            <Form.Item label={t('common:colBrand')}>
              <BrandTag value={brandParam} />
            </Form.Item>
            <Form.Item label={t('accountBalance.accountStatusLabel')}>
              <Tag color="green">{t('accountBalance.statusNormal')}</Tag>
            </Form.Item>
          </div>
        </SectionCard>

        {/* 扣款方式 */}
        <SectionCard
          icon={<DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
          iconBg="#fff7e6" iconColor="#fa8c16"
          title={t('accountBalance.deductMethodLabel')}
          tag={<Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.deductConfigTag')}</Tag>}
        >

          {/* 虛擬賬戶餘額展示 */}
          <BalanceCard value={sourceVirtualBalance} label={t('accountBalance.virtualBalance')} />

          <Form.Item label={t('accountBalance.deductMethodLabel')} name="deductMethod" rules={[{ required: true }]}>
            <Radio.Group onChange={(e) => { setDeductMethod(e.target.value); setDeductAmount(0); setSelectedBatch(undefined) }}>
              <Radio value="consume">{t('accountBalance.deductMethodConsume')}</Radio>
              <Radio value="batch">
                {t('accountBalance.deductMethodBatch')}
                <Popover
                  content={
                    <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                      <div>1. {t('accountBalance.batchPopoverB1')}</div>
                      <div>2. {t('accountBalance.batchPopoverB2')}</div>
                      <div style={{ paddingLeft: 12 }}>• {t('accountBalance.batchPopoverB2a')}</div>
                      <div style={{ paddingLeft: 12 }}>• {t('accountBalance.batchPopoverB2b')}</div>
                    </div>
                  }
                  trigger="hover"
                  placement="top"
                >
                  <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
                </Popover>
              </Radio>
              <Radio value="account">
                {t('accountBalance.deductMethodAccount')}
                <Popover
                  content={
                    <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                      <div>1. {t('accountBalance.acctPopoverB1')}</div>
                      <div>2. {t('accountBalance.acctPopoverB2')}</div>
                      <div style={{ paddingLeft: 12 }}>• {t('accountBalance.deductPopoverB2a')}</div>
                      <div style={{ paddingLeft: 12 }}>• {t('accountBalance.deductPopoverB2b')}</div>
                      <div>3. {t('accountBalance.acctPopoverB3')}</div>
                    </div>
                  }
                  trigger="hover"
                  placement="top"
                >
                  <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
                </Popover>
              </Radio>
            </Radio.Group>
          </Form.Item>

          {/* ====== 消費扣款 ====== */}
          {deductMethod === 'consume' && (
            <>
            {/* 風控提示：集團有未結清欠款時展示消費扣款可用額度 */}
            {riskRow && riskRow.unsettledDebt > 0 && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                background: riskRow.limited && deductAmount > Number(riskRow.availableAmount ?? 0) ? '#FFF1F0' : '#FFF7E6',
                border: `1px solid ${riskRow.limited && deductAmount > Number(riskRow.availableAmount ?? 0) ? '#FFA39E' : '#FFD591'}`,
                fontSize: 12, lineHeight: 1.8,
                color: riskRow.limited && deductAmount > Number(riskRow.availableAmount ?? 0) ? '#CF1322' : '#AD6800',
              }}>
                {riskRow.limited
                  ? t('accountBalance.consumeRiskLimitHint', {
                      available: riskRow.availableAmount == null ? '--' : Number(riskRow.availableAmount).toLocaleString(),
                    })
                  : t('accountBalance.consumeRiskExemptHint')}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
              <Form.Item label={t('common:colChannel')} name="consumeChannel" rules={[{ required: true, message: t('accountBalance.selectBusinessChannel') }]}>
                <Select placeholder={t('accountBalance.selectBusinessChannel')} options={tBusinessChannelOptions} allowClear />
              </Form.Item>
              <Form.Item label={t('common:colStoreName')} name="consumeStore" rules={[{ required: true, message: t('accountBalance.selectStore') }]}>
                <Select
                  placeholder={storeOptions.length ? t('accountBalance.selectStore') : t('accountBalance.noSameBrandStore')}
                  options={storeOptions}
                  showSearch
                  allowClear
                  onChange={handleStoreChange}
                  filterOption={(input, option) => (option?.label ?? '').includes(input)}
                />
              </Form.Item>
              <Form.Item label={t('accountBalance.consumeTypeLabel')} name="consumeType" rules={[{ required: true, message: t('accountBalance.selectConsumeType') }]}>
                <Select placeholder={t('accountBalance.selectConsumeType')} options={tConsumeTypeOptions} allowClear />
              </Form.Item>
              <Form.Item label={t('accountBalance.belongBdLabel')} name="consumeBd">
                <Select
                  placeholder={
                    !form.getFieldValue('consumeStore') ? t('accountBalance.selectStoreFirst')
                      : bdOptions.length ? t('accountBalance.selectBd') : t('accountBalance.noBdBound')
                  }
                  options={bdOptions}
                  allowClear
                />
              </Form.Item>
              <Form.Item label={t('accountBalance.deductAmountLabel')} required style={{ marginBottom: deductAmount > 0 ? 4 : undefined }}>
                <MOPAmountInput value={deductAmount} onChange={setDeductAmount} placeholder={t('accountBalance.enterDeductAmount')} />
              </Form.Item>
            </div>
            </>
          )}

          {/* ====== 充值批次扣款 ====== */}
          {deductMethod === 'batch' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
                <Form.Item label={t('accountBalance.batchNoLabel')} name="batchNo" rules={[{ required: true, message: t('accountBalance.selectBatchNo') }]}>
                  <Select
                    placeholder={batchOptions.length ? t('accountBalance.selectRechargeBatch') : t('accountBalance.noRechargeBatch')}
                    options={batchOptions.map(b => ({ label: b.label, value: b.value }))}
                    showSearch
                    allowClear
                    onChange={(val) => { setSelectedBatch(val); setDeductAmount(0) }}
                    filterOption={(input, option) => (option?.label ?? '').includes(input)}
                  />
                </Form.Item>
                <Form.Item label={t('accountBalance.deductibleAmountLabel')}>
                  <InputNumber
                    disabled
                    value={currentBatch ? currentBatch.deductible : undefined}
                    style={{ width: '100%' }}
                    addonAfter="MOP"
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  />
                </Form.Item>
                <Form.Item label={t('accountBalance.settlementMethodLabel')}>
                  <Input
                    disabled
                    value={currentBatch ? (settlementKeyMap[currentBatch.settlement] ? t(settlementKeyMap[currentBatch.settlement]) : '--') : undefined}
                    placeholder={t('accountBalance.showAfterSelectBatch')}
                  />
                </Form.Item>
                <Form.Item label={t('accountBalance.deductAmountLabel')} required style={{ marginBottom: deductAmount > 0 ? 4 : undefined }}>
                  <MOPAmountInput value={deductAmount} onChange={setDeductAmount} placeholder={t('accountBalance.enterDeductAmount')} max={currentBatch ? currentBatch.deductible : undefined} />
                </Form.Item>
              </div>
            </div>
          )}

          {/* ====== 賬戶扣款 ====== */}
          {deductMethod === 'account' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
                <Form.Item label={t('accountBalance.deductAmountLabel')} required style={{ marginBottom: deductAmount > 0 ? 4 : undefined }}>
                  <MOPAmountInput value={deductAmount} onChange={setDeductAmount} placeholder={t('accountBalance.enterDeductAmount')} />
                </Form.Item>
              </div>
            </div>
          )}
        </SectionCard>

        {/* 相关凭证 */}
        <SectionCard
          icon={<FileProtectOutlined style={{ fontSize: 14, color: '#722ed1' }} />}
          iconBg="#f9f0ff" iconColor="#722ed1"
          title={t('accountBalance.relatedVoucher')}
          tag={<Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.voucherUploadTag')}</Tag>}
          extraEnd={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('accountBalance.supportFormat')}</span>}
        >
          <Form.Item label={t('accountBalance.relatedVoucher')} required style={{ marginBottom: 0 }}>
            <CertificateUploader files={certificateFiles} setFiles={setCertificateFiles} />
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
              placeholder={t('accountBalance.deductRemarkPlaceholder')}
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </SectionCard>
      </Form>

      <FormFooter onCancel={goBack} onSubmit={handleSubmit} submitting={submitting} />

      {/* ====== 提交成功彈窗 ====== */}
      <SuccessModal visible={successVisible} flowNo={submittedFlowNo} onBack={goBack} directExecDesc="✅ 已直接執行扣款（未經審批）" />
    </div>
  )
}
