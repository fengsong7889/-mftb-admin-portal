import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Spin, Tag } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import DingTalkCardPreview from './DingTalkCardPreview'
import {
  fetchDailyReportBuiltinLayout,
  type DailyReportBuiltinLayout,
  type DailyReportBuiltinLayoutType,
} from '../../../api/rdmDailyReport'
import '../index.css'

/**
 * 系統內置版式的詳情頁（只讀）。
 *
 * <p><b>為什麼要有這個頁</b>：固定版式的框架寫死在後端渲染器裡，模板表裡的正文不參與渲染；
 * 過去用戶在「模板配置」裡點進一套模板改正文，改完卻發現推送內容沒變——界面在撒謊。
 * 這裡把「系統內置」與「自定義模板」徹底分開：內置只能看，樣式即最終效果。
 *
 * <p><b>為什麼示例來自後端</b>：示例必須與線上推送用同一個渲染器產出，前端寫死的文案
 * 一改格式就會過時；後端用固定示例數據渲染，既不依賴庫裡有沒有數據，也不會把真實項目
 * 明細當成「示例」展示給只能看模板配置的人。
 */
const BUILTIN_TYPES: DailyReportBuiltinLayoutType[] = ['group_morning', 'group_evening', 'personal']

export default function BuiltinTemplateDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('type') as DailyReportBuiltinLayoutType | null
  const type: DailyReportBuiltinLayoutType = requested && BUILTIN_TYPES.includes(requested)
    ? requested : 'group_morning'

  const [data, setData] = useState<DailyReportBuiltinLayout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchDailyReportBuiltinLayout(type))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    void load()
  }, [load])

  const title = type === 'personal'
    ? t('rdm.dailyTemplate.channelPersonal')
    : `${t('rdm.dailyTemplate.channelGroup')}·${type === 'group_evening'
      ? t('rdm.dailyTemplate.typeEvening') : t('rdm.dailyTemplate.typeMorning')}`

  return (
    <div className="content-area">
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* 入口只有「推送配置」的釘釘消息區一處，返回必須回到那裡；
              回到模板配置頁會讓用戶以為自己剛才是從模板列表進來的 */}
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/rdm-daily-report-rules')}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}>
            {t('rdm.dailyTemplate.back')}
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
          <Tag color="blue">{t('rdm.dailyTemplate.preset')}</Tag>
        </div>
      </div>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="內置版式不可編輯；需要自定義文案時，請把消息模式切為「自定義模板」。" />

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyTemplate.loadFailed')}
          description={error}
          action={<Button size="small" onClick={() => void load()}>{t('rdm.dailyTemplate.retry')}</Button>} />
      )}

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>版式預覽</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
        </div>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
          按示例數據渲染，用於確認版式；不會發送
        </div>
        {loading
          ? <div style={{ padding: '32px 0', textAlign: 'center' }}><Spin /></div>
          : data && (
            <DingTalkCardPreview
              title={data.title}
              content={data.content}
              mode={data.messageMode === 'template' ? 'template' : 'fixed'}
              buttonText={data.messageMode === 'template' ? undefined : t('rdm.dailyTemplate.previewButton')}
              timeText="09:00"
            />
          )}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}
