/**
 * 人氣商家 - 展示樣式預覽彈窗（共享組件）
 *
 * 用於算法配置、皮膚定價、皮膚套件等模塊，
 * 點擊「預覽樣式」按鈕打開彈窗，以模擬 APP 瀑布流卡片效果直觀查看三種展示風格。
 * 樣式與廣告銷售 - 人氣商家卡片右側預覽區域保持一致。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Modal } from 'antd'
import { EyeOutlined } from '@ant-design/icons'

/* ──────────── Mock 數據（與 AdSales/PopularSkinPicker 一致） ──────────── */

const PREVIEW_DISHES = [
  { emoji: '🍔', name: '招牌雙層牛堡·特惠一人餐', price: '$43.3', original: '$65', discount: '6.6折', bg: 'linear-gradient(135deg, #FFE2B8, #FFAE5E)' },
  { emoji: '🍟', name: '黃金薯條（大）', price: '$12.9', original: '$19', discount: '6.8折', bg: 'linear-gradient(135deg, #FFF3C4, #FFD662)' },
  { emoji: '🥤', name: '冰爽可樂（中）', price: '$5.9', original: '$9', discount: '6.5折', bg: 'linear-gradient(135deg, #C9E7FF, #7FB8F0)' },
  { emoji: '🍦', name: '新地雪糕', price: '$8.9', original: '$12', discount: '7.4折', bg: 'linear-gradient(135deg, #FFE9F0, #FFC1D4)' },
]

const POSTER_SLOGANS = ['人氣商家', '人氣爆棚', '人氣之選', '人氣王牌', '人氣好店', '人氣首選']

const tagStyle = (color: string, bg: string): CSSProperties => ({
  fontSize: 9, color, background: bg, borderRadius: 3, padding: '1px 4px', whiteSpace: 'nowrap', flexShrink: 0,
})

/* ──────────── 店鋪 LOGO ──────────── */
function StoreLogo({ size }: { size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: '#DA291C', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    }}>
      <span style={{
        fontSize: Math.round(size * 0.5), fontWeight: 900, color: '#FFC72C',
        fontFamily: '"Arial Black", "Arial Rounded MT Bold", sans-serif',
        lineHeight: 1, letterSpacing: -1, textShadow: '0 1px 1px rgba(0,0,0,0.18)',
      }}>M</span>
      <span style={{ fontSize: Math.max(7, Math.round(size * 0.16)), color: '#fff', fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>麥當勞</span>
    </div>
  )
}

/* ──────────── 店鋪信息行 ──────────── */
function InfoRows({ nameSize = 13 }: { nameSize?: number } = {}) {
  return (
    <>
      <div style={{ fontSize: nameSize, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        McDonald's（氹仔泉福店）
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#FA8C16' }}>⭐ 4.6</span>
        <span style={{ fontSize: 10, color: '#8C8C8C' }}>月售 1196</span>
        <span style={{ fontSize: 10, color: '#8C8C8C' }}>起送$40・減配$0~3・32分鐘・1.9km</span>
      </div>
    </>
  )
}

/* ──────────── 標籤行 ──────────── */
function TagsRow() {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
      <span style={tagStyle('#1565C0', '#E3F2FD')}>全澳銷量第1名</span>
      <span style={tagStyle('#722ED1', '#F9F0FF')}>熱門店鋪</span>
      <span style={tagStyle('#D46B08', '#FFF3E8')}>金黃酥脆，澳門人氣漢堡首選！</span>
      <span style={tagStyle('#8C8C8C', '#F5F5F5')}>千人收藏好店</span>
    </div>
  )
}

/* ──────────── 菜品佈局① 大圖拼列 ──────────── */
function DishGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6, marginTop: 8 }}>
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: PREVIEW_DISHES[0].bg, height: 92 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54, lineHeight: 1 }}>
          {PREVIEW_DISHES[0].emoji}
        </div>
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 6px 4px',
          background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.55))',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{PREVIEW_DISHES[0].price}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', textDecoration: 'line-through', marginLeft: 4 }}>{PREVIEW_DISHES[0].original}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PREVIEW_DISHES.slice(1, 3).map(dish => (
          <div key={dish.name} style={{
            borderRadius: 8, background: dish.bg, height: 43,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, lineHeight: 1,
          }}>{dish.emoji}</div>
        ))}
      </div>
    </div>
  )
}

