import { useState, useEffect } from 'react'
import { Button, Table, Modal, Form, Input, Tree, Space, message, Tag, Tabs, Pagination, Select } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import type { LocationGroup, MerchantGroup } from '../types'
import { locationOptions, countryOptions, countryLocationMap, merchantOptions, STORAGE_KEYS } from '../types'
import './index.css'

const { TextArea } = Input
const { TabPane } = Tabs

/** 将地点选项转换为 Tree 组件数据 */
const locationTreeData: DataNode[] = locationOptions.map(loc => ({
  title: loc.label,
  key: loc.key,
}))

export default function DataPermission() {
  const [locationGroups, setLocationGroups] = useState<LocationGroup[]>([])
  const [merchantGroups, setMerchantGroups] = useState<MerchantGroup[]>([])
  const [locationModalVisible, setLocationModalVisible] = useState(false)
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [currentLocationGroup, setCurrentLocationGroup] = useState<LocationGroup | null>(null)
  const [selectedLocationCountry, setSelectedLocationCountry] = useState<string>('') // 当前选择的国家（地点）
  const [currentMerchantGroup, setCurrentMerchantGroup] = useState<MerchantGroup | null>(null)
  const [selectedMerchantCountry, setSelectedMerchantCountry] = useState<string>('') // 当前选择的国家（商家）
  const [checkedLocations, setCheckedLocations] = useState<string[]>([])
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  const [locationForm] = Form.useForm()
  const [merchantForm] = Form.useForm()
  const [merchantSearchText, setMerchantSearchText] = useState('')
  const [locationCurrentPage, setLocationCurrentPage] = useState(1)
  const [locationPageSize, setLocationPageSize] = useState(10)
  const [merchantCurrentPage, setMerchantCurrentPage] = useState(1)
  const [merchantPageSize, setMerchantPageSize] = useState(10)

  // 从 localStorage 加载数据
  useEffect(() => {
    const savedLocationGroups = localStorage.getItem(STORAGE_KEYS.LOCATION_GROUPS)
    const savedMerchantGroups = localStorage.getItem(STORAGE_KEYS.MERCHANT_GROUPS)

    if (savedLocationGroups) {
      const parsedLocationGroups = JSON.parse(savedLocationGroups)
      // 检查第一条数据是否有country字段，如果没有则重新生成
      if (parsedLocationGroups.length === 0 || !parsedLocationGroups[0].country) {
        generateInitialLocationGroups()
      } else {
        setLocationGroups(parsedLocationGroups)
      }
    } else {
      generateInitialLocationGroups()
    }

    if (savedMerchantGroups) {
      const parsedMerchantGroups = JSON.parse(savedMerchantGroups)
      // 检查第一条数据是否有country字段，如果没有则重新生成
      if (parsedMerchantGroups.length === 0 || !parsedMerchantGroups[0].country) {
        generateInitialMerchantGroups()
      } else {
        setMerchantGroups(parsedMerchantGroups)
      }
    } else {
      generateInitialMerchantGroups()
    }
  }, [])

  /** 生成初始地点组数据 */
  const generateInitialLocationGroups = () => {
    const locationGroupData = [
      {
        name: '华南地区',
        desc: '华南区域地点',
        country: 'china',
        locations: ['guangzhou', 'shenzhen', 'zhuhai', 'dongguan', 'foshan', 'zhongshan', 'huizhou', 'jiangmen', 'zhaoqing'],
      },
      {
        name: '华东地区',
        desc: '华东区域地点',
        country: 'china',
        locations: ['shanghai', 'hangzhou', 'nanjing', 'suzhou', 'wuxi', 'ningbo', 'hefei', 'wenzhou', 'changzhou'],
      },
      {
        name: '华北地区',
        desc: '华北区域地点',
        country: 'china',
        locations: ['beijing', 'tianjin', 'shijiazhuang', 'taiyuan', 'datong', 'baoding', 'tangshan', 'handan', 'langfang'],
      },
      {
        name: '东京都心',
        desc: '日本东京核心区域',
        country: 'japan',
        locations: ['tokyo', 'osaka', 'kyoto', 'nagoya'],
      },
      {
        name: '首尔都市圈',
        desc: '韩国首尔及周边',
        country: 'south_korea',
        locations: ['seoul', 'busan', 'incheon', 'daegu'],
      },
      {
        name: '新加坡全境',
        desc: '新加坡全国地点',
        country: 'singapore',
        locations: ['singapore'],
      },
      {
        name: '泰国旅游区',
        desc: '泰国热门旅游城市',
        country: 'thailand',
        locations: ['bangkok', 'chiang_mai', 'phuket', 'pattaya'],
      },
      {
        name: '港澳地区',
        desc: '港澳区域地点',
        country: 'hongkong',
        locations: ['hongkong', 'macau', 'taipa', 'coloane', 'kowloon', 'new_territories', 'hong_kong_island', 'taipa_cotai'],
      },
      {
        name: '台湾地区',
        desc: '台湾主要城市',
        country: 'taiwan',
        locations: ['taipei', 'kaohsiung', 'taichung', 'tainan'],
      },
      {
        name: '马来西亚西部',
        desc: '马来西亚西海岸城市',
        country: 'malaysia',
        locations: ['kuala_lumpur', 'penang', 'johor_bahru', 'malacca'],
      },
      {
        name: '越南核心区',
        desc: '越南主要城市',
        country: 'vietnam',
        locations: ['ho_chi_minh', 'hanoi', 'da_nang', 'hai_phong'],
      },
      {
        name: '印尼爪哇岛',
        desc: '印度尼西亚核心区域',
        country: 'indonesia',
        locations: ['jakarta', 'surabaya', 'bandung', 'medan'],
      },
      {
        name: '菲律宾马尼拉',
        desc: '菲律宾首都圈',
        country: 'philippines',
        locations: ['manila', 'cebu', 'davao', 'quezon_city'],
      },
      {
        name: '美国东海岸',
        desc: '美国东部主要城市',
        country: 'usa',
        locations: ['new_york', 'chicago', 'houston', 'phoenix'],
      },
      {
        name: '英国伦敦圈',
        desc: '英国主要城市',
        country: 'uk',
        locations: ['london', 'manchester', 'birmingham', 'edinburgh'],
      },
      {
        name: '澳大利亚东部',
        desc: '澳洲东海岸城市',
        country: 'australia',
        locations: ['sydney', 'melbourne', 'brisbane', 'perth'],
      },
    ]

    const initialLocationGroups: LocationGroup[] = locationGroupData.map((item, index) => ({
      id: (index + 1).toString(),
      name: item.name,
      description: item.desc,
      country: item.country,
      locations: item.locations,
      userCount: Math.floor(Math.random() * 8),
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: index < 12 ? 'active' : 'inactive',
    }))

    setLocationGroups(initialLocationGroups)
    localStorage.setItem(STORAGE_KEYS.LOCATION_GROUPS, JSON.stringify(initialLocationGroups))
  }

  /** 生成初始商家组数据 */
  const generateInitialMerchantGroups = () => {
    const merchantGroupData = [
      {
        name: '中国商家组',
        desc: '中国大陆地区商家',
        country: 'china',
        merchants: ['G10001', 'G10002', 'G10005', 'G10006', 'G10007', 'G10009'],
      },
      {
        name: '澳门商家组',
        desc: '澳门地区商家',
        country: 'macau',
        merchants: ['G10003', 'G10004', 'G10008', 'G10010'],
      },
      {
        name: '日本商家组',
        desc: '日本地区商家',
        country: 'japan',
        merchants: ['G10011', 'G10012', 'G10013'],
      },
      {
        name: '韩国商家组',
        desc: '韩国地区商家',
        country: 'south_korea',
        merchants: ['G10014', 'G10015'],
      },
      {
        name: '新加坡商家组',
        desc: '新加坡地区商家',
        country: 'singapore',
        merchants: ['G10016', 'G10017'],
      },
      {
        name: '泰国商家组',
        desc: '泰国地区商家',
        country: 'thailand',
        merchants: ['G10018', 'G10019'],
      },
      {
        name: '马来西亚商家组',
        desc: '马来西亚地区商家',
        country: 'malaysia',
        merchants: ['G10020', 'G10021'],
      },
      {
        name: '越南商家组',
        desc: '越南地区商家',
        country: 'vietnam',
        merchants: ['G10022', 'G10023'],
      },
      {
        name: '美国商家组',
        desc: '美国地区商家',
        country: 'usa',
        merchants: ['G10024', 'G10025'],
      },
      {
        name: '英国商家组',
        desc: '英国地区商家',
        country: 'uk',
        merchants: ['G10026', 'G10027'],
      },
      {
        name: '澳大利亚商家组',
        desc: '澳大利亚地区商家',
        country: 'australia',
        merchants: ['G10028', 'G10029'],
      },
    ]

    const initialMerchantGroups: MerchantGroup[] = merchantGroupData.map((item, index) => ({
      id: (index + 1).toString(),
      name: item.name,
      description: item.desc,
      country: item.country,
      merchants: item.merchants,
      userCount: Math.floor(Math.random() * 6),
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: index < 10 ? 'active' : 'inactive',
    }))

    setMerchantGroups(initialMerchantGroups)
    localStorage.setItem(STORAGE_KEYS.MERCHANT_GROUPS, JSON.stringify(initialMerchantGroups))
  }

  /** 保存地点组数据 */
  const saveLocationGroups = (newGroups: LocationGroup[]) => {
    setLocationGroups(newGroups)
    localStorage.setItem(STORAGE_KEYS.LOCATION_GROUPS, JSON.stringify(newGroups))
  }

  /** 保存商家组数据 */
  const saveMerchantGroups = (newGroups: MerchantGroup[]) => {
    setMerchantGroups(newGroups)
    localStorage.setItem(STORAGE_KEYS.MERCHANT_GROUPS, JSON.stringify(newGroups))
  }

  /** 处理国家选择变化（地点） */
  const handleLocationCountryChange = (country: string) => {
    setSelectedLocationCountry(country)
    // 清空已选地点
    setCheckedLocations([])
  }

  /** 处理国家选择变化（商家） */
  const handleMerchantCountryChange = (country: string) => {
    setSelectedMerchantCountry(country)
    // 清空已选商家
    setSelectedMerchants([])
  }

  /** 根据国家过滤地点树 */
  const getFilteredLocationTree = (country: string): DataNode[] => {
    if (!country) return locationTreeData
    
    const allowedLocations = countryLocationMap[country] || []
    
    return locationTreeData.map(region => ({
      ...region,
      children: region.children?.filter(child => 
        allowedLocations.includes(child.key as string)
      ),
    })).filter(region => region.children && region.children.length > 0)
  }

  /** 根据国家过滤商家列表 */
  const getFilteredMerchants = (country: string) => {
    if (!country) return merchantOptions
    return merchantOptions.filter(merchant => merchant.country === country)
  }

  /** 新建地点组 */
  const handleCreateLocation = () => {
    locationForm.resetFields()
    setCurrentLocationGroup(null)
    setCheckedLocations([])
    setSelectedLocationCountry('') // 重置国家选择
    setLocationModalVisible(true)
  }

  /** 提交地点组 */
  const handleLocationSubmit = async () => {
    const values = await locationForm.validateFields()
    const newGroup: LocationGroup = {
      id: currentLocationGroup ? currentLocationGroup.id : Date.now().toString(),
      name: values.name,
      description: values.description || '',
      country: selectedLocationCountry, // 使用状态中的国家
      locations: checkedLocations,
      userCount: currentLocationGroup ? currentLocationGroup.userCount : 0,
      createdAt: currentLocationGroup ? currentLocationGroup.createdAt : new Date().toISOString(),
      status: currentLocationGroup ? currentLocationGroup.status : 'active',
    }

    if (currentLocationGroup) {
      const newGroups = locationGroups.map(g => g.id === currentLocationGroup.id ? newGroup : g)
      saveLocationGroups(newGroups)
      message.success('地点组已更新')
    } else {
      const newGroups = [...locationGroups, newGroup]
      saveLocationGroups(newGroups)
      message.success('地点组创建成功')
    }
    setLocationModalVisible(false)
  }

  /** 编辑地点组 */
  const handleEditLocation = (record: LocationGroup) => {
    setCurrentLocationGroup(record)
    locationForm.setFieldsValue({
      name: record.name,
      description: record.description,
    })
    setSelectedLocationCountry(record.country) // 设置国家
    setCheckedLocations(record.locations)
    setLocationModalVisible(true)
  }

  /** 切换地点组状态 */
  const handleToggleLocationStatus = (record: LocationGroup) => {
    const newStatus: 'active' | 'inactive' = record.status === 'active' ? 'inactive' : 'active'
    const newGroups = locationGroups.map(g =>
      g.id === record.id ? { ...g, status: newStatus } : g
    )
    saveLocationGroups(newGroups)
    message.success(newStatus === 'active' ? '已启用' : '已停用')
  }

  /** 删除地点组 */
  const handleDeleteLocation = (record: LocationGroup) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除地点组"${record.name}"吗？`,
      onOk: () => {
        const newGroups = locationGroups.filter(g => g.id !== record.id)
        saveLocationGroups(newGroups)
        message.success('地点组已删除')
      },
    })
  }

  /** 新建商家组 */
  const handleCreateMerchant = () => {
    merchantForm.resetFields()
    setCurrentMerchantGroup(null)
    setSelectedMerchants([])
    setSelectedMerchantCountry('') // 重置国家选择
    setMerchantModalVisible(true)
  }

  /** 提交商家组 */
  const handleMerchantSubmit = async () => {
    const values = await merchantForm.validateFields()
    const newGroup: MerchantGroup = {
      id: currentMerchantGroup ? currentMerchantGroup.id : Date.now().toString(),
      name: values.name,
      description: values.description || '',
      country: selectedMerchantCountry, // 使用状态中的国家
      merchants: selectedMerchants,
      userCount: currentMerchantGroup ? currentMerchantGroup.userCount : 0,
      createdAt: currentMerchantGroup ? currentMerchantGroup.createdAt : new Date().toISOString(),
      status: currentMerchantGroup ? currentMerchantGroup.status : 'active',
    }

    if (currentMerchantGroup) {
      const newGroups = merchantGroups.map(g => g.id === currentMerchantGroup.id ? newGroup : g)
      saveMerchantGroups(newGroups)
      message.success('商家组已更新')
    } else {
      const newGroups = [...merchantGroups, newGroup]
      saveMerchantGroups(newGroups)
      message.success('商家组创建成功')
    }
    setMerchantModalVisible(false)
  }

  /** 编辑商家组 */
  const handleEditMerchant = (record: MerchantGroup) => {
    setCurrentMerchantGroup(record)
    merchantForm.setFieldsValue({
      name: record.name,
      description: record.description,
    })
    setSelectedMerchantCountry(record.country) // 设置国家
    setSelectedMerchants(record.merchants)
    setMerchantModalVisible(true)
  }

  /** 切换商家组状态 */
  const handleToggleMerchantStatus = (record: MerchantGroup) => {
    const newStatus: 'active' | 'inactive' = record.status === 'active' ? 'inactive' : 'active'
    const newGroups = merchantGroups.map(g =>
      g.id === record.id ? { ...g, status: newStatus } : g
    )
    saveMerchantGroups(newGroups)
    message.success(newStatus === 'active' ? '已启用' : '已停用')
  }

  /** 删除商家组 */
  const handleDeleteMerchant = (record: MerchantGroup) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除商家组"${record.name}"吗？`,
      onOk: () => {
        const newGroups = merchantGroups.filter(g => g.id !== record.id)
        saveMerchantGroups(newGroups)
        message.success('商家组已删除')
      },
    })
  }

  /** 过滤商家 */
  const filteredMerchants = getFilteredMerchants(selectedMerchantCountry).filter(merchant =>
    merchant.name.includes(merchantSearchText) ||
    merchant.address.includes(merchantSearchText)
  )

  // 地点组表格列
  const locationColumns: TableColumnsType<LocationGroup> = [
    {
      title: '授權國家',
      dataIndex: 'country',
      key: 'country',
      width: 120,
      render: (country: string) => {
        const c = countryOptions.find(c => c.key === country)
        // 不同国家使用不同颜色
        const colorMap: Record<string, string> = {
          china: 'blue',
          hongkong: 'purple',
          macau: 'orange',
          taiwan: 'cyan',
          japan: 'red',
          south_korea: 'magenta',
          singapore: 'green',
          malaysia: 'lime',
          thailand: 'volcano',
          vietnam: 'gold',
          philippines: 'geekblue',
          indonesia: 'purple',
          usa: 'red',
          uk: 'blue',
          australia: 'orange',
        }
        const color = colorMap[country] || 'default'
        return c ? <Tag color={color}>{c.label}</Tag> : '-'
      },
    },
    {
      title: '授權地點組',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 250,
      ellipsis: true,
    },
    {
      title: '包含地點',
      dataIndex: 'locations',
      key: 'locations',
      width: 250,
      render: (locations: string[]) => (
        <Space wrap>
          {locations.map(locKey => {
            const loc = locationOptions.find(l => l.key === locKey)
            return loc ? <Tag key={locKey} color="blue">{loc.label}</Tag> : null
          })}
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: 'active' | 'inactive') => (
        <Tag color={status === 'active' ? 'green' : 'default'}>
          {status === 'active' ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '綁定賬號數',
      dataIndex: 'userCount',
      key: 'userCount',
      width: 120,
      render: (count: number) => (
        <Tag color="green">{count} 個</Tag>
      ),
    },
    {
      title: '創建時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-TW', { hour12: false }),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button 
            type="link" 
            size="small" 
            icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleLocationStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small"  onClick={() => handleEditLocation(record)}>
            編輯
          </Button>
          <Button type="link" size="small" danger  onClick={() => handleDeleteLocation(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  // 商家组表格列
  const merchantColumns: TableColumnsType<MerchantGroup> = [
    {
      title: '授權國家',
      dataIndex: 'country',
      key: 'country',
      width: 120,
      render: (country: string) => {
        const c = countryOptions.find(c => c.key === country)
        // 不同国家使用不同颜色
        const colorMap: Record<string, string> = {
          china: 'blue',
          hongkong: 'purple',
          macau: 'orange',
          taiwan: 'cyan',
          japan: 'red',
          south_korea: 'magenta',
          singapore: 'green',
          malaysia: 'lime',
          thailand: 'volcano',
          vietnam: 'gold',
          philippines: 'geekblue',
          indonesia: 'purple',
          usa: 'red',
          uk: 'blue',
          australia: 'orange',
        }
        const color = colorMap[country] || 'default'
        return c ? <Tag color={color}>{c.label}</Tag> : '-'
      },
    },
    {
      title: '商家組名稱',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 250,
      ellipsis: true,
    },
    {
      title: '包含商家',
      dataIndex: 'merchants',
      key: 'merchants',
      width: 300,
      render: (merchants: string[]) => (
        <Space wrap>
          {merchants.slice(0, 3).map(merchantId => {
            const merchant = merchantOptions.find(m => m.id === merchantId)
            return merchant ? <Tag key={merchantId} color="purple">{merchant.name}</Tag> : null
          })}
          {merchants.length > 3 && <Tag color="default">+{merchants.length - 3}</Tag>}
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: 'active' | 'inactive') => (
        <Tag color={status === 'active' ? 'green' : 'default'}>
          {status === 'active' ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '綁定賬號數',
      dataIndex: 'userCount',
      key: 'userCount',
      width: 120,
      render: (count: number) => (
        <Tag color="green">{count} 個</Tag>
      ),
    },
    {
      title: '創建時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-TW', { hour12: false }),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button 
            type="link" 
            size="small" 
            icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleMerchantStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small"  onClick={() => handleEditMerchant(record)}>
            編輯
          </Button>
          <Button type="link" size="small" danger  onClick={() => handleDeleteMerchant(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const merchantTableColumns = [
    {
      title: '商家ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
    },
    {
      title: '商家名稱',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '註冊地址',
      dataIndex: 'address',
      key: 'address',
    },
  ]

  return (
    <div className="data-permission-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>數據權限</h2>
        <Button 
          danger 
          onClick={() => {
            localStorage.removeItem(STORAGE_KEYS.LOCATION_GROUPS)
            localStorage.removeItem(STORAGE_KEYS.MERCHANT_GROUPS)
            message.success('数据已重置，请刷新页面')
            window.location.reload()
          }}
        >
          重置数据
        </Button>
      </div>

      <Tabs defaultActiveKey="location">
        <TabPane tab="地點維度" key="location">
          <div className="data-permission-tab-content">
            <div className="data-permission-header">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateLocation}>
                新建地點組
              </Button>
            </div>
            <Table
              columns={locationColumns}
              dataSource={locationGroups.slice((locationCurrentPage - 1) * locationPageSize, locationCurrentPage * locationPageSize)}
              rowKey="id"
              pagination={false}
              bordered
            />
            <div className="data-permission-pagination">
              <Pagination
                current={locationCurrentPage}
                pageSize={locationPageSize}
                total={locationGroups.length}
                showSizeChanger
                showQuickJumper
                showTotal={(total) => `共 ${total} 條數據`}
                onChange={(page, size) => {
                  setLocationCurrentPage(page)
                  if (size !== locationPageSize) {
                    setLocationPageSize(size)
                    setLocationCurrentPage(1)
                  }
                }}
              />
            </div>
          </div>
        </TabPane>

        <TabPane tab="商家維度" key="merchant">
          <div className="data-permission-tab-content">
            <div className="data-permission-header">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateMerchant}>
                新建商家組
              </Button>
            </div>
            <Table
              columns={merchantColumns}
              dataSource={merchantGroups.slice((merchantCurrentPage - 1) * merchantPageSize, merchantCurrentPage * merchantPageSize)}
              rowKey="id"
              pagination={false}
              bordered
            />
            <div className="data-permission-pagination">
              <Pagination
                current={merchantCurrentPage}
                pageSize={merchantPageSize}
                total={merchantGroups.length}
                showSizeChanger
                showQuickJumper
                showTotal={(total) => `共 ${total} 條數據`}
                onChange={(page, size) => {
                  setMerchantCurrentPage(page)
                  if (size !== merchantPageSize) {
                    setMerchantPageSize(size)
                    setMerchantCurrentPage(1)
                  }
                }}
              />
            </div>
          </div>
        </TabPane>
      </Tabs>

      {/* 地点组弹窗 */}
      <Modal
        title={currentLocationGroup ? '編輯地點組' : '新建地點組'}
        open={locationModalVisible}
        onOk={handleLocationSubmit}
        onCancel={() => setLocationModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={locationForm} layout="vertical">
          <Form.Item
            name="name"
            label="地點組名稱"
            rules={[{ required: true, message: '请输入地点组名称' }]}
          >
            <Input placeholder="例如：华南地区" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={2} placeholder="请输入描述" />
          </Form.Item>
          <Form.Item
            label="授權國家"
            rules={[{ required: true, message: '请选择国家' }]}
          >
            <Select
              value={selectedLocationCountry}
              onChange={handleLocationCountryChange}
              placeholder="请选择国家"
              options={countryOptions}
            />
          </Form.Item>
          <Form.Item label="選擇地點（{selectedLocationCountry ? countryOptions.find(c => c.key === selectedLocationCountry)?.label : '请选择国家'}）">
            <Tree
              checkable
              checkedKeys={checkedLocations}
              onCheck={(keys) => setCheckedLocations(keys as string[])}
              treeData={getFilteredLocationTree(selectedLocationCountry)}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 商家组弹窗 */}
      <Modal
        title={currentMerchantGroup ? '編輯商家組' : '新建商家組'}
        open={merchantModalVisible}
        onOk={handleMerchantSubmit}
        onCancel={() => setMerchantModalVisible(false)}
        width={800}
        okText={`保存 (${selectedMerchants.length} 個)`}
        cancelText="取消"
      >
        <Form form={merchantForm} layout="vertical">
          <Form.Item
            name="name"
            label="商家組名稱"
            rules={[{ required: true, message: '请输入商家组名称' }]}
          >
            <Input placeholder="例如：中国商家组" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={2} placeholder="请输入描述" />
          </Form.Item>
          <Form.Item
            label="授權國家"
            rules={[{ required: true, message: '请选择国家' }]}
          >
            <Select
              value={selectedMerchantCountry}
              onChange={handleMerchantCountryChange}
              placeholder="请选择国家"
              options={countryOptions}
            />
          </Form.Item>
          <Form.Item label="選擇商家（{selectedMerchantCountry ? countryOptions.find(c => c.key === selectedMerchantCountry)?.label : '请选择国家'}）">
            <Input.Search
              placeholder="搜索商家名稱、註冊地址"
              value={merchantSearchText}
              onChange={(e) => setMerchantSearchText(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Table
              columns={merchantTableColumns}
              dataSource={filteredMerchants}
              rowKey="id"
              pagination={false}
              size="small"
              rowSelection={{
                selectedRowKeys: selectedMerchants,
                onChange: (keys) => setSelectedMerchants(keys as string[]),
              }}
              scroll={{ y: 300 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
