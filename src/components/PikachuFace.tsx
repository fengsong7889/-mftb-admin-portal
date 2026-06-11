/** 闪峰蜜蜂宠物组件 - 高还原度卡通形象 + 丰富表情动画 */

interface PikachuFaceProps {
  expression: string
  size?: number
}

export default function PikachuFace({ expression, size = 100 }: PikachuFaceProps) {
  const s = size / 140

  return (
    <svg
      viewBox="0 0 140 170"
      width={size}
      height={Math.round(170 * s)}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* 头部渐变 - 立体光泽 */}
        <radialGradient id="headGrad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFE57F" />
          <stop offset="60%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFC107" />
        </radialGradient>
        {/* 彩虹护目镜 */}
        <linearGradient id="goggleRainbow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9C27B0" />
          <stop offset="16%" stopColor="#2196F3" />
          <stop offset="33%" stopColor="#4CAF50" />
          <stop offset="50%" stopColor="#FFEB3B" />
          <stop offset="66%" stopColor="#FF9800" />
          <stop offset="83%" stopColor="#F44336" />
          <stop offset="100%" stopColor="#9C27B0" />
        </linearGradient>
        {/* 太空服渐变 */}
        <linearGradient id="suitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F0F0F0" />
        </linearGradient>
        {/* 背包渐变 */}
        <linearGradient id="backpackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#AB47BC" />
          <stop offset="100%" stopColor="#7B1FA2" />
        </linearGradient>
        {/* 腮红 */}
        <radialGradient id="blushGrad">
          <stop offset="0%" stopColor="#FF8A80" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FF8A80" stopOpacity="0" />
        </radialGradient>
        {/* 阴影 */}
        <filter id="petShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* ===== 紫色背包（在身体后面） ===== */}
      <rect x="82" y="95" width="18" height="28" rx="6" fill="url(#backpackGrad)" stroke="#6A1B9A" strokeWidth="0.8" />
      <rect x="85" y="98" width="12" height="6" rx="2" fill="#CE93D8" opacity="0.5" />

      {/* ===== 触角 ===== */}
      <g className="antenna-group">
        {/* 左触角 */}
        <path d="M 56 22 Q 50 10, 46 4" stroke="#5D4037" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <circle cx="46" cy="3" r="5" fill="#FFD700" stroke="#FFA000" strokeWidth="0.8">
          <animate attributeName="cy" values="3;1;3" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* 右触角 */}
        <path d="M 84 22 Q 90 10, 94 4" stroke="#5D4037" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <circle cx="94" cy="3" r="5" fill="#FFD700" stroke="#FFA000" strokeWidth="0.8">
          <animate attributeName="cy" values="3;1;3" dur="2s" repeatCount="indefinite" begin="0.3s" />
        </circle>
      </g>

      {/* ===== 头部 ===== */}
      <ellipse cx="70" cy="48" rx="38" ry="33" fill="url(#headGrad)" filter="url(#petShadow)" />

      {/* 头部高光 */}
      <ellipse cx="58" cy="35" rx="14" ry="8" fill="#fff" opacity="0.25" />

      {/* 棕色虎纹/发簇 - 左 */}
      <path d="M 38 38 Q 42 44, 38 50" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 41 36 Q 44 41, 41 46" stroke="#5D4037" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* 棕色虎纹/发簇 - 右 */}
      <path d="M 102 38 Q 98 44, 102 50" stroke="#5D4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 99 36 Q 96 41, 99 46" stroke="#5D4037" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* ===== 护目镜框架 ===== */}
      <rect x="32" y="32" width="76" height="24" rx="12" fill="#BDBDBD" stroke="#9E9E9E" strokeWidth="1" />
      {/* 彩虹护目镜镜片 */}
      <rect x="35" y="34" width="70" height="20" rx="10" fill="url(#goggleRainbow)" />
      {/* 镜片反光 */}
      <ellipse cx="52" cy="40" rx="10" ry="4" fill="#fff" opacity="0.35" />
      <ellipse cx="88" cy="40" rx="10" ry="4" fill="#fff" opacity="0.35" />
      {/* 镜片中缝 */}
      <line x1="70" y1="34" x2="70" y2="54" stroke="#9E9E9E" strokeWidth="1.5" opacity="0.3" />

      {/* ===== 紫色耳机/耳罩 ===== */}
      <ellipse cx="32" cy="48" rx="10" ry="11" fill="#9C27B0" stroke="#7B1FA2" strokeWidth="1" />
      <ellipse cx="32" cy="48" rx="6" ry="7" fill="#AB47BC" />
      <ellipse cx="32" cy="46" rx="3" ry="3.5" fill="#CE93D8" opacity="0.5" />
      <ellipse cx="108" cy="48" rx="10" ry="11" fill="#9C27B0" stroke="#7B1FA2" strokeWidth="1" />
      <ellipse cx="108" cy="48" rx="6" ry="7" fill="#AB47BC" />
      <ellipse cx="108" cy="46" rx="3" ry="3.5" fill="#CE93D8" opacity="0.5" />

      {/* ===== 身体 - 白色太空服 ===== */}
      <path d="M 42 82 Q 42 78, 52 76 L 88 76 Q 98 78, 98 82 L 100 120 Q 100 138, 85 140 L 55 140 Q 40 138, 40 120 Z"
            fill="url(#suitGrad)" stroke="#E0E0E0" strokeWidth="1" filter="url(#petShadow)" />

      {/* 橙色肩带 */}
      <path d="M 46 80 Q 48 86, 50 92" stroke="#FF5722" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M 94 80 Q 92 86, 90 92" stroke="#FF5722" strokeWidth="3.5" fill="none" strokeLinecap="round" />

      {/* 胸口名牌 */}
      <rect x="52" y="96" width="36" height="16" rx="3" fill="#fff" stroke="#E0E0E0" strokeWidth="0.8" />
      <text x="70" y="108" fontSize="11" fill="#333" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">闪峰</text>

      {/* 彩色按钮面板 */}
      <rect x="56" y="118" width="28" height="12" rx="3" fill="#F5F5F5" stroke="#E0E0E0" strokeWidth="0.6" />
      <circle cx="63" cy="124" r="3.5" fill="#00BCD4" stroke="#0097A7" strokeWidth="0.5" />
      <circle cx="70" cy="124" r="3.5" fill="#FFEB3B" stroke="#FBC02D" strokeWidth="0.5" />
      <circle cx="77" cy="124" r="3.5" fill="#F44336" stroke="#D32F2F" strokeWidth="0.5" />

      {/* 腰带 */}
      <rect x="44" y="132" width="52" height="5" rx="2.5" fill="#9C27B0" />
      <circle cx="70" cy="134.5" r="2.5" fill="#FFD700" />

      {/* ===== 手臂 ===== */}
      {/* 左臂 */}
      <path d="M 42 88 Q 30 98, 28 110" stroke="#F5F5F5" strokeWidth="10" fill="none" strokeLinecap="round" />
      <circle cx="28" cy="112" r="6" fill="#FFFFFF" stroke="#E0E0E0" strokeWidth="0.8" />
      {/* 橙色袖口 */}
      <path d="M 36 100 Q 32 104, 30 108" stroke="#FF5722" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* 右臂 */}
      <path d="M 98 88 Q 110 98, 112 110" stroke="#F5F5F5" strokeWidth="10" fill="none" strokeLinecap="round" />
      <circle cx="112" cy="112" r="6" fill="#FFFFFF" stroke="#E0E0E0" strokeWidth="0.8" />
      {/* 橙色袖口 */}
      <path d="M 104 100 Q 108 104, 110 108" stroke="#FF5722" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* ===== 腿和靴子 ===== */}
      {/* 左腿 */}
      <rect x="50" y="138" width="14" height="12" rx="2" fill="#F5F5F5" stroke="#E0E0E0" strokeWidth="0.5" />
      <ellipse cx="57" cy="154" rx="11" ry="7" fill="#9C27B0" stroke="#7B1FA2" strokeWidth="0.8" />
      <ellipse cx="57" cy="153" rx="7" ry="4" fill="#AB47BC" opacity="0.5" />

      {/* 右腿 */}
      <rect x="76" y="138" width="14" height="12" rx="2" fill="#F5F5F5" stroke="#E0E0E0" strokeWidth="0.5" />
      <ellipse cx="83" cy="154" rx="11" ry="7" fill="#9C27B0" stroke="#7B1FA2" strokeWidth="0.8" />
      <ellipse cx="83" cy="153" rx="7" ry="4" fill="#AB47BC" opacity="0.5" />

      {/* ===== 表情区域 - 护目镜下方的脸 ===== */}

      {/* 腮红（所有表情通用） */}
      <circle cx="46" cy="68" r="7" fill="url(#blushGrad)" />
      <circle cx="94" cy="68" r="7" fill="url(#blushGrad)" />

      {/* --- 开心 --- */}
      {expression === 'happy' && (
        <g>
          <circle cx="58" cy="65" r="3.5" fill="#333" />
          <circle cx="59" cy="63" r="1.2" fill="#fff" />
          <circle cx="82" cy="65" r="3.5" fill="#333" />
          <circle cx="83" cy="63" r="1.2" fill="#fff" />
          <path d="M 60 74 Q 70 82, 80 74" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* --- 思考 --- */}
      {expression === 'thinking' && (
        <g>
          <circle cx="58" cy="65" r="3" fill="#333" />
          <circle cx="82" cy="63" r="3" fill="#333" />
          <path d="M 63 76 Q 70 74, 77 76" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="68" cy="76" r="1.5" fill="#333" opacity="0" >
            <animate attributeName="opacity" values="0;0.3;0" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text x="100" y="30" fontSize="12" fill="#9C27B0" opacity="0.7">?</text>
          <text x="108" y="22" fontSize="8" fill="#9C27B0" opacity="0.5">?</text>
        </g>
      )}

      {/* --- 兴奋 --- */}
      {expression === 'excited' && (
        <g>
          <path d="M 54 63 L 58 68 L 62 63" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 78 63 L 82 68 L 86 63" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="70" cy="78" rx="7" ry="5" fill="#333" />
          <ellipse cx="70" cy="77" rx="5" ry="3" fill="#FF8A80" />
          {/* 星星闪烁 */}
          <text x="28" y="28" fontSize="10" fill="#FFD700">✦</text>
          <text x="102" y="28" fontSize="10" fill="#FFD700">✦</text>
          <text x="20" y="72" fontSize="8" fill="#FF9800" opacity="0.6">✧</text>
          <text x="112" y="72" fontSize="8" fill="#FF9800" opacity="0.6">✧</text>
        </g>
      )}

      {/* --- 困倦 --- */}
      {expression === 'sleepy' && (
        <g>
          <path d="M 52 65 Q 58 62, 64 65" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M 76 65 Q 82 62, 88 65" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <ellipse cx="70" cy="78" rx="6" ry="4.5" fill="#FF8A80" opacity="0.7" />
          {/* Z 漂浮 */}
          <text x="98" y="32" fontSize="7" fill="#9C27B0" fontWeight="bold" opacity="0.5">z</text>
          <text x="105" y="24" fontSize="9" fill="#9C27B0" fontWeight="bold" opacity="0.6">z</text>
          <text x="114" y="14" fontSize="12" fill="#9C27B0" fontWeight="bold" opacity="0.8">Z</text>
        </g>
      )}

      {/* --- 惊讶 --- */}
      {expression === 'surprised' && (
        <g>
          <ellipse cx="58" cy="64" rx="5" ry="6" fill="#fff" stroke="#333" strokeWidth="1.5" />
          <circle cx="58" cy="64" r="3" fill="#333" />
          <circle cx="59" cy="62" r="1.2" fill="#fff" />
          <ellipse cx="82" cy="64" rx="5" ry="6" fill="#fff" stroke="#333" strokeWidth="1.5" />
          <circle cx="82" cy="64" r="3" fill="#333" />
          <circle cx="83" cy="62" r="1.2" fill="#fff" />
          <ellipse cx="70" cy="79" rx="5.5" ry="5" fill="#333" opacity="0.6" />
          <ellipse cx="70" cy="78" rx="3.5" ry="3" fill="#FF8A80" />
          <text x="98" y="28" fontSize="16" fill="#F44336" fontWeight="bold">!</text>
        </g>
      )}

      {/* --- 眨眼 --- */}
      {expression === 'wink' && (
        <g>
          <circle cx="58" cy="65" r="3.5" fill="#333" />
          <circle cx="59" cy="63" r="1.3" fill="#fff" />
          <path d="M 77 65 Q 82 70, 87 65" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M 60 74 Q 70 81, 80 74" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* 脸颊泛红加深 */}
          <circle cx="46" cy="70" r="6" fill="#FF8A80" opacity="0.35" />
          <circle cx="94" cy="70" r="6" fill="#FF8A80" opacity="0.35" />
        </g>
      )}

      {/* --- 调皮 --- */}
      {expression === 'cheeky' && (
        <g>
          <path d="M 52 64 Q 58 59, 64 64" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M 76 64 Q 82 59, 88 64" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M 60 74 Q 70 80, 80 74" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 63 76 Q 70 79, 77 76" fill="#FF8A80" />
          {/* 舌头 */}
          <ellipse cx="70" cy="79" rx="4" ry="3" fill="#E57373" />
        </g>
      )}

      {/* --- 好奇 --- */}
      {expression === 'curious' && (
        <g>
          <circle cx="58" cy="64" r="4" fill="#333" />
          <circle cx="59.5" cy="62" r="1.5" fill="#fff" />
          <circle cx="82" cy="64" r="4" fill="#333" />
          <circle cx="83.5" cy="62" r="1.5" fill="#fff" />
          <path d="M 64 76 Q 70 73, 76 76" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
          <text x="96" y="30" fontSize="13" fill="#9C27B0" opacity="0.65">?</text>
        </g>
      )}

      {/* --- 酷 --- */}
      {expression === 'cool' && (
        <g>
          <path d="M 52 65 Q 58 61, 64 65" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M 76 65 Q 82 61, 88 65" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M 62 76 Q 70 79, 78 76" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* 墨镜效果 */}
          <rect x="47" y="58" width="20" height="14" rx="7" fill="#333" opacity="0.15" />
          <rect x="73" y="58" width="20" height="14" rx="7" fill="#333" opacity="0.15" />
          <text x="96" y="78" fontSize="10" fill="#FFD700">★</text>
        </g>
      )}

      {/* --- 生气 --- */}
      {expression === 'angry' && (
        <g>
          <path d="M 50 60 L 64 64" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 90 60 L 76 64" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="58" cy="67" r="3.5" fill="#333" />
          <circle cx="82" cy="67" r="3.5" fill="#333" />
          <path d="M 62 79 Q 70 75, 78 79" stroke="#333" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          {/* 火焰 */}
          <text x="94" y="50" fontSize="12" opacity="0.8">🔥</text>
          {/* 脸变红 */}
          <circle cx="46" cy="70" r="7" fill="#FF5722" opacity="0.2" />
          <circle cx="94" cy="70" r="7" fill="#FF5722" opacity="0.2" />
        </g>
      )}

      {/* --- 爱心 --- */}
      {expression === 'love' && (
        <g>
          <text x="51" y="70" fontSize="13" fill="#E91E63">♥</text>
          <text x="75" y="70" fontSize="13" fill="#E91E63">♥</text>
          <path d="M 58 76 Q 70 85, 82 76" stroke="#E91E63" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          {/* 漂浮爱心 */}
          <text x="28" y="30" fontSize="8" fill="#E91E63" opacity="0.6">❤</text>
          <text x="102" y="25" fontSize="10" fill="#E91E63" opacity="0.5">❤</text>
          <text x="18" y="65" fontSize="6" fill="#E91E63" opacity="0.4">♥</text>
          <text x="114" y="60" fontSize="6" fill="#E91E63" opacity="0.4">♥</text>
          {/* 脸颊加深红 */}
          <circle cx="46" cy="72" r="6" fill="#FF8A80" opacity="0.4" />
          <circle cx="94" cy="72" r="6" fill="#FF8A80" opacity="0.4" />
        </g>
      )}

      {/* --- 饿了 --- */}
      {expression === 'hungry' && (
        <g>
          <circle cx="58" cy="65" r="3.5" fill="#333" />
          <circle cx="82" cy="65" r="3.5" fill="#333" />
          <ellipse cx="70" cy="79" rx="8" ry="6" fill="#333" opacity="0.55" />
          <ellipse cx="70" cy="78" rx="5.5" ry="3.5" fill="#FF8A80" />
          {/* 口水 */}
          <path d="M 78 78 Q 80 82, 78 86" stroke="#64B5F6" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5">
            <animate attributeName="opacity" values="0.5;0.2;0.5" dur="1s" repeatCount="indefinite" />
          </path>
          <text x="94" y="30" fontSize="10">🍜</text>
        </g>
      )}

      {/* --- 默认/无表情 fallback --- */}
      {!['happy','thinking','excited','sleepy','surprised','wink','cheeky','curious','cool','angry','love','hungry'].includes(expression) && (
        <g>
          <circle cx="58" cy="65" r="3" fill="#333" />
          <circle cx="82" cy="65" r="3" fill="#333" />
          <path d="M 62 76 Q 70 80, 78 76" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}
