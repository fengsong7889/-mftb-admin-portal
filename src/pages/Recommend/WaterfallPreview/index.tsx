import { useState, useMemo } from 'react'
import { Select, Card, Space, Tag, Badge } from 'antd'
import { 
  AppType, 
  RecommendChannel, 
  ServiceStatus,
  APP_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
} from '../constants'
import type { WaterfallSlotConfig } from '../types'
import { mockWaterfallData } from './mockData'

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

export default function WaterfallPreview() {
  const [selectedApp, setSelectedApp] = useState<AppType>(AppType.SHANFENG)
  const [selectedChannel, setSelectedChannel] = useState<RecommendChannel>(RecommendChannel.HOME)

  // 过滤启用的坑位配置
  const enabledSlots = useMemo(() => {
    return mockWaterfallData.filter(
      (item: WaterfallSlotConfig) => 
        item.app === selectedApp && 
        item.channel === selectedChannel && 
        item.status === ServiceStatus.ENABLED
    ).sort((a: WaterfallSlotConfig, b: WaterfallSlotConfig) => a.slotPosition - b.slotPosition)
  }, [selectedApp, selectedChannel])

  return (
    <div className="content-area">
      {/* 筛选区域 */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Space>
            <span style={{ fontWeight: 500 }}>所屬品牌:</span>
            <Select
              value={selectedApp}
              onChange={(value) => setSelectedApp(value as AppType)}
              style={{ width: 150 }}
              options={APP_OPTIONS}
            />
          </Space>
          <Space>
            <span style={{ fontWeight: 500 }}>業務頻道:</span>
            <Select
              value={selectedChannel}
              onChange={(value) => setSelectedChannel(value as RecommendChannel)}
              style={{ width: 200 }}
              options={RECOMMEND_CHANNEL_OPTIONS}
            />
          </Space>
        </Space>
      </Card>

      {/* 手机模型展示区域 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'flex-start',
        gap: 40,
        padding: '20px 0'
      }}>
        {/* 手机外壳 */}
        <div style={{
          width: 375,
          background: '#1a1a1a',
          borderRadius: 40,
          padding: '12px 8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          {/* 手机屏幕 */}
          <div style={{
            background: '#f5f5f5',
            borderRadius: 32,
            overflow: 'hidden',
            minHeight: 667,
          }}>
            {/* 状态栏 */}
            <div style={{
              background: '#fff',
              padding: '8px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
            }}>
              <span>9:41</span>
              <Space size={4}>
                <span>📶</span>
                <span>🔋</span>
              </Space>
            </div>

            {/* 顶部标题区域 */}
            <div style={{
              background: '#fff',
              padding: '16px',
              borderBottom: '1px solid #e8e8e8',
            }}>
              <div style={{ 
                fontSize: 18, 
                fontWeight: 600, 
                marginBottom: 6,
                color: '#262626'
              }}>
                {CHANNEL_LABEL[selectedChannel]}
              </div>
              <div style={{ 
                fontSize: 12, 
                color: '#8c8c8c',
                lineHeight: 1.5
              }}>
                (只展示啟用的坑位)
              </div>
            </div>

            {/* 瀑布流内容区域 */}
            <div style={{ 
              padding: '12px',
              minHeight: 550,
            }}>
              {enabledSlots.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#8c8c8c',
                }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                  <div style={{ fontSize: 14 }}>暫無啟用的坑位配置</div>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                }}>
                  {enabledSlots.map((slot) => (
                    <div
                      key={slot.id}
                      style={{
                        background: '#fff',
                        borderRadius: 8,
                        padding: '12px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      }}
                    >
                      {/* 坑位序号 */}
                      <Badge 
                        count={`位置${slot.slotPosition}`} 
                        style={{ 
                          backgroundColor: '#1890ff',
                          marginBottom: 8,
                          display: 'block'
                        }} 
                      />
                      
                      {/* 算法名称 */}
                      <div style={{
                        fontSize: 14,
                        fontWeight: 500,
                        marginBottom: 6,
                        color: '#262626',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {slot.algorithmName}
                      </div>
                      
                      {/* 算法类型 */}
                      <Tag 
                        color="blue" 
                        style={{ 
                          fontSize: 11,
                          padding: '0 6px',
                          margin: 0,
                        }}
                      >
                        {slot.algorithmType}
                      </Tag>
                      
                      {/* 占位内容 */}
                      <div style={{
                        marginTop: 12,
                        height: 60,
                        background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 100%)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#1890ff',
                        fontSize: 24,
                      }}>
                        📦
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 底部导航栏 */}
            <div style={{
              background: '#fff',
              borderTop: '1px solid #e8e8e8',
              padding: '12px 0',
              display: 'flex',
              justifyContent: 'space-around',
            }}>
              <span style={{ fontSize: 20 }}>🏠</span>
              <span style={{ fontSize: 20 }}>🔍</span>
              <span style={{ fontSize: 20 }}>📋</span>
              <span style={{ fontSize: 20 }}>👤</span>
            </div>
          </div>
        </div>

        {/* 配置信息面板 */}
        <Card 
          title="坑位配置信息" 
          style={{ width: 400 }}
          extra={
            <Tag color="blue">
              已啟用: {enabledSlots.length} 個
            </Tag>
          }
        >
          {enabledSlots.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 20px',
              color: '#8c8c8c'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
              <div>當前篩選條件下沒有啟用的坑位</div>
            </div>
          ) : (
            <div>
              {enabledSlots.map((slot) => (
                <Card 
                  key={slot.id}
                  size="small" 
                  style={{ marginBottom: 12 }}
                  title={
                    <Space>
                      <Badge 
                        count={slot.slotPosition} 
                        style={{ backgroundColor: '#52c41a' }} 
                      />
                      <span>{slot.algorithmName}</span>
                    </Space>
                  }
                >
                  <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.8 }}>
                    <div>
                      <strong>算法類型:</strong> {slot.algorithmType}
                    </div>
                    <div>
                      <strong>算法ID:</strong> {slot.algorithmId}
                    </div>
                    {slot.purchaseLimit && (
                      <div>
                        <strong>購買上限:</strong> 近 {slot.purchaseLimit.days} 天內,最多 {slot.purchaseLimit.quantity} 個時段
                      </div>
                    )}
                    {slot.purchaseInterval && (
                      <div>
                        <strong>間隔天數:</strong> {slot.purchaseInterval} 天
                      </div>
                    )}
                    <div>
                      <strong>商家限制:</strong> {slot.merchantLimit === 'limited' ? '限制' : '不限制'}
                    </div>
                    <div>
                      <strong>销售区域:</strong> {slot.regionLimit === 'limited' ? '限制' : '不限制'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
