import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Select, Space, message, Table, Tag, Badge, Switch, Popover, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, MobileOutlined, PlusOutlined, QuestionCircleOutlined, HolderOutlined, AppstoreOutlined, ThunderboltOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import BrandTag from '../components/BrandTag'
import {
  fetchAdAlgorithms, fetchWaterfallDetail, createWaterfall, updateWaterfall,
} from '../api/adPromotion'
import { isBackendUnavailable } from '../api/request'
import type { WaterfallStrategyRequest } from '../api/adPromotion'
import { SLOT_DRAFT_KEY, SLOT_RESULT_KEY } from './PromotionSlotConfigSlots'

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
  5: 'recommend:algoPopularMerchant',
  6: 'recommend:algoGuessYouLike',
  7: 'recommend:algoOrganicTraffic',
  11: 'recommend:algoBrandMerchant',
  12: 'recommend:algoGoldAd',
  13: 'recommend:algoGoldenSignboard',
  14: 'recommend:algoProductPromo',
  15: 'recommend:algoTrafficAd',
}

/** 算法类型颜色 */
const ALGO_TYPE_COLOR: Record<number, string> = {
  1: 'gold',
  2: 'green',
  3: 'magenta',
  4: 'purple',
  5: 'red',
  6: 'blue',
  7: 'lime',
  11: 'orange',
  12: 'cyan',
  13: 'geekblue',
  14: 'volcano',
  15: 'yellow',
}

/** 坑位算法配置 */
interface SlotAlgorithm {
  position: number
  algorithmId: string
  algorithmName: string
  algorithmType: number
  brand?: string
  status: 1 | 2
}

/** 可选算法条目 */
interface AlgorithmOption {
  label: string
  value: string
  type: number
  brand?: string
}

