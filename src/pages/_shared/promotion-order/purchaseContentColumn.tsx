/**
 * 推廣訂單「購買內容」列共享渲染器
 *
 * 提取 PromotionOrderManage 和 PromotionOrderManageStandalone 中完全相同的
 * purchaseContent 列渲染邏輯：金字招牌標籤日期、盤活復蘇天數、無敵星星時段、mealSlots 降級。
 */
import { Tag, Space, Popover, Button } from 'antd'
import { Region } from '../../Recommend/constants'
import { SIGNBOARD_LABEL_CN, RecommendType, formatSignboardLabel } from './constants'
import type { BaseOrderItem } from './types'

export interface PurchaseContentDeps {
  t: (key: string, opts?: Record<string, unknown>) => string
  orderType: string
  regionLabel: (r: Region | number) => string
}

/**
 * 返回購買內容列的 render 函數。
 * Standalone 版本需在調用前自行處理投流廣告 / 人氣商家天數弹窗等差異邏輯。
 */
export function createPurchaseContentRenderer(deps: PurchaseContentDeps) {
  const { t, orderType, regionLabel } = deps

  return function renderPurchaseContent(_: unknown, record: BaseOrderItem) {
    // 金字招牌：展示標籤 + 日期
    if (orderType === '金字招牌' || record.recommendType === RecommendType.GOLDEN_SIGNBOARD) {
      if (record.labelDates && record.labelDates.length > 0) {
        const MAX_LABELS = 3
        const visibleLabels = record.labelDates.slice(0, MAX_LABELS)
        const hiddenLabels = record.labelDates.slice(MAX_LABELS)
        const hiddenCount = hiddenLabels.length
        const allLabelsContent = (
          <Space direction="vertical" size={8}>
            {record.labelDates.map((lg, li) => {
              const cfg = SIGNBOARD_LABEL_CN[lg.label]
              return (
                <div key={li}>
                  <div style={{ marginBottom: 4 }}>
                    <Tag color={cfg?.color || 'default'} style={{ margin: 0 }}>{cfg?.icon} {formatSignboardLabel(lg.label, lg.scenario)}</Tag>
                  </div>
                  <Space wrap size={4}>
                    {lg.dates.map((d, di) => (
                      <Tag key={di} color="green" style={{ margin: 0 }}>{d}</Tag>
                    ))}
                  </Space>
                </div>
              )
            })}
          </Space>
        )
        return (
          <Space direction="vertical" size={2}>
            {visibleLabels.map((lg, li) => {
              const cfg = SIGNBOARD_LABEL_CN[lg.label]
              const firstDate = lg.dates[0]
              const moreCount = lg.dates.length - 1
              const allDatesContent = (
                <Space direction="vertical" size={4}>
                  {lg.dates.map((d, di) => (
                    <Tag key={di} color="green" style={{ margin: 0 }}>{d}</Tag>
                  ))}
                </Space>
              )
              return (
                <div key={li} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Tag color={cfg?.color || 'default'} style={{ margin: 0 }}>{cfg?.icon} {formatSignboardLabel(lg.label, lg.scenario)}</Tag>
                  {firstDate && (
                    <span style={{ fontSize: 12, color: '#595959' }}>{firstDate}</span>
                  )}
                  {moreCount > 0 && (
                    <Popover
                      content={allDatesContent}
                      title={`${formatSignboardLabel(lg.label, lg.scenario)} 全部日期`}
                      trigger="click"
                      placement="bottomLeft"
                    >
                      <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>+{moreCount}</span>
                    </Popover>
                  )}
                </div>
              )
            })}
            {hiddenCount > 0 && (
              <Popover content={allLabelsContent} title="全部標籤日期" trigger="click" placement="bottomLeft">
                <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>+{hiddenCount}</span>
              </Popover>
            )}
          </Space>
        )
      }
      return <span style={{ color: '#bfbfbf' }}>-</span>
    }

    // 盤活復蘇：只展示天數+日期
    if (orderType === '盤活復蘇' || record.recommendType === RecommendType.HOT_REVIVE_AD) {
      if (record.purchaseDays && record.purchaseDays.length > 0) {
        const days = record.purchaseDays.length
        const hasDates = record.purchaseDays.some(d => !!d)
        const first = record.purchaseDays[0]
        const last = record.purchaseDays[record.purchaseDays.length - 1]
        return (
          <Space direction="vertical" size={2}>
            <Tag color="green" style={{ margin: 0 }}>{t('promotionOrderManage.daysUnit', { count: days })}</Tag>
            {hasDates && (
              <span style={{ fontSize: 12, color: '#595959' }}>
                {first} ~ {last}
              </span>
            )}
          </Space>
        )
      }
      return <span style={{ color: '#bfbfbf' }}>-</span>
    }

    // 無敵星星：去重時段展示（最多3行），面板按商圈→日期→時段層級展示
    if (record.dateSlots && record.dateSlots.length > 0) {
      const slotDateMap = new Map<string, string[]>()
      record.dateSlots.forEach(g => {
        g.slots.forEach(slot => {
          if (!slotDateMap.has(slot)) slotDateMap.set(slot, [])
          if (!slotDateMap.get(slot)!.includes(g.date)) {
            slotDateMap.get(slot)!.push(g.date)
          }
        })
      })
      const allSlots = Array.from(slotDateMap.entries())
      const MAX_SHOW = 3
      const visibleSlots = allSlots.slice(0, MAX_SHOW)
      const hiddenSlots = allSlots.slice(MAX_SHOW)
      const hiddenCount = hiddenSlots.length

      const regionGroupMap = new Map<number, { dates: Map<string, string[]> }>()
      record.dateSlots.forEach(g => {
        const r = g.region ?? 0
        if (!regionGroupMap.has(r)) {
          regionGroupMap.set(r, { dates: new Map() })
        }
        const group = regionGroupMap.get(r)!
        if (!group.dates.has(g.date)) {
          group.dates.set(g.date, [])
        }
        g.slots.forEach(slot => {
          if (!group.dates.get(g.date)!.includes(slot)) {
            group.dates.get(g.date)!.push(slot)
          }
        })
      })
      const panelContent = (
        <Space direction="vertical" size={12}>
          {Array.from(regionGroupMap.entries()).map(([regionVal, group]) => {
            const regionName = regionVal > 0
              ? regionLabel(regionVal as Region)
              : (Array.isArray(record.region)
                  ? record.region.map(r => regionLabel(r)).join('、')
                  : regionLabel(record.region as Region))
            return (
              <div key={regionVal}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: '#262626' }}>
                  {regionName}
                </div>
                {Array.from(group.dates.entries()).map(([date, slots]) => (
                  <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#595959', minWidth: 90 }}>{date}</span>
                    <Space size={4}>
                      {slots.map((slot, si) => (
                        <Tag key={si} color="blue" style={{ margin: 0 }}>{slot}</Tag>
                      ))}
                    </Space>
                  </div>
                ))}
              </div>
            )
          })}
        </Space>
      )

      return (
        <Space direction="vertical" size={2}>
          {visibleSlots.map(([slot, dates], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tag color="blue" style={{ margin: 0 }}>{slot}</Tag>
              <Popover content={panelContent} title={t('promotionOrderManage.allSlots')} trigger="click" placement="bottomLeft">
                <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>{dates[0]}</span>
              </Popover>
              {dates.length > 1 && (
                <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>+{dates.length - 1}</span>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <Popover content={panelContent} title={t('promotionOrderManage.allSlots')} trigger="click" placement="bottomLeft">
              <span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>+{hiddenCount}</span>
            </Popover>
          )}
        </Space>
      )
    }

    // 降級：無 dateSlots 時展示 mealSlots
    if (record.mealSlots && record.mealSlots.length > 0) {
      return (
        <Space direction="vertical" size={2}>
          {record.mealSlots.map((slot, index) => (
            <Tag key={index} color="blue" style={{ margin: 0 }}>
              {slot}
            </Tag>
          ))}
        </Space>
      )
    }
    return <span style={{ color: '#bfbfbf' }}>-</span>
  }
}
