import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import worldSource from 'world-atlas/countries-110m.json?raw'
import { getPortalSystemKey, type PortalSystemKey } from '../../constants/portalSystems'
import { RDM_STAGE, RDM_STAGE_LABEL, RDM_STAGE_ORDER, type RdmStage } from '../../constants/rdm'

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

/**
 * 流水线站点符号：每个阶段一个语义图形，让卡片一眼读出「需求从提交走到上线」。
 * 图形绘制在站点圆心局部坐标内（约 ±8 用户单位），描边继承 currentColor，
 * 未点亮时由场景提供橙色描边，点亮后外层把 color 覆盖为白色复用同一份图形。
 */
function StageGlyph({ stage }: { stage: RdmStage }) {
  switch (stage) {
    // 提交需求：把需求单从托盘推上去
    case RDM_STAGE.SUBMIT:
      return <path d="M-7 3v4h14V3M0 1V-7m-4 4 4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    // 需求審批：单据上的审批通过标记
    case RDM_STAGE.INTAKE:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M-5-7h6l4 4v10H-5Zm6 0v4h4" />
          <path d="m-2 2 2 2 4-5" />
        </g>
      )
    // 分配受理：落到受理人身上
    case RDM_STAGE.DISPATCH:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cy="-4" r="3" />
          <path d="M-6 6a6 6 0 0 1 12 0" />
        </g>
      )
    // 設計評審：PRD 原型线框
    case RDM_STAGE.PRODUCT:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="-7" y="-6" width="14" height="12" rx="2" />
          <path d="M-7-1h14M-1-1v7" />
        </g>
      )
    // 研發測試：代码括号
    case RDM_STAGE.DELIVERY:
      return <path d="M-3-5-8 0-3 5m6-10 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    // 驗收上線：火箭发布
    default:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M0-8c3 3 4 6 4 9H-4c0-3 1-6 4-9Zm0 10v5" />
          <circle cy="-2" r="1.3" />
        </g>
      )
  }
}

/**
 * 產研協同场景：需求交付看板，提供两种风格（门户面板可切换）。
 * A「看板流水線」：面板 + 泳道 + 需求池 + 交付速率图 + 底部产出节奏条；
 * B「甘特看板」：同一套流水线上移，顶部换为看板三列，底部换为甘特阶梯条。
 * 业务方提需求后最想知道「我的需求到哪一步了」，所以主体始终是一条逐站推进的波段轨道：
 * 需求池排队入池 → 光环逐站跳动、轨道逐段铺开 → 审批站点分出「驳回」回路退回需求池，
 * 分配受理站点分出「挂起」短支路（搁置不推进）→ 末站盖验收通过章并火箭上线。
 * 光环位移是相对量（每站 +42/-20），所以两版只改变整体上下偏移，共用 global.css 的 12 秒节拍。
 * 火箭、验收章、站点填充、光环属于动画层（未悬停不显示），因此静态层必须自己填满画布。
 * 阶段名直接取 constants/rdm.ts 的权威文案，保证与系统内的叫法完全一致。
 */
const RDM_STATION_X = [58, 100, 142, 184, 226, 268] as const
/** 波段站点：偶数站在下轨，奇数站在上轨；dx/dy 用于整组平移，站距 42/-20 不变所以节拍不变 */
function rdmStations(dy: number, dx = 0) {
  return RDM_STATION_X.map((x, index) => ({ x: x + dx, y: (index % 2 === 0 ? 112 : 92) + dy }))
}
/** 由站点生成平滑波段（每段水平切线入站），与原手写路径等价 */
function rdmTrack(stations: { x: number; y: number }[]) {
  const [first, second] = stations
  let path = `M${first.x} ${first.y}C${first.x + 14} ${first.y} ${second.x - 14} ${second.y} ${second.x} ${second.y}`
  for (let index = 2; index < stations.length; index += 1) {
    const point = stations[index]
    path += `S${point.x - 14} ${point.y} ${point.x} ${point.y}`
  }
  return path
}
/** 站点文案走门户 artwork 语言包；缺键时回落 RDM 权威繁中常量，不会渲染出裸 key */
const RDM_STAGE_ARTWORK_KEYS: Record<RdmStage, string> = {
  [RDM_STAGE.SUBMIT]: 'rdmSubmit',
  [RDM_STAGE.INTAKE]: 'rdmIntake',
  [RDM_STAGE.DISPATCH]: 'rdmDispatch',
  [RDM_STAGE.PRODUCT]: 'rdmProduct',
  [RDM_STAGE.DELIVERY]: 'rdmDelivery',
  [RDM_STAGE.ACCEPTANCE]: 'rdmAcceptance',
}

