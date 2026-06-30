import { useState } from 'react'
import { Card, Select, Space, Calendar, Badge, Tag } from 'antd'
import type { Dayjs } from 'dayjs'
import AppTabs from '../components/AppTabs'
import { AppType, RecommendChannel, RECOMMEND_CHANNEL_OPTIONS, AlgorithmType } from '../constants'

const SLOT_OPTIONS = [
  { label: '全部坑位', value: '' },
  { label: '首頁第一坑', value: 'slot1' },
  { label: '首頁第二坑', value: 'slot2' },
  { label: '首頁第三坑', value: 'slot3' },
  { label: '外賣推薦坑位1', value: 'slot4' },
  { label: '外賣推薦坑位2', value: 'slot5' },
  { label: '外賣熱門坑位', value: 'slot6' },
  { label: '團購首選坑位', value: 'slot7' },
  { label: '團購推薦坑位1', value: 'slot8' },
  { label: '超市熱賣坑位', value: 'slot9' },
  { label: '超市推薦坑位1', value: 'slot10' },
]

// 算法类型标签颜色
const ALG_COLOR: Record<string, string> = {
  '猜你喜歡': 'blue',
  '無敵星星': 'purple',
  '新店推送': 'green',
  '盤活復蘇': 'orange',
  '獨家商店': 'red',
  '流量廣告': 'gold',
}

/** 模拟排期数据:日期 -> 投放描述 */
const MOCK_SCHEDULE: Record<string, Array<{ alg: string; slot: string; channel: string }>> = {
  // 2026年6月
  '2026-06-01': [
    { alg: '猜你喜歡', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '無敵星星', slot: '首頁第二坑', channel: '大首頁' },
  ],
  '2026-06-02': [
    { alg: '流量廣告', slot: '外賣推薦坑位1', channel: '外賣' },
  ],
  '2026-06-03': [
    { alg: '新店推送', slot: '團購首選坑位', channel: '團購' },
    { alg: '盤活復蘇', slot: '超市熱賣坑位', channel: '超市' },
  ],
  '2026-06-04': [
    { alg: '猜你喜歡', slot: '外賣推薦坑位2', channel: '外賣' },
  ],
  '2026-06-05': [
    { alg: '獨家商店', slot: '首頁第三坑', channel: '大首頁' },
    { alg: '流量廣告', slot: '團購推薦坑位1', channel: '團購' },
  ],
  '2026-06-08': [
    { alg: '無敵星星', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '猜你喜歡', slot: '外賣熱門坑位', channel: '外賣' },
  ],
  '2026-06-09': [
    { alg: '盤活復蘇', slot: '超市推薦坑位1', channel: '超市' },
  ],
  '2026-06-10': [
    { alg: '新店推送', slot: '首頁第二坑', channel: '大首頁' },
    { alg: '流量廣告', slot: '外賣推薦坑位1', channel: '外賣' },
    { alg: '猜你喜歡', slot: '團購首選坑位', channel: '團購' },
  ],
  '2026-06-11': [
    { alg: '獨家商店', slot: '首頁第三坑', channel: '大首頁' },
  ],
  '2026-06-12': [
    { alg: '無敵星星', slot: '外賣推薦坑位2', channel: '外賣' },
    { alg: '盤活復蘇', slot: '超市熱賣坑位', channel: '超市' },
  ],
  '2026-06-15': [
    { alg: '猜你喜歡', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '流量廣告', slot: '團購推薦坑位1', channel: '團購' },
  ],
  '2026-06-16': [
    { alg: '新店推送', slot: '外賣熱門坑位', channel: '外賣' },
  ],
  '2026-06-17': [
    { alg: '無敵星星', slot: '首頁第二坑', channel: '大首頁' },
    { alg: '獨家商店', slot: '超市推薦坑位1', channel: '超市' },
  ],
  '2026-06-18': [
    { alg: '盤活復蘇', slot: '首頁第三坑', channel: '大首頁' },
    { alg: '猜你喜歡', slot: '外賣推薦坑位1', channel: '外賣' },
  ],
  '2026-06-19': [
    { alg: '流量廣告', slot: '團購首選坑位', channel: '團購' },
  ],
  '2026-06-22': [
    { alg: '猜你喜歡', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '新店推送', slot: '超市熱賣坑位', channel: '超市' },
  ],
  '2026-06-23': [
    { alg: '無敵星星', slot: '外賣推薦坑位2', channel: '外賣' },
    { alg: '獨家商店', slot: '首頁第二坑', channel: '大首頁' },
  ],
  '2026-06-24': [
    { alg: '盤活復蘇', slot: '團購推薦坑位1', channel: '團購' },
    { alg: '流量廣告', slot: '首頁第三坑', channel: '大首頁' },
  ],
  '2026-06-25': [
    { alg: '猜你喜歡', slot: '外賣熱門坑位', channel: '外賣' },
  ],
  '2026-06-26': [
    { alg: '新店推送', slot: '超市推薦坑位1', channel: '超市' },
    { alg: '無敵星星', slot: '首頁第一坑', channel: '大首頁' },
  ],
  '2026-06-29': [
    { alg: '獨家商店', slot: '團購首選坑位', channel: '團購' },
    { alg: '流量廣告', slot: '外賣推薦坑位1', channel: '外賣' },
  ],
  '2026-06-30': [
    { alg: '猜你喜歡', slot: '首頁第二坑', channel: '大首頁' },
    { alg: '盤活復蘇', slot: '超市熱賣坑位', channel: '超市' },
  ],
  // 2026年7月
  '2026-07-01': [
    { alg: '無敵星星', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '新店推送', slot: '外賣推薦坑位2', channel: '外賣' },
  ],
  '2026-07-02': [
    { alg: '流量廣告', slot: '團購推薦坑位1', channel: '團購' },
  ],
  '2026-07-03': [
    { alg: '猜你喜歡', slot: '首頁第三坑', channel: '大首頁' },
    { alg: '獨家商店', slot: '超市推薦坑位1', channel: '超市' },
  ],
  '2026-07-06': [
    { alg: '盤活復蘇', slot: '外賣熱門坑位', channel: '外賣' },
    { alg: '無敵星星', slot: '首頁第二坑', channel: '大首頁' },
  ],
  '2026-07-07': [
    { alg: '猜你喜歡', slot: '團購首選坑位', channel: '團購' },
  ],
  '2026-07-08': [
    { alg: '流量廣告', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '新店推送', slot: '超市熱賣坑位', channel: '超市' },
  ],
  '2026-07-09': [
    { alg: '獨家商店', slot: '外賣推薦坑位1', channel: '外賣' },
  ],
  '2026-07-10': [
    { alg: '猜你喜歡', slot: '首頁第二坑', channel: '大首頁' },
    { alg: '盤活復蘇', slot: '團購推薦坑位1', channel: '團購' },
  ],
  '2026-07-13': [
    { alg: '無敵星星', slot: '首頁第三坑', channel: '大首頁' },
    { alg: '流量廣告', slot: '外賣推薦坑位2', channel: '外賣' },
  ],
  '2026-07-14': [
    { alg: '新店推送', slot: '超市推薦坑位1', channel: '超市' },
  ],
  '2026-07-15': [
    { alg: '猜你喜歡', slot: '首頁第一坑', channel: '大首頁' },
    { alg: '獨家商店', slot: '團購首選坑位', channel: '團購' },
    { alg: '盤活復蘇', slot: '外賣熱門坑位', channel: '外賣' },
  ],
  '2026-07-16': [
    { alg: '無敵星星', slot: '超市熱賣坑位', channel: '超市' },
  ],
  '2026-07-17': [
    { alg: '流量廣告', slot: '首頁第二坑', channel: '大首頁' },
    { alg: '新店推送', slot: '外賣推薦坑位1', channel: '外賣' },
  ],
}

