import { useState } from 'react'
import { Button, Form, Input, Select, Space, message, Card, InputNumber, Checkbox, Modal, Table } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, SettingOutlined, AppstoreOutlined } from '@ant-design/icons'
import { TimeSlot } from './Recommend/constants'

export default function PromotionSlotConfigAdd() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<string | null>(null)
  
  // 无敌星星算法参数状态
  const [presaleMode, setPresaleMode] = useState(true) // false: 固定, true: 滚动
  const [continuousPurchase, setContinuousPurchase] = useState(false) // false: 不支持, true: 支持
  const [merchantLimit, setMerchantLimit] = useState(false) // false: 不限制, true: 限制
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, setRegionLimit] = useState(true) // false: 不限制, true: 限制
  const [selectedRegionsForAlgorithm, setSelectedRegionsForAlgorithm] = useState<string[]>([])

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

  // 自定义美化 Switch
  const CustomSwitch = ({
    checked,
    onChange,
    leftText,
    rightText,
    leftColor = '#ff4d4f',
    rightColor = '#1890ff',
  }: {
    checked?: boolean
    onChange?: (checked: boolean) => void
    leftText: string
    rightText: string
    leftColor?: string
    rightColor?: string
  }) => {
    const isChecked = checked ?? false
    return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: 14,
          fontWeight: isChecked ? 400 : 600,
          color: isChecked ? '#8c8c8c' : '#1890ff',
          transition: 'all 0.3s ease',
          minWidth: 36,
          textAlign: 'right',
        }}
      >
        {leftText}
      </span>

      <div
        style={{
          position: 'relative',
          width: 72,
          height: 28,
          borderRadius: 999,
          background: isChecked ? rightColor : leftColor,
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.3s ease',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.12)',
        }}
        onClick={() => onChange && onChange(!isChecked)}
      >
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: 22,
            height: 22,
            background: '#ffffff',
            borderRadius: '50%',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
            transform: isChecked ? 'translateX(44px)' : 'translateX(0)',
            transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>

      <span
        style={{
          fontSize: 14,
          fontWeight: isChecked ? 600 : 400,
          color: isChecked ? '#1890ff' : '#8c8c8c',
          transition: 'all 0.3s ease',
          minWidth: 36,
          textAlign: 'left',
        }}
      >
        {rightText}
      </span>
    </div>
  )
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

  // 返回上一页
  const handleBack = () => {
    navigate('/promotion-slot-config')
  }

  // 保存
  const handleSave = async () => {
    try {
      // 先验证是否选择了推荐类型
      const algorithmType = form.getFieldValue('algorithmType')
      if (!algorithmType) {
        message.warning('請先填寫基礎信息內容')
        return
      }
      
      const values = await form.validateFields()
      console.log('表单数据:', values)
      message.success('保存成功')
      navigate('/promotion-slot-config')
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
            新增瀑布流配置
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

      {/* 基础信息区域 */}
      <Card 
        title={
          <Space>
            <AppstoreOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>基礎信息</span>
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
          {/* 第一行：所属品牌、业务频道、推荐类型、展示位置 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <Form.Item
              label="所屬品牌"
              name="app"
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select
                placeholder="請選擇所屬品牌"
                options={[
                  { label: '閃峰', value: 'shanfeng' },
                  { label: 'mFood', value: 'mfood' },
                ]}
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
                  { label: '大首頁瀑布流', value: 'home' },
                  { label: '外賣頻道瀑布流', value: 'delivery' },
                  { label: '團購頻道瀑布流', value: 'groupBuy' },
                  { label: '超市頻道瀑布流', value: 'supermarket' },
                ]}
              />
            </Form.Item>

            <Form.Item
              label="推薦類型"
              name="algorithmType"
              rules={[{ required: true, message: '請選擇推薦類型' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select
                placeholder="請選擇推薦類型"
                options={[
                  { label: '無敵星星', value: 'invincibleStar' },
                  { label: '猜你喜歡', value: 'youLike' },
                  { label: '新店廣告', value: 'newShopAd' },
                  { label: '盤活復蘇', value: 'activateAd' },
                  { label: '獨家商家', value: 'exclusiveShop' },
                ]}
                onChange={(value) => {
                  setSelectedAlgorithmType(value)
                }}
              />
            </Form.Item>

            <Form.Item
              label="展示位置"
              name="position"
              rules={[{ required: true, message: '請選擇展示位置' }]}
              style={{ flex: 1, marginBottom: 0 }}
              labelCol={{ span: 6 }}
              wrapperCol={{ span: 18 }}
            >
              <Select
                placeholder="請選擇展示位置"
                options={Array.from({ length: parseInt(localStorage.getItem('waterfall_max_slot_count') || '20') }, (_, i) => ({
                  label: `${i + 1}號位`,
                  value: i + 1,
                }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Card>

      {/* 算法参数区域 */}
      {selectedAlgorithmType === 'invincibleStar' ? (
        <Card 
          title={
            <Space>
              <SettingOutlined style={{ fontSize: 18, color: '#52c41a' }} />
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 0.5 }}>算法參數</span>
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
          bodyStyle={{
            padding: '24px'
          }}
        >
          <Form
            form={form}
            layout="horizontal"
            colon={false}
            initialValues={{
              presaleMode: 'rolling',
              continuousPurchase: 'notSupport',
              merchantLimit: 'unlimited',
              regionLimit: 'limited',
            }}
          >
            {/* 区域限制 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Form.Item
                label="区域限制"
                name="regionLimit"
                rules={[{ required: true, message: '請選擇区域限制' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
                valuePropName="checked"
                getValueFromEvent={(checked) => !checked ? 'limited' : 'unlimited'}
                getValueProps={(value) => ({ checked: value === 'unlimited' })}
              >
                <CustomSwitch
                  checked={regionLimit}
                  onChange={(checked) => {
                    setRegionLimit(!checked)
                    form.setFieldsValue({ regionLimit: !checked ? 'limited' : 'unlimited' })
                    if (checked) {
                      setSelectedRegionsForAlgorithm([])
                      form.setFieldsValue({ regions: [] })
                    }
                  }}
                  leftText="限制"
                  rightText="不限制"
                  leftColor="#ff4d4f"
                  rightColor="#52c41a"
                />
              </Form.Item>

              {regionLimit && (
                <Form.Item
                  label="限制区域"
                  name="regions"
                  rules={[{ required: regionLimit, message: '請選擇限制区域' }]}
                  style={{ flex: 1, marginBottom: 0 }}
                  labelCol={{ span: 4 }}
                  wrapperCol={{ span: 20 }}
                >
                  <Checkbox.Group 
                    value={selectedRegionsForAlgorithm}
                    onChange={(values) => {
                      setSelectedRegionsForAlgorithm(values as string[])
                      form.setFieldsValue({ regions: values })
                    }}
                  >
                    <Space size={16}>
                      <Checkbox value="macau">澳門</Checkbox>
                      <Checkbox value="taipa">氹仔</Checkbox>
                      <Checkbox value="zhuhai">珠海市</Checkbox>
                    </Space>
                  </Checkbox.Group>
                </Form.Item>
              )}

              {!regionLimit && <div style={{ flex: 1 }} />}
            </div>

            {/* 预售模式和预售周期并排 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Form.Item
                label="預售模式"
                name="presaleMode"
                rules={[{ required: true, message: '請選擇預售模式' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
                valuePropName="checked"
                getValueFromEvent={(checked) => checked ? 'rolling' : 'fixed'}
                getValueProps={(value) => ({ checked: value === 'rolling' })}
              >
                <CustomSwitch
                  checked={presaleMode}
                  onChange={(checked) => {
                    setPresaleMode(checked)
                    form.setFieldsValue({ presaleMode: checked ? 'rolling' : 'fixed' })
                  }}
                  leftText="固定"
                  rightText="滾動"
                  leftColor="#52c41a"
                  rightColor="#ff4d4f"
                />
              </Form.Item>

              <Form.Item
                label="預售周期"
                name="presaleCycle"
                rules={[{ required: true, message: '請輸入預售周期' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
              >
                <InputNumber 
                  min={1} 
                  max={365} 
                  placeholder="請輸入天數"
                  style={{ 
                    width: '100%',
                    height: 44,
                    borderRadius: 8,
                    fontSize: 14
                  }}
                  addonAfter={
                    <span style={{ 
                      color: '#595959',
                      fontWeight: 500,
                      fontSize: 13
                    }}>天</span>
                  }
                  size="large"
                />
              </Form.Item>
            </div>

            {/* 连续购买和购买上限并排 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Form.Item
                label="連續購買"
                name="continuousPurchase"
                rules={[{ required: true, message: '請選擇是否支持連續購買' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
                valuePropName="checked"
                getValueFromEvent={(checked) => !checked ? 'support' : 'notSupport'}
                getValueProps={(value) => ({ checked: value === 'notSupport' })}
              >
                <CustomSwitch
                  checked={!continuousPurchase}
                  onChange={(checked) => {
                    setContinuousPurchase(!checked)
                    form.setFieldsValue({ continuousPurchase: !checked ? 'support' : 'notSupport' })
                  }}
                  leftText="支持"
                  rightText="不支持"
                  leftColor="#52c41a"
                  rightColor="#ff4d4f"
                />
              </Form.Item>

              {/* 购买上限（仅在支持连续购买时显示） */}
              {continuousPurchase && (
                <Form.Item
                  label="購買上限"
                  style={{ flex: 1, marginBottom: 0 }}
                  labelCol={{ span: 4 }}
                  wrapperCol={{ span: 20 }}
                >
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ color: '#595959', fontWeight: 500, fontSize: 14 }}>近</span>
                    <Form.Item
                      name="purchaseLimitDays"
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: '請配置天數' }]}
                    >
                      <InputNumber 
                        min={1} 
                        max={365} 
                        placeholder="天數"
                        style={{ 
                          width: 100,
                          height: 36,
                          borderRadius: 6
                        }}
                        size="middle"
                      />
                    </Form.Item>
                    <span style={{ color: '#595959', fontWeight: 500, fontSize: 14 }}>天內，最多可購買</span>
                    <Form.Item
                      name="purchaseLimitCount"
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: '請配置數量' }]}
                    >
                      <InputNumber 
                        min={1} 
                        max={100} 
                        placeholder="數量"
                        style={{ 
                          width: 100,
                          height: 36,
                          borderRadius: 6
                        }}
                        size="middle"
                      />
                    </Form.Item>
                    <span style={{ color: '#595959', fontWeight: 500, fontSize: 14 }}>個時段，只統計</span>
                    <Form.Item
                      name="purchaseLimitTimeSlots"
                      style={{ marginBottom: 0, minWidth: 120 }}
                    >
                      <Select
                        mode="multiple"
                        placeholder="請選擇時段"
                        options={[
                          { label: '全部', value: 'all' },
                          { label: '早餐', value: TimeSlot.BREAKFAST },
                          { label: '午餐', value: TimeSlot.LUNCH },
                          { label: '下午茶', value: TimeSlot.AFTERNOON },
                          { label: '晚餐', value: TimeSlot.DINNER },
                          { label: '夜宵', value: TimeSlot.NIGHT_SNACK },
                        ]}
                        maxTagCount={5}
                        style={{ width: 100 }}
                      />
                    </Form.Item>
                  </div>
                </Form.Item>
              )}

              {/* 间隔天数（仅在不支持连续购买时显示） */}
              {!continuousPurchase && (
                <Form.Item
                  label="間隔天數"
                  name="purchaseInterval"
                  rules={[{ required: true, message: '請配置間隔天數' }]}
                  style={{ flex: 1, marginBottom: 0 }}
                  labelCol={{ span: 4 }}
                  wrapperCol={{ span: 20 }}
                >
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span style={{ color: '#595959', fontWeight: 500, fontSize: 14 }}>間隔</span>
                    <InputNumber 
                      min={1} 
                      max={365} 
                      placeholder="天數"
                      style={{ 
                        width: 100,
                        height: 36,
                        borderRadius: 6
                      }}
                      size="middle"
                    />
                    <span style={{ color: '#595959', fontWeight: 500, fontSize: 14 }}>天可購買</span>
                  </div>
                </Form.Item>
              )}
            </div>

            {/* 商家限制和选择商家并排 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Form.Item
                label="商家限制"
                name="merchantLimit"
                rules={[{ required: true, message: '請選擇商家限制' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
                valuePropName="checked"
                getValueFromEvent={(checked) => !checked ? 'limited' : 'unlimited'}
                getValueProps={(value) => ({ checked: value === 'unlimited' })}
              >
                <CustomSwitch
                  checked={merchantLimit}
                  onChange={(checked) => {
                    setMerchantLimit(!checked)
                    form.setFieldsValue({ merchantLimit: !checked ? 'limited' : 'unlimited' })
                    if (checked) {
                      setSelectedMerchants([])
                      form.setFieldsValue({ merchants: [] })
                    }
                  }}
                  leftText="限制"
                  rightText="不限制"
                  leftColor="#ff4d4f"
                  rightColor="#52c41a"
                />
              </Form.Item>

              {merchantLimit && (
                <Form.Item
                  label="限制商家"
                  name="merchants"
                  rules={[{ required: merchantLimit, message: '請選擇商家' }]}
                  style={{ flex: 1, marginBottom: 0 }}
                  labelCol={{ span: 4 }}
                  wrapperCol={{ span: 20 }}
                >
                  <Button 
                    onClick={() => setMerchantModalVisible(true)}
                    style={{ 
                      height: 36,
                      borderRadius: 6,
                      fontSize: 14,
                      width: '100%'
                    }}
                  >
                    {selectedMerchants.length > 0 
                      ? `已選擇 ${selectedMerchants.length} 個商家` 
                      : '點擊選擇商家'}
                  </Button>
                </Form.Item>
              )}

              {!merchantLimit && <div style={{ flex: 1 }} />}
            </div>

            {/* 开放时段 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <Form.Item
                label="開放時段"
                name="availableTimeSlots"
                rules={[{ required: true, message: '請選擇開放時段' }]}
                style={{ flex: 1, marginBottom: 0 }}
                labelCol={{ span: 4 }}
                wrapperCol={{ span: 20 }}
              >
                <Checkbox.Group>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 12px' }}>
                    <Checkbox 
                      value="allDay"
                      style={{ 
                        fontSize: 14,
                        padding: '6px 12px',
                        background: '#ffffff',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        transition: 'all 0.3s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>🕐 全時段</span>
                    </Checkbox>
                    <Checkbox 
                      value="breakfast"
                      style={{ 
                        fontSize: 14,
                        padding: '6px 12px',
                        background: '#ffffff',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        transition: 'all 0.3s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🌅 早餐 <span style={{ color: '#8c8c8c', fontSize: 12 }}>(06:00-09:00)</span>
                    </Checkbox>
                    <Checkbox 
                      value="lunch"
                      style={{ 
                        fontSize: 14,
                        padding: '6px 12px',
                        background: '#ffffff',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        transition: 'all 0.3s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ☀️ 午餐 <span style={{ color: '#8c8c8c', fontSize: 12 }}>(11:00-14:00)</span>
                    </Checkbox>
                    <Checkbox 
                      value="afternoon"
                      style={{ 
                        fontSize: 14,
                        padding: '6px 12px',
                        background: '#ffffff',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        transition: 'all 0.3s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🍵 下午茶 <span style={{ color: '#8c8c8c', fontSize: 12 }}>(14:00-17:00)</span>
                    </Checkbox>
                    <Checkbox 
                      value="dinner"
                      style={{ 
                        fontSize: 14,
                        padding: '6px 12px',
                        background: '#ffffff',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        transition: 'all 0.3s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🌆 晚餐 <span style={{ color: '#8c8c8c', fontSize: 12 }}>(17:00-20:00)</span>
                    </Checkbox>
                    <Checkbox 
                      value="nightSnack"
                      style={{ 
                        fontSize: 14,
                        padding: '6px 12px',
                        background: '#ffffff',
                        borderRadius: 6,
                        border: '1px solid #d9d9d9',
                        transition: 'all 0.3s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🌙 宵夜 <span style={{ color: '#8c8c8c', fontSize: 12 }}>(20:00-02:00)</span>
                    </Checkbox>
                  </div>
                </Checkbox.Group>
              </Form.Item>

              {/* 占位元素，保持左侧字段宽度一致 */}
              <div style={{ flex: 1 }} />
            </div>
          </Form>
        </Card>
      ) : selectedAlgorithmType ? (
        /* 其它算法类型：显示暂无参数配置提示 */
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
              當前算法類型暫未開放參數配置，請聯繫管理員
            </div>
          </div>
        </Card>
      ) : (
        /* 未选择推荐类型：显示提示 */
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
              請先填寫基礎信息內容
            </div>
            <div style={{ fontSize: 14 }}>
              填寫基礎信息後，將顯示對應的參數配置項
            </div>
          </div>
        </Card>
      )}

      {/* 底部操作按钮 */}
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
            onClick={handleBack}
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
            onClick={handleSave}
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

      {/* 商家选择弹窗 */}
      <Modal
        title="選擇商家"
        open={merchantModalVisible}
        onOk={handleConfirmMerchants}
        onCancel={handleCloseMerchantModal}
        width={800}
        okText="確認"
        cancelText="取消"
      >
        <Table
          rowKey="id"
          columns={merchantColumns}
          dataSource={mockMerchants}
          rowSelection={{
            selectedRowKeys: selectedMerchants,
            onChange: (selectedRowKeys) => {
              setSelectedMerchants(selectedRowKeys as string[])
            },
          }}
          pagination={false}
          size="middle"
        />
      </Modal>
    </div>
  )
}
