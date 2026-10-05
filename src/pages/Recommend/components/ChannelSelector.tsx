/**
 * 推荐业务频道选择菜单（大首页 / 外卖 / 超市百货 / 团购到店）。
 *
 * ⚠️ 遗留代码：全仓无调用方。推荐与沙盒页面（TrafficSandbox、Waterfall 等）均直接
 * 使用 antd Select + RECOMMEND_CHANNEL_OPTIONS 自行渲染，未复用本组件。保留仅为
 * 万一需要侧边导航形态的频道入口时可参考，修改前请先确认是否已有替代实现。
 *
 * 图标与频道的对应关系集中在 iconMap，新增频道时需要同时补上此处与 constants。
 */
import React from 'react'
import { Menu } from 'antd'
import { useTranslation } from 'react-i18next'
import { AppstoreOutlined, CoffeeOutlined, ShoppingOutlined, ShopOutlined } from '@ant-design/icons'
import { RECOMMEND_CHANNEL_OPTIONS, RecommendChannel } from '../constants'

interface ChannelSelectorProps {
  value?: RecommendChannel
  onChange?: (channel: RecommendChannel) => void
}

/** 每个频道固定一个图标；Record 要求完整枚举，新增 RecommendChannel 取值时靠编译报错暴露遗漏 */
const iconMap: Record<RecommendChannel, React.ReactNode> = {
  [RecommendChannel.HOME]: <AppstoreOutlined />,
  [RecommendChannel.DELIVERY]: <CoffeeOutlined />,
  [RecommendChannel.GROUP_BUY]: <ShoppingOutlined />,
  [RecommendChannel.SUPERMARKET]: <ShopOutlined />,
}

export default function ChannelSelector({ value = RecommendChannel.HOME, onChange }: ChannelSelectorProps) {
  const { t } = useTranslation()
  return (
    <Menu
      mode="inline"
      selectedKeys={[String(value)]}
      onClick={({ key }) => onChange?.(Number(key) as RecommendChannel)}
      items={RECOMMEND_CHANNEL_OPTIONS.map(opt => ({
        key: String(opt.value),
        icon: iconMap[opt.value],
        label: t(opt.labelKey),
      }))}
      style={{ width: 180, borderRight: '1px solid #f0f0f0' }}
    />
  )
}