/** 看板面板外壳：窗口栏 + 标题胶囊 + 泳道，两版共用 */
function RdmBoardFrame({ laneBottom }: { laneBottom: number }) {
  const lane = `v${laneBottom - 38}`
  return (
    <g>
      <rect x="14" y="14" width="292" height="148" rx="10" fill="#fff" stroke="currentColor" strokeOpacity="0.18" />
      <path d="M14 24a10 10 0 0 1 10-10h272a10 10 0 0 1 10 10v10H14Z" fill="currentColor" opacity="0.1" />
      <g fill="currentColor">
        <circle cx="26" cy="23" r="2.2" opacity="0.5" />
        <circle cx="34" cy="23" r="2.2" opacity="0.35" />
        <circle cx="42" cy="23" r="2.2" opacity="0.25" />
        <rect x="54" y="19.5" width="56" height="7" rx="3.5" opacity="0.2" />
        <rect x="268" y="19.5" width="28" height="7" rx="3.5" opacity="0.3" />
      </g>
      <path d="M14 34h292" stroke="currentColor" strokeOpacity="0.14" />
      <path
        d={`M86 38${lane}M128 38${lane}M170 38${lane}M212 38${lane}M254 38${lane}`}
        stroke="currentColor"
        strokeOpacity="0.07"
      />
    </g>
  )
}

/** 需求池：排队中的需求单，入池路径用流动虚线 */
function RdmRequestPool({ x, y, inflow }: { x: number; y: number; inflow: string }) {
  return (
    <g>
      <rect x={x} y={y} width="48" height="42" rx="6" fill="currentColor" opacity="0.08" />
      <rect x={x + 6} y={y + 6} width="36" height="9" rx="2.5" fill="#fff" stroke="currentColor" strokeOpacity="0.38" />
      <rect x={x + 6} y={y + 19} width="36" height="9" rx="2.5" fill="#fff" stroke="currentColor" strokeOpacity="0.3" />
      <rect x={x + 6} y={y + 32} width="22" height="6" rx="3" fill="currentColor" opacity="0.26" />
      <path
        className="portal-art-motion portal-art-flow"
        d={inflow}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.6"
        strokeDasharray="3 5"
      />
    </g>
  )
}

/** 轨道 + 六个站点 + 阶段标签 + 当前站光环，两版共用 */
function RdmFlow({ dy, dx = 0 }: { dy: number; dx?: number }) {
  const { t } = useTranslation()
  const stations = rdmStations(dy, dx)
  const track = rdmTrack(stations)
  const [origin] = stations
  return (
    <g>
      {/* 轨道：底色是完整链路，橙色进度随推进逐段铺开 */}
      <path d={track} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="4" />
      <path
        className="portal-art-motion portal-rdm-track"
        pathLength={1}
        d={track}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      {RDM_STAGE_ORDER.map((stage, index) => {
        const station = stations[index]
        return <g key={stage}>
          <circle cx={station.x} cy={station.y} r="13" fill="#fff" stroke="currentColor" strokeOpacity="0.35" />
          <g transform={`translate(${station.x} ${station.y})`} opacity="0.6"><StageGlyph stage={stage} /></g>
          <g className={`portal-art-motion portal-rdm-stage-${index}`} opacity="0">
            <circle cx={station.x} cy={station.y} r="13" fill="currentColor" />
            <g transform={`translate(${station.x} ${station.y})`} color="#fff"><StageGlyph stage={stage} /></g>
          </g>
          {/* 波段让相邻站点分居上下两行，同行标签间距 84，长词无需压缩即可容纳，多语言读数更自然 */}
          <text x={station.x} y={station.y + 26} textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor">
            {t(`portal.artwork.${RDM_STAGE_ARTWORK_KEYS[stage]}`, RDM_STAGE_LABEL[stage])}
          </text>
        </g>
      })}
      {/* 当前处理站点：光环沿波段逐站跳动 */}
      <g className="portal-art-motion portal-rdm-halo">
        <circle cx={origin.x} cy={origin.y} r="16" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.55" />
        <circle className="portal-art-motion portal-rdm-pulse" cx={origin.x} cy={origin.y} r="19" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      </g>
    </g>
  )
}

