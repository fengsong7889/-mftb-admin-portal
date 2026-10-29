import { useState } from 'react'
import { Button, Checkbox, Form, InputNumber, message, Segmented, Select, Space, Switch, Tag } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import HelpPopover from '@/components/HelpPopover'
import AlgorithmSection from './AlgorithmForm/AlgorithmSection'
import ScoreRow from './AlgorithmForm/ScoreRow'
import { ServiceStatus } from '@mftb/contracts/recommendConstants'
import {
  REGION_KEYS, REGION_LABELS,
  TRAFFIC_BALANCE_ORDER_TYPES,
  type RegionKey, type TrafficBalanceBand, type TrafficBalanceConfig, type TrafficBalanceOrderType,
} from './organicTrafficConfig'

/** 订单类型选项：前端展示枚举，后端会重新校验（不作为安全边界）。 */
const ORDER_TYPE_LABEL_KEYS: Record<TrafficBalanceOrderType, string> = {
  DELIVERY: 'organicTrafficScore.trafficBalance.orderDelivery',
  PICKUP: 'organicTrafficScore.trafficBalance.orderPickup',
}

/** 区域梯度校验的翻译函数签名（把 t 传入模块级校验器，避免其依赖组件作用域）。 */
type Translate = (key: string, options?: Record<string, unknown>) => string

interface Props {
  config: TrafficBalanceConfig
  readOnly?: boolean
  stores: { storeCode: string; storeName: string }[]
  /** 启停状态与修改人/时间来自真实 PLT_03 行 */
  status: ServiceStatus
  updatedBy?: string
  updatedAt?: string
  /** 提交后端：整行覆盖 PLT_03，携带新的 trafficBalanceConfig 与状态 */
  onSave: (next: TrafficBalanceConfig, nextStatus: ServiceStatus) => void | Promise<void>
}

/** 表单 schema 的区域校验；前端只负责 UX，后端会重新验证全部字段。 */
function validateBands(t: Translate, region: RegionKey, bands: TrafficBalanceBand[] | undefined): Promise<void> {
  const label = REGION_LABELS[region]
  if (!bands?.length || bands.length > 20) return Promise.reject(new Error(t('organicTrafficScore.trafficBalance.errNeedTiers', { label })))
  for (const [index, band] of bands.entries()) {
    if (band.maxOrders === null || !Number.isInteger(band.maxOrders) || band.maxOrders < 0 || band.maxOrders > 10000000) {
      return Promise.reject(new Error(t('organicTrafficScore.trafficBalance.errBadThreshold', { label, n: index + 1 })))
    }
    if (band.score === null || !Number.isInteger(band.score) || band.score < 0 || band.score > 1000) {
      return Promise.reject(new Error(t('organicTrafficScore.trafficBalance.errBadScore', { label, n: index + 1 })))
    }
    if (index > 0) {
      const previous = bands[index - 1]
      if (previous.maxOrders !== null && band.maxOrders <= previous.maxOrders) {
        return Promise.reject(new Error(t('organicTrafficScore.trafficBalance.errNotIncreasing', { label })))
      }
      if (previous.score !== null && band.score > previous.score) {
        return Promise.reject(new Error(t('organicTrafficScore.trafficBalance.errScoreReversed', { label })))
      }
    }
  }
  return Promise.resolve()
}

