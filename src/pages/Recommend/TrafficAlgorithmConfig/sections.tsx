import { useEffect, useState, type ReactNode } from 'react'
import { Checkbox, Form, Input, InputNumber, Select, Switch, message, type FormInstance } from 'antd'
import { CheckCircleOutlined, EnvironmentOutlined, FireOutlined, LockOutlined, StarOutlined, WalletOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import MerchantStatusFields from '../AlgorithmForm/MerchantStatusFields'
import { TIME_PERIOD_KEYS, TIME_PERIOD_LABELS } from '../organicTrafficConfig'
import HelpPopover, { type HelpSection } from '@/components/HelpPopover'
import { CoverageTrial, DecayTrial, SimilarityTrial, RankTrial, ClickRecTrial } from './trialCalc'
import { getTrafficFieldError, isTrafficFieldActive, RANK_CUSTOM_DEFAULT_FACTORS, RANK_TIE_BREAK_OPTIONS, isTrafficOnlyRank, rankField, TRAFFIC_FIELDS, trafficFieldKey, trafficOptionKey, trafficUnitKey, V1_DIMENSIONS, type RankPrefix, type TrafficAlgorithmValues, type TrafficFieldName } from './config'

export interface TrafficSectionProps {
  values: Partial<TrafficAlgorithmValues>
  readOnly: boolean
  /** 共用排序规则的预设切换需回写权重，故透传 form；只读详情态不写。 */
  form?: FormInstance
}

/** 字段保持挂载，功能关闭只隐藏并停止该字段校验，不丢失历史值。
 * compact 模式用逐项 horizontal 布局把「标签+控件」收进行内，多个参数共用一行，避免每项独占一大行。
 * disabledWhen 供「预设锁权重」这类联动禁用；onChangeExtra 在表单值更新后回调（rc-field-form 保留原 trigger）。 */
function Fields({ names, values, readOnly, compact = false, disabledWhen, onChangeExtra, optionsFor }: TrafficSectionProps & {
  names: TrafficFieldName[]
  compact?: boolean
  disabledWhen?: (name: TrafficFieldName) => boolean
  onChangeExtra?: (name: TrafficFieldName, value: unknown) => void
  optionsFor?: (name: TrafficFieldName) => { label: string; value: string }[] | undefined
}) {
  const { t } = useTranslation()
  return (
    <div className={compact ? 'traffic-fields-inline' : 'algorithm-fields'}>
      {names.map(name => {
        const field = TRAFFIC_FIELDS[name]
        const active = isTrafficFieldActive(name, values)
        const disabled = readOnly || field.disabled || disabledWhen?.(name) || undefined
        const extra = onChangeExtra ? { onChange: (value: unknown) => onChangeExtra(name, value) } : {}
        const opts = (optionsFor?.(name) ?? field.options)?.map(o => ({ value: o.value, label: field.translateOptions === false ? o.label : t(trafficOptionKey(name, o.value), { defaultValue: o.label }) }))
        return (
          <Form.Item
            key={name}
            name={name}
            layout={compact ? 'horizontal' : undefined}
            label={field.kind === 'hidden' ? undefined : field.translateLabel === false ? field.label : t(trafficFieldKey(name), { defaultValue: field.label })}
            hidden={!active || field.kind === 'hidden'}
            valuePropName={field.kind === 'boolean' ? 'checked' : 'value'}
            dependencies={field.dependencies}
            required={active && ['number', 'select', 'multiple'].includes(field.kind) && !['merchantTagIdleClearDays', 'userTagIdleClearDays'].includes(name)}
            rules={[({ getFieldsValue }) => ({
              validator: (_, value: unknown) => {
                const error = getTrafficFieldError(name, value, getFieldsValue(true))
                return error ? Promise.reject(new Error(error)) : Promise.resolve()
              },
            })]}
          >
            {field.kind === 'number' ? (
              <InputNumber min={field.min} max={field.max} precision={field.precision}
                step={field.precision === 1 ? 0.5 : 1} suffix={<span className="traffic-config__unit">{field.unit ? t(trafficUnitKey(field.unit), { defaultValue: field.unit }) : null}</span>} disabled={disabled} {...extra} />
            ) : field.kind === 'boolean' ? (
              <Switch checkedChildren={t('recommend.trafficCfg.on', { defaultValue: '开启' })} unCheckedChildren={t('recommend.trafficCfg.off', { defaultValue: '关闭' })} disabled={disabled} {...extra} />
            ) : field.kind === 'select' ? (
              <Select options={opts} disabled={disabled} {...extra} />
            ) : field.kind === 'multiple' ? (
              <Checkbox.Group options={opts} disabled={disabled} {...extra} />
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
      <p className="traffic-config__hint">付费投流以购买流量包为投放资格；暂无综合评分的已购商家不被排除。评分仅作冷启动「软优选」（见冷启动推荐），不作全局硬准入。</p>
      {(props.values.statusRest || props.values.statusOverwhelmed || props.values.statusClosed || !props.values.soldOutFilterEnabled) && (
        <p className="traffic-config__warning" role="status">当前允许部分不可即时购买的候选进入配置范围；请核查营业状态与售罄过滤，避免用户看到买不到的商品。</p>
      )}
      <h4 className="traffic-config__subtitle">数据与商品检查（高级设置）</h4>
      <Fields {...props} names={['consistencyCheckInterval', 'productCheckInterval']} />
      <p className="traffic-config__hint">商品可用性检查周期：只检查「已匹配到该商家的推荐商品」是否仍可购买，并非检查该商家全部商品是否下架或售罄；周期检查不等同于实时库存校验。</p>
      {!props.values.soldOutFilterEnabled && <p className="traffic-config__hint">售罄过滤已关闭，商品校验周期暂不参与校验，原值保留。</p>}
    </>
  )
}

/** 统计范围已固定为全部历史，不再提供选择器，仅以只读口径卡展示。 */
function FixedStatsCard({ staleCustom }: { staleCustom: boolean }) {
  const { t } = useTranslation()
  const items = [
    { key: 'merchant', label: '商家标签统计范围' },
    { key: 'user', label: '用户标签统计范围' },
  ]
  return (
    <div className="traffic-config__fixed-stats" role="note" aria-label="标签统计范围固定口径">
      <div className="traffic-config__fixed-stats-items">
        {items.map(item => (
          <div key={item.key} className="traffic-config__fixed-stats-item">
            <span>{t(trafficFieldKey(item.key === 'merchant' ? 'merchantKeywordStatsMode' : 'userKeywordStatsMode'), { defaultValue: item.label })}</span>
            <strong>{t('recommend.trafficCfg.allHistory', { defaultValue: '全部历史' })} <LockOutlined aria-hidden /> {t('recommend.trafficCfg.fixed', { defaultValue: '固定口径' })}</strong>
          </div>
        ))}
      </div>
      <p>自定义周期因技术实现难度已取消，标签统计一律基于全部历史订单，无需也无法选择。</p>
      {staleCustom && (
        <p className="traffic-config__warning">历史记录中保存的自定义周期已不再生效，保存后统一按全部历史口径执行。</p>
      )}
    </div>
  )
}

/** 行内只保留一条公式/结论，其余长说明收进问号弹层（HelpPopover 分层面板），提升可读性。 */
function FormulaHelp({ formula, title, ariaLabel, sections, width, maxHeight, trial }: {
  formula: ReactNode
  title: string
  ariaLabel: string
  sections: HelpSection[]
  width?: number
  maxHeight?: number
  trial?: ReactNode
}) {
  return (
    <div className="traffic-config__formula-row">
      <code className="traffic-config__formula">{formula}</code>
      <HelpPopover title={title} content={sections} ariaLabel={ariaLabel} width={width} maxHeight={maxHeight} />
      {trial}
    </div>
  )
}

export function MatchingSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  const staleCustom = props.values.merchantKeywordStatsMode === 'custom' || props.values.userKeywordStatsMode === 'custom'
  const metric = props.values.similarityMetric ?? 'cosine'
  return (
    <>
      <p className="traffic-config__hint">已确认计数口径：同一订单内，同一标准标签商家和用户各加 1；多份商品不重复计数。原始订单计数与推荐有效分分开。</p>
      <FixedStatsCard staleCustom={staleCustom} />
      <FieldGroup caption={t('recommend.trafficCfg.cap.c1', { defaultValue: '偏好门槛' })}>
        <Fields compact {...props} names={['userPreferenceMinScore', 'merchantPreferenceMinScore']} />
      </FieldGroup>
      <p className="traffic-config__hint">商家标签由众多买家订单聚合（卖 10 单汉堡=+10），用户标签仅本人订单累加（买 10 次才+10），量级不对称，故商家门槛应显著高于用户门槛。</p>
      <FieldGroup caption="最低覆盖比例（可选）">
        {/* 门槛值保持挂载透传：开关关闭仅隐藏不卸载，历史值不丢、字段注册不缺。 */}
        <Fields compact {...props} names={['coverageFilterEnabled', 'matchThreshold']} />
        <p className="traffic-config__hint">{props.values.coverageFilterEnabled
          ? '开启后，直接标签匹配须达到该覆盖比例；仅约束用户—商家直接匹配，协同与冷启动不适用。'
          : '关闭时不额外限制覆盖比例，但直接标签匹配仍须至少命中一个双方达标的有效标签。'}</p>
      </FieldGroup>
      <FieldGroup caption="用户协同补充（普通投流）" help={<HelpPopover
        title="普通投流协同补充" ariaLabel="普通投流协同补充说明"
        content={[
          { label: '何时启用', body: '直接兴趣匹配不足以填满本轮投流坑位时，才用相似用户的有效成交商家补充。直接匹配已足够时不额外插入；关闭点击后相似推荐不影响此开关。', tone: 'info' },
          { label: '只推荐投流商家', body: '通过用户标签找邻居，再计算其成交店的 CF 得分；最终只保留已购本广告、余量充足且业务可用的商家。协同与直接匹配按商家 ID 去重。', tone: 'warn' },
          { label: '独立准入', body: '协同不要求候选商家与当前用户直接命中标签，也不套用最低覆盖比例；否则无法扩展兴趣。无有效用户标签时不计算协同，仍走冷启动。', tone: 'neutral' },
          { label: '数量与排序', body: '展示数量由本轮属于本投流广告的坑位决定，不套用点击后两家上限。不足时补充：直接匹配优先、协同只补缺口（50 位直接 30 家→协同补 20）。按比例预留：协同先占坑位×比例（向下取整，50×10%=5），即使直接匹配充足也预留；任一路不足名额回补另一路。各来源内按投流坑位排序，协同匹配分=CF，不与直接相似度混排。', tone: 'info' },
          { label: '比例取整', body: '向下取整：本广告 3 位×10%=0.3→该批不预留协同；若要长期接近 10%，需执行层跨批次累计余数（本轮未实现）。比例分母是本广告坑位，不是瀑布流总位置。', tone: 'warn' },
          { label: '数据边界', body: '仅在同一区域/餐段内补充，不越过履约与频控限制。仍不足交既有补齐规则及自然层处理。本轮为配置与匿名本地试算，真实消费者数据未接入。', tone: 'neutral' },
        ]}
      />}>
        <Fields compact {...props} names={['matchingUserSimilarEnabled', 'matchingUserSimilarThreshold', 'matchingUserSimilarMode', 'matchingUserSimilarRatio']} />
        <p className="traffic-config__hint">{props.values.matchingUserSimilarEnabled
          ? (props.values.matchingUserSimilarMode === 'ratio'
            ? `按比例预留：协同占本投流广告坑位的 ${props.values.matchingUserSimilarRatio ?? 10}%（向下取整），其余给直接匹配；协同不足时名额回补直接匹配。`
            : '不足时补充：直接匹配优先，仅在有缺口时用协同补充合格投流商家。')
          : '默认关闭；开启后只影响本投流广告坑位，与点击后推荐独立配置。可在下方相似度试算查看案例。'}</p>
      </FieldGroup>
      {/* 曝光策略/标签上限为只读历史或退役口径：保持挂载透传但移出可见分组，历史值不丢。 */}
      <div hidden>
        <Fields compact {...props} names={['merchantExposureStrategy', 'maxUserTags', 'explorationSlots', 'merchantRetainedTagCount', 'userRetainedTagCount', 'qualityFilterEnabled']} />
      </div>
      <FormulaHelp
        formula="覆盖率 = 商家覆盖的偏好标签数 ÷ 用户偏好标签总数"
        title="现有覆盖率口径"
        ariaLabel="覆盖率口径说明"
        trial={<CoverageTrial values={props.values} />}
        sections={[
          { label: '计入条件', body: '用户侧标签得分达用户门槛、商家侧达商家门槛，才计入覆盖（两侧门槛独立配置）。', tone: 'info' },
          { label: '口径含义', body: '分母＝用户全部达标偏好标签数（不截断）；该比例是数量覆盖，不代表兴趣强弱。\n例：用户鸡翅 100 分、沙拉 12 分（均达门槛），两家各只覆盖一种，覆盖率同为 50%。', tone: 'neutral' },
          { label: '准入与排序', body: '「启用最低覆盖比例」开关控制是否过滤；关闭时仍须至少一个共同达标标签。即使只覆盖较少标签，专营商家仍可能高度相关，不能把 30% 当作统一最优值。匹配分使用完整标签向量计算的相似度。', tone: 'info' },
          { label: '与 Jaccard 区别', body: '覆盖率＝交集 ÷ 用户偏好集（召回视角，不罚商家多余标签）；Jaccard＝交集 ÷ 并集（对称视角，罚双方不重合）。同属集合重叠族但分母不同、语义不同，故覆盖率不作排序分。', tone: 'neutral' },
          { label: '遍历口径', body: '覆盖率与相似度在同一次全量遍历中算出，不提前终止：门槛只做准入过滤，计分遍历全部参与标签，保证不同商家的排序分可比。', tone: 'info' },
          { label: '召回通道', body: '直接标签匹配为主路；启用用户协同后，仅在直接候选不足时补充邻居成交过的合格投流商家。两路独立准入、不相加分数；覆盖率只约束直接匹配。', tone: 'neutral' }
        ]}
      />
      <FieldGroup
        caption={t('recommend.trafficCfg.cap.c3', { defaultValue: '相似度算法（算法级）' })}
        help={<HelpPopover
          title="相似度算法与统一口径"
          ariaLabel="算法级相似度算法说明"
          width={560}
          maxHeight={420}
          content={[
            { label: '两种算法可独立对照', body: '每条投流算法配置可选择余弦或加权 Jaccard，再由不同瀑布流引用。比较效果时保持其他筛选、时段与排序条件一致。同一公式不保证不同场景的分数分布一致，门槛需要分别验证。', tone: 'info' },
            { label: '余弦相似度', body: '两侧各自按门槛筛选，以标签并集对齐，缺失一侧补 0。分值点积除以完整向量模长，比较偏好分布；不能只保留共同标签计算分母。', tone: 'neutral' },
            { label: '加权 Jaccard', body: '完整向量的 Σmin ÷ Σmax，权重使用各侧有效分。它对绝对量级敏感；与余弦得分不同是正常的，不能直接复用同一个阈值。两种算法均保留供业务对照。', tone: 'neutral' },
          ]}
        />}
      >
        <Fields compact {...props} names={['similarityMetric']} />
      </FieldGroup>
      <FormulaHelp
        formula={SIMILARITY_FORMULA[metric]}
        title="相似度算法与口径"
        ariaLabel="相似度算法说明"
        trial={<SimilarityTrial values={props.values} />}
        sections={[
          { label: '计算口径', body: '双方独立筛出有效标签，统一标签 ID，按并集构造向量；未达到本侧门槛或没有该标签时该侧记 0。交集只用于计算覆盖数量，分母不删除单侧标签。', tone: 'warn' },
          { label: '适用范围', body: '兴趣匹配比较当前用户与候选商家，覆盖率过滤可关闭；点击后商家相似比较被点击商家与候选商家，使用独立相似度门槛。同类目属于补充规则，不编造相似度。', tone: 'info' },
        ]}
      />
      <FormulaHelp
        formula="向量维度 = 用户达标标签 ∪ 商家达标标签，缺失侧 = 0"
        title="标签选取规则"
        ariaLabel="标签选取规则说明"
        width={560}
        sections={[
          { label: '不截断', body: '双方凡达偏好门槛的标签全部参与匹配与覆盖率，不按分数截取前 N 个——排名第 6~10 但与对方重合的标签同样计入，避免高分截断漏配。', tone: 'info' },
          { label: '标签一致性', body: '正式数据按标准标签 ID 对齐。试算使用标签名代替 ID，空名称不参与，同名重复行合并取最高分，不重复累加分值或覆盖数量。', tone: 'neutral' },
        ]}
      />
      <h4 className="traffic-config__subtitle">标签有效分衰减</h4>
      <p className="traffic-config__hint">按周期减分；归零或无新增计数达到清理天数时退出有效标签。清理天数留空则仅按分值衰减，原始订单历史不删除。</p>
      <FieldGroup caption={t('recommend.trafficCfg.cap.c4', { defaultValue: '商家标签衰减' })}>
        <Fields compact {...props} names={['merchantDecayDays', 'merchantDecayPoints']} />
        <Fields compact {...props} names={['merchantTagIdleClearDays']} />
      </FieldGroup>
      <FieldGroup caption={t('recommend.trafficCfg.cap.c5', { defaultValue: '用户标签衰减' })}>
        <Fields compact {...props} names={['userDecayDays', 'userDecayPoints']} />
        <Fields compact {...props} names={['userTagIdleClearDays']} />
      </FieldGroup>
      <FormulaHelp
        formula="score(t) = max(0, initial_score − floor(t / decayDays) × decayPoints)"
        title="标签有效分衰减公式"
        ariaLabel="标签有效分衰减说明"
        trial={<DecayTrial values={props.values} />}
        width={560}
        maxHeight={420}
        sections={[
          { label: '衰减', body: '按「天」计：每经过 decayDays 天减 decayPoints 分，不是每分钟或每周。t 为距上次记录经过的天数。', tone: 'info' },
          { label: '有效性', body: '正分也可能低于偏好门槛；零分和过期标签不参与匹配。无偏好用户走冷启动，不代表老商家重新取得新店资格。', tone: 'neutral' },
          { label: '无新增清理', body: '从该标签最后一次有效订单增量计时，定时衰减不刷新这个时间。达到 M 天时有效分清零；M 留空则不按闲置时长清理。', tone: 'warn' },
          { label: '例子', body: '初始 12 分，每 7 天减 1 分；30 天后衰减结果为 8 分。如果另配置 30 天无新增清理且确已闲置 30 天，最终有效分为 0。', tone: 'neutral' },
        ]}
      />
      {/* 新标签加速一期退役：保持挂载透传存量，历史值不丢。 */}
      <div hidden>
        <Fields {...props} names={['newTagBoostMultiplier', 'maxBoostTagCount']} />
      </div>
    </>
  )
}

export function FrequencySection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  const generativeEnabled = props.values.generativeRecommendEnabled === true
  return (
    <>
      <p className="traffic-config__hint">投流广告绑定在瀑布流的若干坑位，用户可连续刷新多页；频控保证同商家在去重窗口内不重复出现。</p>
      <FieldGroup
        caption={t('recommend.trafficCfg.cap.c6', { defaultValue: '同商家去重' })}
        help={<HelpPopover
          title="同商家去重口径"
          ariaLabel="同商家去重说明"
          content={[
            { label: '窗口与次数', body: '窗口＝统计时长（支持 0.5 小时＝30 分钟）；次数＝窗口内同商家最多展示几次。次数设 1，即刷新时同商家不重复。', tone: 'info' },
            { label: '与其他频控分工', body: '此处限「单商家曝光次数」；「相似推荐触发频次」限「发起推荐频率」；跨广告坑位的同商家去重由瀑布流统一计数，此处仅约束本算法候选池。', tone: 'neutral' },
          ]}
        />}
      >
        <Fields compact {...props} names={['merchantFreqHours', 'merchantFreqTimes']} />
      </FieldGroup>
      {/* 一期退役：同标签上限与跨时段频控保持挂载但不渲染，历史值不丢、契约可读。 */}
      <div hidden>
        <Fields {...props} names={['maxMerchantsPerKeyword', 'keywordFreqHours', 'keywordFreqTimes']} />
      </div>
      <div hidden={!generativeEnabled}>
        <FieldGroup
          caption={t('recommend.trafficCfg.cap.c7', { defaultValue: '相似推荐触发频次' })}
          help={<HelpPopover
            title="触发频次说明"
            ariaLabel="触发频次说明"
            content={[
              { label: '不限制 / 限制次数', body: '不限制＝每次达标点击都触发相似推荐；限制次数＝一个用户一天最多触发 N 次（跨会话累计），达上限后当日不再触发。', tone: 'info' },
              { label: '与同商家去重的分工', body: '此处限“触发次数”（发起推荐频率）；同商家去重限“单商家曝光次数”，两者不同轴、同时满足才展示。原“跳过商家点击”冷却与二者重叠，一期收敛移除。', tone: 'warn' },
            ]}
          />}
        >
          <Fields compact {...props} names={['generativeDailyLimitMode', 'generativeDailyLimit']} />
        </FieldGroup>
      </div>
      <div className="traffic-config__note">普通投流与商家相似推荐需共用频控计数。候选全部达到去重上限时，不放宽限制强行展示，由自然流量补位。</div>
    </>
  )
}

// 一期维度真源在 config.ts（V1_DIMENSIONS）：三维度自由勾选、至少一项，集合语义无优先级；
// 距离/流量归一等权综合分，质量分软优选；区域热门度一期暂不开放、完单率并入质量分、类目打散并入展示频控的同标签上限。

/** 冷启动各排序维度的展示元数据：图标 + 一句话口径 + 该维度专属配置字段。
 * 选项顺序与取值仍以 config.ts 的 newUserDimensions.options 为唯一真源，这里只补 UI 说明。 */
const DIMENSION_META: Record<string, { icon: ReactNode; desc: string; fields: TrafficFieldName[]; hintKey?: string; fixedNote?: string }> = {
  remainingTraffic: { icon: <WalletOutlined />, desc: '剩余次数归一后参与综合分（方向可配：剩余多优先／剩余少优先）', fields: ['remainingTrafficDirection'] },
  distance: { icon: <EnvironmentOutlined />, desc: '按直线距离近远归一后参与综合分，不硬排除远商家', fields: [] },
  qualityScore: { icon: <StarOutlined />, desc: '软优选：勾选后达线者先，未评分/未达线仍保留资格（不参与综合分）', fields: ['qualityScoreThreshold'] },
  regionPopular: { icon: <FireOutlined />, desc: '区域内热度分排名前 N% 的商家视为热门商家', fields: ['regionPopularTopPercent'], hintKey: 'recommend.trafficRegionPopularCalc', fixedNote: '统计周期固定 30 天 · 热度指标固定为下单数' },
  completionRate: { icon: <CheckCircleOutlined />, desc: '完单率达标且订单样本充足的商家优先展示', fields: ['completionRateThreshold', 'completionMinOrderCount'], hintKey: 'recommend.trafficCompletionMinSampleHint' },
}

/** 逐维度配置卡：三维度均可自由勾选（至少保留一项），无优先级；距离/流量等权综合分，质量分软优选。
 * 作为 newUserDimensions 的受控控件接收 value/onChange；配置字段仍走 Fields 保持挂载，取消勾选不丢历史值。 */
function ColdStartDimensionCards({ value, onChange, values, readOnly }: {
  value?: string[]
  onChange?: (value: string[]) => void
  values: Partial<TrafficAlgorithmValues>
  readOnly: boolean
}) {
  const { t } = useTranslation()
  const selected = value ?? []
  const [blocked, setBlocked] = useState<string | null>(null)
  useEffect(() => {
    if (!blocked) return
    const timer = setTimeout(() => setBlocked(null), 500)
    return () => clearTimeout(timer)
  }, [blocked])
  // 一期仅暴露三个因子；热门度与完单率退役。
  const options = (TRAFFIC_FIELDS.newUserDimensions.options ?? []).filter(option => (V1_DIMENSIONS as readonly string[]).includes(option.value))
  const labelOf = (dimension: string) => t(trafficOptionKey('newUserDimensions', dimension), { defaultValue: options.find(o => o.value === dimension)?.label ?? dimension })
  const toggle = (dimension: string, checked: boolean) => {
    // 末项拦截：至少保留一个排序维度，警告 + 卡片抖动反馈，不写空值。
    if (!checked && selected.length <= 1) {
      setBlocked(dimension)
      message.warning('冷启动排序维度至少保留一项；未勾选的维度不参与排序。')
      return
    }
    onChange?.(checked ? [...selected, dimension] : selected.filter(item => item !== dimension))
  }
  return (
    <div className="traffic-dim-cards">
      <div className="traffic-dim-cards__summary">
        <span className="traffic-dim-cards__count">{t('recommend.trafficCfg.badge.selected', { defaultValue: '已选' })} {selected.length} / {options.length}</span>
        <span>距离与剩余流量包归一后等权综合、分高者先；质量分软优选达线者先；未勾选不参与。</span>
      </div>
      {options.map(option => {
        const meta = DIMENSION_META[option.value]
        const checked = selected.includes(option.value)
        const badge = meta.fields.length > 0
          ? t('recommend.trafficCfg.badge.n', { defaultValue: `${meta.fields.length} 项配置`, n: meta.fields.length })
          : t('recommend.trafficCfg.badge.none', { defaultValue: '无需额外配置' })
        const hasBody = meta.fields.length > 0 || Boolean(meta.fixedNote) || Boolean(meta.hintKey)
        return (
          <div key={option.value} className={`traffic-dim-card${checked ? ' traffic-dim-card--active' : ''}${blocked === option.value ? ' traffic-dim-card--shake' : ''}`}>
            {/* 整个卡头即 Checkbox 的 label；三维度均可切换，末项取消在 toggle 内拦截。 */}
            <Checkbox className="traffic-dim-card__header" checked={checked} disabled={readOnly}
              onChange={e => toggle(option.value, e.target.checked)}>
              <span className="traffic-dim-card__title">
                <span className="traffic-dim-card__name">
                  <span className="traffic-dim-card__icon" aria-hidden="true">{meta.icon}</span>
                  {labelOf(option.value)}
                  <span className={`traffic-dim-card__badge${checked ? ' traffic-dim-card__badge--active' : ''}`}>{badge}</span>
                </span>
                <span className="traffic-dim-card__desc">{meta.desc}</span>
              </span>
            </Checkbox>
            {hasBody && (
              <div className="traffic-dim-card__body" hidden={!checked}>
                {meta.fields.length > 0 && <Fields compact names={meta.fields} values={values} readOnly={readOnly} />}
                {meta.fixedNote && <p className="traffic-config__hint traffic-dim-card__hint">{meta.fixedNote}</p>}
                {meta.hintKey && <p className="traffic-config__hint traffic-dim-card__hint">{t(meta.hintKey)}</p>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 相似推荐子配置的轻量分组标题，把零散字段按语义聚拢；help 传入问号弹层，紧随标题显示。 */
function FieldGroup({ caption, help, children }: { caption: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="traffic-field-group">
      <span className="traffic-field-group__caption">{caption}{help}</span>
      {children}
    </div>
  )
}

/** 相似度公式（按所选算法行内展示一条，其余收进问号弹层）。aᵢ/bᵢ 为标签 i 在商家/用户的有效分。 */
const SIMILARITY_FORMULA: Record<string, string> = {
  cosine: 'sim(A,B) = Σ(aᵢ·bᵢ) ÷ (√Σaᵢ² × √Σbᵢ²)',
  weightedJaccard: 'sim(A,B) = Σ min(aᵢ,bᵢ) ÷ Σ max(aᵢ,bᵢ)',
}

/** 排序因子元数据：展示色 + 归一口径。勾选式参与（等权相加），不再手填权重。 */
const RANK_FACTORS: { value: string; label: string; color: string; norm: string }[] = [
  { value: 'match', label: '匹配分', color: 'var(--brand)', norm: '直接匹配/商家相似使用相似度 sim；用户协同使用 CF；同类目无相似度、匹配分记 0；冷启动使用独立维度综合分与软优选规则' },
  { value: 'traffic', label: '剩余比例', color: 'var(--info)', norm: '自定义因子使用剩余曝光次数 ÷ 总曝光次数；消耗优先预设直接比较剩余曝光次数，不使用比例，也不受冷启动方向影响' },
  { value: 'quality', label: '质量分', color: 'var(--success)', norm: '商家质量分 ÷ 5' },
  { value: 'distance', label: '距离', color: 'var(--purple)', norm: '1 − min(直线距离 ÷ 最大直线距离, 1)' },
]

/** 读当前所选因子（预设/自定义都已归一写入 Factors 字段）。 */
function rankFactorsOf(values: Partial<TrafficAlgorithmValues>, prefix: RankPrefix) {
  const selected = values[rankField(prefix, 'Factors')] ?? []
  return RANK_FACTORS.filter(f => selected.includes(f.value))
}

/** 候选打分规则组件：坑位排序与相似独立优先级复用同一实现，仅字段前缀/文案不同。
 * 预设＝单轴排序（匹配得分 / 流量包剩余量），不展示因子勾选；自定义因子＝勾选子集归一后等权相加。 */
function RankingRule(props: TrafficSectionProps & { prefix: RankPrefix; caption: string; scenario: string; extraHelp?: HelpSection[] }) {
  const { prefix, caption, scenario, extraHelp } = props
  const presetField = rankField(prefix, 'Preset')
  const factorsField = rankField(prefix, 'Factors')
  const tieField = rankField(prefix, 'TieBreak')
  const preset = props.values[presetField] ?? 'matchFirst'
  const isCustom = preset === 'custom'
  const factors = props.values[factorsField] ?? []
  const trafficOnly = isTrafficOnlyRank(preset, factors)
  const tieOptions = RANK_TIE_BREAK_OPTIONS.filter(o => !(trafficOnly && o.value === 'trafficDirection'))
  const formula = preset === 'matchFirst' ? 'score = 标签匹配得分（商家×用户标签重叠）'
    : preset === 'consumeFirst' ? 'score = 流量包剩余量（匹配达标者内）'
    : 'score = Σ(所选因子归一分) ÷ 所选因子数'
  const desc = preset === 'matchFirst' ? '匹配优先＝按商家与用户的标签匹配得分从高到低排序；同分走「同分决胜」。'
    : preset === 'consumeFirst' ? '消耗优先＝在匹配达标的商家中，按流量包剩余量从多到少排序；同分走「同分决胜」（不含按流量包方向）。'
    : '自定义因子＝所选因子归一后等权相加，剩余比例不等于剩余次数；综合分高者优先。'
  return (
    <FieldGroup
      caption={caption}
      help={<HelpPopover
        title={`${caption}口径`}
        ariaLabel={`${caption}说明`}
        width={560}
        maxHeight={420}
        content={[
          { label: '打分公式', body: `${formula}。分数高者先占坑位。`, tone: 'info' },
          { label: '预设口径', body: '匹配优先＝按标签匹配得分排序；消耗优先＝匹配达标者内按流量包剩余量排序（余量相同再走同分决胜，不用「按流量包方向」）。', tone: 'neutral' },
          { label: '自定义组合与取舍', body: '勾选的因子先各自归一到 0~1 再等权相加，比的是综合分而非单科最高。例：A 匹配 0.9/质量 0.4 → 0.65；B 匹配 0.3/质量 0.9 → 0.60 → A 先。若某因子是硬要求（如质量必须≥3.5），请用门槛过滤而非排序因子。', tone: 'warn' },
          { label: '因子归一（0~1）', body: RANK_FACTORS.map(f => `${f.label}：${f.norm}`).join('\n'), tone: 'neutral' },
          { label: '同分决胜与坑位填充', body: scenario, tone: 'warn' },
          { label: '与频控分工', body: '排序决定「谁先展示」，频控决定「同商家能否再展示」；二者串联，候选全部达去重上限时由自然流量补位。', tone: 'neutral' },
          ...(extraHelp ?? []),
        ]}
      />}
    >
      <Fields compact {...props} names={[presetField]} onChangeExtra={(name, value) => {
        if (name !== presetField || props.readOnly) return
        const next = value as string
        const nextFactors = next === 'custom' ? (factors.length > 0 ? factors : [...RANK_CUSTOM_DEFAULT_FACTORS]) : []
        const patch: Record<string, unknown> = { [factorsField]: nextFactors }
        if (isTrafficOnlyRank(next, nextFactors) && props.values[tieField] === 'trafficDirection') patch[tieField] = 'quality'
        props.form?.setFieldsValue(patch)
      }} />
      <p className="traffic-config__hint">{desc}</p>
      {/* 因子勾选仅自定义时展示；预设不展示（保持挂载以透传/校验）。 */}
      <div hidden={!isCustom}>
        <Fields compact {...props} names={[factorsField]} />
      </div>
      <Fields compact {...props} names={[tieField]} optionsFor={n => (n === tieField ? tieOptions : undefined)} />
      <FormulaHelp
        formula={formula}
        title={`${caption}公式`}
        ariaLabel={`${caption}公式说明`}
        trial={<RankTrial values={props.values} prefix={prefix} />}
        sections={[
          { label: '因子', body: RANK_FACTORS.map(f => `${f.label}：${f.norm}`).join('\n'), tone: 'info' },
          { label: '冷启动路径', body: '无有效用户偏好时使用冷启动排序维度综合分：距离/剩余流量包归一后等权相加、分高者先，质量分软优选达线者先。这里的匹配／消耗／自定义策略只排序有匹配依据的候选。', tone: 'warn' },
        ]}
      />
    </FieldGroup>
  )
}

/** 只读引用另一套排序规则（相似推荐沿用坑位排序时展示），避免重复配置。 */
function SharedRankSummary({ values, prefix, title, ariaLabel }: {
  values: Partial<TrafficAlgorithmValues>; prefix: RankPrefix; title: string; ariaLabel: string
}) {
  const presetLabel = TRAFFIC_FIELDS[rankField(prefix, 'Preset')].options?.find(o => o.value === (values[rankField(prefix, 'Preset')] ?? 'matchFirst'))?.label ?? '匹配优先'
  const preset = values[rankField(prefix, 'Preset')] ?? 'matchFirst'
  const factors = rankFactorsOf(values, prefix)
  return (
    <div className="traffic-rank-summary" role="note" aria-label={ariaLabel}>
      <span className="traffic-rank-summary__title"><LockOutlined aria-hidden /> {title}</span>
      <span className="traffic-rank-summary__preset">{presetLabel}</span>
      {preset === 'custom' ? factors.map(f => (
        <span key={f.value} className="traffic-rank-summary__chip">
          <i className="traffic-rank-bar__dot" style={{ background: f.color }} aria-hidden />{f.label}
        </span>
      )) : (
        <span className="traffic-rank-summary__chip">{preset === 'matchFirst' ? '按匹配得分' : '按剩余量'}</span>
      )}
    </div>
  )
}

/** 投流坑位排序模块：只决定本广告占用坑位内的商家先后（冷启动与兴趣匹配召回都走这套）。
 * 跨广告类型（无敌星星/新店广告等）的坑位顺序由瀑布流策略的坑位序号决定，不在本模块范围。 */
export function RankingSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <p className="traffic-config__hint">只排「购买本广告的商家」在本广告占用坑位内的先后顺序：全量已购商家参与打分，瀑布流按其坑位数（如 50 坑）取前 N 家展示；其他广告类型（无敌星星、新店广告等）的坑位位置与顺序由瀑布流策略的坑位序号决定，不受本模块影响。</p>
      <FieldGroup
        caption={t('recommend.trafficCfg.cap.c8', { defaultValue: '时段优先' })}
        help={<HelpPopover
          title="时段优先口径"
          ariaLabel="时段优先说明"
          width={560}
          maxHeight={420}
          content={[
            { label: '作用', body: `排序前先按当前餐段过滤候选：只提取「主营时段＝当前时段」的匹配商家进入排序，避免早餐时段被午餐/晚餐高分商家挤占。当前时段由业务系统传入（${TIME_PERIOD_KEYS.map(k => TIME_PERIOD_LABELS[k]).join('/')}），本模块不配时间区间。`, tone: 'info' },
            { label: '相邻时段投流商家', body: '先排当前主营时段；不足时先补相邻主营时段，再补其余时段。补充只来自购买本广告且符合全部准入条件的商家。', tone: 'warn' },
            { label: '全时段投流商家', body: '先排当前主营时段；不足时直接从其余时段的合格投流商家补充，不设置相邻时段优先层。', tone: 'neutral' },
            { label: '层内排序与兜底', body: '每层独立排序、跨层去重；后补层不得挤到前层之前。两种策略仍不足时，瀑布流使用其已配置的自然流算法补位，不放宽配送、商品可购买或频控限制。', tone: 'neutral' },
          ]}
        />}
      >
        <Fields compact {...props} names={['mealPeriodPriorityEnabled', 'mealPeriodFallback']} />
        {props.values.mealPeriodPriorityEnabled && <p className="traffic-config__hint">{props.values.mealPeriodFallback === 'adjacent' ? '当前时段 → 相邻时段 → 其余时段投流商家' : '当前时段 → 其余时段投流商家'}；层内排序、跨层去重，仍不足交瀑布流自然流兜底。</p>}
      </FieldGroup>
      <RankingRule
        {...props}
        prefix="rank"
        caption={t('recommend.trafficCfg.cap.c9', { defaultValue: '坑位内打分与填充' })}
        scenario="同分按「同分决胜」配置打破平局；打分覆盖全部已购本广告的商家（不截断），瀑布流按其坑位数取前 N 家展示（如 50 坑取前 50）；刷新靠同商家去重在全量候选内自然轮转，候选全部达去重上限时由瀑布流自然流兜底。"
        extraHelp={[
          { label: '作用边界', body: '本模块只影响本广告坑位内的商家顺序；整条瀑布流的坑位编排（含其他广告类型与自然流量兜底）由瀑布流策略统一决定。', tone: 'info' },
          { label: '预算与消耗', body: '投流预算即商家流量包购买量，按购买量消耗、由执行服务扣量护栏防超耗；本模块不另设日预算/出价/计费模式。', tone: 'warn' },
        ]}
      />
      <p className="traffic-config__hint">先满足“基础与可用性”的通用准入条件，再计算排序分；质量门槛与质量排序因子分别控制“能否进入”和“先后顺序”。</p>
      {/* 权重数值/候选池上限已退役：保持挂载透传存量，历史值不丢。 */}
      <div hidden>
        <Fields compact {...props} names={['rankWeightMatch', 'rankWeightTraffic', 'rankWeightQuality', 'rankWeightDistance', 'rankPoolSize']} />
      </div>
    </>
  )
}

/** 冷启动推荐模块：围绕用户所在区域的召回维度卡；展示顺序交由投流坑位排序。 */
export function ColdStartSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <p className="traffic-config__hint">用户没有达到最低分的偏好标签时走区域冷启动；仍需符合配送、商品可购买与通用质量门槛。</p>
      <FieldGroup
        caption={t('recommend.trafficCfg.cap.c10', { defaultValue: '区域召回范围' })}
        help={<HelpPopover
          title="区域召回范围口径"
          ariaLabel="区域召回范围说明"
          content={[
            { label: '配送范围内', body: '以调度系统当前配置的配送范围为召回边界。该范围由调度侧维护，可能横跨多个商圈，也可能很小；若商家做了缩圈（缩小配送范围），可召回的商家会随之减少 —— 请留意配送范围变更对冷启动量的影响。', tone: 'info' },
            { label: '用户所在商圈', body: '始终取“用户所在商圈”与“当前可配送范围”的交集。配送缩圈时可选商家减少，不以扩圈方式绕过配送限制；不足交瀑布流兜底。', tone: 'neutral' },
            { label: '如何选择', body: '配送范围内覆盖面较广；用户所在商圈进一步限定地域。无偏好冷启动在该范围内按勾选维度综合分排序，仍满足通用准入条件。', tone: 'warn' },
          ]}
        />}
      >
        <Fields compact {...props} names={['coldStartRegionScope']} />
      </FieldGroup>
      <Form.Item
        name="newUserDimensions"
        label={<span className="traffic-dimensions-label">
          {t(trafficFieldKey('newUserDimensions'), { defaultValue: TRAFFIC_FIELDS.newUserDimensions.label })}
          <HelpPopover
            title="冷启动排序维度规则"
            ariaLabel="冷启动排序维度规则"
            width={560}
            maxHeight={420}
            content={[
              { label: '综合分公式', body: '综合分 = Σ(勾选维度归一分) ÷ 勾选维度数（仅距离／剩余流量包参与综合分），分高者先。未勾选的维度完全不参与。', tone: 'info' },
              { label: '归一（0~1）', body: '距离 = 1 − min(直线距离 ÷ 最大直线距离, 1)，越近分高；\n剩余流量包 = 剩余次数 ÷ 本轮候选最大剩余次数，「剩余少优先」时取 1 − 该值。', tone: 'neutral' },
              { label: '质量分软优选', body: '勾选后作优选层：已评分达线者先，未评分/未达线仍保留资格，不作硬准入、不跨餐段层；不参与综合分。仅勾质量分时分层后同分保持候选顺序。', tone: 'warn' },
              { label: '组合场景', body: '只勾距离 = 由近到远；\n只勾流量 = 按方向剩余多/少优先；\n距离＋流量 = 等权综合：余量接近时近者先、距离接近时余量多者先，「远而余量多」与「近而余量少」按综合分权衡；\n三个全勾 = 质量达线者先 ＋ 层内流量/距离综合；\n质量＋单维度 = 达线者先 ＋ 层内按该维度排序。', tone: 'info' },
              { label: '示例（最大直线 5km、候选最大剩余 1900）', body: 'A 剩余 1900 / 4km → (1 + 0.2) ÷ 2 = 0.60；\nB 剩余 900 / 1km → (0.47 + 0.8) ÷ 2 = 0.64 → B 先：余量少但足够近可以胜出；\nC 剩余 1900 / 2km → (1 + 0.6) ÷ 2 = 0.80 → C 先：余量多且近最优。', tone: 'success' },
              { label: '同分与兜底', body: '综合分相同保持候选输入顺序（试算不模拟随机）；至少保留一个排序维度，末项取消会被拦截。', tone: 'neutral' },
            ]}
          />
        </span>}
        required
        className="traffic-dimensions-item"
        rules={[({ getFieldsValue }) => ({
          validator: (_, value: unknown) => {
            const error = getTrafficFieldError('newUserDimensions', value, getFieldsValue(true))
            return error ? Promise.reject(new Error(error)) : Promise.resolve()
          },
        })]}
      >
        <ColdStartDimensionCards values={props.values} readOnly={props.readOnly} />
      </Form.Item>
      {/* 一期退役维度/新商家扶持字段保持挂载但不渲染（新店曝光由瀑布流「新店广告」坑位承担），历史值不丢。 */}
      <div hidden>
        <Fields compact {...props} names={['regionPopularStatsDays', 'popularityMetrics', 'regionPopularTopPercent', 'completionRateThreshold', 'completionMinOrderCount', 'newMerchantBoostEnabled', 'newMerchantDays', 'newMerchantExplorationSlots']} />
      </div>
    </>
  )
}

/** 相似推荐模块：模式/相似度/锚点/触发/数量/插入优先级（可独立配置）。 */
export function SimilarRecSection(props: TrafficSectionProps) {
  const { t } = useTranslation()
  const generativeEnabled = props.values.generativeRecommendEnabled === true
  const modes = props.values.similarRecModes ?? []
  const showSimilar = modes.includes('merchantSimilar')
  const showUserSimilar = modes.includes('userSimilar')
  const showCategory = modes.includes('sameCategory')
  const metric = props.values.similarityMetric ?? 'cosine'
  const independent = props.values.similarRankMode === 'independent'
  // 按坑位来源的可选项只列已勾选模式，避免选到未启用来源。
  const enabledModeOptions = (TRAFFIC_FIELDS.similarRecModes.options ?? []).filter(o => modes.includes(o.value))
  const slotOptionsFor = (name: TrafficFieldName) =>
    (name === 'similarRecSlot1Source' || name === 'similarRecSlot2Source') ? enabledModeOptions : undefined
  const sourceLabelOf = (v?: string) => (TRAFFIC_FIELDS.similarRecModes.options ?? []).find(o => o.value === v)?.label ?? '未配置'
  return (
    <>
      <p className="traffic-config__hint">点击后推荐只产出已购本广告且业务可用的商家。在「推荐数量」处为第 1/2 位各选一个优先来源（只列已勾选模式），按位取人、跨位去重，合计最多 2 家。未购商家即使 CF 或相似度最高，也不进入投流名单。</p>
      <Fields {...props} names={['generativeRecommendEnabled']} />
      {!generativeEnabled && <p className="traffic-config__hint">功能已关闭，子配置已保留；重新开启后可继续编辑。</p>}
      {/* 关闭时整组隐藏但字段保持挂载，历史值不丢失。 */}
      <div className="traffic-generative-groups" hidden={!generativeEnabled}>
        <FieldGroup
          caption={t('recommend.trafficCfg.cap.c11', { defaultValue: '推荐模式' })}
          help={<HelpPopover
            title="推荐模式说明与叠加顺序"
            ariaLabel="推荐模式说明"
            content={[
              { label: '商家相似推荐', body: '作用：以当前浏览商家的标签向量找相似投流商家，上下文最相关、转化意图强。\n优点：即时相关、解释性强；缺点：依赖单次浏览，兴趣面窄。', tone: 'info' },
              { label: '用户协同推荐', body: '作用：先用标签找相似用户，再汇总他们有效成交过的投流商家（CF）。不是分类推荐，也不是用户×商家直接匹配。\n优点：扩展兴趣面；缺点：依赖当前用户有效标签与邻居成交积累，无标签用户不能靠此冷启动。', tone: 'info' },
              { label: '同类目商家推荐', body: '作用：按业务类目（火锅/面食等）推同类目商家，不依赖相似度。\n优点：稳定保量、实现简单；缺点：个性化弱，可能推不相关同类。', tone: 'info' },
              { label: '按坑位选来源', body: '不再设全局填充顺序：在「推荐数量」处为第 1 位、第 2 位各选一个优先来源（仅已勾选模式）。每位从其所选来源取人，不足回补其余已启用来源；跨位按商家 ID 去重，各路分数不直接比较。', tone: 'warn' }
            ]}
          />}
        >
          <Fields compact {...props} names={['similarRecModes']} />
          <div className="traffic-trial__fields"><ClickRecTrial values={props.values} /></div>
        </FieldGroup>
        {/* 模式配置紧邻勾选行：商家/用户相似共用相似度计算（含锚点），同类目单独配类目层级，不与其他组穿插。 */}
        <div hidden={!showSimilar}>
          <FieldGroup
            caption="商家相似度准入"
            help={<HelpPopover
              title="相似度锚点口径"
              ariaLabel="相似度锚点说明"
              content={[
                { label: '被点击商家标签向量', body: '以用户本次点击的商家为锚点找相似商家；点击瀑布流推荐出的商家同样以该商家为锚点，算法仍为本页所选相似度算法。', tone: 'info' },
                { label: '数据口径', body: '双方各取全部达标商家标签，按标签并集对齐后计算；不存在或不达标的标签在该侧补 0。', tone: 'neutral' },
              ]}
            />}
          >
            <Fields compact {...props} names={['similarityThreshold']} />
            <p className="traffic-config__hint">比较对象固定为：被点击商家 × 候选商家；两侧都使用商家标签门槛。</p>
          </FieldGroup>
          <p className="traffic-config__hint">相似度算法沿用本配置：{t(trafficOptionKey('similarityMetric', metric), { defaultValue: TRAFFIC_FIELDS.similarityMetric.options?.find(o => o.value === metric)?.label })}；此处门槛仅用于点击后商家相似推荐。不同瀑布流可引用不同算法配置进行对照。</p>
        </div>
        <div hidden={!showUserSimilar}>
          <FieldGroup
            caption="用户协同准入"
            help={<HelpPopover
              title="用户协同口径"
              ariaLabel="用户协同说明"
              content={[
                { label: '找邻居', body: '当前用户与其他用户各取达标标签，按并集对齐补零计算相似度；排除本人、零相似与未达门槛者，取前 20 个邻居。', tone: 'info' },
                { label: 'CF 得分', body: 'CF(u,m)=Σ sim(u,v)·I(v 有效成交 m) ÷ Σ sim(u,v)。同一邻居对同一商家只计一次支持；仅统计有效完成、未取消/全额退款订单。', tone: 'neutral' },
                { label: '候选边界', body: '邻居成交过的非投流店可作行为输入，但不能成为付费输出；无有效邻居时返回空协同候选，不构造随机推荐。', tone: 'warn' },
              ]}
            />}
          >
            <Fields compact {...props} names={['userSimilarThreshold']} />
            <p className="traffic-config__hint">此处门槛仅用于点击后用户协同，与普通投流协同独立配置，共用用户邻居与 CF 计算。只推荐合格投流商家；真实协同数据未接入。</p>
          </FieldGroup>
        </div>
        <div hidden={!showCategory}>
          <FieldGroup caption={t('recommend.trafficCfg.cap.c13', { defaultValue: '同类目推荐（同类目商家推荐）' })}>
            <Fields compact {...props} names={['categoryMatchLevel']} />
          </FieldGroup>
        </div>
        <FieldGroup
          caption={t('recommend.trafficCfg.cap.c14', { defaultValue: '触发条件' })}
          help={<HelpPopover
            title="触发条件与触发边界"
            ariaLabel="触发条件说明"
            content={[
              { label: '触发方式', body: '点击即触发＝点进商家详情即发起；停留达到时长后触发＝需在商家页停留满门槛秒数才发起，过滤误点。', tone: 'info' },
              { label: '触发边界', body: '本算法只在「配置了本广告的坑位」被点击时触发；点击无敌星星、新店广告等其他类型的坑位不会触发本算法。', tone: 'warn' },
              { label: '若要任意坑位点击都触发', body: '需在瀑布流策略层引用一条独立的相似推荐算法并设定触发范围（与瀑布流引用自然流量兜底算法同构）：被点击商家作为锚点，候选与扣量仍由被引用算法的准入/流量包约束，频控与每日上限在瀑布流层统一计数。本算法页不提供该引用配置。', tone: 'neutral' },
            ]}
          />}
        >
          <Fields compact {...props} names={['generativeTriggerMode', 'dwellTimeThreshold']} />
        </FieldGroup>
        <FieldGroup
          caption={t('recommend.trafficCfg.cap.c15', { defaultValue: '推荐数量' })}
          help={<HelpPopover
            title="每次推荐商家数量说明"
            ariaLabel="推荐数量说明"
            content={[
              { label: '上限为何是 2 家', body: '一次点击最多插入 2 家相似商家（输入框上限 1~2，因此输不下更多）。坑位总数有限，插得越多会挤压自然流量与其他广告位，并放大同屏重复感。', tone: 'info' },
              { label: '选 1 家 / 2 家', body: '选 1 家只配第 1 位优先来源；选 2 家再配第 2 位优先来源。每位从其所选来源的排序候选中取人，跨位按商家 ID 去重；某位来源不足时回补其余已启用来源。实际数量还受本广告可用坑位限制。', tone: 'neutral' },
              { label: '不足时的边界', body: '候选不足时只返回合格商家；不为凑两家放宽付费资格、配送或频控，不重复商家，也不强行插入未购店。', tone: 'warn' }
            ]}
          />}
        >
          <Fields compact {...props} names={['generativeMerchantCount', 'similarRecSlot1Source', 'similarRecSlot2Source']} optionsFor={slotOptionsFor} />
          <p className="traffic-config__hint">第 1/2 位优先来源只可选已勾选的推荐模式；取消勾选后自动回退到首个已勾选模式。某位来源无合格候选时按固定顺序回补其余已启用来源，不空坑。</p>
        </FieldGroup>
        <FieldGroup
          caption={t('recommend.trafficCfg.cap.c16', { defaultValue: '插入优先级' })}
          help={<HelpPopover
            title="插入优先级口径"
            ariaLabel="插入优先级说明"
            content={[
              { label: '沿用投流坑位排序', body: '各来源内部使用投流坑位排序及同分决胜：商家相似路的匹配分为商家相似度，协同路为 CF，同类目没有相似度（匹配分为 0）。来源间按名额规则取人，不相加或混排分数。', tone: 'info' },
              { label: '独立配置', body: '为点击后插入的相似候选单独设一套权重/决胜，只影响插入坑位、不影响本广告坑位排序；适合想强推上下文相关或强推消耗的场景。', tone: 'warn' },
              { label: '坑位来源', body: '坑位总数与序号由瀑布流策略配置；本模块只决定「插入候选内谁先占坑」，不改变坑位数量。', tone: 'neutral' },
            ]}
          />}
        >
          <Fields compact {...props} names={['similarRankMode']} />
        </FieldGroup>
        <div hidden={independent}>
          <SharedRankSummary values={props.values} prefix="rank" title="投流坑位排序" ariaLabel="共用排序规则摘要" />
          <p className="traffic-config__hint">当前沿用投流坑位排序；独立配置仅调整点击后候选的排序策略，不改变准入门槛。</p>
        </div>
        <div hidden={!independent}>
          <p className="traffic-config__hint">高级配置：仅影响点击后推荐，默认继承投流坑位排序。</p>
          <RankingRule
            {...props}
            prefix="similarRank"
            caption={t('recommend.trafficCfg.cap.c17', { defaultValue: '独立优先级打分' })}
            scenario="独立优先级只作用于点击后插入的相似候选，不影响本广告坑位排序。例：每次插入 1~2 家，按独立所选因子等权打分取最高者；同分按独立同分决胜打破平局。"
          />
        </div>
      </div>
      {/* 权重数值已退役（改勾选因子）：保持挂载透传存量，历史值不丢。 */}
      <div hidden>
        <Fields compact {...props} names={['similarRankWeightMatch', 'similarRankWeightTraffic', 'similarRankWeightQuality', 'similarRankWeightDistance']} />
      </div>
      {/* 历史优先级/触发范围/跳过点击/排序范围/链式触发已退役：隐藏但保持挂载，历史值不丢。 */}
      <div hidden>
        <Fields compact {...props} names={['generativePriorityMode', 'generativePriorityMode2', 'generativeTriggerScope', 'generativeSkipMerchantCount', 'similarRecPriority', 'similarRankScope', 'similarChainEnabled', 'similarChainDepth', 'similarAnchor', 'similarBlendRatio']} />
      </div>
      {generativeEnabled && props.values.generativeMerchantCount === 2 && (
        <div className="traffic-config__note">第 1 位优先：{sourceLabelOf(props.values.similarRecSlot1Source)}{props.values.generativeMerchantCount === 2 ? `；第 2 位优先：${sourceLabelOf(props.values.similarRecSlot2Source)}` : ''}。仅选已购本广告商家，按 ID 去重，合计最多 2 家。</div>
      )}
    </>
  )
}
