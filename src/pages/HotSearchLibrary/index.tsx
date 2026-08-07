import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, message, Upload } from 'antd'
import type { TableColumnsType } from 'antd'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ImportOutlined,
  ExportOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

/* ===== 数据模型 ===== */

interface HotSearchWord {
  key: string
  wordId: string
  rank: number
  word: string
  category: string
  source: string
  brand: string
  searchEntry: string
  searchCount: number
  displayPosition: string
  status: 'active' | 'inactive'
  addedBy: string
  addedTime: string
  remark: string
}

/* ===== Mock 数据 ===== */

function makeMockData(): HotSearchWord[] {
  const words: Omit<HotSearchWord, 'key' | 'rank'>[] = [
    // mFood - 大首页
    { wordId: 'MF-HW001', word: '火鍋', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 45623, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '冬季熱門詞' },
    { wordId: 'MF-HW002', word: '珍珠奶茶', category: 'dessert', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 38456, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '穩定熱門詞' },
    { wordId: 'MF-HW003', word: '618大促', category: 'festival', source: 'operation', brand: 'mfood', searchEntry: 'home', searchCount: 35000, displayPosition: 'top', status: 'active', addedBy: '張曉明(E10023)', addedTime: '2026-06-05 10:30', remark: '618活動推廣' },
    { wordId: 'MF-HW004', word: '麥當勞', category: 'brand', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 32145, displayPosition: 'bottom', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '品牌詞' },
    { wordId: 'MF-HW005', word: '壽司', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'home', searchCount: 21000, displayPosition: 'bottom', status: 'active', addedBy: '系統', addedTime: '2026-06-07 09:00', remark: '' },
    // mFood - 外卖搜索
    { wordId: 'MF-HW010', word: '炸雞', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'takeaway', searchCount: 41000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '外賣熱門' },
    { wordId: 'MF-HW011', word: '漢堡包', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'takeaway', searchCount: 33000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW012', word: '燒臘飯', category: 'food', source: 'merchant', brand: 'mfood', searchEntry: 'takeaway', searchCount: 27000, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-06 09:15', remark: '' },
    { wordId: 'MF-HW013', word: '下午茶套餐', category: 'dessert', source: 'operation', brand: 'mfood', searchEntry: 'takeaway', searchCount: 24000, displayPosition: 'bottom', status: 'active', addedBy: '王美玲(E10089)', addedTime: '2026-06-08 14:20', remark: '下午茶時段' },
    // mFood - 超市搜索
    { wordId: 'MF-HW020', word: '生鮮蔬菜', category: 'supermarket', source: 'system', brand: 'mfood', searchEntry: 'supermarket', searchCount: 30000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW021', word: '牛奶', category: 'supermarket', source: 'system', brand: 'mfood', searchEntry: 'supermarket', searchCount: 28500, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW022', word: '零食大禮包', category: 'supermarket', source: 'merchant', brand: 'mfood', searchEntry: 'supermarket', searchCount: 18000, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-05 11:00', remark: '' },
    // mFood - 团购搜索
    { wordId: 'MF-HW030', word: '自助餐', category: 'food', source: 'system', brand: 'mfood', searchEntry: 'groupBuy', searchCount: 37000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'MF-HW031', word: 'SPA套餐', category: 'trending', source: 'operation', brand: 'mfood', searchEntry: 'groupBuy', searchCount: 25000, displayPosition: 'bottom', status: 'active', addedBy: '陳浩然(E10067)', addedTime: '2026-06-07 16:00', remark: '團購推廣' },
    // 闪峰 - 大首页
    { wordId: 'SF-HW001', word: '端午禮盒', category: 'festival', source: 'operation', brand: 'flashBee', searchEntry: 'home', searchCount: 34000, displayPosition: 'top', status: 'active', addedBy: '李婉婷(E10045)', addedTime: '2026-06-07 14:30', remark: '端午節推廣' },
    { wordId: 'SF-HW002', word: '咖啡', category: 'dessert', source: 'system', brand: 'flashBee', searchEntry: 'home', searchCount: 31500, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW003', word: '新開業優惠', category: 'brand', source: 'operation', brand: 'flashBee', searchEntry: 'home', searchCount: 28000, displayPosition: 'bottom', status: 'active', addedBy: '陳浩然(E10067)', addedTime: '2026-06-01 09:00', remark: '新店開業' },
    // 闪峰 - 外卖搜索
    { wordId: 'SF-HW010', word: '日式拉麵', category: 'food', source: 'system', brand: 'flashBee', searchEntry: 'takeaway', searchCount: 33200, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW011', word: '泰式炒河', category: 'food', source: 'system', brand: 'flashBee', searchEntry: 'takeaway', searchCount: 25500, displayPosition: 'bottom', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW012', word: '麻辣燙', category: 'food', source: 'merchant', brand: 'flashBee', searchEntry: 'takeaway', searchCount: 22000, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-06 15:00', remark: '' },
    // 闪峰 - 超市搜索
    { wordId: 'SF-HW020', word: '進口水果', category: 'supermarket', source: 'system', brand: 'flashBee', searchEntry: 'supermarket', searchCount: 27000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW021', word: '有機蔬菜', category: 'supermarket', source: 'merchant', brand: 'flashBee', searchEntry: 'supermarket', searchCount: 17500, displayPosition: 'bottom', status: 'inactive', addedBy: '商家提交', addedTime: '2026-06-06 09:15', remark: '' },
    // 闪峰 - 团购搜索
    { wordId: 'SF-HW030', word: '酒店自助餐', category: 'food', source: 'system', brand: 'flashBee', searchEntry: 'groupBuy', searchCount: 36000, displayPosition: 'top', status: 'active', addedBy: '系統', addedTime: '2026-06-08 10:00', remark: '' },
    { wordId: 'SF-HW031', word: '健身月卡', category: 'trending', source: 'operation', brand: 'flashBee', searchEntry: 'groupBuy', searchCount: 24000, displayPosition: 'bottom', status: 'active', addedBy: '李婉婷(E10045)', addedTime: '2026-06-04 11:00', remark: '團購推廣' },
  ]
  return words.map((w, i) => ({ ...w, key: String(i + 1), rank: 0 }))
    .sort((a, b) => b.searchCount - a.searchCount)
    .map((w, i) => ({ ...w, rank: i + 1 }))
}

const allData = makeMockData()

/* ===== 组件 ===== */

export default function HotSearchLibrary() {
  const { t } = useTranslation()
  const [filterBrand, setFilterBrand] = useState('all')
  const [activeEntry, setActiveEntry] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchWord | null>(null)
  const [form] = Form.useForm()

  // 筛选条件
  const [filterWord, setFilterWord] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | undefined>()
  const [filterSource, setFilterSource] = useState<string | undefined>()
  const [filterStatus, setFilterStatus] = useState<string | undefined>()

  // 根据品牌+入口筛选数据
  const filteredData = useMemo(() => {
    let data = allData
    if (filterBrand !== 'all') {
      data = data.filter(d => d.brand === filterBrand)
    }
    if (activeEntry !== 'all') {
      data = data.filter(d => d.searchEntry === activeEntry)
    }
    if (filterWord) {
      data = data.filter(d => d.word.toLowerCase().includes(filterWord.toLowerCase()))
    }
    if (filterCategory && filterCategory !== 'all') {
      data = data.filter(d => d.category === filterCategory)
    }
    if (filterSource && filterSource !== 'all') {
      data = data.filter(d => d.source === filterSource)
    }
    if (filterStatus && filterStatus !== 'all') {
      data = data.filter(d => d.status === filterStatus)
    }
    return data
  }, [filterBrand, activeEntry, filterWord, filterCategory, filterSource, filterStatus])

  const entryOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.channel.home'), value: 'home' },
    { label: t('dict.channel.takeawaySearch'), value: 'takeaway' },
    { label: t('dict.channel.supermarketSearch'), value: 'supermarket' },
    { label: t('dict.channel.groupBuySearch'), value: 'groupBuy' },
  ]

  const entryMap: Record<string, string> = {
    home: t('dict.channel.home'), takeaway: t('dict.channel.takeawaySearch'), supermarket: t('dict.channel.supermarketSearch'), groupBuy: t('dict.channel.groupBuySearch'),
  }

  const categoryOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.category.food'), value: 'food' },
    { label: t('dict.category.supermarket'), value: 'supermarket' },
    { label: t('dict.category.dessert'), value: 'dessert' },
    { label: t('dict.category.brand'), value: 'brand' },
    { label: t('dict.category.festival'), value: 'festival' },
    { label: t('dict.category.trending'), value: 'trending' },
  ]

  const sourceOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.wordSourceLib.system'), value: 'system' },
    { label: t('dict.wordSourceLib.operation'), value: 'operation' },
    { label: t('dict.wordSourceLib.merchant'), value: 'merchant' },
  ]

  const statusOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.status.active'), value: 'active' },
    { label: t('dict.status.inactive'), value: 'inactive' },
  ]

  const categoryMap: Record<string, string> = {
    food: t('dict.category.food'), supermarket: t('dict.category.supermarket'), dessert: t('dict.category.dessert'),
    brand: t('dict.category.brand'), festival: t('dict.category.festival'), trending: t('dict.category.trending'),
  }

  const displayPositionOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.displayPosition.top'), value: 'top' },
    { label: t('dict.displayPosition.bottom'), value: 'bottom' },
  ]

  const displayPositionMap: Record<string, string> = { top: t('dict.displayPosition.top'), bottom: t('dict.displayPosition.bottom') }

  const handleReset = () => {
    setFilterWord('')
    setFilterCategory(undefined)
    setFilterSource(undefined)
    setFilterStatus(undefined)
    setFilterBrand('all')
    setActiveEntry('all')
  }

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      brand: filterBrand === 'all' ? 'mfood' : filterBrand,
      searchEntry: activeEntry === 'all' ? 'home' : activeEntry,
      category: 'food',
      source: 'operation',
      displayPosition: 'bottom',
      status: 'active',
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchWord) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: HotSearchWord) => {
    Modal.confirm({
      title: t('hotSearchLibrary.deleteTitle'),
      content: t('hotSearchLibrary.deleteContent', { word: record.word }),
      okText: t('common.confirm'), okType: 'danger', cancelText: t('common.cancel'),
      onOk: () => message.success(t('common.deleteSuccess')),
    })
  }

  const handleToggleStatus = (record: HotSearchWord) => {
    const action = record.status === 'active' ? t('common.disable') : t('common.enable')
    Modal.confirm({
      title: t('common.confirmOperation'),
      content: t('hotSearchLibrary.toggleContent', { word: record.word, action }),
      okText: t('common.confirm'), cancelText: t('common.cancel'),
      onOk: () => message.success(t('hotSearchLibrary.toggled', { action })),
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? t('common.updateSuccess') : t('common.addSuccess'))
      setIsModalOpen(false)
    })
  }

  /* 表格列 */
  const columns: TableColumnsType<HotSearchWord> = [
    {
      title: t('hotSearchLibrary.colRank'), dataIndex: 'rank', key: 'rank', width: 70, align: 'center',
      render: (v: number) => {
        const colors = ['#ff4d4f', '#fa8c16', '#fadb14']
        if (v <= 3) return <Tag color={colors[v - 1]} style={{ fontWeight: 'bold', minWidth: 32, textAlign: 'center' }}>{v}</Tag>
        return <span style={{ color: '#999' }}>{v}</span>
      },
    },
    {
      title: t('hotSearchLibrary.colWord'), dataIndex: 'word', key: 'word', width: 180,
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: t('hotSearchLibrary.colCategory'), dataIndex: 'category', key: 'category', width: 110,
      render: (v: string) => <Tag color="blue">{categoryMap[v]}</Tag>,
    },
    {
      title: t('hotSearchLibrary.colBrand'), dataIndex: 'brand', key: 'brand', width: 90,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    {
      title: t('hotSearchLibrary.colEntry'), dataIndex: 'searchEntry', key: 'searchEntry', width: 110,
      render: (v: string) => <Tag color="geekblue">{entryMap[v]}</Tag>,
    },
    {
      title: t('hotSearchLibrary.colSource'), dataIndex: 'source', key: 'source', width: 100,
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          system: { color: 'cyan', text: t('dict.wordSourceLib.system') },
          operation: { color: 'purple', text: t('dict.wordSourceLib.operation') },
          merchant: { color: 'orange', text: t('dict.wordSourceLib.merchant') },
        }
        const c = map[v] || { color: 'default', text: v }
        return <Tag color={c.color}>{c.text}</Tag>
      },
    },
    {
      title: t('hotSearchLibrary.colSearchCount'), dataIndex: 'searchCount', key: 'searchCount', width: 110,
      sorter: (a, b) => a.searchCount - b.searchCount,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: t('hotSearchLibrary.colPosition'), dataIndex: 'displayPosition', key: 'displayPosition', width: 80,
      render: (v: string) => <Tag color={v === 'top' ? 'orange' : 'default'}>{displayPositionMap[v] || v}</Tag>,
    },
    {
      title: t('hotSearchLibrary.colStatus'), dataIndex: 'status', key: 'status', width: 70,
      render: (v: string) => v === 'active' ? <Tag color="success">{t('dict.status.active')}</Tag> : <Tag color="default">{t('dict.status.inactive')}</Tag>,
    },
    {
      title: t('hotSearchLibrary.colAddedBy'), dataIndex: 'addedBy', key: 'addedBy', width: 140, ellipsis: true,
    },
    {
      title: t('hotSearchLibrary.colAddedTime'), dataIndex: 'addedTime', key: 'addedTime', width: 150,
    },
    {
      title: t('common.colAction'), key: 'action', width: 140, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger={record.status === 'active'} style={record.status !== 'active' ? { color: '#52c41a' } : undefined} onClick={() => handleToggleStatus(record)}>
            {record.status === 'active' ? t('common.disable') : t('common.enable')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
          <Form layout="inline">
          <Form.Item label={t('hotSearchLibrary.searchWord')}>
            <Input
              placeholder={t('hotSearchLibrary.searchWordPlaceholder')}
              allowClear
              value={filterWord}
              onChange={e => setFilterWord(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchLibrary.searchBrand')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={filterBrand}
              onChange={v => { setFilterBrand(v); setActiveEntry('all') }}
              options={brandOptions}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchLibrary.searchEntry')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={activeEntry}
              onChange={v => setActiveEntry(v || 'all')}
              options={entryOptions}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchLibrary.searchCategory')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={filterCategory}
              onChange={setFilterCategory}
              options={categoryOptions}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchLibrary.searchSource')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={filterSource}
              onChange={setFilterSource}
              options={sourceOptions}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchLibrary.searchStatus')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              options={statusOptions}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
          </Form>
        </div>

      {/* 操作区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-import" icon={<ImportOutlined />} onClick={() => message.info(t('hotSearchLibrary.importDev'))}>{t('common.batchImport')}</Button>
          <Button className="btn-export" icon={<ExportOutlined />} onClick={() => message.success(t('common.exportSuccess'))}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('hotSearchLibrary.addWord')}</Button>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HotSearchWord>
          columns={columns}
          dataSource={filteredData}
          rowSelection={{}}
          pagination={{
            total: filteredData.length,
            pageSize: 10,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1600 }}
          locale={{ emptyText: t('hotSearchLibrary.emptyText') }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? t('hotSearchLibrary.editTitle') : t('hotSearchLibrary.addTitle')}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t('hotSearchLibrary.colWord')} name="word" rules={[{ required: true, message: t('hotSearchLibrary.wordRequired') }]}>
            <Input placeholder={t('hotSearchLibrary.wordPlaceholder')} maxLength={50} showCount />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchLibrary.brandLabel')} name="brand" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label={t('hotSearchLibrary.entryLabel')} name="searchEntry" rules={[{ required: true, message: t('hotSearchLibrary.entryRequired') }]} style={{ flex: 1 }}>
              <Select options={entryOptions.filter(e => e.value !== 'all')} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchLibrary.categoryLabel')} name="category" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={categoryOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label={t('hotSearchLibrary.sourceLabel')} name="source" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={sourceOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
          </div>

          <Form.Item label={t('hotSearchLibrary.positionLabel')} name="displayPosition" rules={[{ required: true, message: t('hotSearchLibrary.positionRequired') }]}>
            <Select options={displayPositionOptions.filter(o => o.value !== 'all')} />
          </Form.Item>

          <Form.Item label={t('hotSearchLibrary.imageLabel')} name="imageUrl" extra={t('hotSearchLibrary.imageExtra')}>
            <Upload listType="picture-card" maxCount={1} accept=".jpg,.jpeg,.png" beforeUpload={() => false}>
              <div><PlusCircleOutlined /><div style={{ marginTop: 6, fontSize: 12 }}>{t('hotSearchLibrary.uploadImage')}</div></div>
            </Upload>
          </Form.Item>

          <Form.Item label={t('hotSearchLibrary.remarkLabel')} name="remark">
            <TextArea rows={3} placeholder={t('hotSearchLibrary.remarkPlaceholder')} maxLength={200} showCount />
          </Form.Item>

          <Form.Item label={t('hotSearchLibrary.statusLabel')} name="status">
            <Select options={statusOptions.filter(o => o.value !== 'all')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
