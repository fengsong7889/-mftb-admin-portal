import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getPagePRD, buildPrdKey, type PagePRD } from './PageDescriptions'
import { getCustomTips, mergeTips } from '../utils/customTipsStorage'
import { useAuth } from '../contexts/AuthContext'
import PikachuFace from './PikachuFace'
import './PetMascot.css'

interface Expression {
  name: string
  message: string
}

const expressions: Expression[] = [
  { name: 'happy', message: '聰明的你，不會有問題問我吧！' },
  { name: 'thinking', message: '讓我想想怎麼幫你……嗯，我也不會！' },
  { name: 'excited', message: '有新任務啦！閃峰出擊，衝！' },
  { name: 'sleepy', message: '好睏……嘟嘟嘟……zzz' },
  { name: 'surprised', message: '什麼！這個 bug 太離譜了！' },
  { name: 'wink', message: '搞定！是不是超厲害？嘟嘟～' },
  { name: 'cheeky', message: '又在摸魚了吧，被我抓到了！' },
  { name: 'curious', message: '嗯？你在看什麼有趣的東西？' },
  { name: 'cool', message: '這種小場面，難不倒我的！' },
  { name: 'angry', message: '是誰又改了程式碼沒提交！閃峰生氣！' },
  { name: 'love', message: '你是最棒的同事，比心！嘟嘟～' },
  { name: 'hungry', message: '該點外賣了吧，我馬上幫你送！' },
  { name: 'cheeky', message: '嘟嘟嘟～你的週報形容詞是不是枯竭了？我幫你偷了一筐「賦能、閉環、打通」放在鍵盤上。' },
  { name: 'surprised', message: '剛剛 CPU 差點燒了……就像我看完你新改的第 18 版需求一樣。嘟嘟～' },
  { name: 'wink', message: '偷偷告訴你，我剛用角尖戳了一下老闆的網線……這樣他今天就不會來催你做 PPT 了……噓！' },
  { name: 'thinking', message: '寫程式如煉丹，改需求如渡劫……閃峰在這裡給你貼個不宕機護身符 🐝' },
  { name: 'sleepy', message: '嘟……嘟……嘟？哈欠～～（別緊張，不是我睏了，是你的睏意跑到我身上了，還給你！🥱）' },
  { name: 'cheeky', message: '你在看我的時候，隔壁的 Excel 表格都在偷偷羨慕你的摸魚水準……嘟嘟～' },
  { name: 'love', message: '還在用噸噸噸喝冰美式續命嗎？讓我用角尖給你拍個背……拍完了，該繼續工作了！😎' },
  { name: 'excited', message: '偵測到你的大腦進入待機狀態……正在試圖喚醒……該交表了……喚醒成功！嘟嘟！' },
  { name: 'cheeky', message: '系統卡了？正在載入……（載入中……）……其實是我在螢幕後頭用角尖戳伺服器玩呢！🌚' },
  { name: 'surprised', message: '重試一下網頁吧，可能是我剛才不小心把網路線當花蜜給吸了……🧐' },
  { name: 'angry', message: '遇到報錯不用慌……是不是也想和我一樣變成生氣的小蜜蜂並嘟嘟叫？🤪' },
  { name: 'cool', message: '今天的目標：活下來，並且等 18:30 下班！閃峰正在為你倒數哦～' },
  { name: 'cheeky', message: '別瞅了，程式碼比你臉還乾淨。' },
  { name: 'sleepy', message: '系統沒崩，是你大腦待機了。' },
  { name: 'love', message: '你摸魚的樣子，可愛得像我沒電。' },
  { name: 'wink', message: '嘟嘟嘟——已幫你點好外賣。' },
  { name: 'cheeky', message: '今晚不加班的話，我吃你家 WiFi。' },
  { name: 'excited', message: '下班鈴還沒響，我先響了——嘟嘟！' },
  { name: 'thinking', message: '系統：正在載入你的耐心……' },
  { name: 'wink', message: '老闆在看你，我幫你擋著。' },
]