export default function PromotionSlotConfigAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
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
  /** 算法库选项（来自「算法库」已启用算法） */
  const [algorithmOptions, setAlgorithmOptions] = useState<AlgorithmOption[]>([])
  const [saving, setSaving] = useState(false)
  /** 自然流量兜底算法编码（未配置坑位統一讀取該算法數據） */
  const [naturalAlgoId, setNaturalAlgoId] = useState<string | undefined>(undefined)
  /** 是否有未保存的坑位變更（從坑位頁返回後或修改坑位後為 true） */
  const [hasUnsavedSlotChanges, setHasUnsavedSlotChanges] = useState(false)

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
            value: a.algoCode as string,
            type: a.algoType,
            brand: a.brand as string | undefined,
          })))
        }
      })
      .catch(() => { /* 保留降级选项 */ })
  }, [])

  /** 编辑/详情模式加载数据，后端完全不可用时降级 Mock，后端返回业务错误时提示用户 */
  const slotResultConsumedRef = useRef(false)
  useEffect(() => {
    if (!editIdParam) return
    const id = Number(editIdParam)

    // 同步检查 sessionStorage（坑位配置页返回的结果优先于 API 数据）
    const resultRaw = sessionStorage.getItem(SLOT_RESULT_KEY)
    if (resultRaw) {
      sessionStorage.removeItem(SLOT_RESULT_KEY)
      sessionStorage.removeItem(SLOT_DRAFT_KEY)
      slotResultConsumedRef.current = true
      try {
        const parsed = JSON.parse(resultRaw) as SlotAlgorithm[]
        console.log('[WaterfallAdd] 编辑模式读取坑位配置页结果:', parsed.length, '条')
        setSlotAlgorithms(parsed)
        setHasUnsavedSlotChanges(true)
      } catch { /* 忽略脏数据 */ }
    }

    fetchWaterfallDetail(id)
      .then(detail => {
        loadDetailIntoForm(detail, id)
      })
      .catch(err => {
        if (isBackendUnavailable(err)) {
          console.warn('[WaterfallDetail] 后端不可用，顯示空白表單')
          loadDetailIntoForm({ strategyName: '', slots: [] }, id)
        } else {
          const status = err?.response?.status
          const msg = err?.message || '未知错误'
          console.error('[WaterfallDetail] 加载失败:', status, msg)
          if (status === 403) {
            message.error('沒有權限訪問該配置，請聯繫管理員授權')
          } else if (status === 404) {
            message.error('該配置記錄不存在，可能尚未保存至數據庫')
          } else {
            message.error(`加載配置失敗: ${msg}`)
          }
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editIdParam, location.key])

  /** 将后端详情数据填入表单与坑位列表 */
  const loadDetailIntoForm = (detail: { strategyName?: string; brand?: string; naturalAlgoId?: string | null; filterDislike?: number; slots?: { slotPosition: number; algoId: string; algoName?: string; algoType?: number; status?: number }[] }, id: number | string) => {
    form.setFieldsValue({
      promotionName: detail.strategyName,
      app: detail.brand,
    })
    setNaturalAlgoId(detail.naturalAlgoId ?? undefined)
    setFilterDislike(detail.filterDislike === 1)
    // 如果 sessionStorage 已经提供了坑位数据，不再用 API 数据覆盖
    if (slotResultConsumedRef.current) {
      console.log('[WaterfallAdd] sessionStorage 已提供坑位数据，跳过 API 坑位数据')
      return
    }
    const slots: SlotAlgorithm[] = (detail.slots ?? []).map(s => ({
      position: s.slotPosition,
      algorithmId: s.algoId,
      algorithmName: s.algoName ?? '',
      algorithmType: s.algoType ?? 1,
      brand: undefined,
      status: (s.status === 2 ? 2 : 1) as 1 | 2,
    }))
    setSlotAlgorithms(slots)
  }

  // 进入坑位配置独立页面：当前配置写入草稿后跳转
  const handleGoSlots = () => {
    sessionStorage.setItem(SLOT_DRAFT_KEY, JSON.stringify(slotAlgorithms))
    navigate('/promotion-slot-config-slots')
  }

  // 新增模式：应用坑位配置页返回的配置结果
  useEffect(() => {
    if (editIdParam) return
    const raw = sessionStorage.getItem(SLOT_RESULT_KEY)
    if (!raw) return
    sessionStorage.removeItem(SLOT_RESULT_KEY)
    sessionStorage.removeItem(SLOT_DRAFT_KEY)
    try {
      setSlotAlgorithms(JSON.parse(raw) as SlotAlgorithm[])
      setHasUnsavedSlotChanges(true)
    } catch { /* 忽略脏数据 */ }
  }, [editIdParam])

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
        setHasUnsavedSlotChanges(true)
        message.success(t('promotionSlotConfig:deleteSlotSuccess', { pos: record.position }))
      },
    })
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
        setHasUnsavedSlotChanges(true)
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
    setHasUnsavedSlotChanges(true)
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
    setHasUnsavedSlotChanges(true)
  }

  // 手机模型标题
  const phoneTitle = useMemo(() => {
    const app = form.getFieldValue('app') as string | undefined
    const appName = app ? app : 'flashBee'
    return t('promotionSlotConfig:waterfallPreview', { appName: t(APP_LABEL[appName] || 'common:flashBee') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, slotAlgorithms])

  const handleBack = () => {
    if (hasUnsavedSlotChanges) {
      Modal.confirm({
        title: t('promotionSlotConfig:discardConfirmTitle'),
        content: t('promotionSlotConfig:discardConfirmContent'),
        okText: t('promotionSlotConfig:discardConfirmOk'),
        cancelText: t('promotionSlotConfig:discardConfirmCancel'),
        okButtonProps: { danger: true },
        onOk: () => navigate('/promotion-slot-config'),
      })
    } else {
      navigate('/promotion-slot-config')
    }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (!naturalAlgoId) {
        message.warning(t('promotionSlotConfig:fallbackAlgoRequired'))
        return
      }
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
      console.log('[WaterfallAdd] handleSave 开始, isEditMode=', isEditMode, 'editId=', editIdParam)
      console.log('[WaterfallAdd] request payload:', JSON.stringify(request))
      console.log('[WaterfallAdd] slotAlgorithms count:', slotAlgorithms.length)
      if (isEditMode) {
        const res = await updateWaterfall(Number(editIdParam), request)
        console.log('[WaterfallAdd] update 成功, response:', res)
      } else {
        const res = await createWaterfall(request)
        console.log('[WaterfallAdd] create 成功, response:', res)
      }
      message.success(t('promotionSlotConfig:saveSuccessMsg'))
      setHasUnsavedSlotChanges(false)
      navigate('/promotion-slot-config')
    } catch (error) {
      const errStatus = (error as { response?: { status?: number } })?.response?.status
      const errMsg = (error as Error)?.message || '未知错误'
      const errData = (error as { response?: { data?: unknown } })?.response?.data
      console.error('[WaterfallAdd] 保存失败, status=', errStatus, 'msg=', errMsg, 'data=', errData, error)
      message.error(t('promotionSlotConfig:saveFailed'))
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
      width: 200,
      align: 'center',
      render: (code: string) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
          {code}
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
      render: (_: unknown, record: SlotAlgorithm) => {
        const brand = record.brand ?? algorithmOptions.find(a => a.value === record.algorithmId)?.brand
        return brand ? <BrandTag value={brand} /> : '-'
      },
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
      width: 200,
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
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleGoSlots} size="small">
                    {t('promotionSlotConfig:addEditBtn')}
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
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#391085' }}>
                    <span style={{ color: '#FF4D4F', marginRight: 4 }}>*</span>
                    {t('promotionSlotConfig:naturalFallback')}
                  </span>
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

            {/* 未保存变更提示横幅 */}
            {hasUnsavedSlotChanges && !isDetailMode && (
              <div style={{
                background: 'linear-gradient(135deg, #FFF7E6 0%, #FFE7BA 100%)',
                border: '1px solid #FFD591',
                borderRadius: 8,
                padding: '10px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <ExclamationCircleOutlined style={{ color: '#FA8C16', fontSize: 16, flexShrink: 0 }} />
                  <span style={{ color: '#D46B08', fontSize: 13, fontWeight: 500 }}>
                    {t('promotionSlotConfig:unsavedChanges')}
                  </span>
                </div>
                <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                  {t('promotionSlotConfig:saveNow')}
                </Button>
              </div>
            )}

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
