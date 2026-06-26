import { useState, useMemo } from 'react'
import { Card, Table, Tag, Button, Space, Empty, Badge, message } from 'antd'
import {
  ThunderboltOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { AlgorithmType, Region, RecommendChannel } from '../Recommend/constants'
import DateTimeGrid from './DateTimeGrid'
import {
  type InventoryItem,
  type RecommendTypeConfig,
  RECOMMEND_TYPE_CONFIGS,
  CHANNEL_LABEL,
  generateMockInventory,
} from './types'

export default function PromotionSalesConfig() {
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(null)
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null)

  // 根据推荐类型生成库存数据（不需要商圈）
  const inventoryData = useMemo<InventoryItem[]>(() => {
    if (!selectedAlgorithmType) return []
    // 生成所有商圈的库存数据
    const allData: InventoryItem[] = []
    Object.values(Region).forEach(region => {
      if (typeof region === 'number') {
        allData.push(...generateMockInventory(region, selectedAlgorithmType))
      }
    })
    return allData
  }, [selectedAlgorithmType])

  // 推荐类型选择 - 直接进入库存数据界面
  const handleSelectType = (config: RecommendTypeConfig) => {
    if (!config.enabled) {
      message.info('該類型暫未開放，敬請期待')
      return
    }
    setSelectedAlgorithmType(config.type)
    setCurrentStep(1) // 跳过商圈选择，直接进入库存数据界面
  }

  // 库存选择
  const handleSelectInventory = (record: InventoryItem) => {
    setSelectedInventory(record)
    setCurrentStep(2)
  }

  // 返回上一步
  const handleGoBack = () => {
    if (currentStep === 1) {
      setSelectedAlgorithmType(null)
    } else if (currentStep === 2) {
      setSelectedInventory(null)
    }
    setCurrentStep(prev => Math.max(0, prev - 1))
  }

  // 库存表格列配置
  const inventoryColumns: ColumnsType<InventoryItem> = [
    {
      title: '活動名稱',
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 150,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
    {
      title: '展示位置',
      dataIndex: 'slotPosition',
      key: 'slotPosition',
      width: 100,
      render: (v: number) => <Badge count={`${v}號位`} style={{ backgroundColor: '#1890ff' }} />,
    },
    {
      title: '可購買日期',
      key: 'dateRange',
      width: 220,
      render: (_, record) => (
        <span style={{ color: '#595959' }}>
          {record.availableStartDate} ~ {record.availableEndDate}
        </span>
      ),
    },
    {
      title: '庫存狀態',
      key: 'stock',
      width: 140,
      render: (_, record) => {
        const remaining = record.totalSlots - record.soldSlots
        const percent = Math.round((remaining / record.totalSlots) * 100)
        const color = percent > 50 ? 'green' : percent > 20 ? 'orange' : 'red'
        return (
          <Space direction="vertical" size={0}>
            <Tag color={color}>{remaining} 個時段可選</Tag>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>剩餘 {percent}%</span>
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => handleSelectInventory(record)}
        >
          前往購買
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面标题 */}
      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>
          <ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />
          廣告購買
        </h2>
        <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 13 }}>
          可根據需求選擇推薦類型，為您的店鋪購買廣告曝光位，獲取流量
        </p>
      </Card>

      {/* Step 1: 选择推荐类型 */}
      {currentStep === 0 && (
        <Card title="選擇推薦類型" style={{ marginBottom: 16 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {RECOMMEND_TYPE_CONFIGS.map(config => (
              <Card
                key={config.type}
                hoverable={config.enabled}
                onClick={() => handleSelectType(config)}
                style={{
                  cursor: config.enabled ? 'pointer' : 'not-allowed',
                  opacity: config.enabled ? 1 : 0.5,
                  border: selectedAlgorithmType === config.type ? '2px solid #1890ff' : undefined,
                }}
                bodyStyle={{ padding: 20 }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>{config.icon}</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{config.name}</h3>
                  <p style={{ margin: 0, color: '#8c8c8c', fontSize: 13, lineHeight: 1.6 }}>
                    {config.description}
                  </p>
                  {!config.enabled && (
                    <Tag color="default" style={{ marginTop: 12 }}>即將開放</Tag>
                  )}
                  {config.enabled && (
                    <Tag color="green" style={{ marginTop: 12 }}>可購買</Tag>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* Step 2: 选择库存数据 */}
      {currentStep === 1 && (
        <Card
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>選擇展示位</span>
              <Button
                type="primary"
                icon={<ArrowLeftOutlined />}
                onClick={handleGoBack}
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
              >
                返回上一步
              </Button>
            </div>
          }
          style={{ marginBottom: 16 }}
        >
          <Table<InventoryItem>
            rowKey="id"
            columns={inventoryColumns}
            dataSource={inventoryData}
            pagination={false}
            scroll={{ x: 1030 }}
            locale={{ emptyText: <Empty description="該商圈暫無可購買庫存" /> }}
            rowClassName={(record) => selectedInventory?.id === record.id ? 'ant-table-row-selected' : ''}
          />
        </Card>
      )}

      {/* Step 3: 选择时段并加购 */}
      {currentStep === 2 && selectedInventory && (
        <>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={24}>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>當前所選活動：</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fa8c16' }}>{selectedInventory.promotionName}</span>
                  </Space>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>業務頻道：</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>{CHANNEL_LABEL[selectedInventory.channel]}</span>
                  </Space>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>展示位置：</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedInventory.slotPosition}號位</span>
                  </Space>
                </Space>
                <Button
                  type="primary"
                  icon={<ArrowLeftOutlined />}
                  onClick={handleGoBack}
                  style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
                >
                  返回上一步
                </Button>
              </div>
            }
            style={{ marginBottom: 16 }}
          >
            <DateTimeGrid
              inventoryItem={selectedInventory}
            />
          </Card>
        </>
      )}
    </div>
  )
}