/* ──────────── 菜品佈局② 階梯輪播 ──────────── */
function DishCarousel() {
  const depthStyles: CSSProperties[] = [
    { top: 0, bottom: 0, left: 0, right: '28%', zIndex: 3, opacity: 1, transform: 'translateX(0)', boxShadow: '3px 0 10px rgba(0,0,0,0.12)' },
    { top: 6, bottom: 6, left: 22, right: 0, zIndex: 2, opacity: 0.75, transform: 'translateX(0)', boxShadow: 'none' },
    { top: 12, bottom: 12, left: 44, right: -4, zIndex: 1, opacity: 0.5, transform: 'translateX(0)', boxShadow: 'none' },
  ]
  return (
    <div style={{ position: 'relative', height: 104, marginTop: 8, overflow: 'hidden' }}>
      {PREVIEW_DISHES.map((dish, i) => {
        const depth = i % 3
        const style = depthStyles[depth]
        const isFront = depth === 0
        return (
          <div key={dish.name} style={{
            position: 'absolute', borderRadius: 8, overflow: 'hidden', background: dish.bg, pointerEvents: 'none',
            ...style,
          }}>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isFront ? 72 : 48, lineHeight: 1,
              transform: isFront ? 'scale(1)' : 'scale(0.6)',
            }}>{dish.emoji}</div>
            {isFront && (
              <>
                <div style={{ position: 'absolute', left: 5, bottom: 22, display: 'flex', alignItems: 'stretch', borderRadius: 10, overflow: 'hidden' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#E8302D', background: '#fff', padding: '2px 5px' }}>🏷️ {dish.discount}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#E8302D', padding: '2px 5px', display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    {dish.price}
                    <span style={{ fontSize: 8, fontWeight: 400, color: 'rgba(255,255,255,0.8)', textDecoration: 'line-through' }}>{dish.original}</span>
                  </span>
                </div>
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, padding: '2px 6px',
                  background: 'rgba(255,255,255,0.92)', fontSize: 10, fontWeight: 600, color: '#262626',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{dish.name}</div>
              </>
            )}
          </div>
        )
      })}
      {/* 輪播指示點 */}
      <div style={{ position: 'absolute', right: 3, bottom: 3, zIndex: 5, display: 'flex', gap: 3 }}>
        {PREVIEW_DISHES.map((_, i) => (
          <span key={i} style={{
            width: i === 0 ? 10 : 4, height: 4, borderRadius: 2,
            background: i === 0 ? '#E8302D' : '#D9D9D9',
          }} />
        ))}
      </div>
    </div>
  )
}

/* ──────────── 卡片邊框樣式（模擬皮膚邊框效果） ──────────── */
const BORDER_COLOR = '#E8720C'
const cardWithBorder: CSSProperties = {
  position: 'relative', background: '#fff', borderRadius: 10, padding: '12px 14px',
  border: `2px solid ${BORDER_COLOR}`,
  boxShadow: `0 2px 8px ${BORDER_COLOR}33`,
}

/* ──────────── 左側豎版主圖（人氣商家宣傳海報） ──────────── */
function PosterImage() {
  return (
    <div style={{
      position: 'relative', width: 84, flexShrink: 0, alignSelf: 'stretch', borderRadius: 8,
      background: 'linear-gradient(135deg, #E8720C, #F59432)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 6px 8px',
    }}>
      {/* 光影縱深 */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.28) 100%)' }} />
      {/* 巨型水印「人」字 */}
      <span style={{
        position: 'absolute', bottom: -14, right: -10, fontSize: 88, fontWeight: 900, lineHeight: 1,
        color: 'rgba(255,255,255,0.12)', userSelect: 'none', pointerEvents: 'none',
      }}>人</span>
      <StoreLogo size={40} />
      {/* 豎排標語 */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          writingMode: 'vertical-rl', fontSize: 19, fontWeight: 900, letterSpacing: 7, lineHeight: 1,
          background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0.55) 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>人氣商家</span>
      </div>
      <span style={{ position: 'relative', fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 3, whiteSpace: 'nowrap' }}>POPULAR</span>
    </div>
  )
}

