/**
 * 額度配置共享區塊 — DeptQuotaEdit / EmpQuotaEdit 共用
 *
 * 包含：限額周期、限額類型、限額值、軟閾值、幣種、超額動作、降級模型、額度解讀外框
 * 調用方只需傳入「解讀區的前幾行自定義內容」即可。
 */
import { useMemo } from 'react'
import { Form, InputNumber, Radio, Select, Slider } from 'antd'
import { FundOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import SectionCard from './SectionCard'
import {
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  OVER_LIMIT_ACTION_LABEL,
  CURRENCY_OPTIONS,
} from './quotaShared'
import type { QuotaType, OverLimitAction, Currency } from './quotaShared'
import { getValueUnit } from './sharedUtils'
import type { AiModel } from '../../../api'

export interface QuotaConfigSectionProps {
  /** 額度解讀區塊的自定義前幾行（調用方提供） */
  interpretPrefix: ReactNode
  /** 模型列表（用於降級目標選擇） */
  models: AiModel[]
  /** 限額周期 extra 文案 key（dept 與 emp 不同） */
  periodExtraKey: string
  /** 降級模型 extra 文案 key */
  downgradeModelExtraKey: string
  /** 是否顯示降級免責額度（僅部門有） */
  showDowngradeExempt?: boolean
  /** 是否顯示額度分配方式卡片（僅部門有） */
  allocateModeSlot?: ReactNode
  /** Form.useWatch 返回的當前表單值 */
  quotaType: QuotaType | undefined
  currency: Currency | undefined
  overLimitAction: OverLimitAction | undefined
  softThreshold: number | undefined
}

export default function QuotaConfigSection({
  interpretPrefix,
  models,
  periodExtraKey,
  downgradeModelExtraKey,
  showDowngradeExempt = false,
  allocateModeSlot,
  quotaType,
  currency,
  overLimitAction,
  softThreshold,
}: QuotaConfigSectionProps) {
  const { t } = useTranslation()
  const valueUnit = getValueUnit(quotaType, currency)

  const modelOptions = useMemo(
    () => models.map((m) => ({ value: m.id, label: m.name })),
    [models],
  )

  return (
    <SectionCard
      header={{
        icon: <FundOutlined style={{ fontSize: 14, color: '#E8720C' }} />,
        iconBg: '#fff7e6',
        title: t('aiQuotaAuth.quotaConfigSection'),
        tag: t('aiQuotaAuth.coreTag'),
        tagColor: 'orange',
        note: t('aiQuotaAuth.gatewayCheckNote'),
      }}
    >
      {/* 額度分配方式（僅部門有，由外部 slot 傳入） */}
      {allocateModeSlot}

      {/* 限額周期 + 限額類型 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Form.Item name="period" label={t('aiQuotaAuth.periodLabel')} rules={[{ required: true }]} extra={t(periodExtraKey)}>
          <Radio.Group optionType="button" buttonStyle="solid"
            options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="quotaType" label={t('aiQuotaAuth.quotaTypeLabel')} rules={[{ required: true }]}>
          <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </Form.Item>
      </div>

      {/* 限額值 + 軟限額提醒閾值 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Form.Item name="quotaValue" label={t('aiQuotaAuth.quotaValueLabel')} rules={[{ required: true, message: t('aiQuotaAuth.quotaValueRequired') }]}>
          <InputNumber<number>
            min={1}
            style={{ width: '100%' }}
            placeholder={quotaType === 'cost' ? t('aiQuotaAuth.quotaValueCostPh') : quotaType === 'request' ? t('aiQuotaAuth.quotaValueRequestPh') : t('aiQuotaAuth.quotaValueTokenPh')}
            addonAfter={valueUnit}
            formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(v) => Number(`${v ?? ''}`.replace(/,/g, ''))}
          />
        </Form.Item>
        <Form.Item
          name="softThreshold"
          label={<span>{t('aiQuotaAuth.softThresholdLabel')} <span style={{ color: '#8C8C8C', fontWeight: 400, fontSize: 12 }}>{t('aiQuotaAuth.softThresholdHint')}</span></span>}
        >
          <Slider min={10} max={100} step={5} marks={{ 50: '50%', 80: '80%', 100: '100%' }}
            tooltip={{ formatter: (v) => `${v}%` }} />
        </Form.Item>
      </div>

      {/* 計價幣種（僅費用類型時） */}
      {quotaType === 'cost' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="currency" label={t('aiQuotaAuth.currencyLabel')} rules={[{ required: true }]}>
            <Select options={CURRENCY_OPTIONS} />
          </Form.Item>
        </div>
      )}

      {/* 超額動作 */}
      <Form.Item name="overLimitAction" label={t('aiQuotaAuth.overLimitActionLabel')} rules={[{ required: true }]}>
        <Radio.Group>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {(['reject', 'approve', 'downgrade'] as OverLimitAction[]).map((act) => {
              const active = overLimitAction === act
              const desc = act === 'reject' ? t('aiQuotaAuth.rejectDesc')
                : act === 'approve' ? t('aiQuotaAuth.approveDesc')
                : t('aiQuotaAuth.downgradeDesc')
              return (
                <label key={act} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                  padding: '12px 14px', borderRadius: 8,
                  border: `1px solid ${active ? '#E8720C' : '#e8eaed'}`,
                  background: active ? '#FFF7E6' : '#fff', transition: 'all 0.2s',
                }}>
                  <Radio value={act} style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{OVER_LIMIT_ACTION_LABEL[act]}</div>
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </Radio.Group>
      </Form.Item>

      {/* 降級目標模型 */}
      {overLimitAction === 'downgrade' && (
        <>
          <Form.Item name="downgradeModelId" label={t('aiQuotaAuth.downgradeModelLabel')} rules={[{ required: true, message: t('aiQuotaAuth.downgradeModelRequired') }]}
            extra={t(downgradeModelExtraKey)}>
            <Select showSearch optionFilterProp="label" placeholder={t('aiQuotaAuth.downgradeModelPh')} options={modelOptions} />
          </Form.Item>
          {showDowngradeExempt && (
            <Form.Item name="downgradeExemptQuota" label={t('aiQuotaAuth.downgradeExemptLabel')} tooltip={t('aiQuotaAuth.downgradeExemptTooltip')}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder={t('aiQuotaAuth.downgradeExemptPh')} />
            </Form.Item>
          )}
        </>
      )}

      {/* 實時額度解讀 */}
      <div style={{
        marginTop: 4, padding: '14px 16px', borderRadius: 8,
        background: 'linear-gradient(135deg, #FFF7E6, #FFFBF0)', border: '1px solid #FFE7BA',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#E8720C', marginBottom: 8 }}>{t('aiQuotaAuth.quotaInterpretTitle')}</div>
        <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.9 }}>
          {interpretPrefix}
          <div>· {t('aiQuotaAuth.quotaAlertLabel')}：{t('aiQuotaAuth.quotaAlertText', { percent: <strong style={{ color: '#FAAD14' }}>{softThreshold ?? 80}</strong> })}</div>
          <div>· {t('aiQuotaAuth.quotaOverLabel')}：<strong style={{ color: '#FF4D4F' }}>{OVER_LIMIT_ACTION_LABEL[overLimitAction ?? 'reject']}</strong>
            {overLimitAction === 'downgrade' ? t('aiQuotaAuth.quotaOverDowngrade') : ''}</div>
        </div>
      </div>
    </SectionCard>
  )
}
