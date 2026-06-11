import mascotImage from '../assets/mascot-uploaded-bee.png'

interface PikachuFaceProps {
  expression: string
  size?: number
}

const expressionSet = new Set([
  'happy',
  'thinking',
  'excited',
  'sleepy',
  'surprised',
  'wink',
  'cheeky',
  'curious',
  'cool',
  'angry',
  'love',
  'hungry',
])

function FaceExpression({ expression }: { expression: string }) {
  switch (expression) {
    case 'thinking':
    case 'curious':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <circle className="bee-eye-dot" cx="28" cy="32" r="10" />
          <circle className="bee-eye-dot" cx="72" cy="30" r="10" />
          <path className="bee-mouth-line" d="M38 60 Q50 54 62 60" />
          <text x="78" y="16" className="bee-face-mark bee-face-mark-main">?</text>
          <text x="88" y="6" className="bee-face-mark bee-face-mark-sub">?</text>
        </svg>
      )
    case 'excited':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <path className="bee-eye-line" d="M20 32 L28 40 L36 32" />
          <path className="bee-eye-line" d="M64 32 L72 40 L80 32" />
          <ellipse className="bee-mouth-open" cx="50" cy="60" rx="13" ry="9" />
          <text x="12" y="16" className="bee-face-star">✦</text>
          <text x="82" y="16" className="bee-face-star">✦</text>
        </svg>
      )
    case 'sleepy':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <path className="bee-eye-line" d="M18 34 Q28 28 38 34" />
          <path className="bee-eye-line" d="M62 34 Q72 28 82 34" />
          <ellipse className="bee-mouth-soft" cx="50" cy="60" rx="9" ry="6" />
          <text x="76" y="16" className="bee-face-zzz">z</text>
          <text x="86" y="6" className="bee-face-zzz bee-face-zzz-big">Z</text>
        </svg>
      )
    case 'surprised':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <ellipse className="bee-eye-ring" cx="28" cy="32" rx="12" ry="14" />
          <ellipse className="bee-eye-ring" cx="72" cy="32" rx="12" ry="14" />
          <ellipse className="bee-mouth-open" cx="50" cy="62" rx="9" ry="10" />
          <text x="82" y="18" className="bee-face-bang">!</text>
        </svg>
      )
    case 'wink':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <circle className="bee-eye-dot" cx="28" cy="32" r="10" />
          <path className="bee-eye-line" d="M62 34 Q72 42 82 34" />
          <path className="bee-smile-line" d="M28 58 Q50 72 72 58" />
        </svg>
      )
    case 'cheeky':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <path className="bee-eye-line" d="M18 32 Q28 24 38 32" />
          <path className="bee-eye-line" d="M62 32 Q72 24 82 32" />
          <path className="bee-smile-line" d="M30 57 Q50 70 70 57" />
          <ellipse className="bee-tongue" cx="50" cy="68" rx="7" ry="5" />
        </svg>
      )
    case 'cool':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <rect className="bee-glass" x="14" y="24" width="24" height="16" rx="7" />
          <rect className="bee-glass" x="62" y="24" width="24" height="16" rx="7" />
          <path className="bee-glass-bridge" d="M38 32 Q50 36 62 32" />
          <path className="bee-smile-line" d="M30 58 Q50 66 70 58" />
        </svg>
      )
    case 'angry':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <path className="bee-brow-line" d="M16 22 L38 30" />
          <path className="bee-brow-line" d="M84 22 L62 30" />
          <circle className="bee-eye-dot" cx="28" cy="36" r="10" />
          <circle className="bee-eye-dot" cx="72" cy="36" r="10" />
          <path className="bee-mouth-line" d="M32 64 Q50 54 68 64" />
        </svg>
      )
    case 'love':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <text x="18" y="40" className="bee-heart-eye">♥</text>
          <text x="64" y="40" className="bee-heart-eye">♥</text>
          <path className="bee-love-line" d="M28 58 Q50 74 72 58" />
          <text x="8" y="18" className="bee-float-heart">❤</text>
          <text x="84" y="14" className="bee-float-heart">❤</text>
        </svg>
      )
    case 'hungry':
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <circle className="bee-eye-dot" cx="28" cy="32" r="10" />
          <circle className="bee-eye-dot" cx="72" cy="32" r="10" />
          <ellipse className="bee-mouth-open" cx="50" cy="62" rx="13" ry="9" />
          <path className="bee-drool" d="M66 62 Q72 70 66 76" />
          <text x="80" y="18" className="bee-food">🍯</text>
        </svg>
      )
    case 'happy':
    default:
      return (
        <svg viewBox="0 0 100 80" aria-hidden="true">
          <circle className="bee-eye-dot" cx="28" cy="32" r="10" />
          <circle className="bee-eye-dot" cx="72" cy="32" r="10" />
          <path className="bee-smile-line" d="M28 58 Q50 72 72 58" />
        </svg>
      )
  }
}

export default function PikachuFace({ expression, size = 100 }: PikachuFaceProps) {
  const normalizedExpression = expressionSet.has(expression) ? expression : 'happy'
  const height = Math.round(size * 1.58)

  return (
    <div
      className={`uploaded-bee uploaded-bee--${normalizedExpression}`}
      style={{ width: size, height }}
      role="img"
      aria-label="闪峰蜜蜂宠物"
    >
      <img className="uploaded-bee-image uploaded-bee-base" src={mascotImage} alt="闪峰蜜蜂宠物" draggable={false} />
      <div className="uploaded-bee-motion uploaded-bee-signal-motion" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="uploaded-bee-motion uploaded-bee-left-wing-motion" aria-hidden="true" />
      <div className="uploaded-bee-motion uploaded-bee-right-wing-motion" aria-hidden="true" />
      <div className="uploaded-bee-motion uploaded-bee-left-hand-motion" aria-hidden="true" />
      <div className="uploaded-bee-motion uploaded-bee-right-hand-motion" aria-hidden="true" />
      <div className="uploaded-bee-motion uploaded-bee-left-foot-motion" aria-hidden="true" />
      <div className="uploaded-bee-motion uploaded-bee-right-foot-motion" aria-hidden="true" />
      <div className="uploaded-bee-expression" aria-hidden="true">
        <FaceExpression expression={normalizedExpression} />
      </div>
    </div>
  )
}
