import { useState, useMemo, useCallback, useEffect } from 'react'
import { Button, Form, Input, Select, Space, message, Card, Table, Tag, Badge, Switch, Popover, Modal, InputNumber } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, MobileOutlined, PlusOutlined, QuestionCircleOutlined, HolderOutlined } from '@ant-design/icons'
import { mockData } from './PromotionSlotConfig/index'

/** 品牌选项 */
const APP_OPTIONS = [
  { label: '閃峰', value: 'shanfeng' },
  { label: 'mFood', value: 'mfood' },
]

/** 品牌标签 */
const APP_LABEL: Record<string, string> = { shanfeng: '閃峰', mfood: 'mFood' }

/** 算法类型标签 */
const ALGO_TYPE_LABEL: Record<string, string> = {
  invincibleStar: '無敵星星',
  newShopAd: '新店廣告',
  activateAd: '盤活復蘇',
  exclusiveShop: '獨家商家',
  youLike: '猜你喜歡',
}

/** 算法类型颜色 */
const ALGO_TYPE_COLOR: Record<string, string> = {
  invincibleStar: 'magenta',
  newShopAd: 'blue',
  activateAd: 'green',
  exclusiveShop: 'orange',
  youLike: 'purple',
}

/** 算法位置配置 */
interface SlotAlgorithm {
  position: number
  algorithmId: number
  algorithmName: string
  algorithmType: string
  weight: number
  status: 'active' | 'inactive'
}

/** 可选算法列表（Mock） */
const ALGORITHM_OPTIONS = [
  { label: '無敵星星-首頁版', value: 1001, type: 'invincibleStar' },
  { label: '無敵星星-外賣版', value: 1002, type: 'invincibleStar' },
  { label: '猜你喜歡-主力版', value: 2001, type: 'youLike' },
  { label: '猜你喜歡-週末版', value: 2002, type: 'youLike' },
  { label: '新店廣告-首頁版', value: 3001, type: 'newShopAd' },
  { label: '新店廣告-早餐版', value: 3002, type: 'newShopAd' },
  { label: '盤活復蘇-首頁版', value: 4001, type: 'activateAd' },
  { label: '盤活復蘇-午市版', value: 4002, type: 'activateAd' },
  { label: '獨家商家-首頁版', value: 5001, type: 'exclusiveShop' },
  { label: '獨家商家-超市版', value: 5002, type: 'exclusiveShop' },
]

/** Mock: 各位置关联的算法列表 */
const MOCK_SLOT_ALGORITHMS: SlotAlgorithm[] = [
  { position: 1, algorithmId: 1001, algorithmName: '無敵星星-首頁版', algorithmType: 'invincibleStar', weight: 95, status: 'active' },
  { position: 2, algorithmId: 1002, algorithmName: '無敵星星-外賣版', algorithmType: 'invincibleStar', weight: 90, status: 'active' },
  { position: 3, algorithmId: 2001, algorithmName: '猜你喜歡-主力版', algorithmType: 'youLike', weight: 85, status: 'active' },
  { position: 4, algorithmId: 2002, algorithmName: '猜你喜歡-週末版', algorithmType: 'youLike', weight: 80, status: 'active' },
  { position: 5, algorithmId: 3001, algorithmName: '新店廣告-首頁版', algorithmType: 'newShopAd', weight: 75, status: 'active' },
  { position: 6, algorithmId: 3002, algorithmName: '新店廣告-早餐版', algorithmType: 'newShopAd', weight: 70, status: 'inactive' },
  { position: 7, algorithmId: 4001, algorithmName: '盤活復蘇-首頁版', algorithmType: 'activateAd', weight: 65, status: 'active' },
  { position: 8, algorithmId: 4002, algorithmName: '盤活復蘇-午市版', algorithmType: 'activateAd', weight: 60, status: 'active' },
  { position: 9, algorithmId: 5001, algorithmName: '獨家商家-首頁版', algorithmType: 'exclusiveShop', weight: 55, status: 'active' },
  { position: 10, algorithmId: 5002, algorithmName: '獨家商家-超市版', algorithmType: 'exclusiveShop', weight: 50, status: 'inactive' },
]

