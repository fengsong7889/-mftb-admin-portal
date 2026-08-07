import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Radio, Checkbox, DatePicker, Table, message, Divider } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { BRAND_SHANFENG_LABEL, BRAND_MFOOD_LABEL } from '../../constants/brand'

const { RangePicker } = DatePicker

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
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [terminalType, setTerminalType] = useState<string>('specified')
  const [jumpType, setJumpType] = useState<string>('none')
  const [crowdType, setCrowdType] = useState<string>('specified')
  const [hintSource, setHintSource] = useState<string>('operation')
  const [allTimeSelected, setAllTimeSelected] = useState(false)
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<string[]>([])
  const [allRegionSelected, setAllRegionSelected] = useState(false)
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])

  /** 搜索频道 */
  const searchChannelOptions = [
    { label: t('dict.channel.home'), value: 'home' },
    { label: t('dict.channel.takeawayChannel'), value: 'takeaway' },
    { label: t('dict.channel.groupBuyChannel'), value: 'groupBuy' },
    { label: t('dict.channel.supermarketChannel'), value: 'supermarket' },
  ]

  /** 所属品牌 */
  const brandOptions = [
    { label: BRAND_MFOOD_LABEL, value: 'mFood' },
    { label: BRAND_SHANFENG_LABEL, value: 'flashBee' },
    { label: t('hintCreate.brandOther'), value: 'other' },
  ]

  /** 展示终端 */
  const terminalOptions = [
    { label: t('dict.terminal.app'), value: 'app' },
    { label: t('dict.terminal.wechatMini'), value: 'wechatMini' },
    { label: t('dict.terminal.wechatH5'), value: 'wechatH5' },
    { label: t('dict.terminal.alipayH5'), value: 'alipayH5' },
    { label: t('dict.terminal.mpayMini'), value: 'mpayMini' },
  ]

  /** 底纹词源 */
  const hintSourceOptions = [
    { label: t('dict.hintSource.operation'), value: 'operation' },
    { label: t('dict.hintSource.hotSearch'), value: 'hotSearch' },
  ]

  /** 跳转类型 */
  const jumpTypeOptions = [
    { label: t('dict.jumpType.none'), value: 'none' },
    { label: t('dict.jumpType.h5'), value: 'h5' },
    { label: t('dict.jumpType.checkInCenter'), value: 'checkInCenter' },
    { label: t('dict.jumpType.personalCenter'), value: 'personalCenter' },
    { label: t('dict.jumpType.couponCenter'), value: 'couponCenter' },
    { label: t('dict.channel.takeawayChannel'), value: 'takeawayChannel' },
  ]

  /** 生效时段 */
  const timeSlotOptions = [
    { label: t('dict.timeSlot.breakfast'), value: 'breakfast' },
    { label: t('dict.timeSlot.lunch'), value: 'lunch' },
    { label: t('dict.timeSlot.afternoonTea'), value: 'afternoonTea' },
    { label: t('dict.timeSlot.dinner'), value: 'dinner' },
    { label: t('dict.timeSlot.midnightSnack'), value: 'midnightSnack' },
  ]

  /** 展示区域 */
  const regionOptions = [
    { label: t('dict.region.macauPeninsula'), value: 'macau' },
    { label: t('dict.region.taipaPeninsula'), value: 'taipa' },
    { label: t('dict.region.zhuhai'), value: 'zhuhai' },
    { label: t('dict.region.hengqin'), value: 'hengqin' },
  ]

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
      message.success(t('hintCreate.submitSuccess'))
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

  const handleAllTimeChange = (e: { target: { checked: boolean } }) => {
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

  const handleAllRegionChange = (e: { target: { checked: boolean } }) => {
    const checked = e.target.checked
    setAllRegionSelected(checked)
    if (checked) {
      setSelectedRegions([])
      form.setFieldValue('regions', [])
    }
  }

  const crowdColumns = [
    {
      title: t('hintCreate.crowdColName'),
      dataIndex: 'crowdName',
      key: 'crowdName',
    },
    {
      title: t('hintCreate.crowdColCount'),
      dataIndex: 'crowdCount',
      key: 'crowdCount',
    },
    {
      title: t('common.colAction'),
      key: 'action',
      render: () => (
        <div>
          <button type="button" style={{ color: '#1890ff', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px' }}>
            {t('hintCreate.crowdEdit')}
          </button>
          <button type="button" style={{ color: '#ff4d4f', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px' }}>
            {t('common.delete')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <Modal
      title={
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1890ff' }}>
          {t('hintCreate.title')}
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
            {t('common.cancel')}
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
            {t('common.confirm')}
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
            {t('hintCreate.sectionBase')}
          </h3>

          {/* 搜索频道 */}
          <Form.Item
            label={t('hintCreate.searchChannelLabel')}
            name="searchChannel"
            rules={[{ required: true, message: t('hintCreate.searchChannelRequired') }]}
          >
            <Select options={searchChannelOptions} placeholder={t('common.placeholderSelect')} />
          </Form.Item>

          {/* 所属品牌 */}
          <Form.Item
            label={t('hintCreate.brandLabel')}
            name="brand"
            rules={[{ required: true, message: t('hintCreate.brandRequired') }]}
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
            label={t('hintCreate.terminalLabel')}
            name="terminalType"
            rules={[{ required: true, message: t('hintCreate.terminalRequired') }]}
          >
            <div>
              <Radio.Group
                value={terminalType}
                onChange={(e) => setTerminalType(e.target.value)}
                style={{ marginBottom: 12 }}
              >
                <Radio value="all">{t('common.all')}</Radio>
                <Radio value="specified">{t('hintCreate.specified')}</Radio>
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
            {t('hintCreate.sectionContent')}
          </h3>

          {/* 底纹词源 */}
          <Form.Item
            label={t('hintCreate.hintSourceLabel')}
            name="hintSource"
            rules={[{ required: true, message: t('hintCreate.hintSourceRequired') }]}
          >
            <Select
              options={hintSourceOptions}
              placeholder={t('common.placeholderSelect')}
              onChange={(v) => setHintSource(v)}
            />
          </Form.Item>

          {/* 底纹内容 */}
          {hintSource === 'operation' && (
            <Form.Item
              label={t('hintCreate.hintWordLabel')}
              name="hintWord"
              rules={[{ required: true, message: t('hintCreate.hintWordRequired') }]}
            >
              <Input
                placeholder={t('hintCreate.hintWordRequired')}
                maxLength={10}
                showCount
                style={{ borderRadius: 6 }}
              />
            </Form.Item>
          )}

          {/* 指定搜索 */}
          {hintSource === 'operation' && (
            <Form.Item label={t('hintCreate.specifiedSearchLabel')} required>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Form.Item
                  name="jumpType"
                  noStyle
                  rules={[{ required: true, message: t('common.placeholderSelect') }]}
                >
                  <Select
                    options={jumpTypeOptions}
                    placeholder={t('common.placeholderSelect')}
                    style={{ width: 180 }}
                    onChange={(v) => setJumpType(v)}
                  />
                </Form.Item>
                {jumpType === 'h5' && (
                  <Form.Item
                    name="jumpTarget"
                    noStyle
                    rules={[{ required: jumpType === 'h5', message: t('hintCreate.h5LinkRequired') }]}
                  >
                    <Input
                      placeholder={t('hintCreate.h5LinkRequired')}
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
            {t('hintCreate.sectionEffect')}
          </h3>

          {/* 生效时间 */}
          <Form.Item
            label={t('hintCreate.effectTimeLabel')}
            name="dateRange"
            rules={[{ required: true, message: t('hintCreate.effectTimeRequired') }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              placeholder={[t('common.startTime'), t('common.endTime')]}
            />
          </Form.Item>

          {/* 生效时段 */}
          <Form.Item
            label={t('hintCreate.effectTimeSlotLabel')}
            name="timeSlots"
            rules={[{ required: !allTimeSelected && selectedTimeSlots.length === 0, message: t('hintCreate.effectTimeSlotRequired') }]}
          >
            <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={allTimeSelected}
                  onChange={handleAllTimeChange}
                  style={{ fontWeight: 600, fontSize: 14 }}
                >
                  {t('dict.timeSlot.allDay')}
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
          <Form.Item label={t('hintCreate.crowdLabel')} required>
            <div>
              <Radio.Group
                value={crowdType}
                onChange={(e) => setCrowdType(e.target.value)}
                style={{ marginBottom: 12 }}
              >
                <Radio value="all">{t('common.all')}</Radio>
                <Radio value="specified">{t('hintCreate.specified')}</Radio>
              </Radio.Group>
              {crowdType === 'specified' && (
                <div style={{ marginTop: 12, padding: '16px', background: '#f5f5f5', borderRadius: 6 }}>
                  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#1890ff' }}>{t('hintCreate.crowdSelectTitle')}</span>
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
                      {t('hintCreate.addCrowd')}
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
            {t('hintCreate.sectionDisplay')}
          </h3>

          {/* 展示区域 */}
          <Form.Item
            label={t('hintCreate.regionLabel')}
            name="regions"
            rules={[{ required: !allRegionSelected && selectedRegions.length === 0, message: t('hintCreate.regionRequired') }]}
          >
            <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 6 }}>
              <div style={{ marginBottom: 12 }}>
                <Checkbox
                  checked={allRegionSelected}
                  onChange={handleAllRegionChange}
                  style={{ fontWeight: 600, fontSize: 14 }}
                >
                  {t('common.all')}
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
