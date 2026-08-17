import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Select, Space, message, Table, Tag, Badge, Switch, Popover, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, MobileOutlined, PlusOutlined, QuestionCircleOutlined, HolderOutlined, AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons'
import BrandTag from '../components/BrandTag'
import {
  fetchAdAlgorithms, fetchWaterfallDetail, createWaterfall, updateWaterfall,
  withAdFallback,
} from '../api/adPromotion'
import type { WaterfallStrategyRequest } from '../api/adPromotion'
import { mockData } from './PromotionSlotConfig/index'

/** 品牌选项（与后端 brand 枚举对齐） */
const APP_OPTIONS = [
  { labelKey: 'common:flashBee', value: 'flashBee' },
  { labelKey: 'recommend:appMfood', value: 'mFood' },
]

/** 品牌标签 */
const APP_LABEL: Record<string, string> = { flashBee: 'common:flashBee', mFood: 'recommend:appMfood' }

/** 算法类型标签（与算法库 algo_type 枚举对齐） */
const ALGO_TYPE_LABEL: Record<number, string> = {
  1: 'recommend:algoInvincibleStar',
  2: 'recommend:algoNewStoreAd',
  3: 'recommend:algoHotReviveAd',
  4: 'recommend:algoExclusiveMerchant',
  5: 'recommend:algoTrafficAd',
  6: 'recommend:algoGuessYouLike',
  7: 'recommend:algoOrganicTraffic',
  10: 'recommend:algoPopularMerchant',
}

/** 算法类型颜色 */
const ALGO_TYPE_COLOR: Record<number, string> = {
  1: 'magenta',
  2: 'blue',
  3: 'green',
  4: 'orange',
  5: 'cyan',
  6: 'purple',
  7: 'gold',
  10: 'red',
}

/** 坑位算法配置 */
interface SlotAlgorithm {
  position: number
  algorithmId: number
  algorithmName: string
  algorithmType: number
  brand?: string
  status: 1 | 2
}

/** 可选算法条目 */
interface AlgorithmOption {
  label: string
  value: number
  type: number
  brand?: string
}

/** 算法库不可用时的降级选项（当前仅无敌星星接入数据库） */
const _MOCK_ALGORITHM_OPTIONS: AlgorithmOption[] = [
  { label: 'algoInvincibleStar', value: 1, type: 1, brand: 'flashBee' },
]