/* ──────────── 瀑布流上下文對比卡片（模糊的上下鄰卡） ──────────── */
function WaterfallContext({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 上方鄰卡（模糊淡化） */}
      <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍜</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>老友記茶餐廳</div>
              <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>★4.2 月售 866</div>
            </div>
          </div>
        </div>
      </div>
      {/* 當前卡片 + 「您的門店」標籤 */}
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', top: -9, right: 10, zIndex: 1,
          fontSize: 10, color: '#fff', fontWeight: 600,
          background: 'linear-gradient(135deg, #E8720C, #F59432)',
          borderRadius: 8, padding: '1px 8px', lineHeight: '16px',
          boxShadow: '0 2px 6px rgba(232,114,12,0.35)',
        }}>您的門店</span>
        {children}
      </div>
      {/* 下方鄰卡（模糊淡化） */}
      <div style={{ filter: 'blur(0.5px)', opacity: 0.8, transform: 'scale(0.97)', pointerEvents: 'none' }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>☕</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#262626' }}>街角咖啡</div>
              <div style={{ fontSize: 10, color: '#8C8C8C', marginTop: 3 }}>★4.6 月售 1024</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────── 主組件 ──────────── */
export default function PopularLayoutPreviewModal() {
  const [visible, setVisible] = useState(false)
  const [bigLayoutTab, setBigLayoutTab] = useState<'grid' | 'carousel'>('grid')

  return (
    <>
      <Button
        icon={<EyeOutlined />}
        size="small"
        onClick={() => setVisible(true)}
        style={{
          borderRadius: 6,
          borderColor: '#52C41A',
          color: '#52C41A',
          fontSize: 12,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        預覽樣式
      </Button>
      <Modal
        title="人氣商家 — 展示樣式預覽"
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        width={500}
        centered
      >
        <div style={{ background: '#F5F5F5', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ===== 小圖模式 ===== */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>📱 小圖模式</div>
              <WaterfallContext>
                <div style={cardWithBorder}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <StoreLogo size={56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <InfoRows />
                    </div>
                  </div>
                  <TagsRow />
                </div>
              </WaterfallContext>
            </div>

            {/* ===== 大圖模式 ===== */}
            <div>
              {/* 標題 + Tab 切換（同定價預覽樣式） */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>🖼️ 大圖模式</span>
                {([['grid', '大圖拼列（1大2小）'], ['carousel', '階梯輪播']] as const).map(([key, label]) => (
                  <span
                    key={key}
                    onClick={() => setBigLayoutTab(key)}
                    style={{
                      fontSize: 11, cursor: 'pointer', borderRadius: 4, padding: '1px 8px', lineHeight: '18px',
                      color: bigLayoutTab === key ? '#E8720C' : '#8C8C8C',
                      background: bigLayoutTab === key ? '#FFF7E6' : '#F0F0F0',
                      border: `1px solid ${bigLayoutTab === key ? '#E8720C' : 'transparent'}`,
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >{label}</span>
                ))}
              </div>
              <WaterfallContext>
                <div style={cardWithBorder}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                    <PosterImage />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <InfoRows />
                      <TagsRow />
                      {bigLayoutTab === 'grid' ? <DishGrid /> : <DishCarousel />}
                    </div>
                  </div>
                </div>
              </WaterfallContext>
              {/* 風格分配說明 */}
              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 8, lineHeight: 1.7 }}>
                💡 大圖模式風格由系統隨機分配，在皮膚支持的風格間自動切換展示，商家無需選擇；在瀑布流第幾個位置以大圖模式展示，同樣由系統策略決定
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
            店鋪名稱、評分、商品圖與優惠信息為示意數據，實際以商家數據自動生成為準
          </div>
        </div>
      </Modal>
    </>
  )
}
