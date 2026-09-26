import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import worldSource from 'world-atlas/countries-110m.json?raw'
import { getPortalSystemKey, type PortalSystemKey } from '../../constants/portalSystems'

/** 自绘业务场景，不依赖外链；状态文案随门户语言切换。 */
function Sheet({ x, y, width = 104, height = 112 }: { x: number; y: number; width?: number; height?: number }) {
  return (
    <g>
      <rect x={x + 5} y={y + 5} width={width} height={height} rx="8" fill="currentColor" opacity="0.1" />
      <rect x={x} y={y} width={width} height={height} rx="8" fill="#fff" stroke="currentColor" strokeOpacity="0.2" />
      <rect x={x + 14} y={y + 15} width={width * 0.4} height="5" rx="2.5" fill="currentColor" opacity="0.6" />
      <path d={`M${x + 14} ${y + 31}h${width - 28}`} stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
    </g>
  )
}

function Person({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cy="-12" r="13" fill="#fff" />
      <circle cy="-12" r="9" fill="currentColor" opacity="0.65" />
      <path d="M-23 26v-7a23 23 0 0 1 46 0v7Z" fill="currentColor" />
      <path d="m-8-1 8 13 8-13" fill="#fff" opacity="0.9" />
    </g>
  )
}

function Coins({ x, y, rows }: { x: number; y: number; rows: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: rows }, (_, index) => (
        <g key={index} transform={`translate(0 ${-index * 7})`}>
          <path d="M-18-4v7c0 8 36 8 36 0v-7" fill="#E8720C" stroke="#fff" strokeWidth="1" />
          <ellipse rx="18" ry="6" cy="-4" fill="#F59432" stroke="#FFF7F0" />
          <path d="M-5-4H5" stroke="#fff" strokeWidth="2" />
        </g>
      ))}
    </g>
  )
}

/** 设备归属与耗材领用共用员工清单，避免把内部物资管理画成物流仓储。 */
function AssetScene() {
  return <g className="portal-eam-scene">
    <rect x="64" y="9" width="192" height="26" rx="8" fill="#fff" />
    <g className="portal-art-motion portal-eam-overview portal-art-static"><ArtworkText label="assetAndSupplies" x={160} y={27} width={176} /></g>
    <g className="portal-art-motion portal-eam-assigned-label" opacity="0"><ArtworkText label="assetAssigned" x={160} y={27} width={176} /></g>
    <g className="portal-art-motion portal-eam-issued-label" opacity="0"><ArtworkText label="suppliesIssued" x={160} y={27} width={176} /></g>

    <g className="portal-eam-laptop">
      <rect x="46" y="55" width="112" height="78" rx="8" fill="currentColor" opacity="0.12" />
      <rect x="41" y="50" width="112" height="78" rx="8" fill="currentColor" />
      <rect x="48" y="57" width="98" height="63" rx="4" fill="#fff" />
      <path d="M58 70h35m-35 5h23" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <circle cx="97" cy="53.5" r="1.5" fill="#fff" />
      <path d="M41 128h112l14 11q-2 5-10 5H37q-8 0-10-5Z" fill="#F59432" />
      <path d="M83 129h28l5 7H78Z" fill="#fff" opacity="0.65" />
      <g className="portal-art-motion portal-eam-asset-tag">
        <path d="m59 89 9-8h61v28H68l-9-8Z" fill="#FFF7F0" stroke="currentColor" strokeOpacity="0.4" />
        <circle cx="69" cy="95" r="2.5" fill="currentColor" />
        <text x="78" y="99" fontFamily="monospace" fontSize="11" fontWeight="600" fill="currentColor">IT-024</text>
      </g>
      <g className="portal-art-motion portal-eam-registered" opacity="0">
        <circle cx="145" cy="55" r="10" fill="#52C41A" stroke="#fff" strokeWidth="2" />
        <path d="m140 55 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" />
      </g>
    </g>

    <path d="M155 92h18q9 0 9 9v2q0 9 9 9h15" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" strokeDasharray="3 5" />
    <path className="portal-art-motion portal-eam-assignment-path" pathLength="1" d="M155 92h18q9 0 9 9v2q0 9 9 9h15" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0" />

    <g className="portal-eam-custodian">
      <rect x="211" y="51" width="80" height="115" rx="9" fill="currentColor" opacity="0.1" />
      <rect x="206" y="46" width="80" height="115" rx="9" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <rect x="233" y="42" width="26" height="8" rx="4" fill="currentColor" />
      <g color="#1890FF"><Person x={227} y={72} scale={0.45} /></g>
      <path d="M244 64h29m-29 9h21" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <ArtworkText label="assetCustodian" x={246} y={95} width={66} />
      <rect x="213" y="102" width="66" height="23" rx="4" fill="currentColor" opacity="0.06" />
      <path d="M217 107h16v10h-16Zm-2 13h20" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M242 110h17m-17 7h12" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <circle cx="271" cy="113" r="5" fill="none" stroke="#D9D9D9" strokeWidth="1.5" />
      <g className="portal-art-motion portal-eam-asset-confirm" opacity="0">
        <circle cx="271" cy="113" r="6" fill="#52C41A" />
        <path d="m268 113 2 2 4-4" fill="none" stroke="#fff" strokeWidth="1.5" />
      </g>
      <rect x="213" y="130" width="66" height="24" rx="4" fill="currentColor" opacity="0.06" />
      <rect x="215" y="133" width="15" height="18" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 3" />
      <path d="M242 139h17m-17 7h12" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <circle cx="271" cy="142" r="5" fill="none" stroke="#D9D9D9" strokeWidth="1.5" />
      <g className="portal-art-motion portal-eam-supply-confirm" opacity="0">
        <circle cx="271" cy="142" r="6" fill="#52C41A" />
        <path d="m268 142 2 2 4-4" fill="none" stroke="#fff" strokeWidth="1.5" />
      </g>
    </g>

    <g className="portal-eam-stationery">
      <path d="m42 151-4-24m10 24 5-27m-7 25 1-19" stroke="#1890FF" strokeWidth="3" />
      <path d="M34 147h23l-3 23H37Z" fill="#fff" stroke="#1890FF" strokeWidth="1.5" />
      <path d="M41 153v11m8-11v11" stroke="#1890FF" strokeOpacity="0.3" strokeWidth="2" />
      <rect x="70" y="145" width="29" height="30" rx="3" fill="#fff" stroke="currentColor" strokeOpacity="0.3" />
      <rect x="74" y="141" width="29" height="30" rx="3" fill="#FFF7F0" stroke="currentColor" strokeOpacity="0.4" />
      <g className="portal-eam-supply-balance">
        <rect x="119" y="151" width="63" height="24" rx="7" fill="#fff" stroke="currentColor" strokeOpacity="0.2" />
        <path d="M129 157h10v12h-10Zm3 4h4m-4 4h4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text className="portal-art-motion portal-eam-count-full portal-art-static" x="160" y="169" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">12</text>
        <text className="portal-art-motion portal-eam-count-issued" x="160" y="169" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor" opacity="0">11</text>
        <text className="portal-art-motion portal-eam-deduction" x="185" y="158" fontSize="12" fontWeight="700" fill="#E8720C" opacity="0">−1</text>
      </g>
    </g>
    <g className="portal-art-motion portal-eam-supply">
      <rect x="78" y="138" width="28" height="32" rx="3" fill="#F59432" stroke="currentColor" />
      <path d="M84 139v30" stroke="#fff" strokeOpacity="0.65" strokeWidth="2" />
      <rect x="88" y="145" width="13" height="10" rx="2" fill="#fff" />
      <path d="M91 150h7" stroke="currentColor" strokeWidth="1.5" />
    </g>
  </g>
}

