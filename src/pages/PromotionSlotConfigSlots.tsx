import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select, Tag, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import BrandTag from '../components/BrandTag'
import { fetchAdAlgorithms } from '../api/adPromotion'

/** 新增/編輯頁與坑位配置頁之間的草稿/結果傳遞 key（sessionStorage） */
export const SLOT_DRAFT_KEY = 'slotConfigDraftSlots'
export const SLOT_RESULT_KEY = 'slotConfigResultSlots'

/** 坑位算法配置（草稿） */
export interface SlotDraft {
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

/** 坑位算法分配配色（高飽和度，不同算法類型顏色明顯區分） */
const SLOT_TYPE_STYLE: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: '#FFF1B8', border: '#D4A017', text: '#8B6914' },  // 无敌星星 - 黄金
  2: { bg: '#D9F7BE', border: '#52C41A', text: '#237804' },  // 新店广告 - 绿色
  3: { bg: '#FFD6E7', border: '#EB2F96', text: '#C41D7F' },  // 盘活复苏 - 洋红
  4: { bg: '#EFDBFF', border: '#9254DE', text: '#531DAB' },  // 独家商家 - 紫色
  5: { bg: '#FFD8D8', border: '#FF4D4F', text: '#A8071A' },  // 人气商家 - 红色
  6: { bg: '#BAE7FF', border: '#1890FF', text: '#096DD9' },  // 猜你喜欢 - 蓝色
  7: { bg: '#E8FFB3', border: '#73D13D', text: '#389E0D' },  // 自然流量 - 青绿
  11: { bg: '#FFE7D1', border: '#E8720C', text: '#AD4E00' },  // 品牌商家 - 橙色
  12: { bg: '#B5F5EC', border: '#13C2C2', text: '#086E6E' },  // 点金广告 - 青色
  13: { bg: '#D6E4FF', border: '#2F54EB', text: '#1D39C4' },  // 金字招牌 - 极客蓝
  14: { bg: '#FFD8BF', border: '#FA541C', text: '#CB3B00' },  // 商品促销 - 火橘
  15: { bg: '#FFFABE', border: '#FADB14', text: '#8B7200' },  // 投流广告 - 黄色
}
const DEFAULT_SLOT_STYLE = { bg: '#FFF1B8', border: '#D4A017', text: '#8B6914' }

/** 估算文本渲染寬度：CJK 按 fontSize、其餘按 0.62*fontSize 計算 */
const estimateTextWidth = (text: string, fontSize: number) => {
  let w = 0
  for (const ch of text) w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.62
  return w
}

