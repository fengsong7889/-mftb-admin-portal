import { useState, useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, InputNumber, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { TextArea } = Input

// 模擬用戶權限（實際接入後替換為真實權限系統）
const userPermissions = {
  canBoost: true,   // 是否有加分權限
  canDemote: true,  // 是否有減分權限
}

/** 所屬品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 搜索頻道 */
const searchChannelOptions = [
  { label: '全部', value: 'all' },
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
]

/** 干預方向 */
const interventionDirectionOptions = [
  { label: '全部', value: 'all' },
  { label: '加分', value: 'boost' },
  { label: '減分', value: 'demote' },
]

/** 調整方式（查詢用，含全部） */
const adjustMethodQueryOptions = [
  { label: '分數打折', value: 'discount' },
  { label: '固定扣分', value: 'deduction' },
  { label: '固定加分', value: 'fixedBoost' },
  { label: '分數加成', value: 'percentBoost' },
]

/** 狀態 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '失效', value: 'inactive' },
]

/** 加分规则类型 */
type BoostRuleType = 'amount_match' | 'fixed_boost'

/** 减分规则类型 */
type DemoteRuleType = 'fixed_deduction' | 'percent_deduction'

/** 加分梯队配置 */
interface BoostTier {
  minAmount: number  // 消费金额下限
  maxAmount?: number // 消费金额上限（可选，为空表示无上限）
  boostType: BoostRuleType
  boostValue: number // 加分值（amount_match时为倍数，fixed_boost时为固定分数）
}

/** 减分梯队配置 */
interface DemoteTier {
  days: number         // 未购买广告天数
  deductionType: DemoteRuleType
  deductionValue: number // 扣分值（fixed_deduction时为固定分数，percent_deduction时为折扣比例）
}

interface InterventionRecord {
  key: string
  interventionId: string
  groupId: string
  groupName: string
  brand: string
  searchChannel: string[]
  interventionDirection: 'boost' | 'demote'
  // 旧版单规则字段（保留兼容）
  adjustMethod?: string
  adjustValue?: number
  // 新版梯队规则字段
  boostTiers?: BoostTier[]
  demoteTiers?: DemoteTier[]
  reason: string
  effectStartDate: string
  effectEndDate: string
  status: string
  operator: string
  operateTime: string
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const channelMap: Record<string, string> = { home: '大首頁', takeaway: '外賣頻道', groupBuy: '團購頻道', supermarket: '超市頻道' }
const adjustMethodMap: Record<string, string> = { discount: '分數打折', deduction: '固定扣分', fixedBoost: '固定加分', percentBoost: '分數加成' }
const adjustMethodColorMap: Record<string, string> = { discount: 'orange', deduction: 'red', fixedBoost: 'green', percentBoost: 'blue' }

/** 格式化調整數值顯示 */
const formatAdjustValue = (method: string, value: number): string => {
  switch (method) {
    case 'discount':
      return `${value / 10}折`
    case 'deduction':
      return `-${value}分`
    case 'fixedBoost':
      return `+${value}分`
    case 'percentBoost':
      return `${value}%`
    default:
      return String(value)
  }
}

/** 格式化加分梯队显示 */
const formatBoostTiers = (tiers: BoostTier[]): string => {
  return tiers.map((tier, idx) => {
    const amountRange = tier.maxAmount
      ? `消費${tier.minAmount}-${tier.maxAmount}元`
      : `消費≥${tier.minAmount}元`
    const boostDesc = tier.boostType === 'amount_match'
      ? '按消費金額加分'
      : `+${tier.boostValue}分`
    return `${idx + 1}. ${amountRange} → ${boostDesc}`
  }).join('\n')
}

/** 格式化减分梯队显示 */
const formatDemoteTiers = (tiers: DemoteTier[]): string => {
  return tiers.map((tier, idx) => {
    const deductionDesc = tier.deductionType === 'fixed_deduction'
      ? `扣${tier.deductionValue}分`
      : `扣${tier.deductionValue}%`
    return `${idx + 1}. ${tier.days}天未購買 → ${deductionDesc}`
  }).join('\n')
}

/** 根據干預方向篩選調整方式選項 */
const getMethodOptionsByDirection = (direction: 'boost' | 'demote') => {
  if (direction === 'boost') {
    return [
      { label: '固定加分', value: 'fixedBoost' },
      { label: '分數加成', value: 'percentBoost' },
    ]
  }
  return [
    { label: '分數打折', value: 'discount' },
    { label: '固定扣分', value: 'deduction' },
  ]
}

/** 獲取調整數值輸入配置 */
const getAdjustValueConfig = (method: string) => {
  switch (method) {
    case 'discount':
      return { placeholder: '請輸入折扣，如80代表8折', addonAfter: '%' }
    case 'deduction':
      return { placeholder: '請輸入扣減分數', addonAfter: '分' }
    case 'fixedBoost':
      return { placeholder: '請輸入加分分數', addonAfter: '分' }
    case 'percentBoost':
      return { placeholder: '請輸入加成百分比，如120代表加20%', addonAfter: '%' }
    default:
      return { placeholder: '請輸入數值', addonAfter: '' }
  }
}

const mockData: InterventionRecord[] = [
  // 3 條 discount（demote 方向）
  {
    key: '1',
    interventionId: 'GY20260601',
    groupId: 'M10001',
    groupName: '麥當勞集團',
    brand: 'mFood',
    searchChannel: ['takeaway', 'home'],
    interventionDirection: 'demote',
    adjustMethod: 'discount',
    adjustValue: 80,
    reason: '品牌熱度過高，長期不購買廣告推廣',
    effectStartDate: '2026-06-01',
    effectEndDate: '2026-12-31',
    status: 'active',
    operator: '古月(001)',
    operateTime: '2026-06-01 10:30:00',
  },
  {
    key: '2',
    interventionId: 'GY20260602',
    groupId: 'M10005',
    groupName: '必勝客集團',
    brand: 'flashBee',
    searchChannel: ['takeaway', 'groupBuy'],
    interventionDirection: 'demote',
    adjustMethod: 'discount',
    adjustValue: 75,
    reason: '學區熱門品牌，搜索權重過高',
    effectStartDate: '2026-04-01',
    effectEndDate: '2026-06-01',
    status: 'inactive',
    operator: '加侖(002)',
    operateTime: '2026-04-01 16:00:00',
  },
  {
    key: '3',
    interventionId: 'GY20260603',
    groupId: 'M10010',
    groupName: '奈雪的茶集團',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    interventionDirection: 'demote',
    adjustMethod: 'discount',
    adjustValue: 85,
    reason: '品牌熱度持續高漲，壓制其他商家曝光',
    effectStartDate: '2026-06-25',
    effectEndDate: '2026-12-25',
    status: 'active',
    operator: '古月(001)',
    operateTime: '2026-06-25 09:45:00',
  },
  // 3 條 deduction（demote 方向）
  {
    key: '4',
    interventionId: 'GY20260604',
    groupId: 'M10002',
    groupName: '星巴克集團',
    brand: 'mFood',
    searchChannel: ['home', 'groupBuy'],
    interventionDirection: 'demote',
    adjustMethod: 'deduction',
    adjustValue: 20,
    reason: '品牌知名度過高佔據搜索首位，未參與任何平台活動',
    effectStartDate: '2026-06-01',
    effectEndDate: '2026-09-30',
    status: 'active',
    operator: '加侖(002)',
    operateTime: '2026-06-01 11:00:00',
  },
  {
    key: '5',
    interventionId: 'GY20260605',
    groupId: 'M10004',
    groupName: '肯德基集團',
    brand: 'flashBee',
    searchChannel: ['takeaway', 'supermarket'],
    interventionDirection: 'demote',
    adjustMethod: 'deduction',
    adjustValue: 15,
    reason: '近3個月未續費廣告，且多次拒絕活動邀請',
    effectStartDate: '2026-05-20',
    effectEndDate: '2026-08-20',
    status: 'active',
    operator: '古月(001)',
    operateTime: '2026-05-20 14:30:00',
  },
  {
    key: '6',
    interventionId: 'GY20260606',
    groupId: 'M10009',
    groupName: '喜茶集團',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway'],
    interventionDirection: 'demote',
    adjustMethod: 'deduction',
    adjustValue: 25,
    reason: '奶茶類目搜索排名第一，未參加平台促銷',
    effectStartDate: '2026-06-20',
    effectEndDate: '2026-12-20',
    status: 'active',
    operator: '浩源(003)',
    operateTime: '2026-06-20 11:30:00',
  },
  // 3 條 fixedBoost（boost 方向）
  {
    key: '7',
    interventionId: 'GY20260607',
    groupId: 'M10011',
    groupName: '大家樂集團',
    brand: 'flashBee',
    searchChannel: ['home', 'takeaway'],
    interventionDirection: 'boost',
    adjustMethod: 'fixedBoost',
    adjustValue: 15,
    reason: '新簽約付費推廣商家，需提升搜索曝光',
    effectStartDate: '2026-06-01',
    effectEndDate: '2026-12-31',
    status: 'active',
    operator: '浩源(003)',
    operateTime: '2026-06-01 09:00:00',
  },
  {
    key: '8',
    interventionId: 'GY20260608',
    groupId: 'M10012',
    groupName: '吉野家集團',
    brand: 'mFood',
    searchChannel: ['takeaway', 'groupBuy'],
    interventionDirection: 'boost',
    adjustMethod: 'fixedBoost',
    adjustValue: 10,
    reason: '參與平台大促活動，臨時提升搜索排名',
    effectStartDate: '2026-06-15',
    effectEndDate: '2026-09-15',
    status: 'active',
    operator: '加侖(002)',
    operateTime: '2026-06-15 14:00:00',
  },
  {
    key: '9',
    interventionId: 'GY20260609',
    groupId: 'M10013',
    groupName: '美心集團',
    brand: 'flashBee',
    searchChannel: ['supermarket'],
    interventionDirection: 'boost',
    adjustMethod: 'fixedBoost',
    adjustValue: 20,
    reason: '超市頻道重點扶持商家，需增加搜索可見度',
    effectStartDate: '2026-05-01',
    effectEndDate: '2026-07-31',
    status: 'inactive',
    operator: '古月(001)',
    operateTime: '2026-05-01 10:00:00',
  },
  // 3 條 percentBoost（boost 方向）
  {
    key: '10',
    interventionId: 'GY20260610',
    groupId: 'M10014',
    groupName: '翠華餐廳集團',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway'],
    interventionDirection: 'boost',
    adjustMethod: 'percentBoost',
    adjustValue: 120,
    reason: '高級付費商家，享有搜索加成權益',
    effectStartDate: '2026-06-01',
    effectEndDate: '2026-12-31',
    status: 'active',
    operator: '浩源(003)',
    operateTime: '2026-06-01 08:30:00',
  },
  {
    key: '11',
    interventionId: 'GY20260611',
    groupId: 'M10015',
    groupName: '壽司郎集團',
    brand: 'flashBee',
    searchChannel: ['takeaway', 'groupBuy'],
    interventionDirection: 'boost',
    adjustMethod: 'percentBoost',
    adjustValue: 110,
    reason: '新入駐優質商家，享受首月搜索加成',
    effectStartDate: '2026-06-10',
    effectEndDate: '2026-07-10',
    status: 'active',
    operator: '加侖(002)',
    operateTime: '2026-06-10 15:30:00',
  },
  {
    key: '12',
    interventionId: 'GY20260612',
    groupId: 'M10016',
    groupName: '薩莉亞集團',
    brand: 'mFood',
    searchChannel: ['home', 'supermarket'],
    interventionDirection: 'boost',
    adjustMethod: 'percentBoost',
    adjustValue: 130,
    reason: '品牌戰略合作夥伴，全頻道搜索加成',
    effectStartDate: '2026-04-15',
    effectEndDate: '2026-10-15',
    status: 'active',
    operator: '古月(001)',
    operateTime: '2026-04-15 11:00:00',
  },
  // 新增梯队配置示例 - 加分规则
  {
    key: '13',
    interventionId: 'GY20260613',
    groupId: 'M10017',
    groupName: '淘大集團',
    brand: 'mFood',
    searchChannel: ['takeaway', 'home'],
    interventionDirection: 'boost',
    boostTiers: [
      { minAmount: 0, maxAmount: 5000, boostType: 'amount_match', boostValue: 1 },
      { minAmount: 5000, maxAmount: 10000, boostType: 'fixed_boost', boostValue: 50 },
      { minAmount: 10000, boostType: 'fixed_boost', boostValue: 100 },
    ],
    reason: '購買廣告階梯式加分，消費越多加分越多',
    effectStartDate: '2026-07-01',
    effectEndDate: '2026-12-31',
    status: 'active',
    operator: '古月(001)',
    operateTime: '2026-07-01 10:00:00',
  },
  // 新增梯队配置示例 - 减分规则
  {
    key: '14',
    interventionId: 'GY20260614',
    groupId: 'M10018',
    groupName: '大快活集團',
    brand: 'flashBee',
    searchChannel: ['takeaway', 'groupBuy'],
    interventionDirection: 'demote',
    demoteTiers: [
      { days: 30, deductionType: 'fixed_deduction', deductionValue: 10 },
      { days: 60, deductionType: 'fixed_deduction', deductionValue: 20 },
      { days: 90, deductionType: 'percent_deduction', deductionValue: 20 },
    ],
    reason: '未購買廣告階梯式扣分，時間越長扣分越多',
    effectStartDate: '2026-07-01',
    effectEndDate: '2026-12-31',
    status: 'active',
    operator: '加侖(002)',
    operateTime: '2026-07-01 11:00:00',
  },
]

export default function SearchWeightConfig() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<InterventionRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<InterventionRecord | null>(null)
  const [modalDirection, setModalDirection] = useState<'boost' | 'demote'>('boost')
  const [currentAdjustMethod, setCurrentAdjustMethod] = useState<string>('fixedBoost')
  const [boostTiers, setBoostTiers] = useState<BoostTier[]>([])
  const [demoteTiers, setDemoteTiers] = useState<DemoteTier[]>([])
  const [form] = Form.useForm()
  
  // 数据状态管理
  const [dataSource, setDataSource] = useState<InterventionRecord[]>(mockData)

  /** 新增加分 */
  const handleAddBoost = () => {
    setEditingRecord(null)
    setModalDirection('boost')
    setCurrentAdjustMethod('fixedBoost')
    setBoostTiers([])
    setDemoteTiers([])
    form.resetFields()
    form.setFieldsValue({ searchChannel: ['takeaway'] })
    setIsModalOpen(true)
  }

  /** 新增減分 */
  const handleAddDemote = () => {
    setEditingRecord(null)
    setModalDirection('demote')
    setCurrentAdjustMethod('discount')
    setBoostTiers([])
    setDemoteTiers([])
    form.resetFields()
    form.setFieldsValue({ searchChannel: ['takeaway'] })
    setIsModalOpen(true)
  }

  /** 編輯 */
  const handleEdit = (record: InterventionRecord) => {
    setEditingRecord(record)
    setModalDirection(record.interventionDirection)
    setCurrentAdjustMethod(record.adjustMethod || 'fixedBoost')
    // 加载梯队数据，如果没有则初始化默认梯队
    if (record.interventionDirection === 'boost') {
      setBoostTiers(record.boostTiers && record.boostTiers.length > 0 
        ? record.boostTiers 
        : [{ minAmount: 0, maxAmount: undefined, boostType: 'fixed_boost', boostValue: 10 }])
      setDemoteTiers([])
    } else {
      setDemoteTiers(record.demoteTiers && record.demoteTiers.length > 0 
        ? record.demoteTiers 
        : [{ days: 0, deductionType: 'percent_deduction', deductionValue: 10 }])
      setBoostTiers([])
    }
    // 先打开Modal，然后在下一个tick设置表单值
    setIsModalOpen(true)
    setTimeout(() => {
      form.setFieldsValue({
        ...record,
        dateRange:
          record.effectStartDate && record.effectEndDate
            ? [dayjs(record.effectStartDate), dayjs(record.effectEndDate)]
            : undefined,
      })
    }, 0)
  }

  /** 詳情 */
  const handleDetail = (record: InterventionRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  /** 切換狀態 */
  const handleToggleStatus = (record: InterventionRecord) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active'
    const statusText = newStatus === 'active' ? '生效' : '失效'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將集團「${record.groupName}」的干預配置設為「${statusText}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        // 更新数据源中的状态
        setDataSource(prevData => 
          prevData.map(item => 
            item.key === record.key ? { ...item, status: newStatus } : item
          )
        )
        message.success(`已${statusText}`)
      },
    })
  }

  /** 保存 */
  const handleSave = () => {
    form.validateFields().then((values) => {
      if (editingRecord) {
        // 编辑模式：更新现有记录
        setDataSource(prevData => 
          prevData.map(item => {
            if (item.key === editingRecord.key) {
              const [startDate, endDate] = values.dateRange || []
              return {
                ...item,
                searchChannel: values.searchChannel || item.searchChannel,
                reason: values.reason || item.reason,
                effectStartDate: startDate ? startDate.format('YYYY-MM-DD') : item.effectStartDate,
                effectEndDate: endDate ? endDate.format('YYYY-MM-DD') : item.effectEndDate,
                // 更新梯队数据
                boostTiers: modalDirection === 'boost' && boostTiers.length > 0 ? boostTiers : item.boostTiers,
                demoteTiers: modalDirection === 'demote' && demoteTiers.length > 0 ? demoteTiers : item.demoteTiers,
              }
            }
            return item
          })
        )
        message.success('編輯成功')
      } else {
        // 新增模式
        message.success('新增成功')
      }
      setIsModalOpen(false)
    })
  }

  /** 調整方式變更 */
  const handleAdjustMethodChange = (value: string) => {
    setCurrentAdjustMethod(value)
    form.setFieldValue('adjustValue', undefined)
  }

  /** 加分梯队 - 新增 */
  const handleAddBoostTier = () => {
    setBoostTiers([
      ...boostTiers,
      { minAmount: 0, boostType: 'fixed_boost', boostValue: 0 },
    ])
  }

  /** 加分梯队 - 删除 */
  const handleRemoveBoostTier = (index: number) => {
    setBoostTiers(boostTiers.filter((_, i) => i !== index))
  }

  /** 加分梯队 - 更新 */
  const handleUpdateBoostTier = (index: number, field: keyof BoostTier, value: any) => {
    const newTiers = [...boostTiers]
    newTiers[index] = { ...newTiers[index], [field]: value }
    setBoostTiers(newTiers)
  }

  /** 减分梯队 - 新增 */
  const handleAddDemoteTier = () => {
    setDemoteTiers([
      ...demoteTiers,
      { days: 30, deductionType: 'fixed_deduction', deductionValue: 0 },
    ])
  }

  /** 减分梯队 - 删除 */
  const handleRemoveDemoteTier = (index: number) => {
    setDemoteTiers(demoteTiers.filter((_, i) => i !== index))
  }

  /** 减分梯队 - 更新 */
  const handleUpdateDemoteTier = (index: number, field: keyof DemoteTier, value: any) => {
    const newTiers = [...demoteTiers]
    newTiers[index] = { ...newTiers[index], [field]: value }
    setDemoteTiers(newTiers)
  }

  /** 彈窗標題 */
  const getModalTitle = () => {
    if (editingRecord) return '編輯干預配置'
    return '新增商戶配置'
  }

  /** 列配置元數據 */
  const columnMeta = useMemo(
    () => [
      { key: 'interventionId', title: '配置ID' },
      { key: 'groupId', title: '集團ID' },
      { key: 'groupName', title: '集團名稱' },
      { key: 'brand', title: '所屬品牌' },
      { key: 'interventionDirection', title: '干預方向' },
      { key: 'searchChannel', title: '搜索頻道' },
      { key: 'effectDate', title: '生效時間' },
      { key: 'status', title: '狀態' },
      { key: 'operator', title: '操作人' },
      { key: 'operateTime', title: '操作時間' },
      { key: 'action', title: '操作' },
    ],
    [],
  )

  const { configComponent, applyConfig } = useColumnConfig('search-weight-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const adjustValueConfig = getAdjustValueConfig(currentAdjustMethod)

  const columns: TableColumnsType<InterventionRecord> = [
    {
      title: '配置ID',
      dataIndex: 'interventionId',
      key: 'interventionId',
      width: 120,
    },
    {
      title: '集團ID',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 160,
      ellipsis: true,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v] || v}
        </Tag>
      ),
    },
    {
      title: '干預方向',
      dataIndex: 'interventionDirection',
      key: 'interventionDirection',
      width: 90,
      render: (v: string) =>
        v === 'boost' ? <Tag color="green">加分</Tag> : <Tag color="red">減分</Tag>,
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 140,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '生效時間',
      key: 'effectDate',
      width: 200,
      render: (_, r) => `${r.effectStartDate} ~ ${r.effectEndDate}`,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) =>
        v === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">失效</Tag>,
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 110,
    },
    {
      title: '操作時間',
      dataIndex: 'operateTime',
      key: 'operateTime',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => {
        const canEdit =
          record.interventionDirection === 'boost'
            ? userPermissions.canBoost
            : userPermissions.canDemote
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={(e) => {
              e.preventDefault()
              handleDetail(record)
            }}>
              詳情
            </Button>
            <Button
              type="link"
              size="small"
              disabled={!canEdit}
              onClick={(e) => {
                e.preventDefault()
                handleEdit(record)
              }}
            >
              編輯
            </Button>
            <Button
              type="link"
              size="small"
              danger={record.status === 'active'}
              onClick={(e) => {
                e.preventDefault()
                handleToggleStatus(record)
              }}
            >
              {record.status === 'active' ? '失效' : '生效'}
            </Button>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="content-area">
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Form.Item label="集團名稱/ID">
            <Input placeholder="請輸入集團名稱或ID" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="全部" options={brandOptions} />
          </Form.Item>
          <Form.Item label="搜索頻道">
            <Select placeholder="全部" options={searchChannelOptions} />
          </Form.Item>
          <Form.Item label="干預方向">
            <Select placeholder="全部" options={interventionDirectionOptions} />
          </Form.Item>
          <Form.Item label="調整方式">
            <Select mode="multiple" placeholder="全部" options={adjustMethodQueryOptions} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select placeholder="全部" options={statusOptions} />
          </Form.Item>
          <Form.Item label="生效時間">
            <RangePicker placeholder={['開始時間', '結束時間']} />
          </Form.Item>
          <Form.Item label="操作人">
            <Input placeholder="請輸入操作人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>
                搜尋
              </Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能區域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ExportOutlined />}>數據導出</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingRecord(null)
              setModalDirection('boost') // 默认加分，表单内可切换
              setCurrentAdjustMethod('fixedBoost')
              setBoostTiers([{ minAmount: 0, maxAmount: undefined, boostType: 'fixed_boost', boostValue: 10 }])
              setDemoteTiers([{ days: 0, deductionType: 'percent_deduction', deductionValue: 10 }])
              form.resetFields()
              form.setFieldsValue({ searchChannel: ['takeaway'], interventionCategory: 'boost' })
              setIsModalOpen(true)
            }}
          >
            新增商戶
          </Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表區域 */}
      <div className="table-section">
        <Table<InterventionRecord>
          columns={applyConfig(columns)}
          dataSource={dataSource}
          rowSelection={{}}
          pagination={{
            total: dataSource.length,
            pageSize: 10,
            showTotal: total => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1600 }}
        />
      </div>

      {/* 新增/編輯彈窗 */}
      <Modal
        title={getModalTitle()}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="集團ID"
            name="groupId"
            rules={[{ required: true, message: '請輸入集團ID' }]}
          >
            <Input placeholder="請輸入集團ID" disabled={!!editingRecord} />
          </Form.Item>

          <Form.Item
            label="集團名稱"
            name="groupName"
            rules={[{ required: true, message: '請輸入集團名稱' }]}
          >
            <Input placeholder="請輸入集團名稱搜索" disabled={!!editingRecord} />
          </Form.Item>

          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇' }]}
          >
            <Select
              options={brandOptions.filter(o => o.value !== 'all')}
              placeholder="請選擇品牌"
              disabled={!!editingRecord}
            />
          </Form.Item>

          <Form.Item
            label="搜索頻道"
            name="searchChannel"
            rules={[{ required: true, message: '請選擇搜索頻道' }]}
          >
            <Select
              mode="multiple"
              options={searchChannelOptions.filter(o => o.value !== 'all')}
              placeholder="請選擇搜索頻道"
              disabled={!!editingRecord}
            />
          </Form.Item>

          {/* 新增模式下显示干预类目选择 */}
          {!editingRecord && (
            <Form.Item
              label="干預類目"
              name="interventionCategory"
              rules={[{ required: true, message: '請選擇干預類目' }]}
            >
              <Select
                placeholder="請選擇干預類目"
                options={[
                  { label: '加分类目', value: 'boost' },
                  { label: '减分类目', value: 'demote' },
                ]}
                onChange={(val: 'boost' | 'demote') => {
                  setModalDirection(val)
                  setCurrentAdjustMethod(val === 'boost' ? 'fixedBoost' : 'discount')
                }}
              />
            </Form.Item>
          )}

          {/* 加分梯队配置 */}
          {modalDirection === 'boost' && (
            <>
              <Form.Item label="加分規則配置">
                <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
                  配置階梯式加分規則，支持多個梯队
                </div>
                {boostTiers.map((tier, index) => (
                  <div key={index} style={{ 
                    border: '1px solid #d9d9d9', 
                    borderRadius: 4, 
                    padding: 12, 
                    marginBottom: 8,
                    background: '#fafafa'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 'bold' }}>梯队 {index + 1}</span>
                      <Button 
                        type="link" 
                        danger 
                        size="small"
                        onClick={() => handleRemoveBoostTier(index)}
                        disabled={boostTiers.length <= 1}
                      >
                        删除
                      </Button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Form.Item label="消費金額下限" style={{ marginBottom: 0 }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          value={tier.minAmount}
                          onChange={(val) => handleUpdateBoostTier(index, 'minAmount', val || 0)}
                          min={0}
                          addonAfter="元"
                        />
                      </Form.Item>
                      <Form.Item label="消費金額上限" style={{ marginBottom: 0 }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          value={tier.maxAmount}
                          onChange={(val) => handleUpdateBoostTier(index, 'maxAmount', val)}
                          min={tier.minAmount}
                          addonAfter="元"
                          placeholder="留空表示無上限"
                        />
                      </Form.Item>
                      <Form.Item label="加分方式" style={{ marginBottom: 0 }}>
                        <Select
                          value={tier.boostType}
                          onChange={(val) => handleUpdateBoostTier(index, 'boostType', val)}
                          options={[
                            { label: '消費金額', value: 'amount_match' },
                            { label: '固定加分', value: 'fixed_boost' },
                          ]}
                        />
                      </Form.Item>
                      {/* 只有固定加分时才显示加分数字段 */}
                      {tier.boostType === 'fixed_boost' && (
                        <Form.Item label="加分數值" style={{ marginBottom: 0 }}>
                          <InputNumber
                            style={{ width: '100%' }}
                            value={tier.boostValue}
                            onChange={(val) => handleUpdateBoostTier(index, 'boostValue', val || 0)}
                            min={0}
                            addonAfter="分"
                            placeholder="輸入固定分數"
                          />
                        </Form.Item>
                      )}
                    </div>
                  </div>
                ))}
                <Button 
                  type="dashed" 
                  icon={<PlusOutlined />} 
                  onClick={handleAddBoostTier}
                  style={{ width: '100%' }}
                >
                  新增梯队
                </Button>
              </Form.Item>
            </>
          )}

          {/* 減分梯队配置 */}
          {modalDirection === 'demote' && (
            <>
              <Form.Item label="減分規則配置">
                <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
                  配置階梯式減分規則，支持多個梯队
                </div>
                {demoteTiers.map((tier, index) => (
                  <div key={index} style={{ 
                    border: '1px solid #d9d9d9', 
                    borderRadius: 4, 
                    padding: 12, 
                    marginBottom: 8,
                    background: '#fafafa'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 'bold' }}>梯队 {index + 1}</span>
                      <Button 
                        type="link" 
                        danger 
                        size="small"
                        onClick={() => handleRemoveDemoteTier(index)}
                        disabled={demoteTiers.length <= 1}
                      >
                        删除
                      </Button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Form.Item label="未購買天數" style={{ marginBottom: 0 }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          value={tier.days}
                          onChange={(val) => handleUpdateDemoteTier(index, 'days', val || 30)}
                          min={1}
                          addonAfter="天"
                        />
                      </Form.Item>
                      <Form.Item label="扣分方式" style={{ marginBottom: 0 }}>
                        <Select
                          value={tier.deductionType}
                          onChange={(val) => handleUpdateDemoteTier(index, 'deductionType', val)}
                          options={[
                            { label: '固定分數扣', value: 'fixed_deduction' },
                            { label: '按商戶總得分折扣', value: 'percent_deduction' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item label="扣分數值" style={{ marginBottom: tier.deductionType === 'percent_deduction' ? 4 : 0, gridColumn: '1 / -1' }}>
                        <InputNumber
                          style={{ width: '100%' }}
                          value={tier.deductionValue}
                          onChange={(val) => handleUpdateDemoteTier(index, 'deductionValue', val || 0)}
                          min={0}
                          max={tier.deductionType === 'percent_deduction' ? 100 : undefined}
                          addonAfter={tier.deductionType === 'percent_deduction' ? '%' : '分'}
                          placeholder={tier.deductionType === 'percent_deduction' ? '輸入折扣比例，如20表示8折' : '輸入固定扣分'}
                        />
                      </Form.Item>
                      {/* 按比例扣时的提醒说明 */}
                      {tier.deductionType === 'percent_deduction' && (
                        <div style={{ 
                          gridColumn: '1 / -1',
                          padding: '8px 12px',
                          background: '#fffbe6',
                          border: '1px solid #ffe58f',
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#d48806',
                          lineHeight: 1.6
                        }}>
                          <strong>💡 計算說明：</strong>
                          按商戶總得分折扣是根據商戶當前總分進行比例扣減。用戶搜索時，系統會執行：
                          <code style={{ margin: '0 4px', padding: '2px 6px', background: '#f5f5f5', borderRadius: 3 }}>最終得分 = 商戶總分 × (1 - 折扣比例)</code>
                          。例如：商戶總分100分，輸入20%則最終得分80分；輸入100%則全部扣除，最終得分0分。
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <Button 
                  type="dashed" 
                  icon={<PlusOutlined />} 
                  onClick={handleAddDemoteTier}
                  style={{ width: '100%' }}
                >
                  新增梯队
                </Button>
              </Form.Item>
            </>
          )}



          <Form.Item
            label="原因說明"
            name="reason"
            rules={[{ required: true, message: '請填寫原因說明' }]}
          >
            <TextArea rows={3} placeholder="請填寫原因說明" maxLength={200} showCount />
          </Form.Item>

          <Form.Item
            label="生效日期"
            name="dateRange"
            rules={[{ required: true, message: '請選擇生效日期' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 詳情彈窗 */}
      <Modal
        title="干預配置詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={640}
      >
        {detailRecord && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
              <div>
                <span style={{ color: '#999' }}>配置ID：</span>
                {detailRecord.interventionId}
              </div>
              <div>
                <span style={{ color: '#999' }}>集團ID：</span>
                {detailRecord.groupId}
              </div>
              <div>
                <span style={{ color: '#999' }}>集團名稱：</span>
                {detailRecord.groupName}
              </div>
              <div>
                <span style={{ color: '#999' }}>所屬品牌：</span>
                {brandMap[detailRecord.brand]}
              </div>
              <div>
                <span style={{ color: '#999' }}>干預方向：</span>
                {detailRecord.interventionDirection === 'boost' ? (
                  <Tag color="green">加分</Tag>
                ) : (
                  <Tag color="red">減分</Tag>
                )}
              </div>
              <div>
                <span style={{ color: '#999' }}>規則配置：</span>
                {detailRecord.boostTiers ? (
                  <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', gridColumn: '1 / -1' }}>
                    {formatBoostTiers(detailRecord.boostTiers)}
                  </pre>
                ) : detailRecord.demoteTiers ? (
                  <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', gridColumn: '1 / -1' }}>
                    {formatDemoteTiers(detailRecord.demoteTiers)}
                  </pre>
                ) : detailRecord.adjustMethod && detailRecord.adjustValue !== undefined ? (
                  formatAdjustValue(detailRecord.adjustMethod, detailRecord.adjustValue)
                ) : (
                  '-'
                )}
              </div>
              <div>
                <span style={{ color: '#999' }}>搜索頻道：</span>
                {detailRecord.searchChannel.map(c => channelMap[c]).join('、')}
              </div>
              <div>
                <span style={{ color: '#999' }}>生效時間：</span>
                {detailRecord.effectStartDate} ~ {detailRecord.effectEndDate}
              </div>
              <div>
                <span style={{ color: '#999' }}>狀態：</span>
                {detailRecord.status === 'active' ? (
                  <Tag color="green">生效</Tag>
                ) : (
                  <Tag color="red">失效</Tag>
                )}
              </div>
              <div>
                <span style={{ color: '#999' }}>操作人：</span>
                {detailRecord.operator}
              </div>
              <div>
                <span style={{ color: '#999' }}>操作時間：</span>
                {detailRecord.operateTime}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: '#999' }}>原因說明：</span>
                {detailRecord.reason}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
