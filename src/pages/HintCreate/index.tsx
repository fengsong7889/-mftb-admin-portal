import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Radio, Checkbox, DatePicker, Table, message, Divider } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

const { RangePicker } = DatePicker

/** 搜索频道 */
const searchChannelOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
]

/** 所属品牌 */
const brandOptions = [
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
  { label: '其它', value: 'other' },
]

/** 展示终端 */
const terminalOptions = [
  { label: 'APP', value: 'app' },
  { label: '微信小程序', value: 'wechatMini' },
  { label: '微信H5', value: 'wechatH5' },
  { label: '支付寶H5', value: 'alipayH5' },
  { label: 'mPay小應用', value: 'mpayMini' },
]

/** 底纹词源 */
const hintSourceOptions = [
  { label: '運營推廣', value: 'operation' },
  { label: '熱搜推廣', value: 'hotSearch' },
]

/** 跳转类型 */
const jumpTypeOptions = [
  { label: '無跳轉', value: 'none' },
  { label: 'H5鏈接', value: 'h5' },
  { label: '簽到中心', value: 'checkInCenter' },
  { label: '個人中心', value: 'personalCenter' },
  { label: '領券中心', value: 'couponCenter' },
  { label: '外賣頻道', value: 'takeawayChannel' },
]

/** 生效时段 */
const timeSlotOptions = [
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]

/** 展示区域 */
const regionOptions = [
  { label: '澳門半島', value: 'macau' },
  { label: '氹仔路半島', value: 'taipa' },
  { label: '珠海市', value: 'zhuhai' },
  { label: '橫琴粵深度合作區', value: 'hengqin' },
]

/** 人群数据 */
interface CrowdRecord {
  key: string
  crowdName: string
  crowdCount: number
}

const mockCrowdData: CrowdRecord[] = [
  { key: '1', crowdName: '麥當勞忠愛粉', crowdCount: 18921 },
  { key: '2', crowdName: '螺螄粉忠愛粉', crowdCount: 28912 },
]

interface HintCreateModalProps {
  open: boolean
  onCancel: () => void
  onSuccess?: () => void
}

