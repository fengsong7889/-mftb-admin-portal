import { useState } from 'react'
import { Button, Form, Input, Select, Space, message, Card, Checkbox, InputNumber, Modal, Table, TimePicker, Switch } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined, AppstoreOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { AlgorithmType, RecommendChannel, PlacementInterface, TimeSlot, TIME_SLOT_OPTIONS, AppType, APP_OPTIONS } from './constants'

export default function AlgorithmAdd() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const merchantExposureStrategy = Form.useWatch('merchantExposureStrategy', form) // 监听商家曝光策略选择
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(null) // 当前选择的算法类型
  const [presaleMode, setPresaleMode] = useState(true) // false: 固定, true: 滚动
  const [continuousPurchase, setContinuousPurchase] = useState(false) // false: 不支持, true: 支持
  const [merchantLimit, setMerchantLimit] = useState(false) // false: 不限制, true: 限制
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, setRegionLimit] = useState(true) // false: 不限制, true: 限制
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [placementInterfaceMode, setPlacementInterfaceMode] = useState(false) // false: 全部, true: 指定
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([])
  const [isEditing, setIsEditing] = useState(false) // 编辑模式
  const [regionMerchantCustom, setRegionMerchantCustom] = useState(false) // false: 限制1個, true: 自定義
  const [singleUserExposureLimit, setSingleUserExposureLimit] = useState(true) // false: 不限, true: 限制
  const [dailyExposureLimit, setDailyExposureLimit] = useState(false) // false: 不限, true: 限制

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
  ]
  const [dimensionItems, setDimensionItems] = useState<DimensionItem[]>([])
  const [selectedDimension, setSelectedDimension] = useState<string | undefined>(undefined)

  // 返回上一页
  const handleBack = () => {
    navigate('/promotion-algorithm')
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
    { id: 'M001', name: '澳門茶餐廳', brand: '閃峰', businessType: '外賣到家' },
    { id: 'M002', name: '葡撻專門店', brand: '閃峰', businessType: '團購到店' },
    { id: 'M003', name: '海鲜美食坊', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M004', name: '日式拉面屋', brand: '閃峰', businessType: '外賣到家' },
    { id: 'M005', name: '泰式料理', brand: 'mFood', businessType: '團購到店' },
    { id: 'M006', name: '美式漢堡', brand: '閃峰', businessType: '外賣到家' },
    { id: 'M007', name: '意大利麵館', brand: 'mFood', businessType: '外賣到家' },
    { id: 'M008', name: '法式甜品店', brand: '閃峰', businessType: '團購到店' },
  ]

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('新增算法数据:', values)
      message.success('算法新增成功')
      setIsEditing(false)
      navigate('/promotion-algorithm')
    } catch (error) {
      console.error('验证失败:', error)
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部 */}
      <div style={{
        background: '#fff', padding: '12px 20px', marginBottom: 12,
        borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1890ff' }}>
            新增算法
          </h2>
        </div>
        <Button
          type="primary"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{ fontSize: 14 }}
        >
          返回
        </Button>
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
              />
            </Form.Item>

            <Form.Item
              label="業務頻道"
              name="channel"
              rules={[{ required: true, message: '請選擇業務頻道' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select
                placeholder="請選擇業務頻道"
                options={[
                  { label: '美食外賣', value: RecommendChannel.DELIVERY },
                  { label: '超市百貨', value: RecommendChannel.SUPERMARKET },
                  { label: '團購到店', value: RecommendChannel.GROUP_BUY },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 16 }}>
            <Form.Item
              label="廣告類型"
              name="type"
              rules={[{ required: true, message: '請選擇廣告類型' }]}
              style={{ flex: '0 0 calc((100% - 32px) / 3)', marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select
                placeholder="請選擇廣告類型"
                options={[
                  { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
                  { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
                  { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
                  { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
                  { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
                  { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
                  { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
                  { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
                ]}
                onChange={(value) => {
                  setSelectedAlgorithmType(value)
                  // 切换算法类型时重置参数区域的状态
                  if (value !== AlgorithmType.INVINCIBLE_STAR && value !== AlgorithmType.HOT_REVIVE_AD) {
                    setIsEditing(false)
                  }
                  // 無敵星星時：區域商家展示限制默認限制1個並禁用
                  if (value === AlgorithmType.INVINCIBLE_STAR) {
                    setRegionMerchantCustom(false)
                  }
                }}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>

      {/* 算法参数区域 */}
      {(selectedAlgorithmType === AlgorithmType.INVINCIBLE_STAR || selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD) ? (
        <Card 
          title={
            <Space>
              <SettingOutlined style={{ fontSize: 18, color: '#52c41a' }} />
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.5 }}>算法參數</span>
            </Space>
          }
          extra={
            <Space>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                配置算法運行參數
              </span>
              {!isEditing && (
                <Button 
                  type="primary" 
                  size="small"
                  onClick={handleEdit}
                  style={{ 
                    borderRadius: 4,
                    height: 28
                  }}
                >
                  編輯
                </Button>
              )}
            </Space>
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
          disabled={!isEditing}
          initialValues={{
            presaleMode: 'rolling',
            continuousPurchase: 'notSupport',
            merchantLimit: 'unlimited',
            regionLimit: 'limited',
          }}
        >
          {/* 配送地圖同步頻率和執行時段前每 */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Form.Item
              label="配送地圖同步計算"
              name="deliveryMapFetchFrequency"
              rules={[{ required: true, message: '請輸入配送地圖同步計算的分鐘數' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 4 }}
              wrapperCol={{ span: 20 }}
            >
              <InputNumber
                min={1}
                max={1440}
                placeholder="請輸入分钟数"
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 8,
                  fontSize: 14
                }}
                addonAfter={<span style={{ color: '#595959', fontWeight: 500, fontSize: 13 }}>分鐘/次</span>}
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="區域商家數據每日"
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Form.Item name="regionPurchaseCalcTime" noStyle rules={[{ required: true, message: '請選擇計算時間' }]}>
                  <TimePicker
                    format="HH:mm"
                    placeholder="選擇時間"
                    style={{ flex: 1 }}
                    size="large"
                  />
                </Form.Item>
                <span style={{ color: '#595959', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }}>點計算次日數據並緩存</span>
              </div>
            </Form.Item>
          </div>

          {/* 定时器校验 + 监听机制 */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <Form.Item
              label="定時器校驗"
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 4 }}
              wrapperCol={{ span: 20 }}
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
                <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>分鐘校驗數據一致性，時段開始</span>
                <span style={{ fontSize: 14, color: '#1890ff', fontWeight: 600, whiteSpace: 'nowrap' }}>前</span>
                <Form.Item name="preSlotCheckMinutes" noStyle rules={[{ required: true, message: '請輸入' }]}>
                  <InputNumber
                    min={1}
                    max={600}
                    placeholder="分鐘"
                    style={{ width: 60, borderRadius: 8, fontSize: 14 }}
                  />
                </Form.Item>
                <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>分鐘校驗，時段開始</span>
                <span style={{ fontSize: 14, color: '#1890ff', fontWeight: 600, whiteSpace: 'nowrap' }}>時</span>
                <Form.Item name="forceCheckOnSlotStart" noStyle valuePropName="checked">
                  <Checkbox>強制</Checkbox>
                </Form.Item>
                <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>校驗</span>
              </div>
            </Form.Item>

            <Form.Item
              label="監聽機制"
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>訂單監聽:</span>
                <Form.Item name="orderListenCancelled" noStyle valuePropName="checked" initialValue={true}>
                  <Checkbox disabled>已取消</Checkbox>
                </Form.Item>
                <Form.Item name="orderListenRefunded" noStyle valuePropName="checked" initialValue={true}>
                  <Checkbox disabled>已退款</Checkbox>
                </Form.Item>
                <span style={{ fontSize: 14, color: '#1890ff', fontWeight: 600 }}>剔除候選集</span>
                <span style={{ fontSize: 14, color: '#595959' }}>|</span>
                <span style={{ fontSize: 14, color: '#595959', fontWeight: 500, whiteSpace: 'nowrap' }}>商家監聽:</span>
                <Form.Item name="merchantListenClosed" noStyle valuePropName="checked">
                  <Checkbox>已打烊</Checkbox>
                </Form.Item>
                <span style={{ fontSize: 14, color: '#1890ff', fontWeight: 600 }}>剔除候選集</span>
              </div>
            </Form.Item>
          </div>

          {/* 區域商家展示限制 + 算法落地頁 */}
          {selectedAlgorithmType === AlgorithmType.HOT_REVIVE_AD ? (
            /* 盤活復蘇：區域商家展示限制單獨一行，算法落地頁下一排左對齊 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
              {/* 區域商家展示限制 和 輪循商家數限制 同一排 */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 0 }}>
                <Form.Item
                  label="區域商家展示限制"
                  style={{ flex: 1, marginBottom: 0 }}
                  labelCol={{ span: 4 }}
                  wrapperCol={{ span: 20 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: regionMerchantCustom ? '#8c8c8c' : '#1890ff', fontWeight: regionMerchantCustom ? 400 : 600 }}>限制1個</span>
                    <Switch
                      checked={regionMerchantCustom}
                      onChange={(checked) => setRegionMerchantCustom(checked)}
                      disabled={!isEditing}
                      size="small"
                    />
                    <span style={{ fontSize: 13, color: regionMerchantCustom ? '#1890ff' : '#8c8c8c', fontWeight: regionMerchantCustom ? 600 : 400 }}>自定義</span>
                  </div>
                </Form.Item>

                {/* 算法落地頁：與區域商家展示限制同排 */}
                <Form.Item
                  label="算法落地頁"
                  name="algorithmLandingPage"
                  rules={[{ required: true, message: '請選擇算法落地頁' }]}
                  style={{ flex: 1, marginBottom: 0 }}
                  labelCol={{ span: 6 }}
                  wrapperCol={{ span: 18 }}
                >
                  <Checkbox.Group
                    options={[
                      { label: '大首頁-Feed', value: 'home' },
                      { label: '外賣頻道-Feed', value: 'delivery' },
                      { label: '超市頻道-Feed', value: 'supermarket' },
                      { label: '團購頻道-Feed', value: 'groupBuy' },
                    ]}
                  />
                </Form.Item>
              </div>

              {/* 自定義時：算法策略小包围區域 */}
              {regionMerchantCustom && (
                <div style={{
                  border: '1px solid #d6e4ff',
                  borderRadius: 8,
                  background: '#f0f5ff',
                  overflow: 'hidden',
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
                    {/* 條件區域 */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: '#1677ff',
                        marginBottom: 10, paddingLeft: 8,
                        borderLeft: '3px solid #1677ff',
                      }}>條件</div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <Form.Item
                          label="輪循商家數限制"
                          name="regionMerchantDisplayLimit"
                          rules={[{ required: true, message: '請輸入展示個數' }]}
                          style={{ flex: 1, marginBottom: 0 }}
                          labelCol={{ span: 4 }}
                          wrapperCol={{ span: 20 }}
                        >
                          <InputNumber
                            min={1}
                            max={10000}
                            placeholder="請輸入商家数量"
                            style={{ width: '100%', height: 36, borderRadius: 6, fontSize: 14 }}
                            addonAfter={<span style={{ color: '#595959', fontWeight: 500, fontSize: 13 }}>個數</span>}
                          />
                        </Form.Item>
                        <div style={{ flex: 1 }} />
                      </div>
                    </div>

                    {/* 策略區域 */}
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e8eaed',
                      borderRadius: 6,
                      padding: '14px 16px',
                    }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: '#52c41a',
                        marginBottom: 10, paddingLeft: 8,
                        borderLeft: '3px solid #52c41a',
                      }}>策略</div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {/* 單用戶曝光數 */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>單用戶曝光數</span>
                            <span style={{ fontSize: 13, color: singleUserExposureLimit ? '#8c8c8c' : '#1890ff', fontWeight: singleUserExposureLimit ? 400 : 600 }}>不限</span>
                            <Switch
                              checked={singleUserExposureLimit}
                              onChange={(checked) => setSingleUserExposureLimit(checked)}
                              disabled={!isEditing}
                              size="small"
                            />
                            <span style={{ fontSize: 13, color: singleUserExposureLimit ? '#1890ff' : '#8c8c8c', fontWeight: singleUserExposureLimit ? 600 : 400 }}>限制</span>
                            {singleUserExposureLimit && (
                              <Form.Item
                                name="singleUserExposure"
                                style={{ flex: 1, marginBottom: 0 }}
                                wrapperCol={{ span: 24 }}
                              >
                                <InputNumber
                                  min={1}
                                  max={9999}
                                  placeholder="請輸入"
                                  style={{ width: '100%', height: 36, borderRadius: 6, fontSize: 14 }}
                                  addonAfter={<span style={{ color: '#595959', fontWeight: 500, fontSize: 13 }}>次</span>}
                                />
                              </Form.Item>
                            )}
                          </div>
                        </div>

                        {/* 商家單日曝光上限 */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap', marginLeft: '65px' }}>商家單日曝光</span>
                            <span style={{ fontSize: 13, color: dailyExposureLimit ? '#8c8c8c' : '#1890ff', fontWeight: dailyExposureLimit ? 400 : 600 }}>不限</span>
                            <Switch
                              checked={dailyExposureLimit}
                              onChange={(checked) => setDailyExposureLimit(checked)}
                              disabled={!isEditing}
                              size="small"
                            />
                            <span style={{ fontSize: 13, color: dailyExposureLimit ? '#1890ff' : '#8c8c8c', fontWeight: dailyExposureLimit ? 600 : 400 }}>限制</span>
                            {dailyExposureLimit && (
                              <Form.Item
                                name="dailyMaxExposure"
                                style={{ flex: 1, marginBottom: 0 }}
                                wrapperCol={{ span: 24 }}
                              >
                                <InputNumber
                                  min={1}
                                  max={999999}
                                  placeholder="請輸入"
                                  style={{ width: '100%', height: 36, borderRadius: 6, fontSize: 14 }}
                                  addonAfter={<span style={{ color: '#595959', fontWeight: 500, fontSize: 13 }}>次/日</span>}
                                />
                              </Form.Item>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 曝光限制备注 */}
                      {(singleUserExposureLimit || dailyExposureLimit) && (
                        <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4, fontSize: 12, color: '#8c8c8c', lineHeight: '20px' }}>
                          <span style={{ color: '#faad14', fontWeight: 600 }}>備註：</span>
                          計算結果會考慮曝光策略，曝光上限會剔除候選集，剩餘商家繼續輪候，當所有商家曝光滿足，則該展示位將顯示權重分排序商家。
                        </div>
                      )}

                      {/* 商家曝光策略：策略欄内新起一行，左對齊 */}
                      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                        <div style={{ flex: 1 }}>
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
                                  { label: '按商家維度', value: 'merchant' },
                                  { label: '按隨機維度', value: 'random' },
                                ]}
                              />
                            </Form.Item>
                          </div>
                        </div>
                        <div style={{ flex: 1 }} />
                      </div>

                      {/* 按随机维度配置 */}
                      {merchantExposureStrategy === 'random' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <Form.Item name="shuffleRandom" noStyle valuePropName="checked" initialValue={true}>
                              <Checkbox disabled>洗牌隨機</Checkbox>
                            </Form.Item>
                            <span style={{ fontSize: 13, color: '#595959', lineHeight: '22px' }}>
                              維護廣告商家ID列表，亂序排列後逐個取出，取完一輪再重新洗牌開始下一輪，絕對均勻，用戶短時間內不會看到重複廣告。
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 按商家维度配置 */}
                      {merchantExposureStrategy === 'merchant' && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6 }}>
                          <div style={{ fontSize: 13, color: '#595959', marginBottom: 12 }}>
                            <span style={{ color: '#1890ff', fontWeight: 600 }}>*</span> 選擇維度（至少一項，多項可設置權重，權重高的優先曝光）:
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {dimensionItems.map((item, index) => {
                              const opt = DIMENSION_OPTIONS.find(o => o.value === item.type)
                              return (
                                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <span style={{ fontSize: 13, color: '#595959', fontWeight: 500, minWidth: 80 }}>{opt?.label}</span>
                                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>（{opt?.desc}）</span>
                                  <span style={{ fontSize: 13, color: '#595959' }}>權重:</span>
                                  <InputNumber
                                    min={1}
                                    max={100}
                                    placeholder="1-100"
                                    style={{ width: 100 }}
                                    size="small"
                                    value={item.weight}
                                    onChange={(val) => {
                                      const newItems = [...dimensionItems]
                                      newItems[index].weight = val ?? undefined
                                      setDimensionItems(newItems)
                                    }}
                                  />
                                  <DeleteOutlined
                                    style={{ color: '#ff4d4f', fontSize: 16, cursor: 'pointer' }}
                                    onClick={() => setDimensionItems(dimensionItems.filter((_, i) => i !== index))}
                                  />
                                </div>
                              )
                            })}
                            {/* 新增维度 */}
                            {dimensionItems.length < DIMENSION_OPTIONS.length && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Select
                                  placeholder="選擇維度"
                                  style={{ width: 160, height: 32 }}
                                  size="small"
                                  value={selectedDimension}
                                  onChange={(val) => setSelectedDimension(val)}
                                  options={DIMENSION_OPTIONS.filter(o => !dimensionItems.find(d => d.type === o.value))}
                                />
                                <Button
                                  type="dashed"
                                  size="small"
                                  icon={<PlusOutlined />}
                                  disabled={!selectedDimension}
                                  onClick={() => {
                                    if (selectedDimension) {
                                      setDimensionItems([...dimensionItems, { id: Date.now().toString(), type: selectedDimension, weight: undefined }])
                                      setSelectedDimension(undefined)
                                    }
                                  }}
                                >
                                  新增
                                </Button>
                              </div>
                            )}
                          </div>
                          {/* 计算公式 */}
                          <div style={{ marginTop: 16, padding: '10px 12px', background: '#ffffff', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 12, color: '#595959', lineHeight: '20px', display: 'flex', gap: 24 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, marginBottom: 4, color: '#1890ff' }}>計算公式：</div>
                              <div>最終得分 = (質量分/5 × W₁) + (訂單完成率 × W₂) + (扶持分 × W₃)</div>
                              <div style={{ marginTop: 4, color: '#8c8c8c' }}>扶持分 = max(0, (8-首投天數)/7)</div>
                            </div>
                            <div style={{ flex: 1, borderLeft: '1px solid #e8e8e8', paddingLeft: 16 }}>
                              <div style={{ fontWeight: 600, marginBottom: 4, color: '#52c41a' }}>示例：</div>
                              <div style={{ marginBottom: 8 }}>假設權重：W₁=60, W₂=30, W₃=10</div>
                              <div style={{ display: 'flex', gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                  <div>商家A：質量4分 + 完成率90% + 首投15天</div>
                                  <div style={{ color: '#8c8c8c' }}>得分 = 0.8×60 + 0.9×30 + 0×10 = <span style={{ color: '#1890ff', fontWeight: 600 }}>75</span></div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div>商家B：質量3分 + 完成率70% + 首投2天</div>
                                  <div style={{ color: '#8c8c8c' }}>得分 = 0.6×60 + 0.7×30 + 0.857×10 = <span style={{ color: '#1890ff', fontWeight: 600 }}>65.57</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 無敵星星：區域商家展示限制 和 算法落地頁 並排展示 */
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Form.Item
                label="區域商家展示限制"
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: regionMerchantCustom ? '#8c8c8c' : '#1890ff', fontWeight: regionMerchantCustom ? 400 : 600 }}>限制1個</span>
                    <Switch
                      checked={regionMerchantCustom}
                      onChange={(checked) => setRegionMerchantCustom(checked)}
                      disabled={true}
                      size="small"
                    />
                    <span style={{ fontSize: 13, color: regionMerchantCustom ? '#1890ff' : '#8c8c8c', fontWeight: regionMerchantCustom ? 600 : 400 }}>自定義</span>
                  </div>
                  {regionMerchantCustom && (
                    <Form.Item
                      name="regionMerchantDisplayLimit"
                      rules={[{ required: true, message: '請輸入展示個數' }]}
                      style={{ marginBottom: 0 }}
                      label="輪循商家數限制"
                      labelCol={{ span: 8 }}
                      wrapperCol={{ span: 16 }}
                    >
                      <InputNumber
                        min={1}
                        max={10000}
                        placeholder="請輸入商家数量"
                        style={{
                          width: 160,
                          height: 44,
                          borderRadius: 8,
                          fontSize: 14
                        }}
                        addonAfter={<span style={{ color: '#595959', fontWeight: 500, fontSize: 13 }}>個數</span>}
                        size="large"
                      />
                    </Form.Item>
                  )}
                </div>
              </Form.Item>

              <Form.Item
                label="算法落地頁"
                name="algorithmLandingPage"
                rules={[{ required: true, message: '請選擇算法落地頁' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 6 }}
                wrapperCol={{ span: 18 }}
              >
                <Checkbox.Group
                  options={[
                    { label: '大首頁-Feed', value: 'home' },
                    { label: '外賣頻道-Feed', value: 'delivery' },
                    { label: '超市頻道-Feed', value: 'supermarket' },
                    { label: '團購頻道-Feed', value: 'groupBuy' },
                  ]}
                />
              </Form.Item>
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

      {/* 底部保存按钮（仅编辑模式下显示） */}
      {isEditing && (
        <div style={{ 
          marginTop: 24, 
          padding: '20px 24px',
          backgroundColor: '#fff',
          borderRadius: 8,
          border: '1px solid #e8eaed',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          textAlign: 'right'
        }}>
          <Space size={12}>
            <Button 
              size="large"
              onClick={handleCancelEdit}
              style={{ 
                borderRadius: 6,
                padding: '4px 24px',
                height: 40
              }}
            >
              取消
            </Button>
            <Button 
              type="primary" 
              size="large"
              icon={<SaveOutlined />} 
              onClick={handleSubmit}
              style={{ 
                borderRadius: 6,
                padding: '4px 24px',
                height: 40,
                background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                border: 'none',
                boxShadow: '0 2px 6px rgba(24,144,255,0.35)'
              }}
            >
              保存
            </Button>
          </Space>
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