export default function PromotionSlotConfigAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editIdParam = searchParams.get('id') || ''
  const modeParam = searchParams.get('mode') || ''
  const isDetailMode = modeParam === 'detail'
  const isEditMode = !!editIdParam && !isDetailMode
  const [form] = Form.useForm()
  const [filterDislike, setFilterDislike] = useState(false)
  const [slotAlgorithms, setSlotAlgorithms] = useState<SlotAlgorithm[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [addForm] = Form.useForm()
  const [selectedAlgoType, setSelectedAlgoType] = useState<number | null>(null)
  const [selectedPositions, setSelectedPositions] = useState<number[]>([])
  /** 编辑中的坑位序号（新增弹窗复用于编辑场景），null 表示新增 */
  const [editingPosition, setEditingPosition] = useState<number | null>(null)
  const [totalPositions, setTotalPositions] = useState<number>(100)
  /** 算法库选项（来自「算法库」已启用算法） */
  const [algorithmOptions, setAlgorithmOptions] = useState<AlgorithmOption[]>([])
  const [saving, setSaving] = useState(false)
  /** 弹窗中当前选中算法的品牌 */
  const [selectedAlgoBrand, setSelectedAlgoBrand] = useState<string | undefined>(undefined)
  /** 自然流量兜底算法ID（未配置坑位統一讀取該算法數據） */
  const [naturalAlgoId, setNaturalAlgoId] = useState<number | undefined>(undefined)

  /** 自然流量兜底算法選項：只展示算法庫中「自然流量」類型（algoType=7）的算法 */
  const naturalAlgoOptions = useMemo(
    () => algorithmOptions.filter(a => a.type === 7),
    [algorithmOptions],
  )

  const tAppOptions = useMemo(() => APP_OPTIONS.map(o => ({ label: t(o.labelKey), value: o.value })), [t])
  const tAlgoTypeLabel = useCallback((v: number) => ALGO_TYPE_LABEL[v] ? t(ALGO_TYPE_LABEL[v]) : t('promotionSlotConfig:algoTypeFallback', { type: v }), [t])

  /** 加载可选算法: 来自算法库已启用算法（当前仅无敌星星接入） */
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, status: 1 })
      .then(res => {
        if (res.records.length > 0) {
          setAlgorithmOptions(res.records.map(a => ({
            label: a.algoName,
            value: a.id as number,
            type: a.algoType,
            brand: a.brand as string | undefined,
          })))
        }
      })
      .catch(() => { /* 保留降级选项 */ })
  }, [])

  /** 编辑/详情模式加载数据，后端不可用时降级 Mock */
  useEffect(() => {
    if (!editIdParam) return
    const id = Number(editIdParam)
    withAdFallback(
      () => fetchWaterfallDetail(id),
      async () => {
        // 降级: 使用列表 Mock 基础信息，坑位为空
        const record = mockData.find(item => item.id === id)
        return record ?? { id, strategyName: '', slots: [] }
      },
    ).then(detail => {
      form.setFieldsValue({
        promotionName: detail.strategyName,
        app: detail.brand,
      })
      setNaturalAlgoId(detail.naturalAlgoId ?? undefined)
      setFilterDislike(detail.filterDislike === 1)
      setSlotAlgorithms((detail.slots ?? []).map(s => ({
        position: s.slotPosition,
        algorithmId: s.algoId,
        algorithmName: s.algoName ?? '',
        algorithmType: s.algoType ?? 1,
        brand: undefined,
        status: (s.status === 2 ? 2 : 1) as 1 | 2,
      })))
    }).catch(() => message.error(t('promotionSlotConfig:loadFailed')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIdParam])

  // 新增坑位配置
  const handleAddSlot = () => {
    addForm.resetFields()
    setSelectedAlgoType(null)
    setSelectedAlgoBrand(undefined)
    setSelectedPositions([])
    setEditingPosition(null)
    setIsAddModalVisible(true)
  }

  // 切换位置选择（编辑场景单选，新增场景多选）
  const togglePosition = (pos: number) => {
    if (editingPosition !== null) {
      setSelectedPositions([pos])
      return
    }
    setSelectedPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos].sort((a, b) => a - b)
    )
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
        message.warning(t('promotionSlotConfig:selectAtLeastOnePos'))
        return
      }
      const selectedAlgo = algorithmOptions.find(a => a.value === values.algorithmId)
      if (!selectedAlgo) return

      if (editingPosition !== null) {
        // 编辑场景: 替换原坑位的算法（位置可移动，单选）
        setSlotAlgorithms(prev => prev
          .map(item => item.position === editingPosition
            ? {
                ...item,
                position: selectedPositions[0],
                algorithmId: selectedAlgo.value,
                algorithmName: selectedAlgo.label,
                algorithmType: selectedAlgo.type,
                brand: selectedAlgo.brand,
              }
            : item)
          .sort((a, b) => a.position - b.position))
        message.success(t('promotionSlotConfig:updateSlotSuccess', { pos: selectedPositions[0], name: selectedAlgo.label }))
      } else {
        // 新增场景: 一个算法可配置在多个坑位
        const newSlots: SlotAlgorithm[] = selectedPositions.map(pos => ({
          position: pos,
          algorithmId: selectedAlgo.value,
          algorithmName: selectedAlgo.label,
          algorithmType: selectedAlgo.type,
          brand: selectedAlgo.brand,
          status: 1 as const,
        }))
        setSlotAlgorithms(prev => [...prev, ...newSlots].sort((a, b) => a.position - b.position))
        message.success(t('promotionSlotConfig:addSlotSuccess', { name: selectedAlgo.label, positions: selectedPositions.map(p => t('promotionSlotConfig:posNum', { pos: p })).join('、') }))
      }
      setIsAddModalVisible(false)
    } catch (error) {
      console.error('验证失败:', error)
    }
  }

  // 删除坑位配置（删除后该坑位回归自然流量）
  const handleDeleteSlot = (record: SlotAlgorithm) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: t('promotionSlotConfig:deleteSlotConfirm', { pos: record.position }),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        setSlotAlgorithms(prev => prev.filter(item => item.position !== record.position))
        message.success(t('promotionSlotConfig:deleteSlotSuccess', { pos: record.position }))
      },
    })
  }

  // 编辑坑位配置
  const handleEditSlot = (record: SlotAlgorithm) => {
    addForm.resetFields()
    addForm.setFieldsValue({ algorithmId: record.algorithmId })
    setSelectedAlgoType(record.algorithmType)
    setSelectedAlgoBrand(record.brand)
    setSelectedPositions([record.position])
    setEditingPosition(record.position)
    setIsAddModalVisible(true)
  }

  // 切换启用/停用状态
  const handleToggleStatus = (record: SlotAlgorithm) => {
    const newStatus: 1 | 2 = record.status === 1 ? 2 : 1
    const actionText = newStatus === 1 ? t('common:enable') : t('common:disable')
    Modal.confirm({
      title: t('promotionSlotConfig:confirmToggleTitle', { action: actionText }),
      content: t('promotionSlotConfig:confirmToggleContent', { action: actionText, name: record.algorithmName }),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      onOk: () => {
        setSlotAlgorithms(prev =>
          prev.map(item =>
            item.position === record.position ? { ...item, status: newStatus } : item
          )
        )
        message.success(t('promotionSlotConfig:toggleSuccess', { action: actionText, name: record.algorithmName }))
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
    message.success(t('promotionSlotConfig:moveSuccess', { name: moved.algorithmName, pos: index + 1 }))
  }, [dragIndex, slotAlgorithms])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  // 上移/下移（基于全量数组定位，避免分页内索引偏差），移动后重新编号
  const handleMoveSlot = (record: SlotAlgorithm, direction: -1 | 1) => {
    const index = slotAlgorithms.findIndex(s => s.position === record.position)
    const target = index + direction
    if (index < 0 || target < 0 || target >= slotAlgorithms.length) return
    const newList = [...slotAlgorithms]
    const [moved] = newList.splice(index, 1)
    newList.splice(target, 0, moved)
    setSlotAlgorithms(newList.map((item, i) => ({ ...item, position: i + 1 })))
  }

  // 手机模型标题
  const phoneTitle = useMemo(() => {
    const app = form.getFieldValue('app') as string | undefined
    const appName = app ? app : 'flashBee'
    return t('promotionSlotConfig:waterfallPreview', { appName: t(APP_LABEL[appName] || 'common:flashBee') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, slotAlgorithms])

  const handleBack = () => navigate('/promotion-slot-config')

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const request: WaterfallStrategyRequest = {
        strategyName: values.promotionName,
        brand: values.app,
        naturalAlgoId: naturalAlgoId ?? null,
        filterDislike: filterDislike ? 1 : 2,
        status: isEditMode ? undefined : 1,
        slots: slotAlgorithms.map(item => ({
          slotPosition: item.position,
          algoId: item.algorithmId,
          status: item.status,
        })),
      }
      if (isEditMode) {
        await updateWaterfall(Number(editIdParam), request)
      } else {
        await createWaterfall(request)
      }
      message.success(t('promotionSlotConfig:saveSuccessMsg'))
      navigate('/promotion-slot-config')
    } catch (error) {
      console.error('保存失败:', error)
    } finally {
      setSaving(false)
    }
  }

  /** 模块卡片标题行 */
  const cardTitle = (icon: React.ReactNode, iconBg: string, iconColor: string, title: string, extra?: React.ReactNode, rightText?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {extra}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {rightText && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{rightText}</span>}
    </div>
  )

  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  const columns: ColumnsType<SlotAlgorithm> = [
    {
      title: t('promotionSlotConfig:colPosition'),
      dataIndex: 'position',
      key: 'position',
      width: 100,
      align: 'center',
      render: (v: number) => <Tag color="green">{t('promotionSlotConfig:posNum', { pos: v })}</Tag>,
    },
    {
      title: t('promotionSlotConfig:colAlgoId'),
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
      title: t('promotionSlotConfig:colAlgoName'),
      dataIndex: 'algorithmName',
      key: 'algorithmName',
      width: 180,
      ellipsis: true,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: t('promotionSlotConfig:colAlgoType'),
      dataIndex: 'algorithmType',
      key: 'algorithmType',
      width: 110,
      render: (v: number) => (
        <Tag color={ALGO_TYPE_COLOR[v] ?? 'default'}>{tAlgoTypeLabel(v)}</Tag>
      ),
    },
    {
      title: t('common:brand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (v: string) => v ? <BrandTag value={v} /> : '-',
    },
    {
      title: t('promotionSlotConfig:colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: number) => (
        <Tag color={v === 1 ? 'success' : 'default'}>
          {v === 1 ? t('promotionSlotConfig:enabled') : t('promotionSlotConfig:disabled')}
        </Tag>
      ),
    },
    ...(!isDetailMode ? [{
      title: t('common:colAction'),
      key: 'action',
      width: 260,
      align: 'center' as const,
      render: (_: unknown, record: SlotAlgorithm) => {
        const index = slotAlgorithms.findIndex(s => s.position === record.position)
        return (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            disabled={index <= 0}
            onClick={() => handleMoveSlot(record, -1)}
          >
            {t('promotionSlotConfig:moveUp')}
          </Button>
          <Button
            type="link"
            size="small"
            disabled={index === slotAlgorithms.length - 1}
            onClick={() => handleMoveSlot(record, 1)}
          >
            {t('promotionSlotConfig:moveDown')}
          </Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 1}
            style={record.status === 2 ? { color: '#52c41a' } : undefined}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 1 ? t('promotionSlotConfig:disabled') : t('promotionSlotConfig:enabled')}
          </Button>
          <Button type="link" size="small" onClick={() => handleEditSlot(record)}>
            {t('common:edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteSlot(record)}>
            {t('common:delete')}
          </Button>
        </Space>
        )
      },
    }] : []),
  ]

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
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isDetailMode ? t('promotionSlotConfig:slotConfigDetail') : isEditMode ? t('promotionSlotConfig:editSlotConfig') : t('promotionSlotConfig:addSlotConfig')}
            </h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetailMode}>
        {/* 基础信息 */}
        <div style={cardShellStyle}>
          {cardTitle(
            <MobileOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
            '#e6f7ff', '#1890ff', t('promotionSlotConfig:basicInfo'),
            undefined,
            t('promotionSlotConfig:saveHint'),
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item
              label={t('promotionSlotConfig:waterfallNameLabel')}
              name="promotionName"
              rules={[{ required: true, message: t('promotionSlotConfig:enterWaterfallName') }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder={t('promotionSlotConfig:enterWaterfallName')} allowClear />
            </Form.Item>
            <Form.Item
              label={t('common:brand')}
              name="app"
              rules={[{ required: true, message: t('common:selectBrand') }]}
              style={{ marginBottom: 0 }}
            >
              <Select placeholder={t('common:selectBrand')} options={tAppOptions} />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 下方：手机模型 + 算法列表 */}
      <div style={{ display: 'flex', gap: 24 }}>
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
                {t('promotionSlotConfig:previewHint')}
              </div>
            </div>

            {/* 瀑布流位置列表（支持拖拽排序） */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              overflow: 'auto', flex: 1,
            }}>
              {slotAlgorithms.filter(item => item.status === 1).length === 0 && (
                <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 13, padding: '24px 0' }}>
                  {t('promotionSlotConfig:noConfiguredSlot')}
                </div>
              )}
              {slotAlgorithms.filter(item => item.status === 1).map((item, index) => (
                <div
                  key={item.position}
                  draggable={!isDetailMode}
                  onDragStart={() => !isDetailMode && handleDragStart(index)}
                  onDragOver={(e) => !isDetailMode && handleDragOver(e, index)}
                  onDrop={() => !isDetailMode && handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    background: '#FAFAFA',
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: dragOverIndex === index ? '2px solid #1890ff' : '1px solid #F0F0F0',
                    opacity: dragIndex === index ? 0.4 : 1,
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
                        count={t('promotionSlotConfig:posNum', { pos: item.position })}
                        style={{ backgroundColor: '#1890ff' }}
                      />
                    </div>
                    <Tag color={ALGO_TYPE_COLOR[item.algorithmType] ?? 'default'}>
                      {ALGO_TYPE_LABEL[item.algorithmType] ? t(ALGO_TYPE_LABEL[item.algorithmType]) : t('promotionSlotConfig:algoTypeFallback', { type: item.algorithmType })}
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
          <div style={cardShellStyle}>
            {cardTitle(
              <AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
              '#fff7e6', '#fa8c16', t('promotionSlotConfig:slotAlgoList'),
              undefined,
              !isDetailMode ? (
                <Space size={16}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddSlot} size="small">
                    新增
                  </Button>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#595959', whiteSpace: 'nowrap' }}>{t('promotionSlotConfig:filterDislike')}</span>
                    <Switch
                      size="small"
                      checked={filterDislike}
                      onChange={(checked) => {
                        setFilterDislike(checked)
                        message.info(checked ? t('promotionSlotConfig:filterDislikeOn') : t('promotionSlotConfig:filterDislikeOff'))
                      }}
                      style={{ marginLeft: 8 }}
                      disabled={isDetailMode}
                    />
                    <Popover
                      content={
                        <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                          {t('promotionSlotConfig:filterDislikePopover')}
                        </div>
                      }
                      trigger="hover"
                      placement="topRight"
                    >
                      <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
                    </Popover>
                  </span>
                </Space>
              ) : undefined,
            )}

            {/* 自然流量兜底：未配置坑位統一讀取該算法數據 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 60%, #e6fffb 130%)',
              border: '1px solid #d3adf7', borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#fff', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(114, 46, 209, 0.15)',
              }}>
                <ThunderboltOutlined style={{ fontSize: 16, color: '#722ed1' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#391085' }}>{t('promotionSlotConfig:naturalFallback')}</span>
                  <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>{t('promotionSlotConfig:unconfiguredSlotEffective')}</Tag>
                  <Popover
                    content={
                      <div style={{ maxWidth: 320, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                        {t('promotionSlotConfig:naturalFallbackPopover')}
                      </div>
                    }
                    trigger="hover"
                    placement="top"
                  >
                    <QuestionCircleOutlined style={{ color: '#9254de', fontSize: 14, cursor: 'pointer' }} />
                  </Popover>
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                  {t('promotionSlotConfig:naturalFallbackHint')}
                </div>
              </div>
              <Select
                value={naturalAlgoId}
                onChange={(val) => setNaturalAlgoId(val)}
                placeholder={t('promotionSlotConfig:selectFallbackAlgo')}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 240, flexShrink: 0 }}
                disabled={isDetailMode}
                options={naturalAlgoOptions.map(a => ({ label: a.label, value: a.value }))}
              />
            </div>

            <Table<SlotAlgorithm>
              columns={columns}
              dataSource={slotAlgorithms}
              rowKey="position"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (total) => t('common:total', { count: total }),
              }}
              size="small"
              scroll={{ y: 540 }}
            />
          </div>
        </div>
      </div>

      {/* 新增坑位弹窗 */}
      <Modal
        title={editingPosition !== null ? t('promotionSlotConfig:editPosConfig', { pos: editingPosition }) : t('promotionSlotConfig:addPosConfig')}
        open={isAddModalVisible}
        onOk={handleConfirmAddSlot}
        onCancel={() => setIsAddModalVisible(false)}
        okText={t('common:confirm')}
        cancelText={t('common:cancel')}
        okButtonProps={{ style: { background: '#E8720C', borderColor: '#E8720C' } }}
        width={900}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label={t('promotionSlotConfig:colAlgoName')}
            name="algorithmId"
            rules={[{ required: true, message: t('promotionSlotConfig:selectAlgo') }]}
          >
            <Select
              placeholder={t('promotionSlotConfig:selectAlgoPlaceholder')}
              showSearch
              optionFilterProp="label"
              options={algorithmOptions.map(a => ({ label: a.label, value: a.value }))}
              onChange={(value) => {
                const algo = algorithmOptions.find(a => a.value === value)
                setSelectedAlgoType(algo ? algo.type : null)
                setSelectedAlgoBrand(algo ? algo.brand : undefined)
              }}
            />
          </Form.Item>
          <Form.Item label={t('promotionSlotConfig:colAlgoType')}>
            <Input
              value={selectedAlgoType !== null ? tAlgoTypeLabel(selectedAlgoType) : ''}
              disabled
              placeholder={t('promotionSlotConfig:selectAlgoFirst')}
              style={{ color: selectedAlgoType !== null ? '#333' : '#bfbfbf' }}
            />
          </Form.Item>
          <Form.Item label={t('common:brand')}>
            {selectedAlgoBrand ? (
              <BrandTag value={selectedAlgoBrand} />
            ) : (
              <span style={{ color: '#bfbfbf' }}>{t('promotionSlotConfig:selectAlgoFirst')}</span>
            )}
          </Form.Item>
          <Form.Item label={
            <span>
              {t('promotionSlotConfig:displayPosition')}
              <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginLeft: 8 }}>
                {t('promotionSlotConfig:selectedPosCount', { count: selectedPositions.length })}
              </span>
              <Select
                value={totalPositions}
                onChange={(val) => setTotalPositions(val)}
                size="small"
                style={{ width: 90, marginLeft: 12, fontSize: 12 }}
                options={[
                  { label: t('promotionSlotConfig:topN', { count: 100 }), value: 100 },
                  { label: t('promotionSlotConfig:topN', { count: 200 }), value: 200 },
                  { label: t('promotionSlotConfig:topN', { count: 300 }), value: 300 },
                  { label: t('promotionSlotConfig:topN', { count: 500 }), value: 500 },
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
                  // 编辑场景下当前坑位允许重新选择
                  const isOccupied = !!existingSlot && pos !== editingPosition
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
                        {t('promotionSlotConfig:posNum', { pos })}
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
                  {t('promotionSlotConfig:slotStats', { count: selectedPositions.length })}
                </span>
                {selectedPositions.length > 0 && editingPosition === null && (
                  <Button 
                    size="small" 
                    onClick={clearAllPositions} 
                    style={{ fontSize: 12, padding: '0 8px', height: 22 }}
                  >
                    {t('promotionSlotConfig:clearAll')}
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
                      closable={editingPosition === null}
                      onClose={() => removePosition(pos)}
                      color="orange"
                      style={{ margin: 0, fontSize: 12 }}
                    >
                      {t('promotionSlotConfig:posNum', { pos })}
                    </Tag>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#bfbfbf', fontSize: 13 }}>
                  {t('promotionSlotConfig:noPosSelected')}
                </div>
              )}
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 底部操作按钮（详情模式下隐藏） */}
      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common:cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>{t('common:save')}</Button>
        </div>
      )}
    </div>
  )
}
