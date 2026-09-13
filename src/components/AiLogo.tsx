import aiLogo from '../assets/ai-logo.png'

/** AI 標誌圖標（幾何拼色 Ai Logo） */
const AiLogo = ({ size = 40 }: { size?: number }) => (
  <img src={aiLogo} alt="AI" width={size} height={size} className="home-ai-logo" />
)

export default AiLogo
