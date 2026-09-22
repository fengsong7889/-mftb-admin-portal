import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Form, Tag, type FormInstance } from 'antd'
import { AimOutlined, FieldTimeOutlined, SettingOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'
import { AvailabilitySection, MatchingSection, FrequencySection, RecommendationSection, AdvancedSection } from './sections'
import { getTrafficGroup, TRAFFIC_GROUPS, type TrafficAlgorithmValues, type TrafficFormIssue, type TrafficGroup } from './config'
import './index.css'

interface Props {
  form: FormInstance
  readOnly?: boolean
  errors: TrafficFormIssue[]
}

const GROUP_ICONS: Record<TrafficGroup, ReactNode> = {
  availability: <ShopOutlined />, matching: <AimOutlined />, frequency: <FieldTimeOutlined />,
  recommendations: <UserOutlined />, advanced: <SettingOutlined />,
}
const amount = (value: number | null | undefined) => value == null ? '待配置' : String(value)
const statsRange = (mode: string | undefined, days: number | null | undefined) =>
  mode === 'all' ? '全部历史' : mode === 'custom' ? `近 ${amount(days)} 天` : '待配置'

/** 仅负责配置展示，不模拟推荐结果，也不将目标规则标记为已上线。 */
export default function TrafficAlgorithmConfig({ form, readOnly = false, errors }: Props) {
  const values: Partial<TrafficAlgorithmValues> = Form.useWatch([], { form, preserve: true }) ?? form.getFieldsValue(true)
  const [expanded, setExpanded] = useState<Record<TrafficGroup, boolean>>({
    availability: true, matching: true, frequency: true, recommendations: true, advanced: false,
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

  const sectionProps = { values, readOnly }
  const sections: Record<TrafficGroup, ReactNode> = {
    availability: <AvailabilitySection {...sectionProps} />,
    matching: <MatchingSection {...sectionProps} />,
    frequency: <FrequencySection {...sectionProps} />,
    recommendations: <RecommendationSection {...sectionProps} />,
    advanced: <AdvancedSection {...sectionProps} />,
  }

  return (
    <div className="traffic-config">
      <div className="traffic-config__overview" aria-label="投流配置概览">
        <div className="traffic-config__overview-title">
          <strong>投流配置概览</strong><Tag color="orange">外卖到家</Tag><span>当前为管理端配置，推荐执行待接入</span>
        </div>
        <dl className="traffic-config__summary">
          <div><dt>标签统计</dt><dd>商家：{statsRange(values.merchantKeywordStatsMode, values.merchantKeywordStatsDays)}；用户：{statsRange(values.userKeywordStatsMode, values.userKeywordStatsDays)}</dd></div>
          <div><dt>兴趣门槛</dt><dd>偏好 ≥ {amount(values.userPreferenceMinScore)} 分；覆盖率 ≥ {amount(values.matchThreshold)}%</dd></div>
          <div><dt>单用户频控</dt><dd>同店 {amount(values.merchantFreqHours)} 小时 / {amount(values.merchantFreqTimes)} 次；同标签 {amount(values.keywordFreqHours)} 小时 / {amount(values.keywordFreqTimes)} 次</dd></div>
          <div><dt>浏览后相似推荐</dt><dd>{values.generativeRecommendEnabled === undefined ? '待配置' : values.generativeRecommendEnabled ? `开启 · 每次 ${amount(values.generativeMerchantCount)} 家` : '关闭 · 子配置已保留'}</dd></div>
        </dl>
        <nav className="traffic-config__navigation" aria-label="投流配置分组导航">
          {TRAFFIC_GROUPS.map(group => <Button key={group.key} size="small" disabled={false} onClick={() => handleNavigate(group.key)}>{group.title}</Button>)}
        </nav>
      </div>

      {errors.length > 0 && (
        <Alert type="error" showIcon className="traffic-config__errors"
          message={`有 ${errors.length} 项配置需要修正，点击可定位`}
          description={<ul>{errors.map(error => <li key={error.name}><Button type="link" danger onClick={() => handleLocateField(error.name)}>{error.message}</Button></li>)}</ul>}
        />
      )}

      {TRAFFIC_GROUPS.map(group => {
        const errorCount = errors.filter(error => getTrafficGroup(error.name) === group.key).length
        return (
          <AlgorithmSection key={group.key} title={group.title} icon={GROUP_ICONS[group.key]}
            tone={group.key === 'availability' ? 'info' : group.key === 'advanced' ? 'advanced' : 'strategy'}
            readOnly={readOnly} expanded={expanded[group.key]}
            headingId={`traffic-heading-${group.key}`} bodyId={`traffic-body-${group.key}`}
            onExpandedChange={open => setExpanded(prev => ({ ...prev, [group.key]: open }))}
            extra={<>
              {errorCount > 0 && <span className="traffic-config__error-count">{errorCount} 项待修正</span>}
              {group.key === 'advanced' && <span className="traffic-config__secondary">低频调整</span>}
            </>}>
            {sections[group.key]}
          </AlgorithmSection>
        )
      })}
    </div>
  )
}
