import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Form, Tag, type FormInstance } from 'antd'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { AimOutlined, FieldTimeOutlined, ShareAltOutlined, ShopOutlined, SortDescendingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'
import { AvailabilitySection, MatchingSection, FrequencySection, RankingSection, ColdStartSection, SimilarRecSection } from './sections'
import { getTrafficGroup, TRAFFIC_FIELDS, TRAFFIC_GROUPS, trafficGroupKey, trafficOptionKey, type TrafficAlgorithmValues, type TrafficFormIssue, type TrafficGroup } from './config'
import './index.css'

interface Props {
  form: FormInstance
  readOnly?: boolean
  errors: TrafficFormIssue[]
}

const GROUP_ICONS: Record<TrafficGroup, ReactNode> = {
  availability: <ShopOutlined />, matching: <AimOutlined />, ranking: <SortDescendingOutlined />, coldStart: <ThunderboltOutlined />, similarRec: <ShareAltOutlined />, frequency: <FieldTimeOutlined />,
}
const amount = (value: number | null | undefined) => value == null ? i18n.t('recommend.trafficCfg.pending', { defaultValue: '待配置' }) : String(value)
/** 旧记录可能仍存有已废弃的自定义周期值，展示口径统一为全部历史。 */
const hasLegacyCustomStats = (values: Partial<TrafficAlgorithmValues>) =>
  values.merchantKeywordStatsMode === 'custom' || values.userKeywordStatsMode === 'custom'

/** 仅负责配置展示，不模拟推荐结果，也不将目标规则标记为已上线。 */
export default function TrafficAlgorithmConfig({ form, readOnly = false, errors }: Props) {
  const { t } = useTranslation()
  const values: Partial<TrafficAlgorithmValues> = Form.useWatch([], { form, preserve: true }) ?? form.getFieldsValue(true)
  const [expanded, setExpanded] = useState<Record<TrafficGroup, boolean>>({
    availability: true, matching: true, ranking: true, coldStart: true, similarRec: true, frequency: false,
  })

  const handleLocateField = (name: string) => {
    const group = getTrafficGroup(name)
    if (group) setExpanded(prev => ({ ...prev, [group]: true }))
    requestAnimationFrame(() => {
      form.scrollToField(name, { behavior: 'smooth', block: 'center' })
      form.getFieldInstance(name)?.focus?.()
    })
  }

  useEffect(() => {
    if (errors.length === 0) return
    setExpanded(prev => {
      const next = { ...prev }
      errors.forEach(error => {
        const group = getTrafficGroup(error.name)
        if (group) next[group] = true
      })
      return next
    })
    const frame = requestAnimationFrame(() => {
      form.scrollToField(errors[0].name, { behavior: 'smooth', block: 'center' })
      form.getFieldInstance(errors[0].name)?.focus?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [errors, form])

  const handleNavigate = (group: TrafficGroup) => {
    setExpanded(prev => ({ ...prev, [group]: true }))
    requestAnimationFrame(() => {
      const heading = document.getElementById(`traffic-heading-${group}`)
      heading?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      heading?.focus({ preventScroll: true })
    })
  }

  const sectionProps = { values, readOnly, form }
  const sections: Record<TrafficGroup, ReactNode> = {
    availability: <AvailabilitySection {...sectionProps} />,
    matching: <MatchingSection {...sectionProps} />,
    ranking: <RankingSection {...sectionProps} />,
    coldStart: <ColdStartSection {...sectionProps} />,
    similarRec: <SimilarRecSection {...sectionProps} />,
    frequency: <FrequencySection {...sectionProps} />,
  }

  return (
    <div className="traffic-config">
      <div className="traffic-config__overview" aria-label="投流配置概览">
        <div className="traffic-config__overview-title">
          <strong>{t('recommend.trafficCfg.overview', { defaultValue: '投流配置概览' })}</strong><Tag color="orange">{t('recommend.trafficCfg.delivery', { defaultValue: '外卖到家' })}</Tag><span>当前为管理端配置，推荐执行待接入</span>
        </div>
        <dl className="traffic-config__summary">
          <div><dt>{t('recommend.trafficCfg.dt.17', { defaultValue: '标签统计' })}</dt><dd>商家与用户均为：全部历史（固定口径）{hasLegacyCustomStats(values) && <span className="traffic-config__secondary">· 旧自定义周期已失效</span>}</dd></div>
          <div><dt>{t('recommend.trafficCfg.dt.18', { defaultValue: '兴趣门槛' })}</dt><dd>用户 ≥ {amount(values.userPreferenceMinScore)} 分 / 商家 ≥ {amount(values.merchantPreferenceMinScore)} 分；{values.coverageFilterEnabled ? `最低覆盖 ${amount(values.matchThreshold)}%` : '覆盖过滤关闭（仍须共同标签）'}；{values.matchingUserSimilarEnabled ? (values.matchingUserSimilarMode === 'ratio' ? `协同预留 ${amount(values.matchingUserSimilarRatio)}% 坑位` : '不足时协同补充投流商家') : '普通协同补充关闭'}</dd></div>
          <div><dt>{t('recommend.trafficCfg.dt.19', { defaultValue: '单用户频控' })}</dt><dd>同店 {amount(values.merchantFreqHours)} 小时 / {amount(values.merchantFreqTimes)} 次</dd></div>
          <div><dt>{t('recommend.trafficCfg.dt.20', { defaultValue: '相似推荐' })}</dt><dd>{values.generativeRecommendEnabled === undefined ? '待配置' : values.generativeRecommendEnabled ? `开启 · 每次最多 ${amount(values.generativeMerchantCount)} 家 · 仅合格投流商家` : '关闭 · 子配置已保留'}</dd></div>
          <div><dt>{t('recommend.trafficCfg.dt.21', { defaultValue: '坑位排序' })}</dt><dd>{t(trafficOptionKey('rankPreset', values.rankPreset ?? 'matchFirst'), { defaultValue: TRAFFIC_FIELDS.rankPreset.options?.find(o => o.value === (values.rankPreset ?? 'matchFirst'))?.label })} · 全量已购商家参与排序</dd></div>
        </dl>
        <nav className="traffic-config__navigation" aria-label="投流配置分组导航">
          {TRAFFIC_GROUPS.map(group => <Button key={group.key} size="small" disabled={false} onClick={() => handleNavigate(group.key)}>{t(trafficGroupKey(group.key), { defaultValue: group.title })}</Button>)}
        </nav>
      </div>

      <p className="traffic-config__hint">两种相似度算法均可选择；效果对照请分别保存投流算法配置，并在对应瀑布流中引用。此处不会自动新建或修改瀑布流。</p>
      {errors.length > 0 && (
        <Alert type="error" showIcon className="traffic-config__errors"
          message={`有 ${errors.length} 项配置需要修正，点击可定位`}
          description={<ul>{errors.map(error => <li key={error.name}><Button type="link" danger onClick={() => handleLocateField(error.name)}>{error.message}</Button></li>)}</ul>}
        />
      )}

      {TRAFFIC_GROUPS.map(group => {
        const errorCount = errors.filter(error => getTrafficGroup(error.name) === group.key).length
        return (
          <AlgorithmSection key={group.key} title={t(trafficGroupKey(group.key), { defaultValue: group.title })} icon={GROUP_ICONS[group.key]}
            tone={group.key === 'availability' ? 'info' : 'strategy'}
            readOnly={readOnly} expanded={expanded[group.key]}
            headingId={`traffic-heading-${group.key}`} bodyId={`traffic-body-${group.key}`}
            onExpandedChange={open => setExpanded(prev => ({ ...prev, [group.key]: open }))}
            extra={<>
              {errorCount > 0 && <span className="traffic-config__error-count">{errorCount} 项待修正</span>}
            </>}>
            {sections[group.key]}
          </AlgorithmSection>
        )
      })}
    </div>
  )
}