/** 坑位配置獨立頁面：從新增/編輯頁進入，配置完成後保存返回 */
export default function PromotionSlotConfigSlots() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /** 從新增/編輯頁傳入的草稿坑位配置 */
  const [slots, setSlots] = useState<SlotDraft[]>(() => {
    try {
      const raw = sessionStorage.getItem(SLOT_DRAFT_KEY)
      return raw ? (JSON.parse(raw) as SlotDraft[]) : []
    } catch {
      return []
    }
  })
  /** 算法库选项（来自「算法库」已启用算法） */
  const [algorithmOptions, setAlgorithmOptions] = useState<AlgorithmOption[]>([])
  /** 当前选中的算法（点击坑位即分配给该算法） */
  const [currentAlgo, setCurrentAlgo] = useState<AlgorithmOption | null>(null)
  const [selectedAlgoType, setSelectedAlgoType] = useState<number | null>(null)
  const [selectedAlgoBrand, setSelectedAlgoBrand] = useState<string | undefined>(undefined)
  const [totalPositions, setTotalPositions] = useState<number>(100)
  /** 坑位網格單格寬度（用於判斷算法名稱是否需要跑馬燈） */
  const slotGridRef = useRef<HTMLDivElement | null>(null)
  const [slotCellWidth, setSlotCellWidth] = useState(0)

  /** 加载可选算法（排除自然流量、人气商家、金字招牌：自然流量仅在兆底算法区域选择；人气商家在销售定价菜单配置；金字招牌只需标签不需坑位配置） */
  useEffect(() => {
    fetchAdAlgorithms({ page: 1, size: 200, status: 1 })
      .then(res => {
        if (res.records.length > 0) {
          setAlgorithmOptions(
            res.records
              .filter(a => a.algoType !== 7 && a.algoType !== 5 && !a.algoCode?.startsWith('SFJZ'))  // 排除自然流量(7)、人气商家(5)、金字招牌(SFJZ)
              .map(a => ({
                label: a.algoName,
                value: a.algoCode as string,
                type: a.algoType,
                brand: a.brand as string | undefined,
              }))
          )
        }
      })
      .catch(() => { /* 保留空选项 */ })
  }, [])

  /** 測量坑位單格寬度 */
  useEffect(() => {
    if (slotGridRef.current) {
      setSlotCellWidth((slotGridRef.current.clientWidth - 8 * 9) / 10)
    }
  }, [totalPositions])

  const tAlgoTypeLabel = useCallback((v: number) => ALGO_TYPE_LABEL[v] ? t(ALGO_TYPE_LABEL[v]) : t('promotionSlotConfig:algoTypeFallback', { type: v }), [t])

  // 点击坑位：已配置直接移除（切换算法则改派），未配置需选算法后分配
  const togglePosition = (pos: number) => {
    const existing = slots.find(s => s.position === pos)
    if (existing) {
      if (currentAlgo && currentAlgo.value !== existing.algorithmId) {
        // 切换了不同算法：改派该坑位
        setSlots(prev => prev.map(s => s.position === pos
          ? { ...s, algorithmId: currentAlgo.value, algorithmName: currentAlgo.label, algorithmType: currentAlgo.type, brand: currentAlgo.brand }
          : s).sort((a, b) => a.position - b.position))
      } else {
        // 未切换算法：移除该坑位配置
        setSlots(prev => prev.filter(s => s.position !== pos))
      }
      return
    }
    if (!currentAlgo) {
      message.warning(t('promotionSlotConfig:selectAlgoFirst'))
      return
    }
    setSlots(prev => [...prev, {
      position: pos,
      algorithmId: currentAlgo.value,
      algorithmName: currentAlgo.label,
      algorithmType: currentAlgo.type,
      brand: currentAlgo.brand,
      status: 1 as const,
    }].sort((a, b) => a.position - b.position))
  }

  // 移除位置
  const removePosition = (pos: number) => {
    setSlots(prev => prev.filter(s => s.position !== pos))
  }

  // 清空所有选择
  const clearAllPositions = () => {
    setSlots([])
  }

  // 取消：不保存返回新增/编辑页
  const handleBack = () => navigate(-1)

  // 保存：写回结果并返回新增/编辑页
  const handleSave = () => {
    sessionStorage.setItem(SLOT_RESULT_KEY, JSON.stringify(slots))
    sessionStorage.removeItem(SLOT_DRAFT_KEY)
    message.success(t('promotionSlotConfig:saveSuccessMsg'))
    navigate(-1)
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
              {t('promotionSlotConfig:addEditPosConfig')}
            </h2>
          </div>
        </div>
      </div>

      {/* 区域一：算法选择 */}
      <div style={cardShellStyle}>
        {cardTitle(
          <AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
          '#fff7e6', '#fa8c16', t('promotionSlotConfig:algoSelectSection'),
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
              <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
              {t('promotionSlotConfig:colAlgoName')}
            </div>
            <Select
              placeholder={t('promotionSlotConfig:selectAlgoPlaceholder')}
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              value={currentAlgo?.value}
              options={algorithmOptions.map(a => ({ label: a.label, value: a.value }))}
              onChange={(value) => {
                const algo = algorithmOptions.find(a => a.value === value) ?? null
                setSelectedAlgoType(algo ? algo.type : null)
                setSelectedAlgoBrand(algo ? algo.brand : undefined)
                setCurrentAlgo(algo)
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('promotionSlotConfig:colAlgoType')}</div>
            <Input
              value={selectedAlgoType !== null ? tAlgoTypeLabel(selectedAlgoType) : ''}
              disabled
              placeholder={t('promotionSlotConfig:selectAlgoFirst')}
              style={{ color: selectedAlgoType !== null ? '#333' : '#bfbfbf' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('common:brand')}</div>
            <div style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
              {selectedAlgoBrand ? (
                <BrandTag value={selectedAlgoBrand} />
              ) : (
                <span style={{ color: '#bfbfbf' }}>{t('promotionSlotConfig:selectAlgoFirst')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 区域二：展示位配置（左侧选位 + 右侧已选统计，仿广告购买界面） */}
      <div style={cardShellStyle}>
        {cardTitle(
          <AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
          '#fff7e6', '#fa8c16', t('promotionSlotConfig:posConfigSection'),
          <Select
            value={totalPositions}
            onChange={(val) => setTotalPositions(val)}
            style={{ width: 130, fontSize: 13 }}
            className="slot-pos-select"
            options={[
              { label: t('promotionSlotConfig:topN', { count: 100 }), value: 100 },
              { label: t('promotionSlotConfig:topN', { count: 200 }), value: 200 },
              { label: t('promotionSlotConfig:topN', { count: 300 }), value: 300 },
              { label: t('promotionSlotConfig:topN', { count: 500 }), value: 500 },
            ]}
          />,
        )}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          {/* 左侧：展示位选择 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              maxHeight: 520,
              overflowY: 'auto',
              padding: '12px',
              background: '#fafafa',
              border: '1px solid #e8e8e8',
              borderRadius: 6,
            }}>
              <div ref={slotGridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 8 }}>
                {Array.from({ length: totalPositions }, (_, i) => i + 1).map(pos => {
                  const assigned = slots.find(s => s.position === pos)
                  const slotStyle = assigned ? (SLOT_TYPE_STYLE[assigned.algorithmType] ?? DEFAULT_SLOT_STYLE) : null
                  return (
                    <div
                      key={pos}
                      onClick={() => togglePosition(pos)}
                      style={{
                        position: 'relative',
                        height: 44,
                        borderRadius: 6,
                        border: assigned ? `2px solid ${slotStyle!.border}` : '1px solid #d9d9d9',
                        background: assigned ? slotStyle!.bg : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        overflow: 'hidden',
                      }}
                      title={assigned ? `${pos}：${assigned.algorithmName}（${tAlgoTypeLabel(assigned.algorithmType)}）` : undefined}
                    >
                      {assigned ? (
                        <>
                          {/* 左上角位置编号 */}
                          <span style={{
                            position: 'absolute', top: 2, left: 4, zIndex: 1,
                            fontSize: 10, fontWeight: 700, lineHeight: 1, color: slotStyle!.text,
                          }}>{pos}</span>
                          {/* 算法類型居中固定展示 + 名稱換行（僅超出寬度時跑馬燈） */}
                          <div style={{
                            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 2, padding: '8px 2px 2px',
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, color: slotStyle!.text, whiteSpace: 'nowrap' }}>
                              {tAlgoTypeLabel(assigned.algorithmType)}
                            </span>
                            {slotCellWidth > 0 && estimateTextWidth(assigned.algorithmName, 9) > slotCellWidth - 6 ? (
                              <div style={{ width: '100%', overflow: 'hidden', height: 11, lineHeight: '11px' }}>
                                <span className="slot-marquee-text" style={{ fontSize: 9, fontWeight: 500, color: slotStyle!.text }}>
                                  {assigned.algorithmName}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 9, fontWeight: 500, lineHeight: 1, color: slotStyle!.text, whiteSpace: 'nowrap' }}>
                                {assigned.algorithmName}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div style={{
                          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, color: '#333',
                        }}>
                          {t('promotionSlotConfig:posNum', { pos })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 右侧：已选坑位统计（始终可见，独立滚动） */}
          <div style={{
            width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
            border: slots.length > 0 ? '1px solid #ffd591' : '1px solid #f0f0f0',
            borderRadius: 8, background: slots.length > 0 ? '#fff7e6' : '#fafafa',
            padding: '12px 10px 12px 12px', maxHeight: 560,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>
                {t('promotionSlotConfig:slotStats', { count: slots.length })}
              </span>
              {slots.length > 0 && (
                <Button
                  size="small"
                  onClick={clearAllPositions}
                  style={{ fontSize: 12, padding: '0 8px', height: 22 }}
                >
                  {t('promotionSlotConfig:clearAll')}
                </Button>
              )}
            </div>
            {slots.length > 0 ? (
              <div style={{
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                {Object.values(
                  slots.reduce<Record<string, SlotDraft[]>>((acc, cur) => {
                    (acc[cur.algorithmId] = acc[cur.algorithmId] || []).push(cur)
                    return acc
                  }, {}),
                ).map(group => {
                  const gStyle = SLOT_TYPE_STYLE[group[0].algorithmType] ?? DEFAULT_SLOT_STYLE
                  return (
                    <div key={group[0].algorithmId} style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      padding: '4px 10px', borderRadius: 6,
                      background: gStyle.bg, border: `1px solid ${gStyle.border}`,
                    }}>
                      <Tag color={ALGO_TYPE_COLOR[group[0].algorithmType] ?? 'default'} style={{ margin: 0, flexShrink: 0 }}>
                        {tAlgoTypeLabel(group[0].algorithmType)}
                      </Tag>
                      <span style={{ fontSize: 12, fontWeight: 600, color: gStyle.text, flexShrink: 0 }}>{group[0].algorithmName}</span>
                      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', marginLeft: 'auto' }}>
                        {[...group].sort((a, b) => a.position - b.position).map(p => (
                          <Tag
                            key={p.position}
                            closable
                            onClose={() => removePosition(p.position)}
                            style={{ margin: 0, fontSize: 11, background: '#fff', borderColor: gStyle.border, color: gStyle.text }}
                          >
                            {t('promotionSlotConfig:posNum', { pos: p.position })}
                          </Tag>
                        ))}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#bfbfbf', fontSize: 13 }}>
                {t('promotionSlotConfig:noPosSelected')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common:cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>{t('common:save')}</Button>
      </div>
    </div>
  )
}