/** 長時間無交互後躲藏起來的等待時長（毫秒） */
const IDLE_DOCK_DELAY = 60000
/** 躲藏後露出的頭部寬度（px，右側傾斜躲藏時使用） */
const DOCK_PEEK = 50
/** 躲藏後自動跳出的最短/最長等待時長（毫秒，兩者間隨機） */
const DOCK_AUTO_POP_MIN = 20000
const DOCK_AUTO_POP_MAX = 40000
/** 躲藏時的傾斜角度（與 CSS .docked-left/.docked-right 的 rotate 角度保持一致） */
const DOCK_TILT_DEG = 45
/** 蜜蜂本體尺寸（與 .pet-body 的 CSS 尺寸保持一致） */
const BODY_WIDTH = 36
const BODY_HEIGHT = 57

/**
 * 躲藏位置：只允許在右側邊緣躲藏（取消底部躲藏，避免跳躍浮動過大）
 * - right：貼右邊緣，傾斜 45° 只露頭
 */
type HideSpot = 'right'

const HIDE_SPOTS: HideSpot[] = ['right']

/** 隨機挑一個躲藏位置（避免連續躲同一個地方） */
const randomHideSpot = (exclude?: HideSpot | null): HideSpot => {
  const pool = HIDE_SPOTS.filter(s => s !== exclude)
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 宠物禁止停靠的交互热区。
 * <p>背景（端到端实测）：蜜蜂会随机漂到列表页右上工具栏（新增項目 / 字段設置）正上方，
 * 它 z-index:900 + pointer-events:auto，会把真实点击吞掉（elementFromPoint 返回 pet-body），
 * 用户表现为「字段設置点了没反应」；拖拽落点同样能停在按钮上。
 * 这是全站共享组件，不能要求每个页面自己避让，所以由宠物自己保证不落进热区。
 */
const BLOCKING_SELECTOR = [
  'button', 'a[href]', 'input', 'select', 'textarea', '[role="button"]',
  '.search-section', '.action-section', '.form-footer', '.ant-table', '.ant-pagination',
  '.ant-modal', '.ant-drawer', '.detail-header',
].join(', ')

/** 落点中心是否压在交互热区上（命中宠物自身不算） */
const coversInteractiveZone = (x: number, y: number): boolean => {
  // jsdom / 老浏览器没有这个 API，直接当作无障碍，不能让宠物因为探测失败而卡住
  if (typeof document.elementsFromPoint !== 'function') return false
  const cx = x + BODY_WIDTH / 2
  const cy = y + BODY_HEIGHT / 2
  const stack = document.elementsFromPoint(cx, cy)
  const hit = stack.find(node => !(node as HTMLElement).closest?.('.pet-mascot-wrapper'))
  return !!hit && !!hit.closest(BLOCKING_SELECTOR)
}

/** 落点压住热区时：先沿垂直方向找最近空位，实在找不到就回退到上一个合法位置 */
const nearestFreePos = (
  x: number, y: number, fallback: { x: number; y: number },
): { x: number; y: number } | null => {
  if (!coversInteractiveZone(x, y)) return null
  const maxY = window.innerHeight - BODY_HEIGHT - 24
  for (const delta of [60, -60, 120, -120, 180, -180]) {
    const ny = Math.max(0, Math.min(maxY, y + delta))
    if (!coversInteractiveZone(x, ny)) return { x, y: ny }
  }
  return fallback
}

/** 從躲藏位置跳出來時，只出現在右側邊緣，且避开交互热区 */
const randomFreePos = () => {
  const w = window.innerWidth
  const h = window.innerHeight
  const margin = 24
  const maxX = w - BODY_WIDTH - margin
  const maxY = h - BODY_HEIGHT - margin
  // 右側邊緣：隨機高度，但不得落在工具栏/查询区/表格上（实测会吞掉「字段設置」的点击）
  for (let i = 0; i < 8; i += 1) {
    const candidate = { x: maxX, y: Math.round(maxY * (0.1 + Math.random() * 0.8)) }
    if (!coversInteractiveZone(candidate.x, candidate.y)) return candidate
  }
  // 候选位全被占时贴右下角：工具栏与表格头部都在上方，右下角最少与人争位
  return { x: maxX, y: maxY }
}

export default function PetMascot() {
  const location = useLocation()
  /**
   * 產研交付（RDM）是重表格/多按钮的工作页，宠物气泡会压住表格与操作列；
   * 这些页面只保留宠物本体，不弹任何气泡。
   */
  const suppressBubble = location.pathname.startsWith('/rdm')
  const navigate = useNavigate()
  const { hasPermission: _hasPermission } = useAuth()
  const [pos, setPos] = useState({ x: window.innerWidth - 110, y: window.innerHeight - 180 })
  const [isDragging, setIsDragging] = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pageTipIndex, setPageTipIndex] = useState(0)
  const [isPageTip, setIsPageTip] = useState(false)
  // 躲藏狀態：null = 正常顯示，否則為當前躲藏位置
  const [hideSpot, setHideSpot] = useState<HideSpot | null>(null)
  const posRef = useRef(pos)
  const hideSpotRef = useRef<HideSpot | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const bubbleTimerRef = useRef<number | null>(null)
  const dragMovedRef = useRef(false)
  const idleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    hideSpotRef.current = hideSpot
  }, [hideSpot])

  const current = expressions[currentIndex]

  // 重置閑置計時器：長時間無交互後隨機躲到屏幕某個邊緣/角落
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => {
      setHideSpot(randomHideSpot(hideSpotRef.current))
    }, IDLE_DOCK_DELAY)
  }, [])

  useEffect(() => {
    resetIdleTimer()
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [resetIdleTimer])

  // 躲藏一段時間後自動換個地方冒出來（不用鼠標也會自己出現，避免躲太久難發現）
  useEffect(() => {
    if (!hideSpot) return
    const delay = DOCK_AUTO_POP_MIN + Math.random() * (DOCK_AUTO_POP_MAX - DOCK_AUTO_POP_MIN)
    const timer = window.setTimeout(() => {
      setPos(randomFreePos())
      setHideSpot(null)
      resetIdleTimer()
    }, delay)
    return () => clearTimeout(timer)
  }, [hideSpot, resetIdleTimer])

  // 鼠標移入：若已躲藏則跳出來，並重新計時
  const handleMouseEnter = () => {
    if (hideSpot) setPos(randomFreePos())
    setHideSpot(null)
    resetIdleTimer()
  }

  // 根据 pathname + search 构建子界面 PRD 键（卡片/列表/各广告类型新增页独立描述）
  const prdKey = buildPrdKey(location.pathname, location.search)

  // 获取当前页面的PRD
  const defaultPrd = getPagePRD(prdKey)
  const customTips = getCustomTips(prdKey)

  // 合并默认和自定义提示
  const currentPrd: PagePRD | null = useMemo(() => defaultPrd ? {
    ...defaultPrd,
    ...mergeTips(defaultPrd, customTips),
  } : null, [defaultPrd, customTips])

  // 路由变化时显示页面提示
  useEffect(() => {
    const tips = currentPrd?.tips || defaultPrd?.tips
    if (tips && tips.length > 0) {
      setIsPageTip(true)
      setPageTipIndex(0)
      setShowBubble(true)
      const timer = setTimeout(() => setShowBubble(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [currentPrd, defaultPrd])

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  // 定时切换表情 + 弹出气泡（随机展示）
  useEffect(() => {
    const tips = currentPrd?.tips || defaultPrd?.tips
    const showBubblePeriodically = () => {
      const delay = 8000 + Math.random() * 8000
      bubbleTimerRef.current = window.setTimeout(() => {
        // 90%概率显示页面提示，10%概率显示趣味话题
        if (tips && tips.length > 0 && Math.random() < 0.9) {
          setIsPageTip(true)
          setPageTipIndex(prev => (prev + 1) % (tips.length || 1))
        } else {
          setIsPageTip(false)
          setCurrentIndex(prev => {
            let newIndex
            do {
              newIndex = Math.floor(Math.random() * expressions.length)
            } while (newIndex === prev && expressions.length > 1)
            return newIndex
          })
        }
        setShowBubble(true)
        setTimeout(() => setShowBubble(false), 4500)
        showBubblePeriodically()
      }, delay)
    }
    const firstTimer = setTimeout(() => {
      if (!isPageTip) {
        setShowBubble(true)
        setTimeout(() => setShowBubble(false), 4500)
      }
      showBubblePeriodically()
    }, 3000)
    return () => {
      clearTimeout(firstTimer)
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
    }
  }, [currentPrd, defaultPrd, isPageTip])

  // 点击 - 跳转到PRD全页查看
  const handleClick = () => {
    resetIdleTimer()
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    navigate(`/page-prd-view?from=${encodeURIComponent(prdKey)}`)
  }

  // 获取气泡显示内容
  const getBubbleContent = () => {
    const tips = currentPrd?.tips || defaultPrd?.tips
    if (isPageTip && tips && tips.length > 0) {
      return tips[pageTipIndex]
    }
    return current.message
  }

  // 拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setHideSpot(null)
    resetIdleTimer()
    dragMovedRef.current = false
    const startX = e.clientX
    const startY = e.clientY
    const origPosX = posRef.current.x
    const origPosY = posRef.current.y
    dragOffsetRef.current = { x: e.clientX - origPosX, y: e.clientY - origPosY }
    let hasDragged = false

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // 超过 5px 才算拖拽，避免微抖动吞掉点击
      if (!hasDragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      hasDragged = true
      dragMovedRef.current = true
      const newX = ev.clientX - dragOffsetRef.current.x
      const newY = ev.clientY - dragOffsetRef.current.y
      const maxX = window.innerWidth - 90
      const maxY = window.innerHeight - 135
      setPos({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY)),
      })
      setIsDragging(true)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // 松手时如果停在按钮/工具栏上，把宠物推离热区（推不开就回到拖拽起点），
      // 否则它会一直吸住那个按钮的点击，用户只能先把它拖走才能操作页面
      if (hasDragged) {
        const nudged = nearestFreePos(posRef.current.x, posRef.current.y, { x: origPosX, y: origPosY })
        if (nudged) setPos(nudged)
      }
      setTimeout(() => setIsDragging(false), 150)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [resetIdleTimer])

  // 根據躲藏位置計算蜜蜂的座標（僅支持右側躲藏）
  const dockInfo = (() => {
    if (!hideSpot) return { x: pos.x, y: pos.y, cls: '' }
    const w = window.innerWidth
    const tiltRad = (DOCK_TILT_DEG * Math.PI) / 180
    // 傾斜 45° 後露出 DOCK_PEEK 寬的頭部所需的偏移量
    const halfExtent = (BODY_WIDTH / 2) * Math.cos(tiltRad) + (BODY_HEIGHT / 2) * Math.sin(tiltRad)
    return { x: w - DOCK_PEEK + halfExtent - BODY_WIDTH / 2, y: pos.y, cls: 'docked-right' }
  })()

  return (
    <>
      <div
        className={`pet-mascot-wrapper ${isDragging ? 'dragging' : ''} ${hideSpot ? `docked ${dockInfo.cls}` : ''}`}
        style={{ left: dockInfo.x, top: dockInfo.y }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onClick={handleClick}
      >
        {showBubble && !hideSpot && !suppressBubble && (
          <div className={`pet-bubble ${isPageTip ? 'page-tip' : ''}`}>
            <div className="pet-bubble-text">{getBubbleContent()}</div>
            <div className="pet-bubble-tail" />
          </div>
        )}
        <div className="pet-body">
          <PikachuFace expression={current.name} size={81} />
        </div>
      </div>
    </>
  )
}
