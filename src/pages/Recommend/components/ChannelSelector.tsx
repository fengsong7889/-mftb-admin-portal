import React from 'react'
import { Menu } from 'antd'
import { AppstoreOutlined, CoffeeOutlined, ShoppingOutlined, ShopOutlined } from '@ant-design/icons'
import { RECOMMEND_CHANNEL_OPTIONS, RecommendChannel } from '../constants'

interface ChannelSelectorProps {
  value?: RecommendChannel
  onChange?: (channel: RecommendChannel) => void
}

const iconMap: Record<RecommendChannel, React.ReactNode> = {
  [RecommendChannel.HOME]: <AppstoreOutlined />,
  [RecommendChannel.DELIVERY]: <CoffeeOutlined />,
  [RecommendChannel.GROUP_BUY]: <ShoppingOutlined />,
  [RecommendChannel.SUPERMARKET]: <ShopOutlined />,
}

export default function ChannelSelector({ value = RecommendChannel.HOME, onChange }: ChannelSelectorProps) {
  return (
    <Menu
      mode="inline"
      selectedKeys={[String(value)]}
      onClick={({ key }) => onChange?.(Number(key) as RecommendChannel)}
      items={RECOMMEND_CHANNEL_OPTIONS.map(opt => ({
        key: String(opt.value),
        icon: iconMap[opt.value],
        label: opt.label,
      }))}
      style={{ width: 180, borderRight: '1px solid #f0f0f0' }}
    />
  )
}
