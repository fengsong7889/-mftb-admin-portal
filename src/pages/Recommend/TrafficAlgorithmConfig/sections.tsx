import { Checkbox, Form, Input, InputNumber, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import MerchantStatusFields from '../AlgorithmForm/MerchantStatusFields'
import { getTrafficFieldError, isTrafficFieldActive, TRAFFIC_FIELDS, trafficStrategyLabel, type TrafficAlgorithmValues, type TrafficFieldName } from './config'

export interface TrafficSectionProps {
  values: Partial<TrafficAlgorithmValues>
  readOnly: boolean
}

/** 字段保持挂载，功能关闭只隐藏并停止该字段校验，不丢失历史值。 */
function Fields({ names, values, readOnly }: TrafficSectionProps & { names: TrafficFieldName[] }) {
  return (
    <div className="algorithm-fields">
      {names.map(name => {
        const field = TRAFFIC_FIELDS[name]
        const active = isTrafficFieldActive(name, values)
        const disabled = readOnly || field.disabled || undefined
        return (
          <Form.Item
            key={name}
            name={name}
            label={field.kind === 'hidden' ? undefined : field.label}
            hidden={!active || field.kind === 'hidden'}
            valuePropName={field.kind === 'boolean' ? 'checked' : 'value'}
            dependencies={field.dependencies}
            required={active && ['number', 'select', 'multiple'].includes(field.kind)}
            rules={[({ getFieldsValue }) => ({
              validator: (_, value: unknown) => {
                const error = getTrafficFieldError(name, value, getFieldsValue(true))
                return error ? Promise.reject(new Error(error)) : Promise.resolve()
              },
            })]}
          >
            {field.kind === 'number' ? (
              <InputNumber min={field.min} max={field.max} precision={field.precision}
                step={field.precision === 1 ? 0.5 : 1} suffix={<span className="traffic-config__unit">{field.unit}</span>} disabled={disabled} />
            ) : field.kind === 'boolean' ? (
              <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled={disabled} />
            ) : field.kind === 'select' ? (
              <Select options={field.options} disabled={disabled} />
            ) : field.kind === 'multiple' ? (
              <Checkbox.Group options={field.options} disabled={disabled} />
            ) : <Input />}
          </Form.Item>
        )
      })}
    </div>
  )
}

export function AvailabilitySection(props: TrafficSectionProps) {
  return (
    <>
      <p className="traffic-config__hint">本期适用外卖到家。是否可配送、可接单、商品可购买，需由推荐执行服务统一检查。</p>
      <MerchantStatusFields readOnly={props.readOnly} rulesForField={name => [{ validator: (_, value: unknown) => {
        const error = getTrafficFieldError(name, value, props.values)
        return error ? Promise.reject(new Error(error)) : Promise.resolve()
      } }]} />
      <Fields {...props} names={['soldOutFilterEnabled']} />
      {(props.values.statusRest || props.values.statusOverwhelmed || props.values.statusClosed || !props.values.soldOutFilterEnabled) && (
        <p className="traffic-config__warning" role="status">当前允许部分不可即时购买的候选进入配置范围；请核查营业状态与售罄过滤，避免用户看到买不到的商品。</p>
      )}
      <p className="traffic-config__hint">商品校验周期在“高级策略”中调整；周期检查不等同于实时库存校验。</p>
    </>
  )
}

export function MatchingSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <p className="traffic-config__hint">已确认计数口径：同一订单内，同一标准标签商家和用户各加 1；多份商品不重复计数。原始订单计数与推荐有效分分开。</p>
      <Fields {...props} names={['merchantKeywordStatsMode', 'merchantKeywordStatsDays', 'userKeywordStatsMode', 'userKeywordStatsDays']} />
      <Fields {...props} names={['userPreferenceMinScore', 'matchThreshold', 'maxUserTags', 'explorationSlots', 'merchantExposureStrategy']} />
      <div className="traffic-config__note">
        <strong>现有覆盖率口径</strong>
        <p>商家覆盖的用户偏好标签数 ÷ 用户偏好标签总数。用户及商家同标签得分均达到偏好门槛，才计入覆盖。</p>
        <p>该比例是标签数量覆盖，不代表兴趣强弱。用户鸡翅 100 分、沙拉 3 分时，两家分别只覆盖一种标签，覆盖率同为 50%。本轮不改变此计算口径。</p>
      </div>
      <p className="traffic-config__hint">{t('recommend.trafficTagSelectionRule')}</p>
      <div className="traffic-config__note">
        <strong>当前保存策略：{trafficStrategyLabel(props.values.merchantExposureStrategy)}</strong>
        {props.values.merchantExposureStrategy === 'trafficProportional' && <p>历史公式：P(商家 i) = 剩余曝光量 i ÷ 所有候选商家剩余曝光量之和。</p>}
        <p>已确认目标为“兴趣匹配优先，匹配接近时再考虑余量”。当前保留历史策略，不将界面说明当作引擎已生效。</p>
      </div>
    </>
  )
}