function ArtworkText({ label, x, y, width = 120 }: { label: string; x: number; y: number; width?: number }) {
  const { t } = useTranslation()
  const text = t(`portal.artwork.${label}`)
  return <text x={x} y={y} textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor" textLength={Math.min(width, Array.from(text).length * 12)} lengthAdjust="spacingAndGlyphs">{text}</text>
}

/** 用裁切逐字揭示，避免定时器触发整张卡片重渲染；每个实例使用独立 SVG 标识。 */
function TypedReveal({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const id = useId()
  return <>
    <defs><clipPath id={`${id}-typing`}><rect className="portal-art-motion portal-art-typing" x={x} y={y} width={width} height="24" /></clipPath></defs>
    <g clipPath={`url(#${id}-typing)`}>{children}</g>
  </>
}

type GeoPoint = [number, number]
interface GreetingCountry { code: string; id: string; lang: string; text: string; point: GeoPoint }

// 各国语言是展示样本；地理坐标用于镜头定位，问候语与国家高亮共用同一目标。
const WORLD_GREETINGS: readonly GreetingCountry[] = [
  { code: 'CN', id: '156', lang: 'zh-CN', text: '你好', point: [104, 35] },
  { code: 'US', id: '840', lang: 'en-US', text: 'Hello', point: [-98, 38] },
  { code: 'BR', id: '076', lang: 'pt-BR', text: 'Olá', point: [-52, -12] },
  { code: 'JP', id: '392', lang: 'ja', text: 'こんにちは', point: [138, 37] },
  { code: 'KR', id: '410', lang: 'ko', text: '안녕하세요', point: [128, 36] },
  { code: 'FR', id: '250', lang: 'fr', text: 'Bonjour', point: [2, 47] },
  { code: 'DE', id: '276', lang: 'de', text: 'Hallo', point: [10, 51] },
  { code: 'ES', id: '724', lang: 'es', text: 'Hola', point: [-4, 40] },
  { code: 'EG', id: '818', lang: 'ar', text: 'مرحبًا', point: [30, 27] },
  { code: 'KE', id: '404', lang: 'sw', text: 'Jambo', point: [38, 1] },
  { code: 'ZA', id: '710', lang: 'zu', text: 'Sawubona', point: [25, -29] },
  { code: 'AU', id: '036', lang: 'en-AU', text: 'Hello', point: [134, -25] },
  { code: 'IN', id: '356', lang: 'hi', text: 'नमस्ते', point: [79, 23] },
  { code: 'MX', id: '484', lang: 'es-MX', text: 'Hola', point: [-102, 24] },
  { code: 'RU', id: '643', lang: 'ru', text: 'Привет', point: [90, 60] },
  { code: 'NZ', id: '554', lang: 'mi', text: 'Kia ora', point: [173, -41] },
]
const OCEANS: { label: string; point: GeoPoint }[] = [
  { label: 'pacificOcean', point: [-145, 0] }, { label: 'atlanticOcean', point: [-35, 15] },
  { label: 'indianOcean', point: [75, -22] }, { label: 'arcticOcean', point: [0, 80] },
]
// 随包提供的 Natural Earth 1:110m 数据（world-atlas / ISC），包含完整海岸线及国界，无外链请求。
const WORLD_TOPOLOGY: Topology<{ countries: GeometryCollection; land: GeometryCollection }> = JSON.parse(worldSource)
const WORLD_LAND = feature(WORLD_TOPOLOGY, WORLD_TOPOLOGY.objects.land)
const WORLD_COUNTRIES = feature(WORLD_TOPOLOGY, WORLD_TOPOLOGY.objects.countries)
const COUNTRY_SHAPES = new Map(WORLD_COUNTRIES.features.map(country => [String(country.id), country]))
const WORLD_BORDERS = mesh(WORLD_TOPOLOGY, WORLD_TOPOLOGY.objects.countries, (a, b) => a !== b)
const WORLD_GRID = geoGraticule10()
const GLOBE_TRAVEL_MS = 1800
const GLOBE_HOLD_MS = 1800
const GLOBE_FRAME_MS = 1000 / 30

function createGlobeFrame(center: GeoPoint, country: GreetingCountry, arrived: boolean) {
  const projection = geoOrthographic().translate([160, 94]).scale(86).rotate([-center[0], -center[1]]).precision(0.5)
  const path = geoPath(projection)
  const shape = COUNTRY_SHAPES.get(country.id)
  return {
    center, country, arrived,
    land: path(WORLD_LAND) ?? '', borders: path(WORLD_BORDERS) ?? '', grid: path(WORLD_GRID) ?? '',
    highlight: shape ? path(shape) ?? '' : '',
    pin: projection(country.point) ?? [160, 94], pinVisible: geoDistance(center, country.point) < Math.PI / 2,
    oceans: OCEANS.map(ocean => ({ ...ocean, position: projection(ocean.point) ?? [160, 94], visible: geoDistance(center, ocean.point) < 1.2 })),
  }
}
const STATIC_GLOBE_FRAME = createGlobeFrame(WORLD_GREETINGS[0].point, WORLD_GREETINGS[0], true)

function TranslationScene({ playing }: { playing: boolean }) {
  const id = useId()
  const { t, i18n } = useTranslation()
  const [frame, setFrame] = useState(STATIC_GLOBE_FRAME)
  const view = playing ? frame : STATIC_GLOBE_FRAME
  const countryName = new Intl.DisplayNames([i18n.resolvedLanguage || 'en'], { type: 'region' }).of(view.country.code)

  useEffect(() => {
    if (!playing) { setFrame(STATIC_GLOBE_FRAME); return }
    let frameId = 0
    let started: number | null = null
    let lastDraw = -Infinity
    let holding = false
    let origin = WORLD_GREETINGS[0].point
    let previous = WORLD_GREETINGS[0].code
    const pickCountry = () => {
      const candidates = WORLD_GREETINGS.filter(country => country.code !== previous)
      const country = candidates[Math.floor(Math.random() * candidates.length)]
      previous = country.code
      return country
    }
    let target = pickCountry()
    let interpolate = geoInterpolate(origin, target.point)
    const animate = (timestamp: number) => {
      started ??= timestamp
      let elapsed = timestamp - started
      if (elapsed >= GLOBE_TRAVEL_MS + GLOBE_HOLD_MS) {
        origin = target.point
        target = pickCountry()
        interpolate = geoInterpolate(origin, target.point)
        started = timestamp
        elapsed = 0
        holding = false
      }
      if (timestamp - lastDraw >= GLOBE_FRAME_MS && !holding) {
        const progress = Math.min(1, elapsed / GLOBE_TRAVEL_MS)
        const eased = progress * progress * (3 - 2 * progress)
        setFrame(createGlobeFrame(interpolate(eased), target, progress === 1))
        holding = progress === 1
        lastDraw = timestamp
      }
      frameId = requestAnimationFrame(animate)
    }
    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [playing])

  return <g className="portal-globe-scene" data-country={view.country.code} data-arrived={view.arrived} data-center={view.center.map(value => value.toFixed(2)).join(',')} data-world-source="natural-earth" data-country-count={WORLD_COUNTRIES.features.length}>
    <defs>
      <clipPath id={`${id}-globe`}><circle cx="160" cy="94" r="86" /></clipPath>
      <radialGradient id={`${id}-ocean`} cx="32%" cy="24%" r="80%"><stop stopColor="#fff" /><stop offset="0.35" stopColor="#1890FF" /><stop offset="1" stopColor="#001529" /></radialGradient>
      <radialGradient id={`${id}-shade`} cx="35%" cy="26%" r="75%"><stop offset="0.5" stopColor="#001529" stopOpacity="0" /><stop offset="1" stopColor="#001529" stopOpacity="0.5" /></radialGradient>
    </defs>
    <circle cx="160" cy="94" r="89" fill="#1890FF" opacity="0.13" />
    <circle cx="160" cy="94" r="86" fill={`url(#${id}-ocean)`} />
    <g clipPath={`url(#${id}-globe)`}>
      <path className="portal-globe-land" d={view.land} fill="#52C41A" stroke="#FFF7F0" strokeWidth="0.35" />
      <path className="portal-globe-borders" d={view.borders} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.4" />
      <path className="portal-globe-meridian" d={view.grid} fill="none" stroke="#fff" strokeOpacity="0.17" strokeWidth="0.6" />
      <path className="portal-globe-country" d={view.highlight} fill="#F59432" stroke="#fff" strokeWidth="0.8" />
      <circle cx="160" cy="94" r="86" fill={`url(#${id}-shade)`} />
      {view.oceans.map(ocean => <text key={ocean.label} x={ocean.position[0]} y={ocean.position[1]} textAnchor="middle" fill="#fff" fontSize="8" opacity={ocean.visible ? 0.75 : 0}>{t(`portal.artwork.${ocean.label}`)}</text>)}
    </g>
    <g className="portal-globe-greeting" opacity={view.arrived ? 1 : 0}>
      <rect x="89" y="62" width="142" height="63" rx="12" fill="#fff" fillOpacity="0.92" stroke="#fff" strokeOpacity="0.6" />
      <text lang={view.country.lang} x="160" y="82" textAnchor="middle" fontSize="19" fontWeight="700" fill="#001529">{view.country.text}</text>
      <text x="160" y="114" textAnchor="middle" fontSize="10" fill="#595959">{countryName}</text>
    </g>
    <g className="portal-globe-pin" opacity={view.pinVisible ? 1 : 0}>
      <circle className="portal-art-motion portal-art-signal" cx={view.pin[0]} cy={view.pin[1]} r="6" fill="none" stroke={view.arrived ? '#E8720C' : '#fff'} strokeWidth="1.5" />
      <circle cx={view.pin[0]} cy={view.pin[1]} r="3" fill={view.arrived ? '#E8720C' : '#fff'} />
    </g>
  </g>
}

function Storefront({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-23" y="-3" width="46" height="31" rx="4" fill="#fff" stroke="currentColor" strokeWidth="1.5" />
    <path d="m-26-3 6-15h40l6 15Z" fill="currentColor" />
    {[-26, -13, 0, 13].map((left, index) => <path key={left} d={`M${left}-3h13v5a6.5 6.5 0 0 1-13 0Z`} fill={index % 2 ? '#fff' : 'currentColor'} />)}
    <path d="M-13 28V11h12v17m8-15h9v7H7Z" fill="currentColor" opacity="0.45" />
  </g>
}

const scenes: Record<PortalSystemKey | 'generic', ReactNode> = {
  finance: (
    <>
      <g transform="rotate(-8 137 96)">
        <Sheet x={73} y={28} width={125} height={126} />
        <g className="portal-finance-formulas" fill="currentColor" fontSize="16" fontFamily="Georgia, serif">
          <text x="89" y="84">FV = PV × (1+i)ⁿ</text>
          <text x="89" y="110">Σ CF = 128</text>
          <text x="89" y="135">12 × 8 = 96</text>
        </g>
      </g>
      <g transform="rotate(8 235 108)">
        <rect x="194" y="49" width="82" height="113" rx="10" fill="currentColor" />
        <rect x="202" y="59" width="66" height="30" rx="4" fill="#fff" />
        <TypedReveal x={208} y={63} width={54}>
          <text className="portal-finance-display" x="208" y="80" fontSize="18" fontFamily="monospace" fill="currentColor" textLength="54" lengthAdjust="spacingAndGlyphs">ROI=F/PV</text>
        </TypedReveal>
        {[0, 1, 2, 3].map(row => [0, 1, 2].map(col => <rect key={`${row}-${col}`} className={col === 2 ? 'portal-art-motion portal-finance-key' : undefined} x={204 + col * 21} y={99 + row * 14} width="15" height="9" rx="2" fill="#fff" opacity={col === 2 ? 0.9 : 0.45} />))}
      </g>
      <Coins x={74} y={152} rows={3} />
      <Coins x={109} y={162} rows={5} />
    </>
  ),
  merchant: (
    <>
      <path d="m37 47 79-17 89 13 78-14v124l-78 15-89-13-79 16Z" fill="#fff" stroke="currentColor" strokeOpacity="0.2" />
      <path d="M116 31v123m89-110v123M40 88l239-25M41 140l238-23M65 45l52 109m69-110 59 114" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="4" />
      <path d="m76 119 84-61 84 61" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path className="portal-art-motion portal-merchant-route" pathLength="1" d="m76 119 84-61 84 61" fill="none" stroke="#E8720C" strokeWidth="3" />
      {[[76, 115], [160, 59], [244, 115]].map(([x, y], index) => <g key={x}>
        <ellipse className={`portal-art-motion portal-merchant-pin-${index}`} cx={x} cy={y + 24} rx="31" ry="10" fill="#E8720C" opacity="0.12" />
        <Storefront x={x} y={y} />
        <circle className={`portal-art-motion portal-merchant-pin-${index}`} cx={x + 24} cy={y - 16} r="6" fill="#52C41A" opacity="0" />
      </g>)}
      <rect x="126" y="116" width="68" height="43" rx="6" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      {[0, 1, 2].map(index => <rect key={index} className="portal-art-motion portal-merchant-metric" x={138 + index * 16} y={139 - index * 7} width="9" height={12 + index * 7} rx="2" fill="currentColor" />)}
      <g className="portal-art-motion portal-merchant-summary" opacity="0"><rect x="87" y="7" width="146" height="24" rx="8" fill="#fff" /><ArtworkText label="storesSynced" x={160} y={24} width={134} /></g>
    </>
  ),
  search: (
    <>
      <Sheet x={57} y={48} width={179} height={115} />
      <rect x="72" y="88" width="145" height="24" rx="12" fill="currentColor" opacity="0.08" />
      <rect className="portal-art-motion portal-search-result" x="72" y="88" width="145" height="24" rx="12" fill="#52C41A" fillOpacity="0.15" stroke="#52C41A" strokeWidth="2" opacity="0" />
      <path d="M86 100h73M75 125h73m-73 13h105m-105 12h84" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
      <g className="portal-art-motion portal-search-lens">
        <circle cx="212" cy="105" r="32" fill="#fff" fillOpacity="0.85" stroke="currentColor" strokeWidth="8" />
        <path d="m236 130 24 25" stroke="currentColor" strokeWidth="13" />
        <path className="portal-art-motion portal-search-query portal-art-static" d="M195 98h31m-31 10h23m-23 10h16" stroke="#E8720C" strokeWidth="3" />
        <g className="portal-art-motion portal-search-success-mark" opacity="0">
          <circle cx="212" cy="105" r="19" fill="#52C41A" />
          <path className="portal-art-motion portal-search-check" pathLength="1" d="m202 105 7 7 14-16" fill="none" stroke="#fff" strokeWidth="4" />
          <path d="M172 80l-5-5m-1 30h-7m91-25 5-5m2 29h7" stroke="#52C41A" strokeWidth="2" />
        </g>
        <rect x="126" y="29" width="158" height="28" rx="8" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
        <path d="m200 57 7 7 7-7" fill="#fff" />
        <g className="portal-art-motion portal-search-query portal-art-static"><TypedReveal x={134} y={33} width={142}><ArtworkText label="searching" x={205} y={48} width={142} /></TypedReveal></g>
        <g className="portal-art-motion portal-search-success-label" opacity="0"><ArtworkText label="searchMatched" x={205} y={48} width={142} /></g>
      </g>
    </>
  ),
  ads: (
    <>
      <rect x="176" y="24" width="105" height="140" rx="12" fill="currentColor" />
      <rect x="182" y="32" width="93" height="123" rx="8" fill="#fff" />
      <path d="M210 38h36" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      {[55, 87, 119].map((y, index) => <g key={y}>
        <rect x="188" y={y} width="80" height="26" rx="5" fill="currentColor" opacity="0.08" />
        <circle cx="202" cy={y + 13} r="8" fill="currentColor" opacity={index === 1 ? 0.9 : 0.3} />
        <path d={`M218 ${y + 9}h39m-39 8h26`} stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
      </g>)}
      <rect className="portal-art-motion portal-ads-match" x="187" y="86" width="82" height="28" rx="5" fill="none" stroke="#E8720C" strokeWidth="2" opacity="0" />
      <path className="portal-art-motion portal-ads-stream" d="M143 66q20-22 37-6M145 92h35m-33 24 30 13" fill="none" stroke="#E8720C" strokeWidth="2" strokeDasharray="3 6" />
      <g transform="rotate(-15 103 105)">
        <path d="m70 111 10 40h18l-7-42" fill="currentColor" />
        <path d="M64 82h30l53-28v85l-53-28H64Z" fill="#fff" stroke="currentColor" strokeWidth="3" />
        <path d="m94 82 53-28v85l-53-28Z" fill="currentColor" opacity="0.2" />
        <rect x="56" y="81" width="23" height="31" rx="7" fill="currentColor" />
        <path d="M147 60v74m13-59 16-10m-16 33h20m-20 18 16 10" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path className="portal-art-motion portal-ads-cursor" d="m245 96 1 24 7-7 7 9 5-4-7-9 10-3Z" fill="#001529" stroke="#fff" strokeWidth="1.5" />
      <circle className="portal-art-motion portal-ads-click" cx="245" cy="96" r="12" fill="none" stroke="#E8720C" strokeWidth="3" opacity="0" />
      {[0, 1, 2].map(index => <rect key={index} className="portal-art-motion portal-ads-growth" x={110 + index * 17} y={150 - index * 9} width="11" height={16 + index * 9} rx="3" fill="#52C41A" />)}
      <g className="portal-art-motion portal-ads-result" opacity="0"><rect x="47" y="18" width="110" height="26" rx="8" fill="#fff" /><ArtworkText label="recommendMatched" x={102} y={36} width={98} /></g>
    </>
  ),
  ai: (
    <>
      <path d="M89 76H61V45h37m133 30h30V43h-28M85 129H56v25h41m133-26h31v25h-29" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" fill="none" />
      {[ [98, 45], [233, 43], [97, 154], [232, 153] ].map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="6" fill="currentColor" opacity="0.5" />)}
      <rect x="89" y="52" width="139" height="99" rx="28" fill="currentColor" opacity="0.16" />
      <rect x="82" y="45" width="139" height="99" rx="28" fill="#fff" stroke="currentColor" strokeOpacity="0.3" />
      <path d="M152 45V30" stroke="currentColor" strokeWidth="4" />
      <circle className="portal-art-motion portal-robot-signal" cx="152" cy="27" r="7" fill="#E8720C" />
      <path className="portal-art-motion portal-robot-signal" d="M139 21q13-12 26 0m-32-6q19-17 38 0" fill="none" stroke="#E8720C" strokeWidth="2" opacity="0.5" />
      <rect x="102" y="68" width="99" height="44" rx="17" fill="currentColor" />
      {[125, 178].map(x => <g key={x} className="portal-art-motion portal-robot-eye">
        <ellipse cx={x} cy="89" rx="10" ry="12" fill="#fff" />
        <g className="portal-art-motion portal-robot-pupil">
          <circle cx={x} cy="90" r="5" fill="currentColor" />
          <circle cx={x + 1.5} cy="88" r="1.5" fill="#fff" />
        </g>
      </g>)}
      <path className="portal-art-motion portal-robot-smile" d="M140 124q12 12 24 0" stroke="currentColor" strokeWidth="3" fill="none" />
      <rect x="73" y="81" width="9" height="30" rx="4" fill="currentColor" />
      <rect x="221" y="81" width="9" height="30" rx="4" fill="currentColor" />
      <path d="m245 100 6 15 15 6-15 6-6 15-6-15-15-6 15-6Z" fill="#E8720C" />
    </>
  ),
  hr: (
    <>
      <rect x="159" y="43" width="127" height="119" rx="10" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M176 53h35m-35 5h22" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M222 89v14h-31v19m31-19h29v19" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path className="portal-art-motion portal-hr-connection" pathLength="1" d="M222 89v14h29v19" fill="none" stroke="#E8720C" strokeWidth="3" />
      <rect x="204" y="64" width="36" height="27" rx="5" fill="currentColor" opacity="0.1" />
      <Person x={222} y={76} scale={0.4} />
      <rect x="173" y="121" width="36" height="29" rx="5" fill="currentColor" opacity="0.1" />
      <Person x={191} y={134} scale={0.4} />
      <rect className="portal-art-motion portal-hr-department" x="233" y="121" width="36" height="29" rx="5" fill="#FFF7F0" stroke="#E8720C" strokeDasharray="3 3" />
      <path className="portal-art-motion portal-hr-vacancy portal-art-static" d="M245 135h12m-6-6v12" stroke="#E8720C" strokeWidth="2" />
      <g className="portal-art-motion portal-hr-member" opacity="0"><Person x={251} y={134} scale={0.4} /></g>
      <path className="portal-art-motion portal-hr-match-path" pathLength="1" d="M137 97h19q12 0 12 12v26h63" fill="none" stroke="#E8720C" strokeWidth="2.5" strokeDasharray="1" />
      <g className="portal-art-motion portal-hr-profile">
        <rect x="43" y="45" width="94" height="112" rx="10" fill="#fff" stroke="currentColor" strokeOpacity="0.3" />
        <rect x="72" y="40" width="35" height="10" rx="5" fill="currentColor" />
        <circle cx="90" cy="78" r="21" fill="currentColor" opacity="0.08" />
        <Person x={90} y={80} scale={0.65} />
        <path d="M60 112h60m-60 11h48m-48 11h55" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path className="portal-art-motion portal-hr-scan" d="M54 58h71" stroke="#E8720C" strokeWidth="2.5" opacity="0" />
        <circle className="portal-art-motion portal-hr-profile-check" cx="123" cy="54" r="10" fill="#52C41A" opacity="0" />
        <path className="portal-art-motion portal-hr-profile-check" d="m118 54 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" opacity="0" />
      </g>
      <g className="portal-art-motion portal-hr-welcome" opacity="0"><circle cx="272" cy="148" r="10" fill="#52C41A" /><path d="m267 148 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2" /></g>
      <rect x="68" y="7" width="184" height="25" rx="8" fill="#fff" />
      <g className="portal-art-motion portal-hr-matching portal-art-static"><ArtworkText label="hrMatching" x={160} y={24} width={170} /></g>
      <g className="portal-art-motion portal-hr-assigned" opacity="0"><ArtworkText label="hrAssigned" x={160} y={24} width={170} /></g>
    </>
  ),
  eam: <AssetScene />,
  oa: (
    <>
      <path d="M72 40h176" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path className="portal-art-motion portal-office-progress" pathLength="1" d="M72 40h176" stroke="#E8720C" strokeWidth="3" />
      {['start', 'review', 'approved'].map((label, index) => <g key={label}>
        <circle cx={72 + index * 88} cy="40" r="8" fill="#fff" stroke="currentColor" strokeWidth="2" />
        <circle className={`portal-art-motion portal-workflow-stage-${index}`} cx={72 + index * 88} cy="40" r="5" fill="#E8720C" opacity="0" />
        <ArtworkText label={label} x={72 + index * 88} y={163} width={80} />
      </g>)}
      <path className="portal-art-motion portal-art-flow" d="M94 119q20 15 42 0m45 0q19 15 41 0" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 6" />
      <rect x="38" y="72" width="67" height="47" rx="6" fill="currentColor" />
      <rect x="43" y="78" width="57" height="33" rx="3" fill="#fff" />
      <path d="M31 122h81l-9 9H40Z" fill="currentColor" opacity="0.4" />
      <rect x="129" y="73" width="63" height="59" rx="7" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <path d="M137 123h47" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M224 89v-9h20l7 9h27v48h-54Z" fill="#FFF7F0" stroke="#E8720C" strokeWidth="2" />
      <g className="portal-art-motion portal-workflow-paper">
        <path d="M53 76h25l10 10v39H53Z" fill="#fff" stroke="currentColor" strokeWidth="1.5" />
        <path d="M78 76v10h10M60 92h20m-20 7h15" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
        <path className="portal-art-motion portal-office-signature" pathLength="1" d="m59 111 5-7-1 9 6-5 3 3 8-4" fill="none" stroke="#1890FF" strokeWidth="2" opacity="0" />
        <g className="portal-art-motion portal-office-seal" opacity="0"><circle cx="77" cy="115" r="8" fill="#fff" stroke="#52C41A" strokeWidth="1.5" /><path d="m73 115 3 3 5-6" fill="none" stroke="#52C41A" strokeWidth="2" /></g>
      </g>
      <g className="portal-art-motion portal-office-stamp">
        <rect x="156" y="56" width="13" height="17" rx="5" fill="#722ED1" />
        <path d="M159 72v8h-8v6h23v-6h-8v-8" fill="#722ED1" />
        <rect x="146" y="85" width="33" height="8" rx="3" fill="#722ED1" />
      </g>
      <path d="M220 102h63l-5 36h-54Z" fill="#F59432" stroke="#E8720C" strokeWidth="1.5" />
      <path d="M235 111h31" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" />
      <g className="portal-art-motion portal-office-archived" opacity="0"><circle cx="269" cy="132" r="12" fill="#52C41A" /><path d="m263 132 4 4 8-9" fill="none" stroke="#fff" strokeWidth="3" /></g>
      <g className="portal-art-motion portal-office-archived" opacity="0"><rect x="67" y="6" width="186" height="23" rx="8" fill="#fff" /><ArtworkText label="workflowArchived" x={160} y={22} width={174} /></g>
    </>
  ),
  iam: (
    <>
      <rect x="34" y="22" width="252" height="123" rx="12" fill="#fff" stroke="currentColor" strokeOpacity="0.2" />
      <path d="M35 39h250" stroke="currentColor" strokeOpacity="0.15" />
      {[46, 55, 64].map(x => <circle key={x} cx={x} cy="31" r="2" fill="currentColor" opacity="0.4" />)}
      <rect x="46" y="47" width="67" height="44" rx="6" fill="currentColor" opacity="0.08" />
      <Person x={63} y={71} scale={0.43} />
      <path d="M79 59h24m-24 9h19m-19 9h23" stroke="currentColor" strokeOpacity="0.4" strokeWidth="3" />
      <path className="portal-art-motion portal-identity-scan" d="M49 51v35" stroke="#1890FF" strokeWidth="3" opacity="0" />
      <path className="portal-art-motion portal-access-route" d="M115 68h24v-15h21m-45 22h24v52h21" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="3 5" />
      <rect x="160" y="47" width="85" height="89" rx="7" fill="#001529" />
      {[59, 80, 101].map(y => <g key={y}><rect x="176" y={y} width="55" height="15" rx="3" fill="#fff" opacity="0.2" /><circle cx="220" cy={y + 7} r="2" fill="#52C41A" /></g>)}
      <g className="portal-art-motion portal-access-door-left"><rect x="160" y="47" width="42" height="89" rx="5" fill="#FFF7F0" stroke="currentColor" strokeOpacity="0.3" /><path d="M168 55v71" stroke="currentColor" strokeOpacity="0.15" /></g>
      <g className="portal-art-motion portal-access-door-right"><rect x="202" y="47" width="43" height="89" rx="5" fill="#FFF7F0" stroke="currentColor" strokeOpacity="0.3" /><path d="M237 55v71" stroke="currentColor" strokeOpacity="0.15" /></g>
      <g className="portal-art-motion portal-lock-body">
        <path className="portal-art-motion portal-lock-shackle" d="M185 85V68a17 17 0 0 1 34 0v17" stroke="currentColor" strokeWidth="7" fill="none" />
        <rect x="174" y="83" width="56" height="44" rx="9" fill="currentColor" />
        <circle cx="200" cy="102" r="6" fill="#fff" /><path d="M200 104v10" stroke="#fff" strokeWidth="4" />
      </g>
      <g className="portal-art-motion portal-key-denied" opacity="0" stroke="#8C8C8C" strokeWidth="6" fill="none">
        <circle cx="65" cy="103" r="13" /><path d="M78 103h61m-16 0v10m10-10v7" />
        <path className="portal-art-motion portal-lock-denied" d="m61 99 8 8m0-8-8 8" strokeWidth="2" opacity="0" />
      </g>
      <g className="portal-art-motion portal-key-granted portal-art-static" opacity="0" stroke="#8C8C8C" strokeWidth="6" fill="none">
        <circle cx="65" cy="103" r="13" /><path d="M78 103h61m-22 0v10h8v-10m10 0v7" />
        <path className="portal-art-motion portal-lock-granted" d="m59 103 4 4 8-9" strokeWidth="2" opacity="0" />
      </g>
      <g className="portal-art-motion portal-lock-alarm" opacity="0" stroke="#FF4D4F" strokeWidth="3" fill="none">
        <path d="M168 57l-9-8m8 23h-12m83-15 9-8m-8 23h12" />
        <circle cx="264" cy="106" r="14" fill="#fff" /><path d="M264 98v10m0 6v1" />
      </g>
      <rect x="42" y="151" width="236" height="27" rx="8" fill="#fff" stroke="currentColor" strokeOpacity="0.15" />
      <g className="portal-art-motion portal-access-pending portal-art-static" opacity="0"><ArtworkText label="verifyingIdentity" x={160} y={169} width={222} /></g>
      <g className="portal-art-motion portal-lock-denied" opacity="0"><ArtworkText label="accessDenied" x={160} y={169} width={222} /></g>
      <g className="portal-art-motion portal-lock-granted" opacity="0"><ArtworkText label="accessGranted" x={160} y={169} width={222} /></g>
    </>
  ),
  platform: (
    <>
      <path d="M80 145v15h161v-18" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <rect x="48" y="31" width="115" height="116" rx="10" fill="currentColor" opacity="0.12" />
      {[40, 74, 108].map((y, index) => (
        <g key={y}>
          <rect x="56" y={y} width="99" height="29" rx="5" fill="#fff" stroke="currentColor" strokeOpacity="0.2" />
          <path d={`M68 ${y + 10}h34m-34 8h23`} stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
          <circle className={`portal-art-motion portal-config-node-${index}`} cx="139" cy={y + 15} r="4" fill="#8C8C8C" />
        </g>
      ))}
      <rect x="174" y="49" width="95" height="99" rx="9" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
      <rect x="185" y="61" width="32" height="5" rx="2.5" fill="currentColor" opacity="0.6" />
      {[86, 108, 130].map((y, index) => (
        <g key={y}>
          <path d={`M187 ${y}h67`} stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
          <circle className={`portal-art-motion portal-config-slider-${index}`} cx={203 + index * 15} cy={y} r="6" fill="#fff" stroke="#E8720C" strokeWidth="3" />
        </g>
      ))}
      <circle className="portal-art-motion portal-config-packet" cx="241" cy="153" r="5" fill="#E8720C" opacity="0" />
      <g className="portal-art-motion portal-config-published" opacity="0"><rect x="82" y="6" width="156" height="25" rx="8" fill="#fff" /><ArtworkText label="configPublished" x={160} y={23} width={144} /></g>
      <g transform="translate(252 37)"><g className="portal-art-motion portal-config-gear" stroke="#E8720C" strokeWidth="3" fill="#FFF7F0"><circle r="11" /><circle r="4" fill="#fff" /><path d="M0-15v5M0 10v5M-15 0h5m20 0h5m-25-10 4 4m12 12 4 4m0-20-4 4m-12 12-4 4" /></g></g>
    </>
  ),
  merchantWorkbench: (
    <>
      <rect x="47" y="43" width="172" height="108" rx="8" fill="currentColor" />
      <rect x="54" y="50" width="158" height="90" rx="4" fill="#fff" />
      <path d="M35 153h196l-11 12H47Z" fill="currentColor" opacity="0.3" />
      <rect x="69" y="86" width="65" height="42" rx="3" fill="currentColor" opacity="0.1" />
      <path d="m66 84 8-20h55l8 20Z" fill="#E8720C" />
      {[0, 1, 2, 3].map(index => <path key={index} d={`M${66 + index * 18} 84h18v5a9 9 0 0 1-18 0Z`} fill={index % 2 ? '#FFF7F0' : '#E8720C'} />)}
      <rect x="81" y="103" width="18" height="25" rx="2" fill="currentColor" opacity="0.4" />
      <rect x="107" y="103" width="18" height="14" rx="2" fill="#fff" />
      <path d="M153 72h41m-41 10h25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <rect x="155" y="111" width="8" height="17" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="168" y="102" width="8" height="26" rx="2" fill="currentColor" opacity="0.6" />
      <rect className="portal-art-motion portal-order-growth" x="181" y="94" width="8" height="34" rx="2" fill="currentColor" />
      <g className="portal-art-motion portal-order-receipt">
        <path d="M231 30h54v111l-7-4-7 4-7-4-7 4-7-4-7 4-12-5Z" fill="#fff" stroke="currentColor" strokeOpacity="0.25" />
        <path d="M242 45h29m-29 8h19m-19 17h29m-29 10h29m-29 10h20" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
        <g className="portal-art-motion portal-order-stamp" opacity="0"><circle cx="258" cy="115" r="11" fill="#52C41A" /><path d="m252 114 4 4 8-8" fill="none" stroke="#fff" strokeWidth="2" /></g>
      </g>
      <path className="portal-art-motion portal-order-cursor" d="m180 90 1 22 6-7 7 9 5-4-7-8 9-4Z" fill="#001529" stroke="#fff" strokeWidth="1.5" />
      <g className="portal-art-motion portal-order-arrival" opacity="0"><rect x="63" y="8" width="142" height="25" rx="8" fill="#fff" /><ArtworkText label="newOrder" x={134} y={25} width={130} /></g>
      <g className="portal-art-motion portal-order-done" opacity="0"><rect x="63" y="8" width="142" height="25" rx="8" fill="#fff" /><ArtworkText label="orderCompleted" x={134} y={25} width={130} /></g>
    </>
  ),
  translation: null,
  generic: (
    <>
      <path d="M95 65h130v67H95Z" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      {[[66, 39], [198, 39], [66, 113], [198, 113]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="54" height="39" rx="8" fill="#fff" stroke="currentColor" strokeOpacity="0.3" />)}
      <path d="m160 57 36 21v41l-36 21-36-21V78Z" fill="currentColor" />
      <path d="m144 95 12 12 21-24" className="portal-art-motion portal-art-draw" pathLength="1" fill="none" stroke="#fff" strokeWidth="4" />
    </>
  ),
}

export default function SystemArtwork({ code, name = '', active = false }: { code: string; name?: string; active?: boolean }) {
  const id = useId()
  const imageRef = useRef<SVGSVGElement>(null)
  const [motion, setMotion] = useState({ playing: false, reduced: false })
  const scene = getPortalSystemKey(code, name) ?? 'generic'
  const playback = !active || motion.reduced ? 'idle' : motion.playing ? 'running' : 'paused'

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let inView = typeof IntersectionObserver === 'undefined'
    // 悬停只是播放意图；离屏、后台及减少动态效果仍会关闭动画计算。
    const updateMotion = () => setMotion({ playing: inView && !document.hidden, reduced: reduced.matches })
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      updateMotion()
    }, { threshold: 0.1 })
    if (imageRef.current) observer?.observe(imageRef.current)
    updateMotion()
    reduced.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateMotion)
    return () => {
      observer?.disconnect()
      reduced.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateMotion)
    }
  }, [])

  return (
    <svg
      ref={imageRef}
      className="portal-card-artwork"
      viewBox="0 0 320 190"
      aria-hidden="true"
      focusable="false"
      data-scene={scene}
      data-motion={playback}
      data-reduced-motion={motion.reduced}
    >
      <defs>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="320" height="190" fill="currentColor" opacity="0.07" />
      <circle cx="254" cy="42" r="97" fill="currentColor" opacity="0.05" />
      <circle cx="33" cy="171" r="54" fill="currentColor" opacity="0.04" />
      <rect width="320" height="190" fill={`url(#${id}-light)`} />
      <path d="M30 169h260" stroke="currentColor" strokeOpacity="0.12" />
      <ellipse cx="162" cy="168" rx="102" ry="7" fill="currentColor" opacity="0.06" />
      <g strokeLinecap="round" strokeLinejoin="round">{scene === 'translation' ? <TranslationScene playing={playback === 'running'} /> : scenes[scene]}</g>
      <circle cx="286" cy="91" r="3" fill="currentColor" opacity="0.2" />
      <path d="M34 100h8m-4-4v8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    </svg>
  )
}
