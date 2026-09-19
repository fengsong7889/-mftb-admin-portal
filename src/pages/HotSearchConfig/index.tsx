import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Space, Input, InputNumber, Select, Table, Tag, Modal, Form, DatePicker,
  ColorPicker, Upload, message, Popover, Radio, Switch,
} from 'antd'
import type { TableColumnsType, RadioChangeEvent } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, UploadOutlined,
  EyeOutlined, TranslationOutlined, FireOutlined,
  SmileOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { fetchAdAlgorithms } from '../../api/adPromotion'
import { fetchStores } from '../../api/store'

const { RangePicker } = DatePicker

/* ======================== 常量定义 ======================== */

/** 常用表情 */
const emojiOptions = ['🔥', '⭐', '🎉', '🎊', '💥', '🆕', '👑', '🎁', '💰', '🏷️', '🍜', '🍕', '🍔', '🧋', '🍰', '☕']

/* ======================== 接口 & 类型 ======================== */

interface HotSearchRecord {
  key: string
  id: number
  word: string
  wordEn: string
  wordSource: string
  libMode: string
  hotSearchRank: number | null
  promotionType: string
  jumpType: string
  jumpTarget: string
  searchEntry: string
  brand: string
  terminal: string[]
  region: string[]
  timeSlot: string[]
  displayMode: string
  displayTimeRange: [string, string] | null
  startDate: string
  endDate: string
  hasImage: boolean
  imageUrl?: string
  imageUrlEn?: string
  sortOrder: number
  status: string
  updateTime: string
}

/* ======================== 组件 ======================== */

