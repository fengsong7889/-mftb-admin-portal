import { useEffect, useState } from 'react'
import { Button, Spin, Tag } from 'antd'
import dayjs from 'dayjs'
import { ArrowLeftOutlined, FileTextOutlined, CodeOutlined, DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchVersionDetail } from '../../api/versionHistory'
import type { VersionHistoryRecord } from '../../api/versionHistory'

const TYPE_COLOR: Record<string, string> = { major: 'red', minor: 'blue', patch: 'green' }

/** 将换行分隔的文本渲染为列表 */
function ChangeList({ text, emptyText }: { text: string; emptyText: string }) {
  if (!text?.trim()) return <span style={{ color: '#8c8c8c', fontSize: 13 }}>{emptyText}</span>
  const lines = text.split('\n').filter(l => l.trim())
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {lines.map((line, i) => <li key={i} style={{ marginBottom: 4, color: '#595959', fontSize: 13, lineHeight: 1.8 }}>{line}</li>)}
    </ul>
  )
}

export default function VersionHistoryDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<VersionHistoryRecord | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetchVersionDetail(Number(id))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!data) return <div style={{ textAlign: 'center', padding: 80, color: '#8c8c8c' }}>{t('versionHistory.notFound')}</div>

  const handleBack = () => navigate('/version-history')

  return (
    <div className="content-area">
      {/* 页面头部 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              v{data.versionNo} {t('versionHistory.detailTitle')}
            </h2>
            <Tag color={TYPE_COLOR[data.releaseType] || 'default'}>{t(`versionHistory.type_${data.releaseType}`)}</Tag>
          </div>
          <div style={{ fontSize: 13, color: '#8c8c8c' }}>
            {data.releaseDate && dayjs(data.releaseDate).format('YYYY-MM-DD')}
          </div>
        </div>
      </div>

      {/* 基本信息 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InfoCircleOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('versionHistory.basicInfo')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.versionNo')}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>v{data.versionNo}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.releaseType')}</div>
            <Tag color={TYPE_COLOR[data.releaseType] || 'default'}>{t(`versionHistory.type_${data.releaseType}`)}</Tag>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.releaseDate')}</div>
            <div style={{ fontSize: 14 }}>{data.releaseDate ? dayjs(data.releaseDate).format('YYYY-MM-DD') : '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.status')}</div>
            <Tag color={data.status === 1 ? 'success' : 'default'}>
              {data.status === 1 ? t('versionHistory.statusPublished') : t('versionHistory.statusDraft')}
            </Tag>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.createdBy')}</div>
            <div style={{ fontSize: 14 }}>{data.createdBy || '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.createdAt')}</div>
            <div style={{ fontSize: 14 }}>{data.createdAt ? dayjs(data.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</div>
          </div>
        </div>
        {data.summary && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('versionHistory.summary')}</div>
            <div style={{ fontSize: 14, color: '#262626', lineHeight: 1.8 }}>{data.summary}</div>
          </div>
        )}
      </div>

      {/* 前端更新内容 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CodeOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('versionHistory.frontendChanges')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <ChangeList text={data.frontendChanges} emptyText={t('versionHistory.noChanges')} />
      </div>

      {/* 后端更新内容 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('versionHistory.backendChanges')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <ChangeList text={data.backendChanges} emptyText={t('versionHistory.noChanges')} />
      </div>

      {/* 数据库变更 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DatabaseOutlined style={{ fontSize: 14, color: '#722ed1' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('versionHistory.databaseChanges')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <ChangeList text={data.databaseChanges} emptyText={t('versionHistory.noChanges')} />
      </div>
    </div>
  )
}
