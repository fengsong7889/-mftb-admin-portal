import { useState, useEffect, useRef, useMemo } from 'react'
import { Button, Form, Input, Select, Space, message, Card, Checkbox, InputNumber, Modal, Table, TimePicker, Popover, Switch } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined, AppstoreOutlined, PlusOutlined, DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { AlgorithmType, TimeSlot, TIME_SLOT_OPTIONS, AppType, APP_OPTIONS } from './constants'
import { mockAlgorithmData } from './Algorithm/index'
import './WeightSlider.css'

/** 广告类型标签映射 */
const TYPE_LABEL: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
}

const TYPE_ICON: Record<number, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '⭐',
  [AlgorithmType.NEW_STORE_AD]: '🏪',
  [AlgorithmType.HOT_REVIVE_AD]: '🔥',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '👑',
  [AlgorithmType.TRAFFIC_AD]: '📊',
  [AlgorithmType.GUESS_YOU_LIKE]: '💡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '🌿',
  [AlgorithmType.SEARCH_ALGORITHM]: '🔍',
}

export default function AlgorithmAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const algorithmTypeParam = searchParams.get('type') || ''
  const algorithmIdParam = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail' // 只读详情模式
  const initialType = algorithmTypeParam ? Number(algorithmTypeParam) as AlgorithmType : null
  const isEditMode = !!algorithmIdParam && !isDetailMode // 有 id 参数且非详情模式则为编辑模式
  const [form] = Form.useForm()
  const merchantExposureStrategy = Form.useWatch('merchantExposureStrategy', form) // 监听曝光策略选择

  // 商家维度配置（按商家维度曝光策略）
  interface DimensionItem {
    id: string
    type: string
    weight: number | undefined
  }
  const DIMENSION_OPTIONS = [
    { value: 'qualityScore', label: '商家質量分', desc: '滿分5分，歸一化至0-1' },
    { value: 'orderCompletion', label: '訂單完成率', desc: '近30天訂單完成比例，歸一化至0-1' },
    { value: 'newMerchant', label: '新商家扶持', desc: '首投7天內漸變：第1天=1，第7天=0.14，第8天=0' },
    { value: 'distance', label: '距離維度', desc: '距離衰減：e^(-0.1×距離km)，越近分越高' },
  ]
  const [dimensionItems, setDimensionItems] = useState<DimensionItem[]>([])
  const [selectedDimension, setSelectedDimension] = useState<string | undefined>(undefined)
  const [orderCompletionDays, setOrderCompletionDays] = useState(30) // 订单完成率天数
  const [tooltipVisible, setTooltipVisible] = useState<Record<string, boolean>>({})
  const hideTimerRef = useRef<Record<string, NodeJS.Timeout>>({})
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(initialType) // 从 URL 参数初始化
  const [presaleMode, setPresaleMode] = useState(true) // false: 固定, true: 滚动
  const [continuousPurchase, setContinuousPurchase] = useState(false) // false: 不支持, true: 支持
  const [merchantLimit, setMerchantLimit] = useState(false) // false: 不限制, true: 限制
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  const [deliveryRangeByDistrict, setDeliveryRangeByDistrict] = useState<Record<string, string[]>>({
    macau: [],
    taipa: [],
  })

  // 盘活复苏 - 区域配置（固定可选项）
  const ALL_REVIVE_DISTRICTS = [
    { id: 'macau', label: '澳門' },
    { id: 'taipa', label: '氹仔' },
    { id: 'hengqin', label: '横琴合作區' },
    { id: 'zhuhai', label: '珠海市' },
  ]
  const [reviveDistrictIds, setReviveDistrictIds] = useState<string[]>(['macau', 'taipa'])
  const reviveDistricts = ALL_REVIVE_DISTRICTS.filter(d => reviveDistrictIds.includes(d.id))

  const handleReviveDistrictChange = (ids: string[]) => {
    if (ids.length === 0) return // 至少保留一个
    setReviveDistrictIds(ids)
    // 同步配送范围数据：新增区域初始化为空，删除区域移除
    setDeliveryRangeByDistrict(prev => {
      const next: Record<string, string[]> = {}
      ids.forEach(id => { next[id] = prev[id] || [] })
      return next
    })
  }
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, setRegionLimit] = useState(true) // false: 不限制, true: 限制
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(isEditMode && !isDetailMode) // 编辑模式（详情模式下不可编辑）

  // 新店广告 - 波浪计算配置
  const [newStoreCycle, setNewStoreCycle] = useState(30) // 新店周期（天）
  const [waveInterval, setWaveInterval] = useState(5) // 波浪间隔（天）

  // 大区列表（固定可选项）
  const ALL_WAVE_DISTRICTS = [
    { id: 'macau', label: '澳門' },
    { id: 'taipa', label: '氹仔' },
    { id: 'hengqin', label: '横琴合作區' },
    { id: 'zhuhai', label: '珠海市' },
  ]
  const [selectedDistrictIds, setSelectedDistrictIds] = useState<string[]>(['macau', 'taipa'])
  const waveDistricts = ALL_WAVE_DISTRICTS.filter(d => selectedDistrictIds.includes(d.id))

  // 区域选择变更
  const handleDistrictChange = (ids: string[]) => {
    if (ids.length === 0) return // 至少保留一个
    setSelectedDistrictIds(ids)
    // 同步到已有节点：新增的区域初始化为空，删除的区域移除
    setWaveNodes(prev => prev.map(n => {
      const newRanges: Record<string, string[]> = {}
      ids.forEach(id => { newRanges[id] = n.ranges[id] || [] })
      return { ...n, ranges: newRanges }
    }))
  }

  // 配置模式：shared=全部共享, independent=按区域独立配置
  const [waveConfigMode, setWaveConfigMode] = useState<'shared' | 'independent'>('shared')

  interface WaveNode {
    day: number
    ranges: Record<string, string[]> // key: district id, value: ['short','medium','long']
  }
  const [waveNodes, setWaveNodes] = useState<WaveNode[]>([])

  // 波浪交替起始勾选
  const [waveStartRanges, setWaveStartRanges] = useState<string[]>(['short'])

  // 执行波浪交替：取最大参数往后增长，直到远程后从短程开始循环
  // 规则：
  // 1. 第一行展示用户勾选的参数
  // 2. 第二行取第一行最大的一个参数往后增长（遠程>中程>短程，循环）
  // 3. 以此类推，直到满3个 [短程,中程,远程]，然后从 [短程] 开始自增循环
  const applyWaveAlternating = () => {
    if (waveNodes.length === 0 || waveStartRanges.length === 0) return
    const cycle = ['short', 'medium', 'long']
    const selected = cycle.filter(r => waveStartRanges.includes(r))

    // 生成模式序列
    const pattern: string[][] = []

    // 阶段1：每次取当前组合中最大的往后加一个
    // 规则：上一行包含远程 → 下一行必须是 [短程]
    let current = [...selected]
    pattern.push([...current])
    while (current.length < 3) {
      if (current.includes('long')) {
        // 上一行有远程，下一行从短程开始
        current = ['short']
      } else {
        const maxIdx = Math.max(...current.map(r => cycle.indexOf(r)))
        const nextRange = cycle[(maxIdx + 1) % 3]
        current = [...current, nextRange]
      }
      pattern.push([...current])
    }
    // 阶段1结束，current 为 [短程,中程,远程]

    // 阶段2：自增循环 [短程] → [短程,中程] → [短程,中程,远程] → 回到 [短程]...
    // 规则：上一行包含远程 → 下一行必须是 [短程]
    const loop: string[][] = [
      ['short'],
      ['short', 'medium'],
      ['short', 'medium', 'long'],
    ]
    for (let si = 0; si < loop.length; si++) {
      const step = loop[si]
      if (current.join(',') !== step.join(',')) {
        pattern.push([...step])
      }
      current = [...step]
    }

    setWaveNodes(prev => prev.map((node, idx) => {
      const ranges = pattern[idx % pattern.length]
      const newRanges: Record<string, string[]> = {}
      waveDistricts.forEach(d => { newRanges[d.id] = ranges })
      return { ...node, ranges: newRanges }
    }))
  }

  // 根据新店周期和间隔计算波浪节点
  const calculatedWaveNodes = useMemo(() => {
    if (!newStoreCycle || !waveInterval || newStoreCycle <= 0 || waveInterval <= 0) return []
    const nodes: { day: number }[] = []
    for (let d = newStoreCycle; d > 0; d -= waveInterval) {
      nodes.push({ day: d })
    }
    return nodes
  }, [newStoreCycle, waveInterval])

  // 当计算节点变化时，更新 waveNodes（保留已有配置）
  useEffect(() => {
    setWaveNodes(prev => {
      return calculatedWaveNodes.map(cn => {
        const existing = prev.find(p => p.day === cn.day)
        return existing || { day: cn.day, ranges: {} }
      })
    })
  }, [calculatedWaveNodes])

  // 编辑模式或详情模式下加载默认数据
  useEffect(() => {
    if (algorithmIdParam) {
      const record = mockAlgorithmData.find(item => item.id === Number(algorithmIdParam))
      if (record) {
        form.setFieldsValue({
          name: record.name,
          brand: record.brand,
        })
      }
    }
  }, [algorithmIdParam, form])

  // 返回算法列表页
  const handleBack = () => {
    navigate(`/promotion-algorithm?type=${algorithmTypeParam}`)
  }

  // 进入编辑模式
  const handleEdit = () => {
    setIsEditing(true)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false)
    form.resetFields()
  }

  // 打开商家选择弹窗
  const handleOpenMerchantModal = () => {
    setMerchantModalVisible(true)
  }

  // 关闭商家选择弹窗
  const handleCloseMerchantModal = () => {
    setMerchantModalVisible(false)
  }

  // 确认选择商家
  const handleConfirmMerchants = () => {
    form.setFieldsValue({ merchants: selectedMerchants })
    setMerchantModalVisible(false)
    message.success(`已選擇 ${selectedMerchants.length} 個商家`)
  }

  // 商家选择表格列
  const merchantColumns = [
    { title: '商家ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '商家名稱', dataIndex: 'name', key: 'name', width: 200 },
    { title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 120 },
    { title: '業務類型', dataIndex: 'businessType', key: 'businessType', width: 120 },
  ]

  // Mock商家数据
  const mockMerchants = [
    { id: 'M001', name: '澳門茶餐廳', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M002', name: '葡撻專門店', brand: '閃蜂', businessType: '團購到店' },
    { id: 'M003', name: '海鲜美食坊', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M004', name: '日式拉面屋', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M005', name: '泰式料理', brand: 'mFood', businessType: '團購到店' },
    { id: 'M006', name: '美式漢堡', brand: '閃蜂', businessType: '外賣到家' },
    { id: 'M007', name: '意大利麵館', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M008', name: '法式甜品店', brand: '閃蜂', businessType: '團購到店' },
  ]

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('新增算法数据:', values)
      message.success('算法新增成功')
      setIsEditing(false)
      navigate(`/promotion-algorithm?type=${algorithmTypeParam}`)
    } catch (error) {
      console.error('验证失败:', error)
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isDetailMode ? '算法詳情' : isEditMode ? '編輯算法' : '新增算法'}
              </h2>
              {selectedAlgorithmType && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  <span style={{ fontSize: 14 }}>{TYPE_ICON[selectedAlgorithmType]}</span>
                  {TYPE_LABEL[selectedAlgorithmType]}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 算法选择区域 */}
      <Card 
        title={
          <Space>
            <AppstoreOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>算法選擇</span>
          </Space>
        }
        style={{ 
          marginTop: 16,
          backgroundColor: '#fafbfc',
          border: '1px solid #e8eaed',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}
        headStyle={{
          backgroundColor: '#f0f5ff',
          borderBottom: '1px solid #d6e4ff',
          borderRadius: '8px 8px 0 0'
        }}
      >
        <Form
          form={form}
          layout="horizontal"
          disabled={isDetailMode}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <Form.Item
              label="算法名稱"
              name="name"
              rules={[{ required: true, message: '請輸入算法名稱' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Input placeholder="請輸入算法名稱" />
            </Form.Item>

            <Form.Item
              label="所屬品牌"
              name="brand"
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select
                placeholder="請選擇所屬品牌"
                options={APP_OPTIONS}
                disabled={isEditMode || isDetailMode}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>

      {/* 算法参数区域 */}
      {(selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD || selectedAlgorithmType === AlgorithmType.NEW_STORE_AD || selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT) ? (
        <Card 
          title={
            <Space>
              <SettingOutlined style={{ fontSize: 18, color: '#52c41a' }} />
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.5 }}>算法參數</span>
            </Space>
          }
          extra={
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              配置算法運行參數
            </span>
          }
          style={{ 
            marginTop: 16,
            backgroundColor: '#ffffff',
            border: '1px solid #e8eaed',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
          }}
          headStyle={{
            backgroundColor: 'linear-gradient(135deg, #f6ffed 0%, #e6f7e6 100%)',
            borderBottom: '2px solid #b7eb8f',
            borderRadius: '12px 12px 0 0',
            padding: '16px 24px'
          }}
        >
        <Form
          form={form}
          layout="horizontal"
          colon={false}
          disabled={isDetailMode}
          initialValues={{
            presaleMode: 'rolling',
            continuousPurchase: 'notSupport',
            merchantLimit: 'unlimited',
            regionLimit: 'limited',
            merchantExposureStrategy: 'random',
          }}
        >

          {/* 商家状态计算 */}
          <Form.Item
            label="商家狀態計算"
            style={{ marginBottom: 16 }}
            labelCol={{ flex: '150px' }}
            wrapperCol={{ flex: 1 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Form.Item name="statusOpen" noStyle valuePropName="checked" initialValue={true}>
                <Checkbox disabled>營業中</Checkbox>
              </Form.Item>
              <Form.Item name="statusRest" noStyle valuePropName="checked">
                <Checkbox>休息一會，馬上回來<span style={{ fontSize: 12, color: '#8c8c8c' }}>（2小時後自動恢復）</span></Checkbox>
              </Form.Item>
              <Form.Item name="statusOverwhelmed" noStyle valuePropName="checked">
                <Checkbox>爆單了，暫停接單一會<span style={{ fontSize: 12, color: '#8c8c8c' }}>（2小時後自動恢復）</span></Checkbox>
              </Form.Item>
              <Form.Item name="statusClosed" noStyle valuePropName="checked">
                <Checkbox>休息打烊<span style={{ fontSize: 12, color: '#ff4d4f' }}>（需手動恢復，開啟已打烊會影響用戶體驗，請慎重）</span></Checkbox>
              </Form.Item>
            </div>
          </Form.Item>

          {/* 定时器 */}
          <Form.Item
            label="定時器"
            style={{ flex: 1, marginBottom: 16 }}
            labelCol={{ flex: '150px' }}
            wrapperCol={{ flex: 1 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>每</span>
              <Form.Item name="consistencyCheckInterval" noStyle rules={[{ required: true, message: '請輸入' }]}>
                <InputNumber
                  min={1}
                  max={1440}
                  placeholder="分鐘"
                  style={{ width: 60, borderRadius: 8, fontSize: 14 }}
                />
              </Form.Item>
              <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>分鐘校驗數據一致性</span>
            </div>
          </Form.Item>

          {/* 波浪計算（僅新店廣告） */}
          {selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
            <Form.Item
              style={{ marginBottom: 16 }}
              labelCol={{ flex: '150px' }}
              wrapperCol={{ flex: 1 }}
            >
              {/* 策略类型模块区域 */}
              <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fafafa', padding: '16px 20px' }}>
                <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600, color: '#262626', paddingBottom: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span>策略類型：波浪計算</span>
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#d46b08' }}>⚠️ 新店週期結束後，商家將自動退出新店廣告計算範圍，不再參與新店曝光。</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>新店週期</span>
                    <InputNumber
                      min={1}
                      max={365}
                      value={newStoreCycle}
                      onChange={(val) => setNewStoreCycle(val ?? 30)}
                      style={{ width: 80 }}
                      disabled={isDetailMode}
                    />
                    <span style={{ fontSize: 14, color: '#595959', whiteSpace: 'nowrap' }}>天</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>波浪間隔</span>
                    <InputNumber
                      min={1}
                      max={newStoreCycle}
                      value={waveInterval}
                      onChange={(val) => setWaveInterval(val ?? 5)}
                      style={{ width: 80 }}
                      disabled={isDetailMode}
                    />
                    <span style={{ fontSize: 14, color: '#595959', whiteSpace: 'nowrap' }}>天切換一次</span>
                  </div>
                </div>

                {/* 区域配置 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>區域配置：</span>
                <span style={{ fontSize: 13, color: waveConfigMode === 'shared' ? '#262626' : '#8c8c8c' }}>全區通用</span>
                <Switch
                  checked={waveConfigMode === 'independent'}
                  disabled={isDetailMode}
                  onChange={(checked) => setWaveConfigMode(checked ? 'independent' : 'shared')}
                />
                <span style={{ fontSize: 13, color: waveConfigMode === 'independent' ? '#262626' : '#8c8c8c' }}>獨立配置</span>
                {waveConfigMode === 'independent' && (
                  <>
                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap', marginLeft: 8 }}>展示區域：</span>
                    <Checkbox.Group
                      value={selectedDistrictIds}
                      disabled={isDetailMode}
                      onChange={(vals) => handleDistrictChange(vals as string[])}
                      options={ALL_WAVE_DISTRICTS.map(d => ({ label: d.label, value: d.id }))}
                    />
                  </>
                )}
                </div>

                {/* 快速配置 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>快速配置：</span>
                  <Checkbox.Group
                    value={waveStartRanges}
                    disabled={isDetailMode}
                    onChange={(vals) => setWaveStartRanges(vals as string[])}
                    options={[
                      { label: '短程', value: 'short' },
                      { label: '中程', value: 'medium' },
                      { label: '遠程', value: 'long' },
                    ]}
                  />
                  <Button size="small" type="primary" disabled={isDetailMode || waveStartRanges.length === 0 || waveNodes.length === 0} onClick={applyWaveAlternating}>執行</Button>
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>（勾選起始範圍，點擊執行生成波浪節點）</span>
                </div>

                {/* 波浪节点配置表格 */}
                <div style={{ border: '1px solid #e8eaed', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: waveConfigMode === 'shared' ? '80px 1fr' : `80px repeat(${waveDistricts.length}, 1fr)`,
                  background: '#f0f5ff', borderBottom: '1px solid #d6e4ff',
                  padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1890ff',
                }}>
                  <span>剩餘天數</span>
                  {waveConfigMode === 'shared' ? (
                    <span>配送範圍（全部區域共享）</span>
                  ) : (
                    waveDistricts.map(d => <span key={d.id}>{d.label}</span>)
                  )}
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {waveNodes.map((node, idx) => (
                    <div key={node.day} style={{
                      display: 'grid',
                      gridTemplateColumns: waveConfigMode === 'shared' ? '80px 1fr' : `80px repeat(${waveDistricts.length}, 1fr)`,
                      padding: '10px 16px', alignItems: 'center',
                      borderBottom: idx < waveNodes.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{node.day}天</span>
                      {waveConfigMode === 'shared' ? (
                        <Checkbox.Group
                          options={[
                            { label: '短程', value: 'short' },
                            { label: '中程', value: 'medium' },
                            { label: '遠程', value: 'long' },
                          ]}
                          value={node.ranges['macau'] || []}
                          disabled={isDetailMode}
                          onChange={(vals) => {
                            setWaveNodes(prev => prev.map((n, i) => {
                              if (i !== idx) return n
                              const newRanges: Record<string, string[]> = {}
                              waveDistricts.forEach(d => { newRanges[d.id] = vals as string[] })
                              return { ...n, ranges: newRanges }
                            }))
                          }}
                        />
                      ) : (
                        waveDistricts.map(d => (
                          <Checkbox.Group
                            key={d.id}
                            options={[
                              { label: '短程', value: 'short' },
                              { label: '中程', value: 'medium' },
                              { label: '遠程', value: 'long' },
                            ]}
                            value={node.ranges[d.id] || []}
                            disabled={isDetailMode}
                            onChange={(vals) => {
                              setWaveNodes(prev => prev.map((n, i) => i === idx ? { ...n, ranges: { ...n.ranges, [d.id]: vals as string[] } } : n))
                            }}
                          />
                        ))
                      )}
                    </div>
                  ))}
                </div>
                </div>
              </div>
            </Form.Item>
          )}

          {/* 配送範圍計算（僅盤活復蘇） - 按大區配置 */}
          {selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD && (
            <Form.Item
              label="配送範圍計算"
              style={{ marginBottom: 16 }}
              labelCol={{ flex: '150px' }}
              wrapperCol={{ flex: 1 }}
            >
              {/* 区域选择 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>配置區域：</span>
                <Checkbox.Group
                  value={reviveDistrictIds}
                  disabled={isDetailMode}
                  onChange={(vals) => handleReviveDistrictChange(vals as string[])}
                  options={ALL_REVIVE_DISTRICTS.map(d => ({ label: d.label, value: d.id }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {reviveDistricts.map(d => (
                  <div key={d.id} style={{
                    flex: 1, minWidth: 260,
                    border: '1px solid #d6e4ff', borderRadius: 8,
                    background: '#f0f5ff', overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '8px 16px', background: '#e6f4ff',
                      borderBottom: '1px solid #d6e4ff',
                      fontSize: 13, fontWeight: 600, color: '#1890ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {d.label}
                    </div>
                    <div style={{ padding: '12px 16px' }}>
                      <Checkbox.Group
                        options={[
                          { label: '短程', value: 'short' },
                          { label: '中程', value: 'medium' },
                          { label: '遠程', value: 'long' },
                        ]}
                        value={deliveryRangeByDistrict[d.id] || []}
                        disabled={isDetailMode}
                        onChange={(vals) => setDeliveryRangeByDistrict(prev => ({ ...prev, [d.id]: vals as string[] }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                {reviveDistricts.map(d => d.label).join('、')}的商家匹配各自區域的配送範圍，各區獨立計算、互不影響
              </div>
            </Form.Item>
          )}

          {/* 區域商家展示限制（盤活復蘇 / 無敵星星） */}
          {(selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD || selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR) && (
            /* 盤活復蘇/無敵星星：區域商家展示限制 */
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      算法策略
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder="請選擇"
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR ? [
                            { label: '隨機計算', value: 'random' },
                          ] : [
                            { label: '維度計算', value: 'merchant' },
                            { label: '輪詢計算', value: 'random' },
                          ]}
                          disabled={isDetailMode || selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              {selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR
                                ? '系統自動統計各區域內購買廣告的商家，生成商家ID列表進行隨機展示。過程中如有新增購買商家，系統會自動納入隨機候選集；如有取消推廣的商家，系統會自動剔除。'
                                : '系統自動統計各區域內購買廣告的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保同一區域內每位廣告商家獲得均勻的曝光機會。過程中如有新增購買商家，系統會自動納入候選集並加入排序展示；如有取消推廣的商家，系統會自動剔除，後續商家依次往前頂補位。'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 按商家维度配置 */}
                      {merchantExposureStrategy === 'merchant' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#ffffff', border: '1px solid #e8eaed', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#1890ff', fontWeight: 600 }}>*</span> 選擇維度:
                            </span>
                            {dimensionItems.length < DIMENSION_OPTIONS.length && (
                              <>
                                <Select
                                  placeholder="選擇維度"
                                  style={{ width: 140, height: 28 }}
                                  size="small"
                                  value={selectedDimension}
                                  onChange={(val) => setSelectedDimension(val)}
                                  options={DIMENSION_OPTIONS.filter(o => !dimensionItems.find(d => d.type === o.value))}
                                  disabled={isDetailMode}
                                />
                                <Button
                                  type="dashed"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  disabled={isDetailMode || !selectedDimension}
                                  onClick={() => {
                                    if (selectedDimension) {
                                      setDimensionItems([...dimensionItems, { id: Date.now().toString(), type: selectedDimension, weight: undefined }])
                                      setSelectedDimension(undefined)
                                    }
                                  }}
                                >
                                  新增
                                </Button>
                                <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>（至少一項，多項可設置權重，權重高的優先曝光）</span>
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dimensionItems.map((item, index) => {
                              const opt = DIMENSION_OPTIONS.find(o => o.value === item.type)
                              return (
                                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', padding: '10px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                                  {/* 第一行：参数名 + 描述 + 删除 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt?.label}</span>
                                    {item.type === 'orderCompletion' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        近
                                        <InputNumber
                                          min={1}
                                          max={365}
                                          value={orderCompletionDays}
                                          onChange={(val) => setOrderCompletionDays(val ?? 30)}
                                          style={{ width: 64 }}
                                          size="small"
                                          disabled={isDetailMode}
                                        />
                                        天訂單完成比例（貝葉斯平滑）
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#52c41a' }}>📊 貝葉斯平滑說明</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>修正完成率</strong> = (完成單數 + α) / (總單數 + β)
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                • <strong>α</strong>：固定值 5，預設已完成訂單數
                                                <br />
                                                • <strong>β</strong>：固定值 10，預設總訂單數
                                                <br />
                                                • <strong>作用</strong>：單量越少，完成率越被拉向 50%，避免小樣本偏差
                                                <br />
                                                • <strong>單量越大</strong>，修正率越接近真實完成率
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f6ffed', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                例：1單完成1單 → 修正率=(1+5)/(1+10)=54.5%
                                                <br />
                                                20單完成10單 → 修正率=(10+5)/(20+10)=50%
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : item.type === 'distance' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {opt?.desc}
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#722ed1' }}>📏 距離衰減說明</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>距離分</strong> = e<sup>-0.1 × 距離(km)</sup>
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                • 距離越近，分數越接近 1
                                                <br />
                                                • 距離越遠，分數指數衰減趨近 0
                                                <br />
                                                • <strong>衰減係數 0.1</strong>：每增加 10km，分數約下降 63%
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f9f0ff', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                1km → 0.90 &nbsp; 3km → 0.74 &nbsp; 5km → 0.61
                                                <br />
                                                8km → 0.45 &nbsp; 15km → 0.22 &nbsp; 30km → 0.05
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#722ed1', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>（{opt?.desc}）</span>
                                    )}
                                    {!isDetailMode && (
                                      <DeleteOutlined
                                        style={{ color: '#ff4d4f', fontSize: 16, cursor: 'pointer' }}
                                        onClick={() => setDimensionItems(dimensionItems.filter((_, i) => i !== index))}
                                      />
                                    )}
                                  </div>
                                  {/* 第二行：权重滑块 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 0 }}>
                                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>權重:</span>
                                    <div className="ws-wrapper">
                                      {/* 原生滑块 + 气泡 */}
                                      <div className="ws-slider-box">
                                        {/* 气泡 - 绝对定位在滑块上方 */}
                                        <div className="ws-tooltip" style={{ left: `${((item.weight ?? 1) - 1) / 9 * 100}%`, opacity: tooltipVisible[item.id] ? 1 : 0, transition: 'opacity 0.25s ease, left 0.25s ease-out', pointerEvents: 'none' }}>
                                          <div className="ws-tooltip-box">{item.weight ?? 1}</div>
                                          <div className="ws-tooltip-arrow" />
                                        </div>
                                        <div className="ws-rail">
                                          <div className="ws-fill" style={{ width: `${((item.weight ?? 1) - 1) / 9 * 100}%` }} />
                                        </div>
                                        <input
                                          type="range"
                                          className="ws-input"
                                          min={1}
                                          max={10}
                                          value={item.weight ?? 1}
                                          disabled={isDetailMode}
                                          onMouseDown={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onMouseUp={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onTouchStart={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onTouchEnd={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onChange={(e) => {
                                            const val = Number(e.target.value)
                                            const newItems = [...dimensionItems]
                                            newItems[index].weight = val
                                            setDimensionItems(newItems)
                                          }}
                                        />
                                      </div>
                                      {/* 刻度 */}
                                      <div className="ws-ticks">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                          <div key={n} className="ws-tick">
                                            <div className={`ws-tick-bar ${n <= (item.weight ?? 1) ? 'on' : ''}`} />
                                            <span className={`ws-tick-num ${n === (item.weight ?? 1) ? 'on' : ''}`}>{n}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* 计算公式 */}
                          <div style={{ marginTop: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 4, fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#1890ff' }}>計算公式：</div>
                                <div>最終得分 = (質量分/5 × W₁) + (修正完成率 × W₂) + (扶持分 × W₃) + (距離分 × W₄)</div>
                                <div style={{ marginTop: 4, color: '#8c8c8c' }}>扶持分 = max(0, (8-首投天數)/7)；距離分 = e^(-0.1×距離km)</div>
                              </div>
                              <div style={{ flex: 1, borderLeft: '1px solid #e8e8e8', paddingLeft: 16 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#52c41a' }}>示例：</div>
                                <div style={{ marginBottom: 8 }}>假設權重：W₁=6, W₂=3, W₃=1, W₄=4（α=5, β=10 固定）</div>
                                <div style={{ display: 'flex', gap: 16 }}>
                                  <div style={{ flex: 1 }}>
                                    <div>商家A：質量4分 + 20單完成10單 + 首投15天 + 距離2km</div>
                                    <div style={{ color: '#8c8c8c' }}>修正率=(10+5)/(20+10)=50%，距離分=e^(-0.1×2)=0.82</div>
                                    <div style={{ color: '#8c8c8c' }}>得分 = 0.8×6 + 0.5×3 + 0×1 + 0.82×4 = <span style={{ color: '#1890ff', fontWeight: 600 }}>9.58</span></div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div>商家B：質量3分 + 1單完成1單 + 首投2天 + 距離8km</div>
                                    <div style={{ color: '#8c8c8c' }}>修正率=(1+5)/(1+10)=54.5%，距離分=e^(-0.1×8)=0.45</div>
                                    <div style={{ color: '#8c8c8c' }}>得分 = 0.6×6 + 0.545×3 + 0.857×1 + 0.45×4 = <span style={{ color: '#1890ff', fontWeight: 600 }}>7.7</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 曝光分配策略 */}
                            <div style={{ padding: '10px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8, color: '#d46b08', fontSize: 12 }}>
                                🎯 曝光分配策略：加權隨機（輪盤賭）
                              </div>
                              <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
                                單坑位場景下，每次用戶請求到達時，按商家得分權重隨機抽取一個商家展示。分數越高，被抽中概率越大，但低分商家也有機會曝光。
                              </div>
                              <div style={{ padding: '8px 10px', background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontWeight: 600, color: '#d46b08', fontSize: 12 }}>分配公式：</span>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>P(商家i) = score_i / Σ(所有商家得分)</span>
                                  <Popover
                                    trigger="click"
                                    placement="right"
                                    title={<span style={{ fontWeight: 600, color: '#d46b08' }}>📊 分配示例</span>}
                                    content={
                                      <div style={{ maxWidth: 320, fontSize: 12 }}>
                                        <div style={{ color: '#595959', marginBottom: 8 }}>
                                          假設 5 個商家得分：A=6, B=7, C=10, D=5, E=9.5，總分=37.5
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                          {[
                                            { name: 'C', score: 10, color: '#1890ff' },
                                            { name: 'E', score: 9.5, color: '#722ed1' },
                                            { name: 'B', score: 7, color: '#52c41a' },
                                            { name: 'A', score: 6, color: '#fa8c16' },
                                            { name: 'D', score: 5, color: '#eb2f96' },
                                          ].map(m => (
                                            <div key={m.name} style={{ flex: '1 1 70px', padding: '4px 6px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                                              <div style={{ fontWeight: 600, color: m.color, fontSize: 12 }}>商家{m.name}</div>
                                              <div style={{ fontSize: 10, color: '#8c8c8c' }}>得分 {m.score}</div>
                                              <div style={{ fontSize: 11, fontWeight: 600, color: '#595959' }}>{(m.score / 37.5 * 100).toFixed(1)}%</div>
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '18px', padding: '4px 6px', background: '#f6ffed', borderRadius: 4 }}>
                                          💡 長期效果：請求 1000 次，C 約 267 次，E 約 253 次，B 約 187 次，A 約 160 次，D 約 133 次
                                        </div>
                                      </div>
                                    }
                                  >
                                    <QuestionCircleOutlined style={{ color: '#d46b08', cursor: 'pointer', fontSize: 13 }} />
                                  </Popover>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
            </div>


          )}

          {/* ===== 獨家商家：保單類型計算（獨立模塊） ===== */}
          {selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT && (
            <Form.Item
              label="保單類型計算"
              style={{ marginBottom: 16 }}
              labelCol={{ flex: '150px' }}
              wrapperCol={{ flex: 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Form.Item name="orderTypeDelivery" noStyle valuePropName="checked">
                  <Checkbox disabled={isDetailMode}>外賣訂單</Checkbox>
                </Form.Item>
                <Form.Item name="orderTypePickup" noStyle valuePropName="checked">
                  <Checkbox disabled={isDetailMode}>自取訂單</Checkbox>
                </Form.Item>
              </div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                勾選參與保單類型計算的訂單類型，至少選擇一項
              </div>
            </Form.Item>
          )}

          {/* ===== 獨家商家：算法策略（獨立模塊，與盤活復蘇/無敵星星互不影響） ===== */}
          {selectedAlgorithmType === AlgorithmType.EXCLUSIVE_MERCHANT && (
              <div style={{
                border: '1px solid #d6e4ff',
                borderRadius: 8,
                background: '#f0f5ff',
                overflow: 'hidden',
                marginBottom: 16,
              }}>
                    {/* 標題欄 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, color: '#1890ff',
                      padding: '10px 20px',
                      borderBottom: '1px solid #d6e4ff',
                      background: '#e6f4ff',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <SettingOutlined />
                      算法策略
                    </div>

                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                      <Form.Item
                        name="merchantExposureStrategy"
                        style={{ flex: 1, marginBottom: 0 }}
                        wrapperCol={{ span: 24 }}
                      >
                        <Select
                          placeholder="請選擇"
                          style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                          options={[
                            { label: '維度計算', value: 'merchant' },
                            { label: '輪詢計算', value: 'random' },
                          ]}
                          disabled={isDetailMode}
                        />
                      </Form.Item>
                    </div>

                      {/* 按轮询维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              系統自動統計各區域內購買廣告的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保同一區域內每位廣告商家獲得均勻的曝光機會。過程中如有新增購買商家，系統會自動納入候選集並加入排序展示；如有取消推廣的商家，系統會自動剔除，後續商家依次往前頂補位。
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 按商家维度配置 */}
                      {merchantExposureStrategy === 'merchant' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#ffffff', border: '1px solid #e8eaed', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#1890ff', fontWeight: 600 }}>*</span> 選擇維度:
                            </span>
                            {dimensionItems.length < DIMENSION_OPTIONS.length && (
                              <>
                                <Select
                                  placeholder="選擇維度"
                                  style={{ width: 140, height: 28 }}
                                  size="small"
                                  value={selectedDimension}
                                  onChange={(val) => setSelectedDimension(val)}
                                  options={DIMENSION_OPTIONS.filter(o => !dimensionItems.find(d => d.type === o.value))}
                                  disabled={isDetailMode}
                                />
                                <Button
                                  type="dashed"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  disabled={isDetailMode || !selectedDimension}
                                  onClick={() => {
                                    if (selectedDimension) {
                                      setDimensionItems([...dimensionItems, { id: Date.now().toString(), type: selectedDimension, weight: undefined }])
                                      setSelectedDimension(undefined)
                                    }
                                  }}
                                >
                                  新增
                                </Button>
                                <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>（至少一項，多項可設置權重，權重高的優先曝光）</span>
                              </>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dimensionItems.map((item, index) => {
                              const opt = DIMENSION_OPTIONS.find(o => o.value === item.type)
                              return (
                                <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', padding: '10px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                                  {/* 第一行：参数名 + 描述 + 删除 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt?.label}</span>
                                    {item.type === 'orderCompletion' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        近
                                        <InputNumber
                                          min={1}
                                          max={365}
                                          value={orderCompletionDays}
                                          onChange={(val) => setOrderCompletionDays(val ?? 30)}
                                          style={{ width: 64 }}
                                          size="small"
                                          disabled={isDetailMode}
                                        />
                                        天訂單完成比例（貝葉斯平滑）
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#52c41a' }}>📊 貝葉斯平滑說明</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>修正完成率</strong> = (完成單數 + α) / (總單數 + β)
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                • <strong>α</strong>：固定值 5，預設已完成訂單數
                                                <br />
                                                • <strong>β</strong>：固定值 10，預設總訂單數
                                                <br />
                                                • <strong>作用</strong>：單量越少，完成率越被拉向 50%，避免小樣本偏差
                                                <br />
                                                • <strong>單量越大</strong>，修正率越接近真實完成率
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f6ffed', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                例：1單完成1單 → 修正率=(1+5)/(1+10)=54.5%
                                                <br />
                                                20單完成10單 → 修正率=(10+5)/(20+10)=50%
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : item.type === 'distance' ? (
                                      <span style={{ fontSize: 13, color: '#8c8c8c', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {opt?.desc}
                                        <Popover
                                          trigger="click"
                                          placement="right"
                                          title={<span style={{ fontWeight: 600, color: '#722ed1' }}>📏 距離衰減說明</span>}
                                          content={
                                            <div style={{ maxWidth: 280, fontSize: 12, lineHeight: '20px' }}>
                                              <div style={{ marginBottom: 6 }}>
                                                <strong>距離分</strong> = e<sup>-0.1 × 距離(km)</sup>
                                              </div>
                                              <div style={{ color: '#595959' }}>
                                                • 距離越近，分數越接近 1
                                                <br />
                                                • 距離越遠，分數指數衰減趨近 0
                                                <br />
                                                • <strong>衰減係數 0.1</strong>：每增加 10km，分數約下降 63%
                                              </div>
                                              <div style={{ marginTop: 8, padding: '6px 8px', background: '#f9f0ff', borderRadius: 4, color: '#8c8c8c', fontSize: 11 }}>
                                                1km → 0.90 &nbsp; 3km → 0.74 &nbsp; 5km → 0.61
                                                <br />
                                                8km → 0.45 &nbsp; 15km → 0.22 &nbsp; 30km → 0.05
                                              </div>
                                            </div>
                                          }
                                        >
                                          <QuestionCircleOutlined style={{ color: '#722ed1', cursor: 'pointer', fontSize: 14 }} />
                                        </Popover>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>（{opt?.desc}）</span>
                                    )}
                                    {!isDetailMode && (
                                      <DeleteOutlined
                                        style={{ color: '#ff4d4f', fontSize: 16, cursor: 'pointer' }}
                                        onClick={() => setDimensionItems(dimensionItems.filter((_, i) => i !== index))}
                                      />
                                    )}
                                  </div>
                                  {/* 第二行：权重滑块 */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 0 }}>
                                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>權重:</span>
                                    <div className="ws-wrapper">
                                      <div className="ws-slider-box">
                                        <div className="ws-tooltip" style={{ left: `${((item.weight ?? 1) - 1) / 9 * 100}%`, opacity: tooltipVisible[item.id] ? 1 : 0, transition: 'opacity 0.25s ease, left 0.25s ease-out', pointerEvents: 'none' }}>
                                          <div className="ws-tooltip-box">{item.weight ?? 1}</div>
                                          <div className="ws-tooltip-arrow" />
                                        </div>
                                        <div className="ws-rail">
                                          <div className="ws-fill" style={{ width: `${((item.weight ?? 1) - 1) / 9 * 100}%` }} />
                                        </div>
                                        <input
                                          type="range"
                                          className="ws-input"
                                          min={1}
                                          max={10}
                                          value={item.weight ?? 1}
                                          disabled={isDetailMode}
                                          onMouseDown={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onMouseUp={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onTouchStart={() => {
                                            if (hideTimerRef.current[item.id]) clearTimeout(hideTimerRef.current[item.id])
                                            setTooltipVisible(prev => ({ ...prev, [item.id]: true }))
                                          }}
                                          onTouchEnd={() => {
                                            hideTimerRef.current[item.id] = setTimeout(() => {
                                              setTooltipVisible(prev => ({ ...prev, [item.id]: false }))
                                            }, 2000)
                                          }}
                                          onChange={(e) => {
                                            const val = Number(e.target.value)
                                            const newItems = [...dimensionItems]
                                            newItems[index].weight = val
                                            setDimensionItems(newItems)
                                          }}
                                        />
                                      </div>
                                      <div className="ws-ticks">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                          <div key={n} className="ws-tick">
                                            <div className={`ws-tick-bar ${n <= (item.weight ?? 1) ? 'on' : ''}`} />
                                            <span className={`ws-tick-num ${n === (item.weight ?? 1) ? 'on' : ''}`}>{n}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* 计算公式 */}
                          <div style={{ marginTop: 16, padding: '10px 12px', background: '#f9f9f9', border: '1px solid #e8e8e8', borderRadius: 4, fontSize: 12, color: '#595959', lineHeight: '20px' }}>
                            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#1890ff' }}>計算公式：</div>
                                <div>最終得分 = (質量分/5 × W₁) + (修正完成率 × W₂) + (扶持分 × W₃) + (距離分 × W₄)</div>
                                <div style={{ marginTop: 4, color: '#8c8c8c' }}>扶持分 = max(0, (8-首投天數)/7)；距離分 = e^(-0.1×距離km)</div>
                              </div>
                              <div style={{ flex: 1, borderLeft: '1px solid #e8e8e8', paddingLeft: 16 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#52c41a' }}>示例：</div>
                                <div style={{ marginBottom: 8 }}>假設權重：W₁=6, W₂=3, W₃=1, W₄=4（α=5, β=10 固定）</div>
                                <div style={{ display: 'flex', gap: 16 }}>
                                  <div style={{ flex: 1 }}>
                                    <div>商家A：質量4分 + 20單完成10單 + 首投15天 + 距離2km</div>
                                    <div style={{ color: '#8c8c8c' }}>修正率=(10+5)/(20+10)=50%，距離分=e^(-0.1×2)=0.82</div>
                                    <div style={{ color: '#8c8c8c' }}>得分 = 0.8×6 + 0.5×3 + 0×1 + 0.82×4 = <span style={{ color: '#1890ff', fontWeight: 600 }}>9.58</span></div>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div>商家B：質量3分 + 1單完成1單 + 首投2天 + 距離8km</div>
                                    <div style={{ color: '#8c8c8c' }}>修正率=(1+5)/(1+10)=54.5%，距離分=e^(-0.1×8)=0.45</div>
                                    <div style={{ color: '#8c8c8c' }}>得分 = 0.6×6 + 0.545×3 + 0.857×1 + 0.45×4 = <span style={{ color: '#1890ff', fontWeight: 600 }}>7.7</span></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 曝光分配策略 */}
                            <div style={{ padding: '10px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8, color: '#d46b08', fontSize: 12 }}>
                                🎯 曝光分配策略：加權隨機（輪盤賭）
                              </div>
                              <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
                                單坑位場景下，每次用戶請求到達時，按商家得分權重隨機抽取一個商家展示。分數越高，被抽中概率越大，但低分商家也有機會曝光。
                              </div>
                              <div style={{ padding: '8px 10px', background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontWeight: 600, color: '#d46b08', fontSize: 12 }}>分配公式：</span>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>P(商家i) = score_i / Σ(所有商家得分)</span>
                                  <Popover
                                    trigger="click"
                                    placement="right"
                                    title={<span style={{ fontWeight: 600, color: '#d46b08' }}>📊 分配示例</span>}
                                    content={
                                      <div style={{ maxWidth: 320, fontSize: 12 }}>
                                        <div style={{ color: '#595959', marginBottom: 8 }}>
                                          假設 5 個商家得分：A=6, B=7, C=10, D=5, E=9.5，總分=37.5
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                          {[
                                            { name: 'C', score: 10, color: '#1890ff' },
                                            { name: 'E', score: 9.5, color: '#722ed1' },
                                            { name: 'B', score: 7, color: '#52c41a' },
                                            { name: 'A', score: 6, color: '#fa8c16' },
                                            { name: 'D', score: 5, color: '#eb2f96' },
                                          ].map(m => (
                                            <div key={m.name} style={{ flex: '1 1 70px', padding: '4px 6px', background: '#fafafa', borderRadius: 4, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                                              <div style={{ fontWeight: 600, color: m.color, fontSize: 12 }}>商家{m.name}</div>
                                              <div style={{ fontSize: 10, color: '#8c8c8c' }}>得分 {m.score}</div>
                                              <div style={{ fontSize: 11, fontWeight: 600, color: '#595959' }}>{(m.score / 37.5 * 100).toFixed(1)}%</div>
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: '18px', padding: '4px 6px', background: '#f6ffed', borderRadius: 4 }}>
                                          💡 長期效果：請求 1000 次，C 約 267 次，E 約 253 次，B 約 187 次，A 約 160 次，D 約 133 次
                                        </div>
                                      </div>
                                    }
                                  >
                                    <QuestionCircleOutlined style={{ color: '#d46b08', cursor: 'pointer', fontSize: 13 }} />
                                  </Popover>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
            </div>
          )}

          {/* 新店廣告：算法策略（波浪計算 + 輪詢曝光） */}
          {selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
            <div style={{
              border: '1px solid #d6e4ff',
              borderRadius: 8,
              background: '#f0f5ff',
              overflow: 'hidden',
              marginBottom: 16,
            }}>
              {/* 標題欄 */}
              <div style={{
                fontSize: 14, fontWeight: 600, color: '#1890ff',
                padding: '10px 20px',
                borderBottom: '1px solid #d6e4ff',
                background: '#e6f4ff',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <SettingOutlined />
                算法策略
              </div>

              <div style={{ padding: '16px 20px' }}>
                {/* 商家曝光策略 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>商家曝光策略</span>
                  <Select
                    value="roundRobin"
                    style={{ width: '25%', height: 36, borderRadius: 6, fontSize: 14 }}
                    options={[{ label: '輪詢計算', value: 'roundRobin' }]}
                    disabled={isDetailMode}
                  />
                </div>

                {/* 輪詢說明 */}
                <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                  <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                    系統自動統計各區域內符合新店週期的商家，生成商家 ID 列表並按順序排列，然後逐個輪播展示，確保每位新店商家獲得均勻的曝光機會。過程中如有新開業商家，系統會自動納入候選集；如商家新店週期結束或取消推廣，系統會自動剔除，後續商家依次往前頂補位。
                  </span>
                </div>
              </div>
            </div>
          )}
        </Form>
        </Card>
      ) : selectedAlgorithmType ? (
        /* 其它算法类型：显示提示 */
        <Card 
          style={{ 
            marginTop: 16,
            backgroundColor: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: 12,
          }}
        >
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#8c8c8c'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
              暫無參數配置
            </div>
            <div style={{ fontSize: 14 }}>
              當前廣告類型暫未開放參數配置，請聯繫管理員
            </div>
          </div>
        </Card>
      ) : (
        /* 未选择算法类型：显示提示 */
        <Card 
          style={{ 
            marginTop: 16,
            backgroundColor: '#f0f5ff',
            border: '1px solid #d6e4ff',
            borderRadius: 12,
          }}
        >
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: '#595959'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👆</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#1890ff' }}>
              請先選擇廣告類型
            </div>
            <div style={{ fontSize: 14 }}>
              選擇廣告類型後，將顯示對應的參數配置項
            </div>
          </div>
        </Card>
      )}

      {/* 底部保存按钮（详情模式下隐藏） */}
      {selectedAlgorithmType && !isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>
            取消
          </Button>
          <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={handleSubmit}
          >
            保存
          </Button>
        </div>
      )}

      {/* 商家选择弹窗 */}
      <Modal
        title="選擇商家"
        open={merchantModalVisible}
        onOk={handleConfirmMerchants}
        onCancel={handleCloseMerchantModal}
        width={900}
        okText="確認選擇"
        cancelText="取消"
      >
        <Table
          rowKey="id"
          columns={merchantColumns}
          dataSource={mockMerchants}
          rowSelection={{
            selectedRowKeys: selectedMerchants,
            onChange: (selectedRowKeys: React.Key[]) => {
              setSelectedMerchants(selectedRowKeys as string[])
            },
          }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
          }}
        />
      </Modal>
    </div>
  )
}