export default function HotSearchConfig() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<HotSearchRecord | null>(null)
  const [form] = Form.useForm()
  const [wordSource, setWordSource] = useState<string>('custom')
  const [libMode, setLibMode] = useState<string>('specific')
  const [promotionType, setPromotionType] = useState<string>('merchant')
  const [jumpType, setJumpType] = useState<string>('none')
  const [displayMode, setDisplayMode] = useState<string>('text')
  const [autoRankBusiness, setAutoRankBusiness] = useState<string[]>([])
  const [autoRankDays, setAutoRankDays] = useState<number>(30)
  const [autoRankTop, setAutoRankTop] = useState<number>(10)

  // 列表数据（待接入后端 API）
  const [data] = useState<HotSearchRecord[]>([])
  const [total] = useState(0)

  // 搜索区域：品牌 → 算法 → 门店 级联状态
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStore, setSearchStore] = useState<string | null>(null)
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])

  // 品牌变更 → 重新加载算法列表，清空算法和门店
  const handleSearchBrandChange = (value: string | undefined) => {
    setSearchBrand(value ?? null)
    setSearchAlgorithm(null)
    setSearchStore(null)
    setAlgorithmOptions([])
    setStoreOptions([])
  }

  // 算法变更 → 重新加载门店列表，清空门店
  const handleSearchAlgorithmChange = (value: string | null) => {
    setSearchAlgorithm(value)
    setSearchStore(null)
    setStoreOptions([])
    if (searchBrand && value) {
      fetchStores({ brand: searchBrand, size: 200 }).then(res => {
        const records = res.records || []
        setStoreOptions(
          records.map(s => ({ label: `${s.storeName}（${s.storeCode}）`, value: s.storeCode }))
        )
      }).catch(() => {})
    }
  }

  // 品牌变更时自动加载算法列表（按品牌过滤）
  useEffect(() => {
    if (!searchBrand) {
      setAlgorithmOptions([])
      return
    }
    fetchAdAlgorithms({ page: 1, size: 200, brand: searchBrand, status: 1 })
      .then(res => {
        if (!res) return
        const records = res.records.filter(a => a.updatedBy !== '系統')
        setAlgorithmOptions(
          records.map(a => ({ label: a.algoName, value: String(a.id) }))
        )
      }).catch(() => {})
  }, [searchBrand])

  /** 搜索入口（合并原 searchPage + searchChannel） */
  const searchEntryOptions = [
    { label: t('dict.channel.home'), value: 'home' },
    { label: t('dict.channel.takeawaySearch'), value: 'takeaway' },
    { label: t('dict.channel.supermarketSearch'), value: 'supermarket' },
    { label: t('dict.channel.groupBuySearch'), value: 'groupBuy' },
  ]

  /** 展示終端 */
  const terminalOptions = [
    { label: t('dict.terminal.app'), value: 'app' },
    { label: t('dict.terminal.wechatMini'), value: 'wechatMini' },
  ]

  /** 展示區域 */
  const regionOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.region.macau'), value: 'macau' },
    { label: t('dict.region.taipa'), value: 'taipa' },
    { label: t('dict.region.zhuhai'), value: 'zhuhai' },
  ]

  /** 時段 */
  const timeSlotOptions = [
    { label: t('dict.timeSlot.allDay'), value: 'allDay' },
    { label: t('dict.timeSlot.breakfast'), value: 'breakfast' },
    { label: t('dict.timeSlot.lunch'), value: 'lunch' },
    { label: t('dict.timeSlot.afternoonTea'), value: 'afternoonTea' },
    { label: t('dict.timeSlot.dinner'), value: 'dinner' },
    { label: t('dict.timeSlot.midnightSnack'), value: 'midnightSnack' },
  ]

  /** 熱搜詞來源 */
  const wordSourceOptions = [
    { label: t('dict.wordSource.custom'), value: 'custom' },
    { label: t('dict.wordSource.hotSearchLib'), value: 'hotSearchLib' },
  ]

  /** 詞庫二級模式 */
  const libModeOptions = [
    { label: t('dict.libMode.specific'), value: 'specific' },
    { label: t('dict.libMode.autoRank'), value: 'autoRank' },
  ]

  /** 推廣類型 */
  const promotionTypeOptions = [
    { label: t('dict.promotionType.merchant'), value: 'merchant' },
    { label: t('dict.promotionType.activity'), value: 'activity' },
    { label: t('dict.promotionType.hotSearch'), value: 'hotSearch' },
  ]

  /** 跳轉類型（按推廣類型動態過濾） */
  const allJumpTypeOptions = [
    { label: t('dict.jumpType.none'), value: 'none' },
    { label: t('dict.jumpType.merchantPage'), value: 'merchantPage' },
    { label: t('dict.jumpType.h5'), value: 'h5' },
    { label: t('dict.jumpType.appPage'), value: 'appPage' },
  ]

  /** APP頁面 */
  const appPageOptions = [
    { label: t('dict.jumpType.personalCenter'), value: 'personalCenter' },
    { label: t('dict.jumpType.checkInCenter'), value: 'checkInCenter' },
    { label: t('dict.jumpType.claimCenter'), value: 'claimCenter' },
    { label: t('dict.jumpType.orderPage'), value: 'orderPage' },
  ]

  /** 展示模式 */
  const displayModeOptions = [
    { label: t('dict.displayMode.text'), value: 'text' },
    { label: t('dict.displayMode.image'), value: 'image' },
  ]

  /** 展示映射 */
  const searchEntryMap: Record<string, string> = {
    home: t('dict.channel.home'), takeaway: t('dict.channel.takeawaySearch'),
    supermarket: t('dict.channel.supermarketSearch'), groupBuy: t('dict.channel.groupBuySearch'),
  }
  const regionMap: Record<string, string> = { macau: t('dict.region.macau'), taipa: t('dict.region.taipa'), zhuhai: t('dict.region.zhuhai') }
  const timeSlotMap: Record<string, string> = {
    allDay: t('dict.timeSlot.allDay'), breakfast: t('dict.timeSlot.breakfast'), lunch: t('dict.timeSlot.lunch'),
    afternoonTea: t('dict.timeSlot.afternoonTea'), dinner: t('dict.timeSlot.dinner'), midnightSnack: t('dict.timeSlot.midnightSnack'),
  }
  const wordSourceMap: Record<string, string> = { custom: t('dict.wordSource.custom'), hotSearchLib: t('dict.wordSource.hotSearchLib') }
  const promotionTypeMap: Record<string, string> = {
    merchant: t('dict.promotionType.merchant'), activity: t('dict.promotionType.activity'), hotSearch: t('dict.promotionType.hotSearch'),
  }
  const displayModeMap: Record<string, string> = { text: t('dict.displayMode.textShort'), image: t('dict.displayMode.imageShort') }

  // 实时预览 watch
  const watchWord = Form.useWatch('word', form)
  const watchBorderColor = Form.useWatch('borderColor', form)
  const watchBgColor = Form.useWatch('bgColor', form)
  const watchFontColor = Form.useWatch('fontColor', form)

  /** 根据推广类型获取可用跳转选项 */
  const getJumpOptions = useCallback((promoType: string) => {
    if (promoType === 'merchant') {
      return allJumpTypeOptions.filter(o => ['none', 'merchantPage', 'h5'].includes(o.value))
    }
    // activity 和 hotSearch 支持所有跳转
    return allJumpTypeOptions
  }, [allJumpTypeOptions])

  /** 是否为自动获取排名模式（隐藏跳转配置） */
  const isAutoRank = wordSource === 'hotSearchLib' && libMode === 'autoRank'

  /** 自动翻译（模拟） */
  const handleAutoTranslate = () => {
    const word = form.getFieldValue('word')
    if (!word) { message.warning(t('hotSearchConfig.translateWarning')); return }
    
    // 模拟调用翻译API
    message.loading(t('hotSearchConfig.translating'), 0.5)
    
    setTimeout(() => {
      // 模拟翻译结果
      const mockTranslations: Record<string, string> = {
        '火鍋': 'Hot Pot', '奶茶': 'Milk Tea', '炸雞': 'Fried Chicken',
        '壽司': 'Sushi', '拉麵': 'Ramen', '漢堡': 'Burger',
        '限時火鍋優惠': 'Limited Time Hot Pot Deal',
        '美味漢堡': 'Delicious Burger',
        '下午茶限時折扣': 'Afternoon Tea Limited Discount',
      }
      
      // 清理表情符号
      const cleanWord = word.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
      const translated = mockTranslations[cleanWord] || cleanWord.split('').map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('').slice(0, 15)
      
      form.setFieldsValue({ wordEn: translated })
      message.success(t('hotSearchConfig.translateDone'))
    }, 500)
  }

  /** 15条上限校验 */
  const checkSlotLimit = (brand: string, searchEntry: string, startDate: string, endDate: string): boolean => {
    const count = data.filter(d =>
      d.brand === brand && d.searchEntry === searchEntry &&
      d.startDate <= endDate && d.endDate >= startDate &&
      d.status === 'active'
    ).length
    if (editingRecord) {
      // 编辑模式排除自身
      const selfCount = data.filter(d =>
        d.key === editingRecord.key && d.brand === brand && d.searchEntry === searchEntry
      ).length
      return (count - selfCount) >= 15
    }
    return count >= 15
  }

  /* ==================== CRUD ==================== */

  const handleAdd = () => {
    setEditingRecord(null)
    setWordSource('custom')
    setLibMode('specific')
    setPromotionType('merchant')
    setJumpType('none')
    setDisplayMode('text')
    setAutoRankBusiness([])
    setAutoRankDays(30)
    setAutoRankTop(10)
    form.resetFields()
    form.setFieldsValue({
      wordSource: 'custom', libMode: 'specific', promotionType: 'merchant',
      searchEntry: 'home', status: 'active', timeSlot: 'allDay',
      region: ['macau'], terminal: ['app'], jumpType: 'none', displayMode: 'text',
      borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333333',
      displayTimeRange: null, sortOrder: 1,
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchRecord) => {
    setEditingRecord(record)
    setWordSource(record.wordSource)
    setLibMode(record.libMode || 'specific')
    setPromotionType(record.promotionType)
    setJumpType(record.jumpType || 'none')
    setDisplayMode(record.displayMode || 'text')
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDetail = (record: HotSearchRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  const handleDelete = (record: HotSearchRecord) => {
    Modal.confirm({
      title: t('hotSearchConfig.deleteTitle'),
      content: t('hotSearchConfig.deleteContent', { word: record.word }),
      okText: t('common.confirm'), cancelText: t('common.cancel'),
      onOk: () => message.success(t('common.deleteSuccess')),
    })
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      // 15条上限校验
      const dateRange = values.dateRange
      if (dateRange && values.brand && values.searchEntry) {
        const start = dateRange[0]?.format?.('YYYY-MM-DD') || ''
        const end = dateRange[1]?.format?.('YYYY-MM-DD') || ''
        if (checkSlotLimit(values.brand, values.searchEntry, start, end)) {
          Modal.warning({
            title: t('hotSearchConfig.limitTitle'),
            content: t('hotSearchConfig.limitContent'),
          })
          return
        }
      }
      message.success(editingRecord ? t('common.updateSuccess') : t('common.addSuccess'))
      setIsModalOpen(false)
    })
  }

  /* ==================== 列配置 ==================== */

  const columnMeta = useMemo(() => [
    { key: 'id', title: t('hotSearchConfig.colId') },
    { key: 'brand', title: t('hotSearchConfig.colBrand') },
    { key: 'word', title: t('hotSearchConfig.colWord') },
    { key: 'wordEn', title: t('hotSearchConfig.colWordEn') },
    { key: 'wordSource', title: t('hotSearchConfig.colWordSource') },
    { key: 'promotionType', title: t('hotSearchConfig.colPromotionType') },
    { key: 'searchEntry', title: t('hotSearchConfig.colSearchEntry') },
    { key: 'region', title: t('hotSearchConfig.colRegion') },
    { key: 'timeSlot', title: t('hotSearchConfig.colTimeSlot') },
    { key: 'displayMode', title: t('hotSearchConfig.colDisplayMode') },
    { key: 'dateRange', title: t('hotSearchConfig.colDateRange') },
    { key: 'sortOrder', title: t('hotSearchConfig.colSortOrder') },
    { key: 'status', title: t('hotSearchConfig.colStatus') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('hot-search-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<HotSearchRecord> = [
    { title: t('hotSearchConfig.colId'), dataIndex: 'id', key: 'id', width: 90, render: (v: number) => `#${v}` },
    { 
      title: t('hotSearchConfig.colBrand'), 
      dataIndex: 'brand', 
      key: 'brand', 
      width: 100,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    { 
      title: t('hotSearchConfig.colWord'), 
      dataIndex: 'word', 
      key: 'word', 
      width: 180, 
      render: (v: string, record: HotSearchRecord) => {
        // 图片模式展示 - 轮播文字+表情
        if (record.displayMode === 'image' && record.hasImage) {
          // 根据ID使用不同的渐变色
          const gradientMap: Record<number, string> = {
            1003: 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)', // 红色-橙色
            1005: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)', // 紫色
            1007: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', // 绿色
            1009: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', // 橙黄色
          }
          const bgGradient = gradientMap[record.id] || 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)'
          
          return (
            <div 
              style={{
                width: 100,
                height: 20,
                borderRadius: 10,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 2px 6px rgba(232, 114, 12, 0.25)',
                background: bgGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  animation: 'marquee 6s linear infinite',
                  whiteSpace: 'nowrap',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 11 }}>🔥</span>
                <span>{v.replace(/\p{Extended_Pictographic}/gu, '').trim()}</span>
                <span style={{ fontSize: 11 }}>⭐</span>
                <span>{v.replace(/\p{Extended_Pictographic}/gu, '').trim()}</span>
              </div>
            </div>
          )
        }
        // 文字模式展示
        return v
      }
    },
    { 
      title: t('hotSearchConfig.colWordEn'), 
      dataIndex: 'wordEn', 
      key: 'wordEn', 
      width: 180, 
      render: (v: string, record: HotSearchRecord) => {
        // 图片模式展示 - 轮播文字+表情
        if (record.displayMode === 'image' && record.hasImage) {
          // 根据ID使用不同的渐变色
          const gradientMap: Record<number, string> = {
            1003: 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)', // 红色-橙色
            1005: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)', // 紫色
            1007: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', // 绿色
            1009: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', // 橙黄色
          }
          const bgGradient = gradientMap[record.id] || 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)'
          
          return (
            <div 
              style={{
                width: 100,
                height: 20,
                borderRadius: 10,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 2px 6px rgba(232, 114, 12, 0.25)',
                background: bgGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  animation: 'marquee 6s linear infinite',
                  whiteSpace: 'nowrap',
                  color: '#FFFFFF',
                  fontSize: 9,
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 10 }}>🎉</span>
                <span>{v || 'Deal'}</span>
                <span style={{ fontSize: 10 }}>🎊</span>
                <span>{v || 'Deal'}</span>
              </div>
            </div>
          )
        }
        // 文字模式展示
        return v || '-'
      }
    },
    { title: t('hotSearchConfig.colWordSource'), dataIndex: 'wordSource', key: 'wordSource', width: 90,
      render: (v: string, r: HotSearchRecord) => (
        <Tag color={v === 'hotSearchLib' ? 'orange' : 'blue'}>
          {wordSourceMap[v]}{v === 'hotSearchLib' && r.libMode === 'autoRank' ? t('hotSearchConfig.rankPrefix', { rank: r.hotSearchRank }) : ''}
        </Tag>
      ),
    },
    { title: t('hotSearchConfig.colPromotionType'), dataIndex: 'promotionType', key: 'promotionType', width: 90, render: (v: string) => <Tag color={v === 'merchant' ? 'blue' : v === 'activity' ? 'orange' : 'green'}>{promotionTypeMap[v]}</Tag> },
    { title: t('hotSearchConfig.colSearchEntry'), dataIndex: 'searchEntry', key: 'searchEntry', width: 90, render: (v: string) => searchEntryMap[v] },
    { title: t('hotSearchConfig.colRegion'), dataIndex: 'region', key: 'region', width: 100, render: (v: string[]) => v.map(r => regionMap[r]).join('、') },
    { title: t('hotSearchConfig.colTimeSlot'), dataIndex: 'timeSlot', key: 'timeSlot', width: 100, render: (v: string) => timeSlotMap[v] || v },
    { title: t('hotSearchConfig.colDisplayMode'), dataIndex: 'displayMode', key: 'displayMode', width: 80, render: (v: string) => <Tag color={v === 'image' ? 'purple' : 'cyan'}>{displayModeMap[v] || t('dict.displayMode.textShort')}</Tag> },
    { title: t('hotSearchConfig.colDateRange'), key: 'dateRange', width: 210, render: (_: unknown, r: HotSearchRecord) => <span style={{ whiteSpace: 'nowrap' }}>{`${r.startDate} ~ ${r.endDate}`}</span> },
    { 
      title: t('hotSearchConfig.colSortOrder'), 
      dataIndex: 'sortOrder', 
      key: 'sortOrder', 
      width: 70, 
      align: 'center',
      render: (v: number) => (
        <InputNumber 
          min={1} 
          max={999} 
          value={v} 
          size="small" 
          style={{ width: 60 }}
          onChange={(val) => {
            message.success(t('hotSearchConfig.sortUpdated', { val }))
          }}
        />
      )
    },
    { title: t('hotSearchConfig.colStatus'), dataIndex: 'status', key: 'status', width: 80, render: (v: string) => <Switch checked={v === 'active'} checkedChildren={t('dict.status.enable')} unCheckedChildren={t('dict.status.disable')} disabled /> },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: HotSearchRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>{t('common.detail')}</Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  /* ==================== 预览颜色处理 ==================== */
  const previewBorderColor = typeof watchBorderColor === 'string' ? watchBorderColor : watchBorderColor?.toHexString?.() || '#E8720C'
  const previewBgColor = typeof watchBgColor === 'string' ? watchBgColor : watchBgColor?.toHexString?.() || '#FFF7ED'
  const previewFontColor = typeof watchFontColor === 'string' ? watchFontColor : watchFontColor?.toHexString?.() || '#333333'
  const previewWord = watchWord || t('hotSearchConfig.previewWord')

  /* ==================== 渲染 ==================== */

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('hotSearchConfig.searchBrand')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={searchBrand}
              onChange={handleSearchBrandChange}
              options={brandOptions}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchAlgorithm')}>
            <Select
              placeholder={searchBrand ? t('adSales.algoSearchPlaceholder') : t('adSales.selectBrandFirst')}
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchAlgorithm}
              onChange={handleSearchAlgorithmChange}
              options={algorithmOptions}
              disabled={!searchBrand}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchStore')}>
            <Select
              placeholder={searchAlgorithm ? t('common.placeholderSelect') : t('algorithm.selectAlgorithmFirst')}
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchStore}
              onChange={v => setSearchStore(v ?? null)}
              options={storeOptions}
              disabled={!searchAlgorithm}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchWord')}>
            <Input placeholder={t('hotSearchConfig.searchWordPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchWordSource')}>
            <Select placeholder={t('common.all')} allowClear options={wordSourceOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchPromotionType')}>
            <Select placeholder={t('common.all')} allowClear options={promotionTypeOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchEntry')}>
            <Select placeholder={t('common.all')} allowClear options={searchEntryOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchRegion')}>
            <Select placeholder={t('common.all')} allowClear options={regionOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchStatus')}>
            <Select placeholder={t('common.all')} allowClear options={[{ label: t('dict.status.enable'), value: 'active' }, { label: t('dict.status.disable'), value: 'inactive' }]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setSearchBrand(null); setSearchAlgorithm(null); setSearchStore(null)
                setAlgorithmOptions([]); setStoreOptions([])
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<EyeOutlined />} onClick={() => navigate('/hot-search-verify')}>{t('common.preview')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('hotSearchConfig.addWord')}</Button>
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HotSearchRecord>
          columns={applyConfig(columns)}
          dataSource={data}
          rowSelection={{}}
          pagination={{
            total,
            pageSize: 10,
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1800 }}
        />
      </div>

      {/* ==================== 新增/编辑弹窗 ==================== */}
      <Modal
        title={editingRecord ? t('hotSearchConfig.editTitle') : t('hotSearchConfig.addTitle')}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

          {/* ===== 行1：搜索入口 + 资产品牌 + 展示终端（置顶） ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchConfig.searchEntryLabel')} name="searchEntry" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={searchEntryOptions} disabled={!!editingRecord} onChange={(v) => {
                // 非大首页时，自动同步业务频道
                if (v !== 'home' && wordSource === 'hotSearchLib' && libMode === 'autoRank') {
                  setAutoRankBusiness([v])
                }
              }} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.brandLabel')} name="brand" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} disabled={!!editingRecord} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.terminalLabel')} name="terminal" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select mode="multiple" options={terminalOptions} placeholder={t('hotSearchConfig.terminalPlaceholder')} disabled={!!editingRecord} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchConfig.displayModeLabel')} name="displayMode" style={{ flex: 1 }}>
              <Radio.Group options={displayModeOptions} optionType="button" buttonStyle="solid"
                disabled={!!editingRecord}
                onChange={(e: RadioChangeEvent) => setDisplayMode(e.target.value as string)} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.wordSourceLabel')} name="wordSource" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={wordSourceOptions} disabled={!!editingRecord} onChange={(v) => {
                setWordSource(v)
                if (v === 'custom') {
                  setLibMode('specific'); form.setFieldsValue({ libMode: 'specific' })
                }
                if (v === 'hotSearchLib' && libMode === 'autoRank') {
                  setPromotionType('hotSearch'); form.setFieldsValue({ promotionType: 'hotSearch' })
                }
              }} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.promotionTypeLabel')} name="promotionType" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select
                options={isAutoRank
                  ? promotionTypeOptions.filter(o => o.value === 'hotSearch')
                  : promotionTypeOptions
                }
                disabled={!!editingRecord}
                onChange={(v) => {
                  setPromotionType(v)
                  if (v === 'merchant' && jumpType === 'appPage') {
                    setJumpType('none'); form.setFieldsValue({ jumpType: 'none' })
                  }
                }}
              />
            </Form.Item>
          </div>

          {wordSource === 'hotSearchLib' && (
            <Form.Item label={t('hotSearchConfig.libModeLabel')} name="libMode" rules={[{ required: true }]}>
              <Select options={libModeOptions} disabled={!!editingRecord} onChange={(v) => {
                setLibMode(v)
                if (v === 'autoRank') {
                  setJumpType('none'); form.setFieldsValue({ jumpType: 'none' })
                  setPromotionType('hotSearch'); form.setFieldsValue({ promotionType: 'hotSearch' })
                }
              }} />
            </Form.Item>
          )}

          {/* ===== 热搜词输入（根据词来源和模式动态展示） ===== */}
          {wordSource === 'custom' && displayMode === 'text' && (
            <>
              <Form.Item label={t('hotSearchConfig.wordLabel')} name="word" rules={[{ required: true, message: t('hotSearchConfig.wordRequired') }]}>
                <Input 
                  placeholder={t('hotSearchConfig.wordPlaceholder')} 
                  maxLength={15} 
                  showCount 
                  suffix={
                    <Popover
                      content={
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 280 }}>
                          {emojiOptions.map(emoji => (
                            <span
                              key={emoji}
                              style={{ fontSize: 22, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, border: '1px solid #F0F0F0' }}
                              onClick={() => {
                                const current = form.getFieldValue('word') || ''
                                form.setFieldsValue({ word: current + emoji })
                              }}
                            >
                              {emoji}
                            </span>
                          ))}
                        </div>
                      }
                      trigger="click"
                      placement="bottomRight"
                    >
                      <SmileOutlined style={{ cursor: 'pointer', color: '#1677FF' }} />
                    </Popover>
                  }
                />
              </Form.Item>
            </>
          )}

          {/* 图片模式不显示热搜词输入框 */}
          {wordSource === 'custom' && displayMode === 'image' && (
            <Form.Item label={t('hotSearchConfig.imageLabel')} name="imageUrl" rules={[{ required: true, message: t('hotSearchConfig.imageRequired') }]}>
              <Upload listType="picture-card" maxCount={1}>
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>{t('hotSearchConfig.uploadImage')}</div>
                </div>
              </Upload>
            </Form.Item>
          )}

          {wordSource === 'hotSearchLib' && libMode === 'specific' && (
            <Form.Item label={t('hotSearchConfig.selectWordLabel')} name="word" rules={[{ required: true, message: t('hotSearchConfig.selectWordRequired') }]}>
              <Select
                showSearch
                placeholder={t('hotSearchConfig.selectWordPlaceholder')}
                options={[] as Array<{ label: string; value: string }>}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
          )}

          {/* ===== 自动获取排名（输入框模式） ===== */}
          {wordSource === 'hotSearchLib' && libMode === 'autoRank' && (
            <div style={{ background: '#FFF7ED', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <Form.Item label={t('hotSearchConfig.bizChannelLabel')} name="autoRankBusiness" rules={[{ required: true, message: t('hotSearchConfig.bizChannelRequired') }]}>
                <Select
                  mode={form.getFieldValue('searchEntry') === 'home' ? 'multiple' : undefined}
                  options={searchEntryOptions}
                  placeholder={t('hotSearchConfig.bizChannelPlaceholder')}
                  value={autoRankBusiness}
                  onChange={(v) => {
                    const val = Array.isArray(v) ? v : [v]
                    setAutoRankBusiness(val)
                  }}
                  disabled={form.getFieldValue('searchEntry') !== 'home'}
                />
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {form.getFieldValue('searchEntry') === 'home'
                    ? t('hotSearchConfig.homeMultiTip')
                    : t('hotSearchConfig.followEntryTip')
                  }
                </div>
              </Form.Item>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: '#333' }}>{t('hotSearchConfig.autoDaysPrefix')}</span>
                <InputNumber
                  min={1} max={90} value={autoRankDays}
                  onChange={(v) => setAutoRankDays(v || 30)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>{t('hotSearchConfig.autoDaysSuffix')}</span>
                <InputNumber
                  min={1} max={50} value={autoRankTop}
                  onChange={(v) => setAutoRankTop(v || 10)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>{t('hotSearchConfig.autoTopSuffix')}</span>
              </div>
              <div style={{ fontSize: 12, color: '#E8720C', marginTop: 8 }}>
                {t('hotSearchConfig.autoRankTip')}
              </div>
            </div>
          )}

          {/* ===== 英文字段（非自动排名 + 文字模式） ===== */}
          {displayMode === 'text' && !isAutoRank && (
            <Form.Item label={t('hotSearchConfig.wordEnLabel')} name="wordEn">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input placeholder={t('hotSearchConfig.wordEnPlaceholder')} style={{ flex: 1 }} />
                <Button type="primary" icon={<TranslationOutlined />} onClick={handleAutoTranslate}>{t('hotSearchConfig.autoTranslate')}</Button>
              </div>
            </Form.Item>
          )}
          {displayMode === 'text' && isAutoRank && (
            <Form.Item label={t('hotSearchConfig.wordEnLabel')} name="wordEn">
              <Input placeholder={t('hotSearchConfig.wordEnAutoTip')} disabled suffix={<span style={{ color: '#999', fontSize: 12 }}>{t('hotSearchConfig.wordEnAutoSuffix')}</span>} />
            </Form.Item>
          )}

          {/* ===== 图片上传（图片模式） ===== */}
          {displayMode === 'image' && (
            <>
              <Form.Item label={t('hotSearchConfig.imageCnLabel')} name="image">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error(t('hotSearchConfig.imageTooLarge')); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>300×100</div>
                  </div>
                </Upload>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {t('hotSearchConfig.imageSizeTip')}
                </div>
              </Form.Item>
              <Form.Item label={t('hotSearchConfig.imageEnLabel')} name="imageEn">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error(t('hotSearchConfig.imageTooLarge')); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>EN 300×100</div>
                  </div>
                </Upload>
              </Form.Item>
            </>
          )}

          {/* ===== 跳转配置（自动获取排名时隐藏） ===== */}
          {isAutoRank ? null : (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>{t('hotSearchConfig.jumpConfigTitle')}</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label={t('hotSearchConfig.jumpTypeLabel')} name="jumpType" style={{ flex: 1 }}>
                  <Select options={getJumpOptions(promotionType)} onChange={(v) => setJumpType(v)} />
                </Form.Item>
                {jumpType === 'merchantPage' && (
                  <Form.Item label={t('hotSearchConfig.merchantIdLabel')} name="jumpTarget" rules={[{ required: true, message: t('hotSearchConfig.merchantIdRequired') }]} style={{ flex: 1 }}>
                    <Input placeholder={t('hotSearchConfig.merchantIdPlaceholder')} />
                  </Form.Item>
                )}
                {jumpType === 'h5' && (
                  <Form.Item label={t('hotSearchConfig.h5Label')} name="jumpTarget" rules={[{ required: true, message: t('hotSearchConfig.h5Required') }]} style={{ flex: 1 }}>
                    <Input placeholder={t('hotSearchConfig.h5Placeholder')} />
                  </Form.Item>
                )}
                {jumpType === 'appPage' && (
                  <Form.Item label={t('hotSearchConfig.appPageLabel')} name="jumpTarget" rules={[{ required: true, message: t('hotSearchConfig.appPageRequired') }]} style={{ flex: 1 }}>
                    <Select options={appPageOptions} placeholder={t('hotSearchConfig.appPagePlaceholder')} />
                  </Form.Item>
                )}
              </div>
            </div>
          )}

          {/* ===== 展示区域 ===== */}
          <Form.Item label={t('hotSearchConfig.regionLabel')} name="region" rules={[{ required: true }]}>
            <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} />
          </Form.Item>

          {/* ===== 展示时段（单选下拉） ===== */}
          <Form.Item label={t('hotSearchConfig.timeSlotLabel')} name="timeSlot" rules={[{ required: true, message: t('hotSearchConfig.timeSlotRequired') }]}>
            <Select options={timeSlotOptions} placeholder={t('hotSearchConfig.timeSlotPlaceholder')} />
          </Form.Item>

          {/* ===== 生效日期 + 状态 + 排序 ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchConfig.effectDateLabel')} name="dateRange" rules={[{ required: true, message: t('hotSearchConfig.effectDateRequired') }]} style={{ flex: 2 }}>
              <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.statusLabel')} name="status" style={{ flex: 1 }}>
              <Select options={[{ label: t('dict.status.enable'), value: 'active' }, { label: t('dict.status.disable'), value: 'inactive' }]} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.sortLabel')} name="sortOrder" style={{ flex: 1 }}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* ===== 样式配置 + 预览（仅 词来源=自定义词 + 文字模式） ===== */}
          {wordSource === 'custom' && displayMode === 'text' && (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>{t('hotSearchConfig.styleTitle')}</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label={t('hotSearchConfig.borderColorLabel')} name="borderColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label={t('hotSearchConfig.bgColorLabel')} name="bgColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label={t('hotSearchConfig.fontColorLabel')} name="fontColor">
                  <ColorPicker />
                </Form.Item>
              </div>
              {/* 实时预览 - 单场景 */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>📱 {t('hotSearchConfig.previewTitle')}</div>
                <div style={{ background: '#FFF', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 14px', borderRadius: 16,
                      border: `2px solid ${previewBorderColor}`,
                      background: previewBgColor, color: previewFontColor, fontSize: 14,
                    }}>
                      <FireOutlined style={{ color: previewBorderColor }} /> {previewWord}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Form>
      </Modal>

      {/* ==================== 详情弹窗 ==================== */}
      <Modal
        title={t('hotSearchConfig.detailTitle')}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>{t('common.close')}</Button>,
        ]}
        width={760}
      >
        {detailRecord && (
          <div style={{ marginTop: 16 }}>
            {/* 基本信息 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📋 {t('hotSearchConfig.secBase')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fId')}</div>
                  <div style={{ fontWeight: 'bold' }}>{detailRecord.id}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fEntry')}</div>
                  <div>{searchEntryOptions.find(o => o.value === detailRecord.searchEntry)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fBrand')}</div>
                  <div>{brandOptions.find(o => o.value === detailRecord.brand)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fTerminal')}</div>
                  <div>
                    {detailRecord.terminal.map(t => (
                      <Tag key={t} style={{ marginRight: 4 }}>{terminalOptions.find(o => o.value === t)?.label || t}</Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fDisplayMode')}</div>
                  <div>{displayModeOptions.find(o => o.value === detailRecord.displayMode)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fWordSource')}</div>
                  <div>{wordSourceOptions.find(o => o.value === detailRecord.wordSource)?.label || '-'}</div>
                </div>
              </div>
            </div>

            {/* 热搜词信息 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>🔍 {t('hotSearchConfig.secWord')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fWordCn')}</div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>{detailRecord.word}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fWordEn')}</div>
                  <div>{detailRecord.wordEn || '-'}</div>
                </div>
                {detailRecord.wordSource === 'hotSearchLib' && detailRecord.libMode === 'autoRank' && (
                  <div>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fLibRank')}</div>
                    <div>Top {detailRecord.hotSearchRank || '-'}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fLibMode')}</div>
                  <div>{libModeOptions.find(o => o.value === detailRecord.libMode)?.label || '-'}</div>
                </div>
              </div>
            </div>

            {/* 推广配置 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📢 {t('hotSearchConfig.secPromo')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fPromoType')}</div>
                  <div>{promotionTypeOptions.find(o => o.value === detailRecord.promotionType)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fJumpType')}</div>
                  <div>{allJumpTypeOptions.find(o => o.value === detailRecord.jumpType)?.label || '-'}</div>
                </div>
                {detailRecord.jumpType && detailRecord.jumpType !== 'none' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fJumpTarget')}</div>
                    <div style={{ wordBreak: 'break-all', color: '#1677FF' }}>{detailRecord.jumpTarget}</div>
                  </div>
                )}
              </div>
            </div>

            {/* 定向设置 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>🎯 {t('hotSearchConfig.secTarget')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fRegion')}</div>
                  <div>
                    {detailRecord.region.map(r => (
                      <Tag key={r} style={{ marginRight: 4 }}>{regionOptions.find(o => o.value === r)?.label || r}</Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fTimeSlot')}</div>
                  <div>
                    {detailRecord.timeSlot.map(t => (
                      <Tag key={t} style={{ marginRight: 4 }}>{timeSlotOptions.find(o => o.value === t)?.label || t}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 生效时间 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📅 {t('hotSearchConfig.secEffect')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fEffectDate')}</div>
                  <div>{detailRecord.startDate} ~ {detailRecord.endDate}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fDisplayRange')}</div>
                  <div>
                    {detailRecord.displayTimeRange && detailRecord.displayTimeRange.length === 2
                      ? `${detailRecord.displayTimeRange[0]} - ${detailRecord.displayTimeRange[1]}`
                      : t('dict.timeSlot.allDay')}
                  </div>
                </div>
              </div>
            </div>

            {/* 其他信息 */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>ℹ️ {t('hotSearchConfig.secOther')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fSort')}</div>
                  <div>{detailRecord.sortOrder}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fStatus')}</div>
                  <div>{detailRecord.status === 'active' ? <Tag color="success">{t('dict.status.enable')}</Tag> : <Tag color="default">{t('dict.status.disable')}</Tag>}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fUpdate')}</div>
                  <div>{detailRecord.updateTime}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
