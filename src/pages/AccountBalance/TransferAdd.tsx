import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Form, Input, Select, Button, message, InputNumber, Tag, Modal, type UploadFile } from 'antd'
import {
  AccountBookOutlined,
  DollarOutlined,
  FileProtectOutlined,
  EditOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import BrandTag from '../../components/BrandTag'
import { fetchFinAccounts, submitTransferApply, fetchFinRiskConfig, checkFinTransferBatches } from '../../api/finance'
import type { FinAccount, TransferApplyPayload, FinRiskRow, FinTransferBlock } from '../../api/finance'
import { isWorkflowEnabled } from '../../utils/workflowEnabled'
import { amountToChinese, accountStatusMap } from './components/shared'
import { useAccountFormCommon } from './components/useAccountFormCommon'
import { showConfirmSubmit, handleFormSubmitError } from './components/ConfirmSubmitModal'
import MOPAmountInput from './components/MOPAmountInput'
import FormFooter from './components/FormFooter'
import CertificateUploader from './components/CertificateUploader'
import SuccessModal from './components/SuccessModal'
import SectionCard from './components/SectionCard'
import FormPageHeader from './components/FormPageHeader'
import BalanceCard from './components/BalanceCard'

export default function TransferAdd() {
  const { t } = useTranslation()
  const common = useAccountFormCommon()
  const { groupIdParam, groupNameParam, brandParam, goBack, isFromProcessCenter,
    groupSearchOptions, groupSearchLoading, handleGroupSearch,
    certificateFiles, setCertificateFiles,
    successVisible, setSuccessVisible, submitting, setSubmitting,
    submittedFlowNo, setSubmittedFlowNo } = common

  const [form] = Form.useForm()
  const [transferAmount, setTransferAmount] = useState<number>(0)
  const [targetGroupId, setTargetGroupId] = useState<string | undefined>(undefined)

  /** 同品牌推廣金賬戶列表（轉出餘額與轉入集團选项均由此派生） */
  const [accounts, setAccounts] = useState<FinAccount[]>([])

  /** 轉出集團風控信息（未結清欠款提示） */
  const [riskInfo, setRiskInfo] = useState<FinRiskRow | null>(null)
  /** 當前轉賬金額會觸碰的欠款批次（非空=提交將被攔截） */
  const [blockedBatches, setBlockedBatches] = useState<FinTransferBlock[]>([])

  useEffect(() => {
    fetchFinAccounts({ page: 1, size: 500, brand: brandParam })
      .then(res => setAccounts(res.records || []))
      .catch(() => setAccounts([]))
  }, [brandParam])

  /** 集团选择变更（从流程中心进入时启用） */
  const handleGroupChange = useCallback((value: string) => {
    const opt = groupSearchOptions.find(o => o.value === value)
    if (opt) {
      form.setFieldsValue({ sourceGroupId: value, sourceGroupName: opt.label })
    }
  }, [groupSearchOptions, form])

  /** 加載轉出集團風控信息（有未結清欠款時展示提示） */
  useEffect(() => {
    if (!groupIdParam) return
    fetchFinRiskConfig(groupIdParam, brandParam)
      .then(setRiskInfo)
      .catch(() => setRiskInfo(null))
  }, [groupIdParam, brandParam])

  /** 轉賬金額變化時檢查是否觸碰欠款批次（防抖） */
  useEffect(() => {
    if (!groupIdParam || transferAmount <= 0) {
      setBlockedBatches([])
      return
    }
    const timer = setTimeout(() => {
      checkFinTransferBatches(groupIdParam, transferAmount)
        .then(setBlockedBatches)
        .catch(() => setBlockedBatches([]))
    }, 400)
    return () => clearTimeout(timer)
  }, [groupIdParam, transferAmount])

  /** 轉出集團賬戶（虛擬餘額/狀態） */
  const sourceAccount = accounts.find(a => a.groupId === groupIdParam)
  const sourceVirtualBalance = Number(sourceAccount?.virtualBalance) || 0

  /** 轉入集團选項：同品牌且排除當前集團，非正常狀態賬戶不可選 */
  const targetGroupOptions = accounts
    .filter(a => a.groupId !== groupIdParam)
    .map(a => ({
      label: `${a.groupId} - ${a.groupName}${a.status !== 'normal' ? `（${t(accountStatusMap[a.status]?.labelKey || '') || a.status}）` : ''}`,
      value: a.groupId,
      disabled: a.status !== 'normal',
    }))

  /** 已選轉入集團賬戶 */
  const targetAccount = accounts.find(a => a.groupId === targetGroupId)

  /** 提交申請 */
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      if (!transferAmount || transferAmount <= 0) {
        message.warning(t('accountBalance.fillTransferAmount'))
        return
      }
      if (transferAmount > sourceVirtualBalance) {
        message.warning(t('accountBalance.amountExceedBalance'))
        return
      }
      if (blockedBatches.length > 0) {
        message.error(t('accountBalance.transferBlockedDesc', {
          batches: blockedBatches.map(b => b.batchNo).join('、'),
        }))
        return
      }
      if (certificateFiles.length === 0) {
        message.warning(t('accountBalance.uploadCertificate'))
        return
      }
      // ====== 二次確認彈窗 ======
      const approvalEnabled = isWorkflowEnabled('transfer')
      showConfirmSubmit(t, {
        infoRows: (
          <>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.fromGroup')}</span>
              <span className="confirm-info-value">{groupNameParam}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.toGroup')}</span>
              <span className="confirm-info-value">{targetAccount?.groupName || '-'}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('accountBalance.transferAmountLabel')}</span>
              <span className="confirm-info-value highlight">MOP {transferAmount.toLocaleString()}</span>
            </div>
          </>
        ),
        approvalEnabled,
        directExecDesc: '當前轉賬審批流程已停用，確認後將直接執行轉賬，無需審批。',
        onConfirm: async () => {
          try {
            const payload: TransferApplyPayload = {
              fromGroupId: groupIdParam,
              fromGroupName: groupNameParam,
              brand: brandParam,
              toGroupId: targetGroupId || '',
              toGroupName: targetAccount?.groupName || '',
              transferAmount,
              remark: form.getFieldValue('remark') || '',
            }
            const flowNo = await submitTransferApply(payload)
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
        title={t('accountBalance.transferTitle')}
        tag={<Tag style={{ fontSize: 11, color: '#13C2C2', borderColor: '#13C2C2' }}>{t('accountBalance.transferApplyTag')}</Tag>}
        onBack={goBack}
      />

      <Form form={form} layout="vertical"
        initialValues={{
          sourceGroupId: groupIdParam,
          sourceGroupName: groupNameParam,
        }}
      >
        {/* 轉出集團信息 */}
        <SectionCard icon={<AccountBookOutlined style={{ fontSize: 14, color: '#1890ff' }} />} title={t('accountBalance.sourceGroup')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('accountBalance.sourceGroup')} name="sourceGroupId">
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
            <Form.Item label={t('accountBalance.colBrand')}>
              <BrandTag value={brandParam} />
            </Form.Item>
            <Form.Item label={t('accountBalance.colStatus')}>
              <Tag color={accountStatusMap[sourceAccount?.status || 'normal']?.color || 'green'}>
                {t(accountStatusMap[sourceAccount?.status || 'normal']?.labelKey || '') || t('accountBalance.statusNormal')}
              </Tag>
            </Form.Item>
          </div>
        </SectionCard>

        {/* 轉入集團信息 */}
        <SectionCard
          icon={<SwapOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
          iconBg="#fff7e6" iconColor="#fa8c16"
          title={t('accountBalance.targetGroup')}
          extraEnd={<span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>{t('accountBalance.targetGroupHint')}</span>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label={t('accountBalance.targetGroup')} name="targetGroupId" rules={[{ required: true, message: t('accountBalance.selectTargetGroup') }]}>
              <Select
                placeholder={targetGroupOptions.length ? t('accountBalance.selectTargetGroupSameBrand') : t('accountBalance.noSameBrandGroup')}
                options={targetGroupOptions}
                showSearch
                allowClear
                onChange={(val) => setTargetGroupId(val)}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label={t('accountBalance.colBrand')}>
              {targetGroupId ? <BrandTag value={brandParam} /> : <span style={{ color: '#BFBFBF', fontSize: 13 }}>{t('accountBalance.selectGroupToShow')}</span>}
            </Form.Item>
            <Form.Item label={t('accountBalance.colStatus')}>
              {targetGroupId
                ? <Tag color={accountStatusMap[targetAccount?.status || 'normal']?.color || 'green'}>
                    {t(accountStatusMap[targetAccount?.status || 'normal']?.labelKey || '') || t('accountBalance.statusNormal')}
                  </Tag>
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>{t('accountBalance.selectGroupToShow')}</span>}
            </Form.Item>
          </div>
        </SectionCard>

        {/* 转账金额 */}
        <SectionCard
          icon={<DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
          iconBg="#fff7e6" iconColor="#fa8c16"
          title={t('accountBalance.transferAmountLabel')}
          tag={<Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.amountConfig')}</Tag>}
        >
          {/* 轉出集團虛擬賬戶餘額 */}
          <BalanceCard value={sourceVirtualBalance} label={t('accountBalance.sourceVirtualBalanceLabel')} />

          {/* 转账金额输入 */}
          <Form.Item label={t('accountBalance.transferAmountLabel')} required style={{ marginBottom: transferAmount > 0 ? 4 : 16 }}>
            <MOPAmountInput value={transferAmount} onChange={setTransferAmount} placeholder={t('accountBalance.enterTransferAmount')} max={sourceVirtualBalance} width={360} />
          </Form.Item>

          {/* 風控提示：集團存在未結清欠款 / 本次轉賬觸碰欠款批次 */}
          {riskInfo && riskInfo.unsettledDebt > 0 && (
            <div style={{
              marginTop: 4, marginBottom: blockedBatches.length > 0 ? 0 : 16,
              padding: '10px 14px', borderRadius: 8,
              background: blockedBatches.length > 0 ? '#FFF1F0' : '#FFF7E6',
              border: `1px solid ${blockedBatches.length > 0 ? '#FFA39E' : '#FFD591'}`,
              fontSize: 12, lineHeight: 1.8,
              color: blockedBatches.length > 0 ? '#CF1322' : '#AD6800',
            }}>
              {blockedBatches.length > 0 ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{t('accountBalance.transferBlockedTitle')}</div>
                  {t('accountBalance.transferBlockedDesc', {
                    batches: blockedBatches.map(b => b.batchNo).join('、'),
                  })}
                </>
              ) : (
                t('accountBalance.transferDebtWarn', { amount: Number(riskInfo.unsettledDebt).toLocaleString() })
              )}
            </div>
          )}
        </SectionCard>

        {/* 相关凭证 */}
        <SectionCard
          icon={<FileProtectOutlined style={{ fontSize: 14, color: '#722ed1' }} />}
          iconBg="#f9f0ff" iconColor="#722ed1"
          title={t('accountBalance.certificates')}
          tag={<Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{t('accountBalance.certificateUpload')}</Tag>}
          extraEnd={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('accountBalance.supportedFormatsShort')}</span>}
        >
          <Form.Item label={t('accountBalance.certificates')} required style={{ marginBottom: 0 }}>
            <CertificateUploader files={certificateFiles} setFiles={setCertificateFiles} />
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              {t('accountBalance.certificateLimit')}
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
              placeholder={t('accountBalance.transferRemarkPlaceholder')}
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </SectionCard>
      </Form>

      <FormFooter onCancel={goBack} onSubmit={handleSubmit} submitting={submitting} />

      {/* ====== 提交成功彈窗 ====== */}
      <SuccessModal visible={successVisible} flowNo={submittedFlowNo} onBack={goBack} />
    </div>
  )
}