export function FrequencySection(props: TrafficSectionProps) {
  return (
    <>
      <p className="traffic-config__hint">均按单个用户统计。同商家频控避免重复店铺，同标签频控避免连续同类广告，两者共同生效。</p>
      <Fields {...props} names={['merchantFreqHours', 'merchantFreqTimes', 'keywordFreqHours', 'keywordFreqTimes', 'maxMerchantsPerKeyword']} />
      <div className="traffic-config__note">普通投流与浏览后相似推荐需共用频控计数。候选全部达到上限时，不放宽限制强行展示，由自然流量补位；曝光计数与扣量待执行服务接入。</div>
    </>
  )
}

export function RecommendationSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <h4 className="traffic-config__subtitle">无有效偏好时的冷启动</h4>
      <p className="traffic-config__hint">{t('recommend.trafficNewUserDimensionRule')}</p>
      <Fields {...props} names={['newUserDimensions']} />
      <Fields {...props} names={['qualityScoreThreshold', 'regionPopularStatsDays', 'popularityMetrics', 'regionPopularTopPercent', 'completionRateThreshold', 'completionMinOrderCount']} />
      {props.values.newUserDimensions?.includes('regionPopular') && <p className="traffic-config__hint">{t('recommend.trafficRegionPopularCalc')}</p>}
      {props.values.newUserDimensions?.includes('completionRate') && <p className="traffic-config__hint">{t('recommend.trafficCompletionMinSampleHint')}</p>}
      <h4 className="traffic-config__subtitle">浏览后相似推荐</h4>
      <p className="traffic-config__hint">原“生成式推荐”，指浏览商家后在附近推荐同类投流商家，不是生成式 AI。以下参数保留现有配置。</p>
      <Fields {...props} names={['generativeRecommendEnabled']} />
      {!props.values.generativeRecommendEnabled && <p className="traffic-config__hint">功能已关闭，子配置已保留；重新开启后可继续编辑。</p>}
      <Fields {...props} names={['generativeTriggerMode', 'dwellTimeThreshold', 'generativeTriggerScope', 'generativeMerchantCount', 'generativePriorityMode', 'generativePriorityMode2', 'generativeDailyLimitMode', 'generativeDailyLimit', 'generativeSkipMerchantCount']} />
      {props.values.generativeRecommendEnabled && (
        <div className="traffic-config__note">
          <p>每日触发次数限制不等同于商家曝光次数限制；两者需要同时满足。间隔指触发后跳过的商家点击数量。</p>
          {props.values.generativeMerchantCount === 2 && <p>两家依次选取并去重；不足两家时只展示达标商家，不重复补位。</p>}
          <p>“剩余流量包优先”和“混合评分”为历史选项，暂不自动改写；与兴趣优先目标的统一在后续执行阶段完成。</p>
        </div>
      )}
    </>
  )
}

export function AdvancedSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <h4 className="traffic-config__subtitle">技术检查周期</h4>
      <Fields {...props} names={['consistencyCheckInterval', 'productCheckInterval']} />
      {!props.values.soldOutFilterEnabled && <p className="traffic-config__hint">售罄过滤已关闭，商品校验周期暂不参与校验，原值保留。</p>}
      <h4 className="traffic-config__subtitle">标签有效分衰减</h4>
      <Fields {...props} names={['merchantDecayDays', 'merchantDecayPoints', 'merchantRetainedTagCount', 'userDecayDays', 'userDecayPoints', 'userRetainedTagCount']} />
      <div className="traffic-config__note">
        <strong>历史衰减口径，本轮不调整数值或公式</strong>
        <p className="traffic-config__formula">score(t) = max(0, initial_score − floor(t / decayDays) × decayPoints)</p>
        <p>{t('recommend.trafficFreezeRuleDesc')}</p>
        <p className="traffic-config__warning">保留记录不等于保留近期偏好。历史冻结规则可能让旧偏好长期存在，后续将单独确认有效分衰减方案。</p>
      </div>
      <h4 className="traffic-config__subtitle">新偏好探索与加速</h4>
      <Fields {...props} names={['newTagBoostMultiplier', 'maxBoostTagCount']} />
      <p className="traffic-config__hint">{t('recommend.trafficNewTagScope')}</p>
      <p className="traffic-config__hint">{t('recommend.trafficNewTagRecover')}</p>
      <div className="traffic-config__note">加速参数仅属于推荐有效分策略；不应把原始订单计数从每单加 1 改为加多次。原始计数和有效分的分离由后续标签服务实现。</div>
    </>
  )
}
