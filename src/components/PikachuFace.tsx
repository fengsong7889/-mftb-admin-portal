/** 皮卡丘头像组件 - 用于头像展示 */

interface PikachuFaceProps {
  expression: string
  size?: number
}

export default function PikachuFace({ expression, size = 64 }: PikachuFaceProps) {
  const scale = size / 95 // 基于原始宽度95的缩放比例
  
  return (
    <svg 
      viewBox="0 0 140 155" 
      width={size} 
      height={Math.round(155 * scale)} 
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* 闪电尾巴 */}
      <polygon points="115,80 125,65 120,65 132,42 126,42 140,18 128,48 134,48 122,68 128,68 118,82" fill="#FDD835" />
      <polygon points="115,80 125,65 120,65 132,42 126,42 140,18 128,48 134,48 122,68 128,68 118,82" fill="none" stroke="#C6A700" strokeWidth="1" />
      <polygon points="115,80 118,76 120,82" fill="#8B6914" />
      
      {/* 耳朵 */}
      <path d="M 32 55 L 12 8 L 48 42 Z" fill="#FDD835" />
      <path d="M 12 8 L 22 28 L 18 30 Z" fill="#333" />
      <path d="M 108 55 L 128 8 L 92 42 Z" fill="#FDD835" />
      <path d="M 128 8 L 118 28 L 122 30 Z" fill="#333" />
      
      {/* 身体 */}
      <ellipse cx="70" cy="112" rx="34" ry="30" fill="#FDD835" />
      <ellipse cx="70" cy="116" rx="26" ry="22" fill="#FFE57F" />
      <path d="M 48 100 L 54 94 L 56 100" stroke="#C68A00" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M 84 100 L 90 94 L 92 100" stroke="#C68A00" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      
      {/* 头 */}
      <ellipse cx="70" cy="70" rx="38" ry="34" fill="#FDD835" />
      
      {/* 红脸颊 */}
      <circle cx="38" cy="78" r="10" fill="#E53935" opacity="0.85" />
      <circle cx="102" cy="78" r="10" fill="#E53935" opacity="0.85" />
      <ellipse cx="35" cy="75" rx="3" ry="2" fill="#FF8A80" opacity="0.5" />
      <ellipse cx="99" cy="75" rx="3" ry="2" fill="#FF8A80" opacity="0.5" />

      {/* 表情 */}
      {expression === 'happy' && (
        <g>
          <path d="M 48 66 Q 55 58, 62 66" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 78 66 Q 85 58, 92 66" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 52 82 Q 70 98, 88 82" stroke="#333" strokeWidth="2.5" fill="#FF8A80" />
          <ellipse cx="70" cy="88" rx="6" ry="4" fill="#E53935" />
        </g>
      )}
      {expression === 'thinking' && (
        <g>
          <ellipse cx="55" cy="64" rx="9" ry="10" fill="#333" />
          <ellipse cx="85" cy="64" rx="9" ry="10" fill="#333" />
          <circle cx="55" cy="60" r="4" fill="#fff" />
          <circle cx="85" cy="60" r="4" fill="#fff" />
          <path d="M 60 84 Q 70 86, 80 82" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="40" cy="86" rx="8" ry="6" fill="#FDD835" transform="rotate(-20 40 86)" />
        </g>
      )}
      {expression === 'excited' && (
        <g>
          <ellipse cx="55" cy="64" rx="11" ry="12" fill="#333" />
          <ellipse cx="85" cy="64" rx="11" ry="12" fill="#333" />
          <circle cx="55" cy="64" r="7" fill="#5D4037" />
          <circle cx="85" cy="64" r="7" fill="#5D4037" />
          <circle cx="57" cy="60" r="3.5" fill="#fff" />
          <circle cx="87" cy="60" r="3.5" fill="#fff" />
          <text x="51" y="67" fontSize="6" fill="#fff">✦</text>
          <text x="81" y="67" fontSize="6" fill="#fff">✦</text>
          <ellipse cx="70" cy="86" rx="10" ry="8" fill="#FF8A80" />
        </g>
      )}
      {expression === 'sleepy' && (
        <g>
          <ellipse cx="55" cy="66" rx="9" ry="4" fill="#333" />
          <ellipse cx="85" cy="66" rx="9" ry="4" fill="#333" />
          <path d="M 46 62 Q 55 60, 64 62" stroke="#FDD835" strokeWidth="7" fill="#FDD835" strokeLinecap="round" />
          <path d="M 76 62 Q 85 60, 94 62" stroke="#FDD835" strokeWidth="7" fill="#FDD835" strokeLinecap="round" />
          <ellipse cx="70" cy="84" rx="8" ry="7" fill="#FF8A80" stroke="#333" strokeWidth="1.5" />
        </g>
      )}
      {expression === 'surprised' && (
        <g>
          <ellipse cx="55" cy="64" rx="11" ry="13" fill="#fff" />
          <ellipse cx="85" cy="64" rx="11" ry="13" fill="#fff" />
          <circle cx="55" cy="64" r="6" fill="#333" />
          <circle cx="85" cy="64" r="6" fill="#333" />
          <circle cx="57" cy="60" r="2.5" fill="#fff" />
          <circle cx="87" cy="60" r="2.5" fill="#fff" />
          <ellipse cx="70" cy="86" rx="7" ry="8" fill="#333" opacity="0.7" />
          <ellipse cx="70" cy="85" rx="5" ry="6" fill="#FF8A80" />
        </g>
      )}
      {expression === 'wink' && (
        <g>
          <ellipse cx="55" cy="64" rx="9" ry="10" fill="#333" />
          <circle cx="57" cy="60" r="3" fill="#fff" />
          <path d="M 78 68 Q 85 74, 92 68" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 56 82 Q 70 92, 84 82" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {expression === 'cheeky' && (
        <g>
          <path d="M 46 66 Q 55 58, 64 66" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 76 66 Q 85 58, 94 66" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 56 82 Q 70 88, 84 82" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="73" cy="90" rx="7" ry="9" fill="#FF8A80" />
          <path d="M 66 88 Q 73 94, 80 88" fill="#E53935" />
        </g>
      )}
      {expression === 'cool' && (
        <g>
          <rect x="40" y="58" rx="5" ry="5" width="26" height="15" fill="#222" />
          <rect x="74" y="58" rx="5" ry="5" width="26" height="15" fill="#222" />
          <line x1="66" y1="64" x2="74" y2="64" stroke="#222" strokeWidth="2.5" />
          <line x1="40" y1="64" x2="34" y2="62" stroke="#222" strokeWidth="2" />
          <line x1="100" y1="64" x2="106" y2="62" stroke="#222" strokeWidth="2" />
          <path d="M 56 82 Q 70 92, 84 82" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {expression === 'love' && (
        <g>
          <path d="M 48 60 C 48 53, 57 53, 55 62 C 53 53, 62 53, 62 60 C 62 67, 55 72, 55 72 C 55 72, 48 67, 48 60 Z" fill="#E53935" />
          <path d="M 78 60 C 78 53, 87 53, 85 62 C 83 53, 92 53, 92 60 C 92 67, 85 72, 85 72 C 85 72, 78 67, 78 60 Z" fill="#E53935" />
          <path d="M 56 82 Q 70 92, 84 82" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {/* 默认表情 */}
      {(!expression || expression === 'default') && (
        <g>
          <ellipse cx="55" cy="64" rx="9" ry="10" fill="#333" />
          <circle cx="57" cy="60" r="3" fill="#fff" />
          <ellipse cx="85" cy="64" rx="9" ry="10" fill="#333" />
          <circle cx="87" cy="60" r="3" fill="#fff" />
          <path d="M 56 82 Q 70 90, 84 82" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* 鼻子 */}
      <circle cx="70" cy="74" r="2" fill="#333" />
    </svg>
  )
}