/** 统一统计口径的流量均衡面板：编辑态草稿由本组件持有，保存时整行提交后端。 */
export default function TrafficBalancePanel({ config, readOnly = false, stores, status, updatedBy, updatedAt, onSave }: Props) {
  const { t } = useTranslation()
  const tb = (key: string, options?: Record<string, unknown>) => t(`organicTrafficScore.trafficBalance.${key}`, options)
  const [editing, setEditing] = useState(false)
  const [activeRegion, setActiveRegion] = useState<RegionKey>('MACAU')
  /** 编辑态的工作状态：随保存提交，取消则丢弃，与其它计分项内联编辑一致 */
  const [draftStatus, setDraftStatus] = useState<ServiceStatus>(status)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<TrafficBalanceConfig>()
  const draftRegions: TrafficBalanceConfig['regions'] | undefined = Form.useWatch('regions', form)
  const isEditing = editing && !readOnly
  const handleEdit = () => {
    form.resetFields()
    form.setFieldsValue(config)
    setDraftStatus(status)
    setEditing(true)
  }
  const handleCancel = () => {
    form.resetFields()
    setEditing(false)
  }
  const handleSave = async () => {
    let values: TrafficBalanceConfig
    try {
      values = await form.validateFields()
    } catch {
      const invalidRegion = REGION_KEYS.find(region => form.getFieldError(['regions', region]).length > 0)
      if (invalidRegion) setActiveRegion(invalidRegion)
      message.warning(tb('checkAll'))
      return
    }
    setSaving(true)
    try {
      // 提交失败时 request.ts 已统一弹错，保持编辑态不关闭，避免用户输入丢失
      await onSave(values, draftStatus)
      setEditing(false)
    } catch { /* 错误提示由统一请求层处理，不双弹 */ } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={tb('panelAria')}>
      <div className="organic-score-toolbar">
        <Tag color="purple">{tb('tagUnified')}</Tag>
        {!isEditing && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {(updatedBy || updatedAt) && (
              <span style={{ fontSize: 11, color: '#8C8C8C', whiteSpace: 'nowrap' }}>
                {updatedBy && <>{tb('updatedBy')}<span style={{ color: '#595959' }}>{updatedBy}</span></>}
                {updatedBy && updatedAt && <span style={{ margin: '0 4px' }}>·</span>}
                {updatedAt && <span>{updatedAt}</span>}
              </span>
            )}
            {!readOnly && (
              <Button aria-label={tb('editAria')} size="small" icon={<EditOutlined />} onClick={handleEdit}
                style={{ borderRadius: 6, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>
                {tb('edit')}
              </Button>
            )}
          </span>
        )}
      </div>
      {/* 父级算法页已有 Form，使用 component=false 避免嵌套 HTML form。 */}
      <Form form={form} component={false} layout="vertical" initialValues={config} disabled={!isEditing}>
        <AlgorithmSection title={tb('sectionStatScope')} tone="info" readOnly={readOnly}
          extra={<HelpPopover title={tb('helpStatTitle')} ariaLabel={tb('helpStatTitle')} width={440} content={[
            { tone: 'info', label: '時間與去重', body: '按首次支付成功時間統計滾動過去 N 天的訂單，進行中及已完成訂單均可納入；每個訂單 ID 最多計 1 單，外賣與自取等權合計。' },
            { tone: 'neutral', label: '取消與退款', body: '已取消的訂單不納入計算，包括用戶及商家取消，退款開關不會改變此規則。退款僅指退款成功，申請中或退款失敗不算已退款，下次重算更新。' },
            { tone: 'warn', label: '固定排除', body: '未支付、測試及已識別異常訂單不納入；數據缺失不能當作真實 0 單取得最高獎勵。退款時間不會讓老訂單重新進入統計窗口。' },
          ]} />}>
          {isEditing ? <>
            <div className="algorithm-fields">
              <Form.Item name="statDays" label={tb('statDays')} rules={[{ required: true, type: 'integer', min: 1, max: 365, message: tb('ruleStatDays') }]}>
                <InputNumber aria-label={tb('statDaysAria')} min={1} max={365} precision={0} addonBefore={tb('statDaysPast')} addonAfter={tb('daysUnit')} />
              </Form.Item>
              <Form.Item name="refreshMinutes" label={tb('refreshInterval')} rules={[{ required: true, type: 'integer', min: 1, max: 1440, message: tb('ruleRefresh') }]}>
                <InputNumber aria-label={tb('refreshAria')} min={1} max={1440} precision={0} addonBefore={tb('everyPrefix')} addonAfter={tb('minutesUnit')} />
              </Form.Item>
              <Form.Item name="orderTypes" label={tb('orderType')} rules={[{ required: true, type: 'array', min: 1, message: tb('ruleOrderType') }]}>
                <Checkbox.Group options={TRAFFIC_BALANCE_ORDER_TYPES.map(value => ({ value, label: t(ORDER_TYPE_LABEL_KEYS[value]) }))} />
              </Form.Item>
            </div>
            <div className="algorithm-fields">
              <Form.Item name="includeRefunded" label={tb('includeRefunded')} valuePropName="checked">
                <Switch aria-label={tb('includeRefunded')} checkedChildren={tb('include')} unCheckedChildren={tb('exclude')} />
              </Form.Item>
            </div>
          </> : <div className="organic-score-panel">
            <div className="algorithm-form__row">
              <span>{tb('statSummary', { days: config.statDays })}</span>
              <span>{tb('refreshSummary', { n: config.refreshMinutes })}</span>
            </div>
            <div className="algorithm-form__row">
              <span>{tb('orderType')}：</span>
              {TRAFFIC_BALANCE_ORDER_TYPES.filter(value => config.orderTypes.includes(value)).map(value => <Tag key={value} color="blue">{t(ORDER_TYPE_LABEL_KEYS[value])}</Tag>)}
            </div>
            <Space wrap size={24}>
              <span>{tb('refundedSummary', { v: config.includeRefunded ? tb('include') : tb('exclude') })}</span>
            </Space>
          </div>}
          <div className="organic-score-note">
            <div>{tb('cancelNotCounted')}</div>
            <div>{tb('scopeSharedNote')}</div>
          </div>
        </AlgorithmSection>

        <AlgorithmSection title={tb('sectionScope')} tone="info" readOnly={readOnly}>
          <p className="algorithm-form__hint">{tb('scopeEligibilityHint')}</p>
          {isEditing ? <Form.Item name="excludedStoreCodes" label={tb('excludedStores')}>
            <Select aria-label={tb('excludedStores')} mode="multiple" allowClear showSearch optionFilterProp="label" maxTagCount={3}
              placeholder={tb('storeSelectPlaceholder')} notFoundContent={tb('noStores')}
              options={stores.map(store => ({ value: store.storeCode, label: `${store.storeName}（${store.storeCode}）` }))} />
          </Form.Item> : <div className="organic-score-panel">
            <span>{tb('excludedStores')}：</span>
            {config.excludedStoreCodes.length === 0 ? <span>{tb('none')}</span> : config.excludedStoreCodes.map(code => (
              <Tag key={code}>{stores.find(store => store.storeCode === code)?.storeName ?? code}（{code}）</Tag>
            ))}
          </div>}
          <div className="organic-score-note">{tb('excludedNote')}</div>
        </AlgorithmSection>

        <AlgorithmSection title={tb('sectionRegionTier')} tone="advanced" readOnly={readOnly}
          extra={<HelpPopover title={tb('helpTierTitle')} ariaLabel={tb('helpTierTitle')} width={420} content={[
            { tone: 'info', body: '只填各檔訂單上限，首檔從 0 單開始，下檔從上一檔上限加 1 開始，超過末檔為 0 分；命中一檔即停、不累加。' },
            { tone: 'warn', body: '只使用非負加分，單量越高加分不得越多。本項 0 分不代表總分歸零或強制墊底，不替代實時爆單保護。' },
            { tone: 'neutral', body: '訂單門檻需按新統計口徑重新校準；正式接入時需校準平台維度滿分分母，並確保新舊規則不重複計分。' },
          ]} />}>
          <Segmented aria-label={tb('sectionRegionTier')} disabled={false} value={activeRegion}
            options={REGION_KEYS.map(region => ({ value: region, label: REGION_LABELS[region] }))}
            onChange={value => setActiveRegion(value as RegionKey)} style={{ marginBottom: 16 }} />
          <p className="algorithm-form__hint">{tb('regionTierHint')}</p>
          {/* 两个区域的表单都挂载，保存时校验隐藏区域，防止只校验当前区域。 */}
          {REGION_KEYS.map(region => {
            const bands = isEditing ? draftRegions?.[region] ?? config.regions[region] : config.regions[region]
            const lastUpper = bands[bands.length - 1]?.maxOrders
            const tailLabel = lastUpper == null ? tb('tailAbove') : tb('tailAtLeast', { n: lastUpper + 1 })
            return <div key={region} hidden={activeRegion !== region}>
              {isEditing ? <Form.List name={['regions', region]} rules={[{ validator: (_, value: TrafficBalanceBand[] | undefined) => validateBands(t, region, value) }]}>
                {(fields, { add, remove }, { errors }) => <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {fields.map((field, index) => {
                      const previousUpper = bands[index - 1]?.maxOrders
                      const lower = index === 0 ? '0' : previousUpper == null ? '上一檔上限 + 1' : String(previousUpper + 1)
                      return <div key={field.key} className="organic-score-edit-tier">
                        <span className="organic-score-edit-tier__label">{tb('tierBandLabel', { n: index + 1, lower })}</span>
                        <Form.Item name={[field.name, 'maxOrders']} style={{ marginBottom: 0 }}>
                          <InputNumber aria-label={`${REGION_LABELS[region]}第 ${index + 1} 檔訂單上限`} min={0} max={10000000} precision={0}
                            placeholder={tb('pendingThreshold')} addonAfter={tb('ordersUnit')} style={{ width: 160 }} />
                        </Form.Item>
                        <span>{tb('fixedBonus')}</span>
                        <Form.Item name={[field.name, 'score']} style={{ marginBottom: 0 }}>
                          <InputNumber aria-label={`${REGION_LABELS[region]}第 ${index + 1} 檔加分`} min={0} max={1000} precision={0} addonAfter={t('organicTrafficScore.scoreUnit')} style={{ width: 130 }} />
                        </Form.Item>
                        <Button aria-label={`${REGION_LABELS[region]}刪除第 ${index + 1} 檔`} type="text" danger size="small" icon={<DeleteOutlined />}
                          disabled={fields.length <= 1} onClick={() => remove(field.name)} />
                      </div>
                    })}
                    <div className="organic-score-panel"><ScoreRow label={tailLabel} score={0} hint={tb('tailFixedNote')} /></div>
                    <Button type="dashed" icon={<PlusOutlined />} disabled={fields.length >= 20}
                      onClick={() => add({ maxOrders: null, score: bands[bands.length - 1]?.score ?? 0 })}>{tb('addTier')}</Button>
                  </div>
                  <Form.ErrorList errors={errors} />
                </>}
              </Form.List> : <div className="organic-score-panel organic-score-list">
                {bands.map((band, index) => {
                  const previousUpper = bands[index - 1]?.maxOrders
                  const ready = band.maxOrders !== null && (index === 0 || previousUpper != null)
                  const lower = index === 0 ? 0 : (previousUpper ?? 0) + 1
                  return <ScoreRow key={index} index={index} score={band.score ?? 0}
                    label={ready ? tb('rangeLabel', { lower, upper: band.maxOrders }) : tb('pendingBandLabel')} hint={ready ? undefined : tb('pendingBandHint')} />
                })}
                <ScoreRow label={tailLabel} score={0} hint={tb('tailFixedNote')} />
              </div>}
            </div>
          })}
          <div className="organic-score-note">{tb('tierNote')}</div>
        </AlgorithmSection>
      </Form>
      {/* 最後一排：取消/保存居中（狀態啟停統一由卡片頭部開關負責，底部不再重複） */}
      {isEditing && <div className="organic-score-toolbar" style={{ paddingTop: 12, borderTop: '1px dashed #e8eaed', marginBottom: 0, justifyContent: 'center' }}>
        <div className="organic-score-edit-actions">
          <Button size="small" onClick={handleCancel}>{tb('cancel')}</Button>
          <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => { void handleSave() }}>{tb('save')}</Button>
        </div>
      </div>}
    </section>
  )
}