function dateCellRender(value: Dayjs) {
  const key = value.format('YYYY-MM-DD')
  const events = MOCK_SCHEDULE[key]
  if (!events || events.length === 0) return null
  
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {events.slice(0, 3).map((event, idx) => (
        <li key={idx} style={{ marginBottom: 2 }}>
          <Tag 
            color={ALG_COLOR[event.alg] || 'default'} 
            style={{ 
              margin: 0, 
              fontSize: 10, 
              padding: '0 4px',
              lineHeight: '18px',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block'
            }}
          >
            {event.alg}
          </Tag>
        </li>
      ))}
      {events.length > 3 && (
        <li style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
          +{events.length - 3} 更多
        </li>
      )}
    </ul>
  )
}

export default function RecommendCalendar() {
  const [activeApp, setActiveApp] = useState<AppType>(AppType.SHANFENG)
  const [selectedChannel, setSelectedChannel] = useState<RecommendChannel | undefined>(undefined)
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>(undefined)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2>投放日曆</h2>
      </div>
      <AppTabs value={activeApp} onChange={setActiveApp} />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="選擇頻道"
            allowClear
            style={{ width: 180 }}
            options={RECOMMEND_CHANNEL_OPTIONS}
            value={selectedChannel}
            onChange={setSelectedChannel}
          />
          <Select
            placeholder="選擇坑位"
            allowClear
            style={{ width: 160 }}
            options={SLOT_OPTIONS}
            value={selectedSlot}
            onChange={setSelectedSlot}
          />
        </Space>
      </Card>
      <Card>
        <Calendar cellRender={dateCellRender} />
      </Card>
    </div>
  )
}