export default function HintCreateModal({ open, onCancel, onSuccess }: HintCreateModalProps) {
  const [form] = Form.useForm()
  const [terminalType, setTerminalType] = useState<string>('specified')
  const [jumpType, setJumpType] = useState<string>('none')
  const [crowdType, setCrowdType] = useState<string>('specified')
  const [hintSource, setHintSource] = useState<string>('operation')
  const [allTimeSelected, setAllTimeSelected] = useState(false)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([])
  const [allRegionSelected, setAllRegionSelected] = useState(false)
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])

  // 重置表单
  useEffect(() => {
    if (open) {
      form.resetFields()
      setTerminalType('specified')
      setJumpType('none')
      setCrowdType('specified')
      setHintSource('operation')
      setAllTimeSelected(false)
      setSelectedTimeSlots([])
      setAllRegionSelected(false)
      setSelectedRegions([])
    }
  }, [open, form])

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      console.log('表单数据:', values)
      message.success('新增底紋詞成功')
      onSuccess?.()
      onCancel()
    })
  }

  // 处理时段选择
  const handleTimeSlotChange = (checkedValues: string[]) => {
    if (checkedValues.length === timeSlotOptions.length) {
      setAllTimeSelected(true)
      setSelectedTimeSlots([])
      form.setFieldValue('timeSlots', [])
    } else {
      setAllTimeSelected(false)
      setSelectedTimeSlots(checkedValues)
    }
  }

  const handleAllTimeChange = (e: any) => {
    const checked = e.target.checked
    setAllTimeSelected(checked)
    if (checked) {
      setSelectedTimeSlots([])
      form.setFieldValue('timeSlots', [])
    }
  }

  // 处理区域选择
  const handleRegionChange = (checkedValues: string[]) => {
    if (checkedValues.length === regionOptions.length) {
      setAllRegionSelected(true)
      setSelectedRegions([])
      form.setFieldValue('regions', [])
    } else {
      setAllRegionSelected(false)
      setSelectedRegions(checkedValues)
    }
  }

  const handleAllRegionChange = (e: any) => {
    const checked = e.target.checked
    setAllRegionSelected(checked)
    if (checked) {
      setSelectedRegions([])
      form.setFieldValue('regions', [])
    }
  }

  const crowdColumns = [
    {
      title: '群名稱',
      dataIndex: 'crowdName',
      key: 'crowdName',
    },
    {
      title: '群人數',
      dataIndex: 'crowdCount',
      key: 'crowdCount',
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <div>
          <button type="button" style={{ color: '#1890ff', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px' }}>
            修改
          </button>
          <button type="button" style={{ color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px' }}>
            刪除
          </button>
        </div>
      ),
    },
  ]

  return (
    <Modal
      title={
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1890ff' }}>
          新增底紋詞
        </div>
      }
      open={open}
      onCancel={onCancel}
      width={800}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '12px 0' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 24px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '8px 24px',
              border: 'none',
              borderRadius: 6,
              background: '#1890ff',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            確認
          </button>
        </div>
      }
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          searchChannel: 'home',
          brand: 'mFood',
          terminalType: 'specified',
          jumpType: 'none',
          crowdType: 'specified',
          hintSource: 'operation',
        }}
        style={{ marginTop: 16 }}
      >
        {/* 基础配置区域 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#1890ff',
            marginBottom: 16,
            borderBottom: '2px solid #1890ff',
            paddingBottom: 8,
          }}>
            基础配置
          </h3>

          {/* 搜索频道 */}
          <Form.Item
            label="搜索頻道"
            name="searchChannel"
            rules={[{ required: true, message: '請選擇搜索頻道' }]}
          >
            <Select options={searchChannelOptions} placeholder="請選擇" />
          </Form.Item>

          {/* 所属品牌 */}
          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Radio.Group>
              {brandOptions.map((option) => (
                <Radio key={option.value} value={option.value}>
                  {option.label}
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>

          {/* 展示终端 */}
          <Form.Item
            label="展示終端"
            name="terminalType"
            rules={[{ required: true, message: '請選擇展示終端' }]}
          >
            <div>
              <Radio.Group
                value={terminalType}
                onChange={(e) => setTerminalType(e.target.value)}
                style={{ marginBottom: 12 }}
              >
                <Radio value="all">全部</Radio>
                <Radio value="specified">指定</Radio>
              </Radio.Group>
              {terminalType === 'specified' && (
                <Form.Item name="terminals" noStyle>
                  <Checkbox.Group
                    options={terminalOptions}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      padding: '12px',
                      background: '#f5f5f5',
                      borderRadius: 6,
                    }}
                  />
                </Form.Item>
              )}
            </div>
          </Form.Item>
        </div>

        <Divider />

        {/* 底纹内容区域 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#1890ff',
            marginBottom: 16,
            borderBottom: '2px solid #1890ff',
            paddingBottom: 8,
          }}>
            底纹内容
          </h3>

          {/* 底纹词源 */}
          <Form.Item
            label="底紋詞源"
            name="hintSource"
            rules={[{ required: true, message: '請選擇底紋詞源' }]}
          >
            <Select
              options={hintSourceOptions}
              placeholder="請選擇"
              onChange={(v) => setHintSource(v)}
            />
          </Form.Item>

          {/* 底纹内容 */}
          {hintSource === 'operation' && (
            <Form.Item
              label="底紋內容"
              name="hintWord"
              rules={[{ required: true, message: '請輸入底紋詞，限制10個字！' }]}
            >
              <Input
                placeholder="請輸入底紋詞，限制10個字！"
                maxLength={10}
                showCount
                style={{ borderRadius: 6 }}
              />
            </Form.Item>
          )}

          {/* 指定搜索 */}
          {hintSource === 'operation' && (
            <Form.Item label="指定搜索" required>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Form.Item
                  name="jumpType"
                  noStyle
                  rules={[{ required: true, message: '請選擇' }]}
                >
                  <Select
                    options={jumpTypeOptions}
                    placeholder="請選擇"
                    style={{ width: 180 }}
                    onChange={(v) => setJumpType(v)}
                  />
                </Form.Item>
                {jumpType === 'h5' && (
                  <Form.Item
                    name="jumpTarget"
                    noStyle
                    rules={[{ required: jumpType === 'h5', message: '請輸入H5鏈接地址' }]}
                  >
                    <Input
                      placeholder="請輸入H5鏈接地址"
                      style={{ flex: 1, borderRadius: 6 }}
                    />
                  </Form.Item>
                )}
              </div>
            </Form.Item>
          )}
        </div>

        <Divider />

        {/* 生效配置区域 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#1890ff',
            marginBottom: 16,
            borderBottom: '2px solid #1890ff',
            paddingBottom: 8,
          }}>
            生效配置
          </h3>

          {/* 生效时间 */}
          <Form.Item
            label="生效時間"
            name="dateRange"
            rules={[{ required: true, message: '請選擇生效時間' }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              placeholder={['開始日期', '結束日期']}
            />
          </Form.Item>

          {/* 生效时段 */}
          <Form.Item
            label="生效時段"
            name="timeSlots"
            rules={[{ required: !allTimeSelected && selectedTimeSlots.length === 0, message: '請選擇生效時段' }]}
          >
            <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={allTimeSelected}
                  onChange={handleAllTimeChange}
                  style={{ fontWeight: 600, fontSize: 14 }}
                >
                  全時段
                </Checkbox>
              </div>
              <Checkbox.Group
                value={selectedTimeSlots}
                onChange={handleTimeSlotChange}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                }}
              >
                {timeSlotOptions.map((option) => (
                  <Checkbox key={option.value} value={option.value} disabled={allTimeSelected}>
                    {option.label}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          </Form.Item>

          {/* 指定人群 */}
          <Form.Item label="指定人群" required>
            <div>
              <Radio.Group
                value={crowdType}
                onChange={(e) => setCrowdType(e.target.value)}
                style={{ marginBottom: 12 }}
              >
                <Radio value="all">全部</Radio>
                <Radio value="specified">指定</Radio>
              </Radio.Group>
              {crowdType === 'specified' && (
                <div style={{ marginTop: 12, padding: '16px', background: '#f5f5f5', borderRadius: 6 }}>
                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#1890ff' }}>人群選擇</span>
                    <button
                      type="button"
                      style={{
                        padding: '4px 12px',
                        background: '#1890ff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <PlusOutlined />
                      新增人群
                    </button>
                  </div>
                  <Table
                    columns={crowdColumns}
                    dataSource={mockCrowdData}
                    pagination={false}
                    size="small"
                    bordered
                    style={{ background: '#fff' }}
                  />
                </div>
              )}
            </div>
          </Form.Item>
        </div>

        <Divider />

        {/* 展示配置区域 */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#1890ff',
            marginBottom: 16,
            borderBottom: '2px solid #1890ff',
            paddingBottom: 8,
          }}>
            展示配置
          </h3>

          {/* 展示区域 */}
          <Form.Item
            label="展示區域"
            name="regions"
            rules={[{ required: !allRegionSelected && selectedRegions.length === 0, message: '請選擇展示區域' }]}
          >
            <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={allRegionSelected}
                  onChange={handleAllRegionChange}
                  style={{ fontWeight: 600, fontSize: 14 }}
                >
                  全部
                </Checkbox>
              </div>
              <Checkbox.Group
                value={selectedRegions}
                onChange={handleRegionChange}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                }}
              >
                {regionOptions.map((option) => (
                  <Checkbox key={option.value} value={option.value} disabled={allRegionSelected}>
                    {option.label}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          </Form.Item>
        </div>
      </Form>
    </Modal>
  )
}