export default function PromotionSlotConfigAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editIdParam = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'
  const isEditMode = !!editIdParam && !isDetailMode
  const [form] = Form.useForm()
  const [filterDislike, setFilterDislike] = useState(false)
  const [slotAlgorithms, setSlotAlgorithms] = useState<SlotAlgorithm[]>(MOCK_SLOT_ALGORITHMS)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [addForm] = Form.useForm()
  const [selectedAlgoType, setSelectedAlgoType] = useState<string>('')
  const [selectedPositions, setSelectedPositions] = useState<number[]>([])
  const [rangeStart, setRangeStart] = useState<number | null>(null)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [totalPositions, setTotalPositions] = useState<number>(100)

  // 编辑模式或详情模式下加载数据
  useEffect(() => {
    if (editIdParam) {
      const record = mockData.find(item => item.id === Number(editIdParam))
      if (record) {
        form.setFieldsValue({
          promotionName: record.promotionName,
          app: record.app,
        })
      }
    }
  }, [editIdParam, form])

  // 新增坑位配置
  const handleAddSlot = () => {
    addForm.resetFields()
    setSelectedAlgoType('')
    setSelectedPositions([])
    setRangeStart(null)
    setRangeEnd(null)
    setIsAddModalVisible(true)
  }

  // 切换位置选择
  const togglePosition = (pos: number) => {
    setSelectedPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos].sort((a, b) => a - b)
    )
  }

  // 批量添加范围位置
  const handleAddRange = () => {
    if (rangeStart === null || rangeEnd === null || rangeStart > rangeEnd) {
      message.warning('請輸入有效的位置範圍')
      return
    }
    const occupiedPositions = new Set(slotAlgorithms.map(s => s.position))
    const newPositions: number[] = []
    for (let i = rangeStart; i <= rangeEnd; i++) {
      if (!occupiedPositions.has(i) && !selectedPositions.includes(i)) {
        newPositions.push(i)
      }
    }
    if (newPositions.length === 0) {
      message.warning('所選範圍內無可用位置')
      return
    }
    setSelectedPositions(prev => [...prev, ...newPositions].sort((a, b) => a - b))
    setRangeStart(null)
    setRangeEnd(null)
    message.success(`已添加 ${newPositions.length} 個位置`)
  }

  // 移除位置
  const removePosition = (pos: number) => {
    setSelectedPositions(prev => prev.filter(p => p !== pos))
  }

  // 清空所有选择
  const clearAllPositions = () => {
    setSelectedPositions([])
  }

  const handleConfirmAddSlot = async () => {
    try {
      const values = await addForm.validateFields()
      if (selectedPositions.length === 0) {
        message.warning('請至少選擇一個展示位置')
        return
      }
      const selectedAlgo = ALGORITHM_OPTIONS.find(a => a.value === values.algorithmId)
      if (!selectedAlgo) return
      const newSlots: SlotAlgorithm[] = selectedPositions.map(pos => ({
        position: pos,
        algorithmId: selectedAlgo.value,
        algorithmName: selectedAlgo.label,
        algorithmType: selectedAlgo.type,
        weight: 50,
        status: 'active' as const,
      }))
      setSlotAlgorithms(prev => {
        const updated = [...prev, ...newSlots].sort((a, b) => a.position - b.position)
        return updated.map((item, i) => ({ ...item, position: i + 1 }))
      })
      message.success(`已新增 ${selectedAlgo.label} 至 ${selectedPositions.map(p => `${p}號位`).join('、')}`)
      setIsAddModalVisible(false)
    } catch (error) {
      console.error('验证失败:', error)
    }
  }

  // 删除坑位配置
  const handleDeleteSlot = (record: SlotAlgorithm) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除${record.position}號位配置嗎？`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => message.success(`已刪除 ${record.position}號位 配置`),
    })
  }

  // 编辑坑位配置
  const handleEditSlot = (record: SlotAlgorithm) => {
    addForm.setFieldsValue({
      algorithmId: record.algorithmId,
    })
    setSelectedAlgoType(ALGO_TYPE_LABEL[record.algorithmType] || '')
    setSelectedPositions([record.position])
    setIsAddModalVisible(true)
  }

  // 切换启用/停用状态
  const handleToggleStatus = (record: SlotAlgorithm) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'active' ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}「${record.algorithmName}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        setSlotAlgorithms(prev =>
          prev.map(item =>
            item.position === record.position ? { ...item, status: newStatus } : item
          )
        )
        message.success(`已${actionText} ${record.algorithmName}`)
      },
    })
  }

  // 拖拽排序
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) return
    const newList = [...slotAlgorithms]
    const [moved] = newList.splice(dragIndex, 1)
    newList.splice(index, 0, moved)
    // 重新编号 position
    const reordered = newList.map((item, i) => ({ ...item, position: i + 1 }))
    setSlotAlgorithms(reordered)
    setDragIndex(null)
    setDragOverIndex(null)
    message.success(`已將「${moved.algorithmName}」移動至 ${index + 1}號位`)
  }, [dragIndex, slotAlgorithms])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  // 手机模型标题
  const phoneTitle = useMemo(() => {
    const app = form.getFieldValue('app') as string | undefined
    const appName = app ? APP_LABEL[app] || app : '閃峰'
    return `瀑布流預覽-${appName}`
  }, [form])

  const handleBack = () => navigate('/promotion-slot-config')

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      console.log('表单数据:', values)
      message.success('保存成功')
      navigate('/promotion-slot-config')
    } catch (error) {
      console.error('验证失败:', error)
    }
  }

  const columns: ColumnsType<SlotAlgorithm> = [
    {
      title: '展示位置',
      dataIndex: 'position',
      key: 'position',
      width: 100,
      align: 'center',
      render: (v: number) => <Tag color="green">{v}號位</Tag>,
    },
    {
      title: '算法ID',
      dataIndex: 'algorithmId',
      key: 'algorithmId',
      width: 100,
      align: 'center',
      render: (id: number) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
          {String(id).padStart(6, '0')}
        </code>
      ),
    },
    {
      title: '算法名稱',
      dataIndex: 'algorithmName',
      key: 'algorithmName',
      width: 180,
      ellipsis: true,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '算法類型',
      dataIndex: 'algorithmType',
      key: 'algorithmType',
      width: 110,
      render: (v: string) => (
        <Tag color={ALGO_TYPE_COLOR[v]}>{ALGO_TYPE_LABEL[v]}</Tag>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'default'}>
          {v === 'active' ? '啟用' : '停用'}
        </Tag>
      ),
    },
    ...(!isDetailMode ? [{
      title: '操作',
      key: 'action',
      width: 180,
      align: 'center' as const,
      render: (_: any, record: SlotAlgorithm) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            style={record.status === 'inactive' ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" onClick={() => handleEditSlot(record)}>
            編輯
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteSlot(record)}>
            刪除
          </Button>
        </Space>
      ),
    }] : []),
  ]

  return (
    <div className="content-area">
      {/* 页面头部 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ fontSize: 14 }}>
          返回
        </Button>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
          {isDetailMode ? '瀑布流詳情' : isEditMode ? '編輯瀑布流配置' : '新增瀑布流配置'}
        </h2>
      </div>

      {/* 表单区域 */}
      <Card
        title={
          <Space>
            <MobileOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>基礎信息</span>
          </Space>
        }
        style={{
          borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: '1px solid #e8eaed',
        }}
        headStyle={{
          backgroundColor: '#f0f5ff',
          borderBottom: '1px solid #d6e4ff',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <Form form={form} layout="horizontal" disabled={isDetailMode}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <Form.Item
              label="瀑布流名稱"
              name="promotionName"
              rules={[{ required: true, message: '請輸入瀑布流名稱' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Input placeholder="請輸入瀑布流名稱" allowClear />
            </Form.Item>

            <Form.Item
              label="所屬品牌"
              name="app"
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select placeholder="請選擇所屬品牌" options={APP_OPTIONS} />
            </Form.Item>
          </div>
        </Form>
      </Card>

      {/* 下方：手机模型 + 算法列表 */}
      <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
        {/* 左侧：手机模型 */}
        <div style={{
          width: 375, height: 720, flexShrink: 0,
          background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
          borderRadius: 40, padding: '60px 20px 30px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
          border: '10px solid #1a1a1a', position: 'relative',
        }}>
          {/* 顶部状态栏 */}
          <div style={{
            position: 'absolute', top: 16, left: 0, right: 0,
            padding: '0 24px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', fontSize: 12, color: '#333', fontWeight: 600,
          }}>
            <span>9:41</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11 }}>📶</span>
              <span style={{ fontSize: 11 }}>🔋</span>
            </div>
          </div>

          {/* 屏幕内容区 */}
          <div style={{
            background: '#fff', borderRadius: 24, padding: '16px',
            height: 'calc(100% - 20px)', overflow: 'hidden',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* 标题栏 */}
            <div style={{
              textAlign: 'center', padding: '12px 0', marginBottom: 16,
              borderBottom: '1px solid #f0f0f0', flexShrink: 0,
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                {phoneTitle}
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>
                瀑布流展示位預覽
              </div>
            </div>

            {/* 瀑布流位置列表（支持拖拽排序） */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              overflow: 'auto', flex: 1,
            }}>
              {slotAlgorithms.filter(item => item.status === 'active').map((item, index) => (
                <div
                  key={item.position}
                  draggable={!isDetailMode}
                  onDragStart={() => !isDetailMode && handleDragStart(index)}
                  onDragOver={(e) => !isDetailMode && handleDragOver(e, index)}
                  onDrop={() => !isDetailMode && handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: item.status === 'active' ? '#FAFAFA' : '#f5f5f5',
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: dragOverIndex === index
                      ? '2px solid #1890ff'
                      : `1px solid ${item.status === 'active' ? '#F0F0F0' : '#e8e8e8'}`,
                    opacity: dragIndex === index ? 0.4 : (item.status === 'active' ? 1 : 0.6),
                    cursor: isDetailMode ? 'default' : 'grab',
                    transition: 'border 0.2s, opacity 0.2s',
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isDetailMode && (
                        <HolderOutlined style={{ color: '#bfbfbf', fontSize: 14, cursor: 'grab' }} />
                      )}
                      <Badge
                        count={`${item.position}號位`}
                        style={{ backgroundColor: item.status === 'active' ? '#1890ff' : '#d9d9d9' }}
                      />
                    </div>
                    <Tag color={ALGO_TYPE_COLOR[item.algorithmType]}>
                      {ALGO_TYPE_LABEL[item.algorithmType]}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                    {item.algorithmName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧：算法列表 */}
        <div style={{ flex: 1, minWidth: 360 }}>
          <Card
            title={
              <span style={{ fontSize: 15, fontWeight: 600 }}>展示位算法列表</span>
            }
            extra={
              <Space size={16}>
                {!isDetailMode && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSlot} size="small">
                    新增
                  </Button>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>過濾用戶不喜歡</span>
                  <Switch
                    size="small"
                    checked={filterDislike}
                    onChange={(checked) => {
                      setFilterDislike(checked)
                      message.info(checked ? '已開啟過濾用戶不喜歡' : '已關閉過濾用戶不喜歡')
                    }}
                    style={{ marginLeft: 8 }}
                    disabled={isDetailMode}
                  />
                  <Popover
                    content={
                      <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                        開啟後，用戶進入 APP 時，若推廣商家是用戶此前標記為「不喜歡」的商家，系統將自動過濾，不再向該用戶展示此商家。
                      </div>
                    }
                    trigger="hover"
                    placement="topRight"
                  >
                    <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
                  </Popover>
                </div>
              </Space>
            }
            style={{ borderRadius: 8 }}
          >
            <Table<SlotAlgorithm>
              columns={columns}
              dataSource={slotAlgorithms}
              rowKey="position"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total) => `共 ${total} 條`,
              }}
              size="small"
              scroll={{ y: 540 }}
            />
          </Card>
        </div>
      </div>

      {/* 新增坑位弹窗 */}
      <Modal
        title="新增坑位配置"
        open={isAddModalVisible}
        onOk={handleConfirmAddSlot}
        onCancel={() => setIsAddModalVisible(false)}
        okText="確定"
        cancelText="取消"
        okButtonProps={{ style: { background: '#E8720C', borderColor: '#E8720C' } }}
        width={900}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="算法名稱"
            name="algorithmId"
            rules={[{ required: true, message: '請選擇算法名稱' }]}
          >
            <Select
              placeholder="請選擇算法"
              showSearch
              optionFilterProp="label"
              options={ALGORITHM_OPTIONS}
              onChange={(value) => {
                const algo = ALGORITHM_OPTIONS.find(a => a.value === value)
                setSelectedAlgoType(algo ? ALGO_TYPE_LABEL[algo.type] : '')
              }}
            />
          </Form.Item>
          <Form.Item label="算法類型">
            <Input
              value={selectedAlgoType}
              disabled
              placeholder="請先選擇算法名稱"
              style={{ color: selectedAlgoType ? '#333' : '#bfbfbf' }}
            />
          </Form.Item>
          <Form.Item label={
            <span>
              展示位置
              <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginLeft: 8 }}>
                已選 {selectedPositions.length} 個位置
              </span>
              <Select
                value={totalPositions}
                onChange={(val) => setTotalPositions(val)}
                size="small"
                style={{ width: 90, marginLeft: 12, fontSize: 12 }}
                options={[
                  { label: '前 100 個', value: 100 },
                  { label: '前 200 個', value: 200 },
                  { label: '前 300 個', value: 300 },
                  { label: '前 500 個', value: 500 },
                ]}
              />
            </span>
          } required>
            <div style={{ 
              maxHeight: 450, 
              overflowY: 'auto', 
              padding: '12px', 
              background: '#fafafa', 
              border: '1px solid #e8e8e8', 
              borderRadius: 6 
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 8 }}>
                {Array.from({ length: totalPositions }, (_, i) => i + 1).map(pos => {
                  const existingSlot = slotAlgorithms.find(s => s.position === pos)
                  const isOccupied = !!existingSlot
                  const isSelected = selectedPositions.includes(pos)
                  return (
                    <div
                      key={pos}
                      onClick={() => !isOccupied && togglePosition(pos)}
                      style={{
                        padding: '8px 4px',
                        borderRadius: 6,
                        border: isSelected ? '2px solid #E8720C' : isOccupied ? '1px solid #e8e8e8' : '1px solid #d9d9d9',
                        background: isSelected ? '#fff7e6' : isOccupied ? '#f5f5f5' : '#fff',
                        cursor: isOccupied ? 'not-allowed' : 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s',
                        opacity: isOccupied ? 0.5 : 1,
                      }}
                    >
                      <div style={{ 
                        fontSize: 12, 
                        fontWeight: isSelected ? 600 : 400, 
                        color: isSelected ? '#E8720C' : isOccupied ? '#bfbfbf' : '#333' 
                      }}>
                        {pos}號位
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 已选位置统计展示区 */}
            <div style={{ 
              marginTop: 12, 
              padding: '12px 16px', 
              background: selectedPositions.length > 0 ? '#fff7e6' : '#fafafa', 
              border: selectedPositions.length > 0 ? '1px solid #ffd591' : '1px solid #e8e8e8', 
              borderRadius: 6 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>
                  已選坑位統計（{selectedPositions.length} 個）
                </span>
                {selectedPositions.length > 0 && (
                  <Button 
                    size="small" 
                    onClick={clearAllPositions} 
                    style={{ fontSize: 12, padding: '0 8px', height: 22 }}
                  >
                    清空全部
                  </Button>
                )}
              </div>
              {selectedPositions.length > 0 ? (
                <div style={{ 
                  maxHeight: 120, 
                  overflowY: 'auto', 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 6 
                }}>
                  {selectedPositions.map(pos => (
                    <Tag
                      key={pos}
                      closable
                      onClose={() => removePosition(pos)}
                      color="orange"
                      style={{ margin: 0, fontSize: 12 }}
                    >
                      {pos}號位
                    </Tag>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#bfbfbf', fontSize: 13 }}>
                  暫未選擇位置，請在上方網格中點擊選擇
                </div>
              )}
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 底部操作按钮（详情模式下隐藏） */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
        </div>
      )}
    </div>
  )
}