/** 上线段：尾迹与星点静态常驻（未悬停也要填满角落），火箭本体只在动画里点火升空 */
function RdmLaunch({ trail, sparks, rocket }: {
  trail: string
  sparks: readonly (readonly [number, number])[]
  rocket: { x: number; y: number }
}) {
  return (
    <g>
      <path d={trail} fill="none" stroke="#F59432" strokeOpacity="0.5" strokeWidth="1.4" strokeDasharray="3 4" />
      <g fill="#F59432" opacity="0.45">
        {sparks.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" />)}
      </g>
      <path d="M296 34l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6Z" fill="currentColor" opacity="0.4" />
      <g className="portal-art-motion portal-rdm-launch" opacity="0">
        <g transform={`translate(${rocket.x} ${rocket.y})`}>
          <path d="M0-10c4.6 3.2 5.8 8.6 4.4 14l-3 2.4h-2.8l-3-2.4C-5.8-1.4-4.6-6.8 0-10Z" fill="#E8720C" />
          <circle cy="-2.4" r="2" fill="#fff" />
          <path d="M-4.2 4-8 9l3.6-1.2M4.2 4 8 9l-3.6-1.2" fill="#F59432" />
          <path d="M-1.8 9h3.6L0 17Z" fill="#FA8C16" opacity="0.9" />
        </g>
      </g>
    </g>
  )
}

/** 验收通过章：只在流程走到末站时盖上，静态不占位，避免误读成「已完成」 */
function RdmDeliveredStamp({ x, y }: { x: number; y: number }) {
  return (
    <g className="portal-art-motion portal-rdm-delivered" opacity="0">
      <circle cx={x} cy={y} r="8.5" fill="#52C41A" stroke="#fff" strokeWidth="1.8" />
      <path d={`m${x - 4} ${y} 2.8 2.8 5.2-5.6`} fill="none" stroke="#fff" strokeWidth="1.8" />
    </g>
  )
}

/** 风格 A：看板流水线（顶部交付速率图 + 底部产出节奏条） */
function RdmPipelineScene() {
  return (
    <g className="portal-rdm-scene">
      <RdmBoardFrame laneBottom={142} />
      <RdmRequestPool x={20} y={42} inflow="M44 86q6 16 12 22" />

      {/* 驳回支路：審批不通过的需求退回需求池，不占用主线节拍 */}
      <path
        className="portal-art-motion portal-art-flow"
        d="M92 82C78 66 68 60 62 60"
        fill="none"
        stroke="#FF4D4F"
        strokeOpacity="0.8"
        strokeWidth="1.6"
        strokeDasharray="4 5"
      />
      <path d="m60 60 6.5-4v8Z" fill="#FF4D4F" opacity="0.8" />

      {/* 挂起支路：分配受理阶段可搁置（ON_HOLD），虚线通向死胡同的暂停牌 */}
      <path
        className="portal-art-motion portal-art-flow"
        d="M142 98c0-16 6-28 10-36"
        fill="none"
        stroke="#FA8C16"
        strokeOpacity="0.75"
        strokeWidth="1.6"
        strokeDasharray="3 5"
      />
      <circle cx="158" cy="52" r="11" fill="#fff" stroke="#FA8C16" strokeOpacity="0.85" strokeWidth="1.6" />
      <path d="M154.5 47.5v9m7-9v9" fill="none" stroke="#FA8C16" strokeWidth="1.8" />

      {/* 交付速率图：填满顶部中右区，给右侧火箭轨迹让位 */}
      <rect x="196" y="36" width="62" height="32" rx="6" fill="#fff" stroke="currentColor" strokeOpacity="0.2" />
      <path d="M203 62h48" stroke="currentColor" strokeOpacity="0.18" />
      <g fill="currentColor" opacity="0.16">
        <rect x="205" y="53" width="6" height="9" rx="2" />
        <rect x="216" y="49" width="6" height="13" rx="2" />
        <rect x="227" y="55" width="6" height="7" rx="2" />
        <rect x="238" y="47" width="6" height="15" rx="2" />
      </g>
      <path d="M205 56 219 50 233 53 249 43" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="249" cy="43" r="2.2" fill="currentColor" />

      <RdmFlow dy={0} />
      <RdmDeliveredStamp x={246} y={80} />
      <RdmLaunch trail="M276 88q10-16 12-32" sparks={[[282, 74], [288, 60]]} rocket={{ x: 272, y: 96 }} />

      {/* 底部产出节奏条：压住下沿留白，读作交付进度 */}
      <rect x="20" y="146" width="164" height="7" rx="3.5" fill="currentColor" opacity="0.12" />
      <rect x="20" y="146" width="112" height="7" rx="3.5" fill="currentColor" opacity="0.55" />
      <path d="M132 146v7" stroke="#fff" strokeWidth="1.4" />
      <rect x="194" y="146" width="34" height="7" rx="3.5" fill="currentColor" opacity="0.28" />
      <rect x="234" y="146" width="34" height="7" rx="3.5" fill="currentColor" opacity="0.5" />
      <rect x="274" y="146" width="26" height="7" rx="3.5" fill="currentColor" opacity="0.72" />
    </g>
  )
}

/** 风格 B：甘特看板（流水线上移 14，顶部看板三列，底部甘特阶梯条） */
function RdmGanttScene() {
  return (
    <g className="portal-rdm-scene">
      <RdmBoardFrame laneBottom={124} />
      <RdmRequestPool x={20} y={34} inflow="M44 78q8 8 16 14" />

      {/* 驳回支路：审毕退回需求池 */}
      <path
        className="portal-art-motion portal-art-flow"
        d="M98 68C86 56 76 54 68 54"
        fill="none"
        stroke="#FF4D4F"
        strokeOpacity="0.8"
        strokeWidth="1.6"
        strokeDasharray="4 5"
      />
      <path d="m66 54 6.5-4v8Z" fill="#FF4D4F" opacity="0.8" />

      {/* 挂起支路 */}
      <path
        className="portal-art-motion portal-art-flow"
        d="M148 84c0-14 8-24 14-30"
        fill="none"
        stroke="#FA8C16"
        strokeOpacity="0.75"
        strokeWidth="1.6"
        strokeDasharray="3 5"
      />
      <circle cx="168" cy="46" r="11" fill="#fff" stroke="#FA8C16" strokeOpacity="0.85" strokeWidth="1.6" />
      <path d="M164.5 41.5v9m7-9v9" fill="none" stroke="#FA8C16" strokeWidth="1.8" />

      {/* 看板三列：待办 → 進行中 → 已交付；整体左移避开末站圆 */}
      <g>
        <rect x="184" y="34" width="20" height="38" rx="5" fill="currentColor" opacity="0.07" />
        <rect x="208" y="34" width="20" height="38" rx="5" fill="currentColor" opacity="0.07" />
        <rect x="232" y="34" width="20" height="38" rx="5" fill="currentColor" opacity="0.07" />
        <g fill="#fff" stroke="currentColor" strokeOpacity="0.3">
          <rect x="187" y="38" width="14" height="6" rx="2" />
          <rect x="187" y="47" width="14" height="6" rx="2" />
          <rect x="187" y="56" width="14" height="6" rx="2" />
          <rect x="211" y="38" width="14" height="6" rx="2" />
          <rect x="211" y="47" width="14" height="6" rx="2" />
          <rect x="235" y="38" width="14" height="6" rx="2" />
        </g>
        <circle cx="242" cy="60" r="5.5" fill="#52C41A" opacity="0.9" />
        <path d="m239.4 60 1.9 1.9 3.4-3.8" fill="none" stroke="#fff" strokeWidth="1.4" />
      </g>

      <RdmFlow dy={-14} dx={6} />
      <RdmDeliveredStamp x={252} y={84} />
      <RdmLaunch trail="M284 74q10-14 12-26" sparks={[[290, 62], [295, 50]]} rocket={{ x: 280, y: 82 }} />

      {/* 甘特阶梯：需求从受理到上线的时间跨度 */}
      <path d="M20 158h280" stroke="currentColor" strokeOpacity="0.16" />
      <path d="M90 158v-4M160 158v-4M230 158v-4" stroke="currentColor" strokeOpacity="0.12" />
      <rect x="20" y="132" width="200" height="6" rx="3" fill="currentColor" opacity="0.5" />
      <rect x="44" y="141" width="168" height="6" rx="3" fill="currentColor" opacity="0.36" />
      <rect x="70" y="150" width="128" height="6" rx="3" fill="currentColor" opacity="0.24" />
      <rect x="228" y="132" width="30" height="6" rx="3" fill="currentColor" opacity="0.28" />
      <rect x="264" y="132" width="30" height="6" rx="3" fill="currentColor" opacity="0.18" />
      <rect x="228" y="141" width="66" height="6" rx="3" fill="currentColor" opacity="0.22" />
    </g>
  )
}

/**
 * 胶囊文案：先按自然宽度渲染并实测，超出胶囊宽度才压缩。
 * 压缩只用 lengthAdjust="spacing"（调字距），禁止 spacingAndGlyphs——
 * 后者会横向缩放字形，导致中文等宽字形被纵向压扁。
 */
function ArtworkText({ label, x, y, width = 120 }: { label: string; x: number; y: number; width?: number }) {
  const { t } = useTranslation()
  const text = t(`portal.artwork.${label}`)
  const textRef = useRef<SVGTextElement>(null)
  const [naturalWidth, setNaturalWidth] = useState(0)
  useEffect(() => {
    const node = textRef.current
    if (!node) return
    try { setNaturalWidth(node.getBBox().width) } catch { /* jsdom 等环境不支持 getBBox 时保持自然渲染 */ }
  }, [text])
  const compressed = naturalWidth > width
  return <text ref={textRef} x={x} y={y} textAnchor="middle" fontSize="12" fontWeight="600" fill="currentColor" textLength={compressed ? width : undefined} lengthAdjust={compressed ? 'spacing' : undefined}>{text}</text>
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

/** 排序面板里的候选商家角标：单檐店铺，尺寸只有 13×12，只描形状不带文字。 */
function MerchantGlyph({ x, y, opacity = 1 }: { x: number; y: number; opacity?: number }) {
  return <g transform={`translate(${x} ${y})`} opacity={opacity}>
    <path d="M0 12V3.4h13V12Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M-1.5 3.4 1.2 0h9.6l2.7 3.4Z" fill="currentColor" />
  </g>
}

/** 数学记号统一用衬线斜体，公式与变量跨语言中性，不走 i18n 也不会被多语言排版压扁。 */
function MathText({ x, y, children, size = 8, opacity = 0.85, anchor = 'start', className }: {
  x: number; y: number; children: string; size?: number; opacity?: number; anchor?: 'start' | 'middle' | 'end'; className?: string
}) {
  return <text className={className} x={x} y={y} textAnchor={anchor} fontSize={size} fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic" fill="currentColor" opacity={opacity}>{children}</text>
}

/**
 * 广告推荐场景一（业务链路版）：把算法投流画成可读懂的四拍——
 * ① 圈定精准人群（画像 + 偏好特征）② 引擎按 eCPM 公式竞价打分排序
 * ③ 胜出商家进入用户 APP 首屏坑位 ④ 曝光点击回流，按梯度公式更新权重。
 * 静态层必须自带完整可读构图，动画层只在悬停时按 8 秒节拍逐拍点亮。
 */
function AdsTrafficScene() {
  /** 排序行几何：y 为行顶，width 为该商家的竞价得分条长度。 */
  const rankRows = [
    { rank: 1, y: 56, width: 40 },
    { rank: 2, y: 80, width: 24 },
    { rank: 3, y: 104, width: 13 },
  ]
  /** 偏好标签：碗（口味）、杯（品类）、定位（距离），只画图形不带文字，避免多语言挤压。 */
  const interestTags = [
    { x: 10, y: 24, width: 30, glyph: <><path d="M16 34a7 7 0 0 1 14 0Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M23 28v-2" stroke="currentColor" strokeWidth="1.4" /></> },
    { x: 46, y: 14, width: 30, glyph: <path d="M55 25.5v-7h10l-1.6 7Z" fill="none" stroke="currentColor" strokeWidth="1.4" /> },
    { x: 54, y: 122, width: 32, glyph: <path d="M65 133.5a5 5 0 1 1 10 0l-5-4Z" fill="none" stroke="currentColor" strokeWidth="1.4" /> },
  ]
  return (
    <g className="portal-ads-scene">
      {/* ① 人群定向：虚线圈住目标客群，圈外灰点表示未被选中的人群 */}
      <ellipse cx="50" cy="86" rx="38" ry="30" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="5 5" strokeOpacity="0.4" />
      <ellipse className="portal-art-motion portal-ads-target" cx="50" cy="86" rx="38" ry="30" fill="none" stroke="#E8720C" strokeWidth="2" strokeDasharray="240" opacity="0" />
      <g fill="currentColor">
        <circle cx="24" cy="84" r="5.5" opacity="0.5" /><path d="M16 98v-3a8 8 0 0 1 16 0v3Z" opacity="0.5" />
        <circle cx="76" cy="86" r="5.5" opacity="0.4" /><path d="M68 99v-3a8 8 0 0 1 16 0v3Z" opacity="0.4" />
        <circle cx="33" cy="62" r="3" opacity="0.28" /><circle cx="68" cy="64" r="3" opacity="0.28" />
        <circle cx="50" cy="74" r="9" /><path d="M34 100v-5a16 16 0 0 1 32 0v5Z" />
      </g>
      {interestTags.map((tag, index) => <g key={index} className="portal-art-motion portal-ads-tag">
        <rect x={tag.x} y={tag.y} width={tag.width} height="15" rx="7.5" fill="#fff" stroke="currentColor" strokeWidth="1.3" />
        {tag.glyph}
      </g>)}
      <path d="M25 39l5 15M61 29l-5 25M70 122l-4-8" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" strokeDasharray="3 3" />

      {/* ② 算法引擎：面板顶部直接写竞价公式，扫描线逐行评估，底部给出率曲线 */}
      <rect x="104" y="34" width="86" height="118" rx="10" fill="#fff" stroke="currentColor" strokeOpacity="0.35" />
      <path d="M104 52h86" stroke="currentColor" strokeOpacity="0.15" />
      <g transform="translate(112 38)" fill="currentColor" stroke="currentColor" strokeWidth="1.3">
        <circle cx="2" cy="6" r="2" /><circle cx="12" cy="1" r="2" fill="none" /><circle cx="12" cy="11" r="2" fill="none" />
        <path d="M3.6 5 10.4 1.8M3.6 7l6.8 3.2" fill="none" />
      </g>
      <MathText x={130} y={47}>eCPM=bid×pCTR</MathText>
      {rankRows.map((row, index) => <g key={row.rank}>
        <rect x="110" y={row.y} width="74" height="22" rx="4" fill="currentColor" opacity={0.12 - index * 0.04} />
        <MerchantGlyph x={114} y={row.y + 5} opacity={1 - index * 0.55} />
        <rect x="132" y={row.y + 8} width={row.width} height="6" rx="3" fill="currentColor" opacity={1 - index * 0.55} />
        {index === 0
          ? <><circle cx="176" cy={row.y + 11} r="6.5" fill="#E8720C" /><text x="176" y={row.y + 14.2} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff">1</text></>
          : <><circle cx="176" cy={row.y + 11} r="6.5" fill="none" stroke="currentColor" strokeOpacity={0.3 - index * 0.05} /><text x="176" y={row.y + 14.2} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="currentColor" opacity={0.45 - index * 0.15}>{row.rank}</text></>}
      </g>)}
      {/* 特征加权求和→过激活函数得到预估点击率 */}
      <MathText x={112} y={133} size={7.5} opacity={0.6}>score=Σwᵢfᵢ(x)</MathText>
      <path d="M112 149h24" stroke="currentColor" strokeOpacity="0.2" />
      <path d="M113 148q8 0 10-5t10-5h3" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.4" />
      <MathText x={141} y={146} size={7.5} opacity={0.7}>p=σ(z)</MathText>
      <rect className="portal-art-motion portal-ads-scan" x="110" y="54" width="74" height="2" rx="1" fill="#E8720C" opacity="0" />
      <rect className="portal-art-motion portal-ads-lead" x="108" y="54" width="78" height="26" rx="6" fill="none" stroke="#E8720C" strokeWidth="2" opacity="0" />

      {/* ③ 用户 APP 首屏：首坑为已匹配的商家美食，下方为待刷新的信息流 */}
      <rect x="208" y="20" width="92" height="144" rx="13" fill="currentColor" />
      <rect x="214" y="28" width="80" height="128" rx="7" fill="#fff" />
      <path d="M244 24h20" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      <g className="portal-art-motion portal-ads-feed">
        <rect x="220" y="34" width="48" height="8" rx="4" fill="currentColor" opacity="0.16" />
        <circle cx="284" cy="38" r="3.4" fill="currentColor" opacity="0.3" />
        <rect x="220" y="48" width="68" height="34" rx="4" fill="#FFF7F0" stroke="currentColor" strokeOpacity="0.35" />
        <rect x="224" y="52" width="26" height="26" rx="3" fill="currentColor" opacity="0.16" />
        <path d="M229 66a8 8 0 0 1 16 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M254 56h28m-28 9h18" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.5" />
        <rect x="220" y="88" width="68" height="26" rx="4" fill="currentColor" opacity="0.07" />
        <rect x="224" y="92" width="18" height="18" rx="3" fill="currentColor" opacity="0.13" />
        <path d="M246 96h32m-32 8h20" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.2" />
        <rect x="220" y="120" width="68" height="26" rx="4" fill="currentColor" opacity="0.05" />
        <rect x="224" y="124" width="18" height="18" rx="3" fill="currentColor" opacity="0.1" />
        <path d="M246 128h32m-32 8h15" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.15" />
        <rect x="244" y="150" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.25" />
      </g>
      <rect className="portal-art-motion portal-ads-slot" x="217" y="45" width="74" height="40" rx="7" fill="none" stroke="#E8720C" strokeWidth="2.2" opacity="0" />
      <g className="portal-art-motion portal-ads-heart" opacity="0">
        <circle cx="286" cy="48" r="7.5" fill="#E8720C" />
        <path d="M286 51.8c-2.9-2-4.2-3.3-4.2-4.8a2 2 0 0 1 4.2-1 2 2 0 0 1 4.2 1c0 1.5-1.3 2.8-4.2 4.8Z" fill="#fff" />
      </g>

      {/* ④ 链路与回流：人群入模、Top1 出模入首坑、曝光数据回流调权 */}
      <path d="M88 80q8-6 16-5" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" strokeDasharray="4 4" />
      <path className="portal-art-motion portal-ads-intake" d="M88 80q8-6 16-5" fill="none" stroke="#E8720C" strokeWidth="1.8" strokeDasharray="4 4" opacity="0" />
      <path d="M190 66q9-4 18-3" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.6" strokeDasharray="4 4" />
      <path className="portal-art-motion portal-ads-intake" d="M190 66q9-4 18-3" fill="none" stroke="#E8720C" strokeWidth="1.8" strokeDasharray="4 4" opacity="0" />
      <g className="portal-art-motion portal-ads-promote" opacity="0">
        <rect x="186" y="60" width="18" height="12" rx="3" fill="#E8720C" />
        <path d="M189 64h12m-12 4h7" stroke="#fff" strokeWidth="2" />
      </g>
      <path d="M224 158c-24 12-54 10-72-4" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4" />
      <path className="portal-art-motion portal-ads-loop" d="M224 158c-24 12-54 10-72-4" fill="none" stroke="#E8720C" strokeWidth="1.6" strokeDasharray="4 4" opacity="0.2" />
      <path d="M152 154l-1-6m1 6 5-3" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" />
      {/* 回流不是装饰：弧线上标梯度下降公式，表示曝光点击样本回流后重算权重 */}
      <g className="portal-art-motion portal-ads-loop">
        <rect x="163" y="156" width="50" height="13" rx="3" fill="#fff" opacity="0.92" />
        <MathText x={188} y={165.5} size={8} anchor="middle" opacity={0.9}>w←w−η∇L</MathText>
      </g>
      <g className="portal-art-motion portal-ads-result" opacity="0">
        <rect x="84" y="6" width="122" height="24" rx="8" fill="#fff" />
        <ArtworkText label="recommendMatched" x={145} y={22} width={110} />
      </g>
    </g>
  )
}

/**
 * 广告推荐场景二（模型架构版）：按论文里的模型结构图画法，自下而上分层——
 * 特征 token → 向量化 → 双层交互网络（全连接交叉边）→ 多目标预估头 → 打分柱，
 * 右侧落到用户首屏坑位。左侧公式带逐层给出信息熵、embedding、线性打分、
 * softmax、sigmoid 与梯度更新，表达「精准推荐是一串可推导的数学」。
 */
function AdsModelScene() {
  /** 四个特征列：用户/商家/菜品/距离，每列 = 一个 token + 它自己的 embedding 向量。 */
  const columns = [98, 134, 170, 206]
  /** 交互网络下层与 embedding 对齐，上层错开位置，使全连接边形成交叉网。 */
  const upper = [116, 152, 188]
  /** 每个预估头上的特征重性柱（高度即权重，类比论文里的多属性分布图）。 */
  const barHeights = [8, 14, 20, 6]
  /** 层间全连接：把 from 层每个节点到 to 层每个节点合并成一条 path，整批一次描出。 */
  const links = (from: number[], to: number[], y1: number, y2: number) =>
    from.map(fx => to.map(tx => `M${fx} ${y1}L${tx} ${y2}`).join('')).join('')
  return (
    <g className="portal-ads-scene portal-ads-model">
      {/* 左侧公式带：从下到上对应五个层，数学记号跨语言中性 */}
      <MathText x={62} y={157} anchor="end" className="portal-art-motion portal-ads-formula">H=−Σp·log p</MathText>
      <MathText x={62} y={133} anchor="end" className="portal-art-motion portal-ads-formula">e=x·E</MathText>
      <MathText x={62} y={100} anchor="end" className="portal-art-motion portal-ads-formula portal-ads-formula-mid">z=W·h+b</MathText>
      <MathText x={62} y={66} anchor="end" className="portal-art-motion portal-ads-formula portal-ads-formula-high">α=softmax(z)</MathText>
      <MathText x={62} y={44} anchor="end" className="portal-art-motion portal-ads-formula portal-ads-formula-high">pCTR=σ(z)</MathText>

      {/* 层间交叉边：先画边再画节点，节点白底盖住线头，留出干净的层级感 */}
      <path className="portal-art-motion portal-ads-edge" pathLength={1} d={links(columns, columns, 142, 115)} fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <path className="portal-art-motion portal-ads-edge portal-ads-edge-late" pathLength={1} d={links(columns, upper, 101, 91)} fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <path className="portal-art-motion portal-ads-edge portal-ads-edge-late" pathLength={1} d={links(upper, upper, 77, 71)} fill="none" stroke="currentColor" strokeOpacity="0.5" />
      {/* 交互网络层虚线框：表示参数共享的多层结构 */}
      <rect x="80" y="74" width="142" height="44" rx="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="4 4" />

      {/* 一号层：特征输入 + 向量化 */}
      {columns.map((cx, index) => <g key={cx}>
        <g className="portal-art-motion portal-ads-cell">
          <rect x={cx - 10} y="124" width="20" height="5" rx="1.5" fill="currentColor" opacity="0.6" />
          <rect x={cx - 10} y="130.5" width="20" height="5" rx="1.5" fill="currentColor" opacity="0.4" />
          <rect x={cx - 10} y="137" width="20" height="5" rx="1.5" fill="currentColor" opacity="0.25" />
        </g>
        <g className="portal-art-motion portal-ads-token">
          <circle cx={cx} cy="154" r="11" fill="#fff" stroke="currentColor" strokeOpacity="0.6" />
          {index === 0 && <g fill="currentColor"><circle cx={cx} cy="151" r="3" /><path d={`M${cx - 5} 159a5 5 0 0 1 10 0Z`} /></g>}
          {index === 1 && <g fill="none" stroke="currentColor" strokeWidth="1.2"><path d={`M${cx - 5} 159v-6h10v6Z`} /><path d={`M${cx - 6} 153l2-3h8l2 3`} /></g>}
          {index === 2 && <g fill="none" stroke="currentColor" strokeWidth="1.2"><path d={`M${cx - 5} 156a5 5 0 0 1 10 0Z`} /><path d={`M${cx} 149v-2`} /></g>}
          {index === 3 && <g fill="none" stroke="currentColor" strokeWidth="1.2"><path d={`M${cx} 159l-4-5a4 4 0 1 1 8 0Z`} /><circle cx={cx} cy="153.5" r="1.4" /></g>}
        </g>
      </g>)}

      {/* 二号层：双层交互网络 */}
      {columns.map(cx => <g key={`l${cx}`} className="portal-art-motion portal-ads-node">
        <ellipse cx={cx} cy="108" rx="12" ry="7" fill="#fff" stroke="currentColor" strokeOpacity="0.6" />
        <ellipse cx={cx} cy="108" rx="6" ry="3.2" fill="currentColor" opacity="0.35" />
      </g>)}
      {upper.map(cx => <g key={`u${cx}`} className="portal-art-motion portal-ads-node portal-ads-node-late">
        <ellipse cx={cx} cy="84" rx="12" ry="7" fill="#fff" stroke="currentColor" strokeOpacity="0.6" />
        <ellipse cx={cx} cy="84" rx="6" ry="3.2" fill="currentColor" opacity="0.35" />
      </g>)}

      {/* 三号层：多目标预估头（三路并行）与对应的打分柱 */}
      {upper.map((cx, index) => <g key={`h${cx}`}>
        <g className="portal-art-motion portal-ads-head">
          <rect x={cx - 16} y="58" width="32" height="13" rx="6.5" fill="#fff" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.75" />
          {[-8, 0, 8].map(offset => <circle key={offset} cx={cx + offset} cy="64.5" r="2.6" fill="currentColor" />)}
        </g>
        <g className="portal-art-motion portal-ads-bar">
          {barHeights.map((height, bar) => <rect
            key={height}
            x={cx - 15 + bar * 6.5}
            y={56 - height}
            width="5"
            height={height}
            rx="1.5"
            fill="currentColor"
            opacity={index === 1 && bar === 2 ? 0.95 : 0.5}
          />)}
        </g>
      </g>)}

      {/* 场景出口：胜出商家进入用户首屏，下方为待刷新坑位 */}
      <path className="portal-art-motion portal-ads-intake" d="M200 40q18-4 32 6" fill="none" stroke="#E8720C" strokeWidth="1.8" strokeDasharray="4 4" opacity="0" />
      <MathText x={238} y={30} size={8} opacity={0.9}>eCPM=bid×pCTR</MathText>
      <g className="portal-ads-cards">
        <rect x="238" y="36" width="74" height="32" rx="4" fill="#FFF7F0" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="242" y="40" width="24" height="24" rx="3" fill="currentColor" opacity="0.18" />
        <path d="M247 54a7 7 0 0 1 14 0Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M272 42h30m-30 9h19" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.55" />
        <rect x="238" y="74" width="74" height="24" rx="4" fill="currentColor" opacity="0.08" />
        <rect x="242" y="78" width="16" height="16" rx="3" fill="currentColor" opacity="0.14" />
        <path d="M262 82h34m-34 7h22" stroke="currentColor" strokeWidth="3" strokeOpacity="0.22" />
        <rect x="238" y="104" width="74" height="24" rx="4" fill="currentColor" opacity="0.06" />
        <rect x="242" y="108" width="16" height="16" rx="3" fill="currentColor" opacity="0.11" />
        <path d="M262 112h34m-34 7h16" stroke="currentColor" strokeWidth="3" strokeOpacity="0.16" />
      </g>
      <rect className="portal-art-motion portal-ads-slot" x="235" y="33" width="80" height="38" rx="7" fill="none" stroke="#E8720C" strokeWidth="2.2" opacity="0" />
      <g className="portal-art-motion portal-ads-heart" opacity="0">
        <circle cx="308" cy="38" r="7" fill="#E8720C" />
        <path d="M308 41.5c-2.7-1.9-3.9-3-3.9-4.4a1.85 1.85 0 0 1 3.9-.9 1.85 1.85 0 0 1 3.9.9c0 1.4-1.2 2.5-3.9 4.4Z" fill="#fff" />
      </g>

      {/* 在线学习：曝光点击回流后按梯度公式更新层间权重 */}
      <path d="M300 128v8q0 8-12 8h-22" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.4" strokeDasharray="4 4" />
      <g className="portal-art-motion portal-ads-learn" opacity="0.7">
        <circle cx="250" cy="148" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="10 6" />
        <path d="M250 137l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </g>
      <MathText x={263} y={151} size={8} opacity={0.85}>w←w−η∇L</MathText>

      {/* 结果胶囊：与链路版共用同一文案，保证两套构图都能独立收尾 */}
      <g className="portal-art-motion portal-ads-result" opacity="0">
        <rect x="100" y="6" width="122" height="24" rx="8" fill="#fff" />
        <ArtworkText label="recommendMatched" x={161} y={22} width={110} />
      </g>
    </g>
  )
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
  ads: <AdsTrafficScene />,
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
  rdm: <RdmPipelineScene />,
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
      {/* 店铺雨棚跟系统身份色走，不写死品牌橙；否则金色卡里夹一块橙色，与广告推荐卡又读成同族 */}
      <path d="m66 84 8-20h55l8 20Z" fill="currentColor" />
      {[0, 1, 2, 3].map(index => <path key={index} d={`M${66 + index * 18} 84h18v5a9 9 0 0 1-18 0Z`} fill={index % 2 ? '#fff' : 'currentColor'} />)}
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

/** 门户插画构图风格：同一系统可提供两套构图，进门户时随机抽一套；用不区分主次的语义名，方便更多系统接入。 */
export type PortalArtworkStyle = 'primary' | 'alternate'

/**
 * 拥有两套构图的系统：风格参数只对这里登记的场景生效，其余场景一律走 scenes。
 * 新增变体只换内部构图，data-scene 不变，场景识别与样式选择器保持稳定。
 */
const variantScenes: Partial<Record<PortalSystemKey | 'generic', (style: PortalArtworkStyle) => ReactNode>> = {
  rdm: style => (style === 'alternate' ? <RdmGanttScene /> : <RdmPipelineScene />),
  ads: style => (style === 'alternate' ? <AdsModelScene /> : <AdsTrafficScene />),
}

export default function SystemArtwork({ code, name = '', active = false, style = 'primary' }: {
  code: string
  name?: string
  active?: boolean
  style?: PortalArtworkStyle
}) {
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
      <g strokeLinecap="round" strokeLinejoin="round">
        {scene === 'translation'
          ? <TranslationScene playing={playback === 'running'} />
          /* 有两套构图的系统按随机风格切换，其余场景直接取静态构图 */
          : variantScenes[scene]?.(style) ?? scenes[scene]}
      </g>
      <circle cx="286" cy="91" r="3" fill="currentColor" opacity="0.2" />
      <path d="M34 100h8m-4-4v8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    </svg>
  )
}
