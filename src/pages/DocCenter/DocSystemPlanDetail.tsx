/**
 * 系统方案详情：读取归档快照，元数据与正文一起保留，供后续改造追溯。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Empty, Spin, Tag } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AiRichText from '@/pages/Home/AiRichText'
import { fetchDocSystemPlanDetail, type DocSystemPlanDetail } from '@/api/docCatalog'
import { formatDocKnowledgeTime } from '@/api/docKnowledge'
import DocSectionCard from './DocSectionCard'
import '@/styles/components.css'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function DocSystemPlanDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { search } = useLocation()
  const id = parseId(new URLSearchParams(search).get('id'))
  const [detail, setDetail] = useState<DocSystemPlanDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setFailed(t('docKnowledge.missingId'))
      setLoading(false)
      return
    }
    fetchDocSystemPlanDetail(id)
      .then(setDetail)
      .catch(error => setFailed(error instanceof Error ? error.message : t('docKnowledge.loadFailed')))
      .finally(() => setLoading(false))
  }, [id, t])

  if (loading) return <div className="content-area" style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  if (failed || !detail) {
    return <div className="content-area"><Alert type="error" showIcon message={failed ?? t('docKnowledge.loadFailed')}
      action={<Button size="small" onClick={() => navigate('/doc-system-plans')}>{t('docKnowledge.systemPlanBack')}</Button>} /></div>
  }

  const plan = detail.plan
  return (
    <div className="content-area">
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)' }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/doc-system-plans')}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8 }}>
            {t('docKnowledge.systemPlanBack')}
          </Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{plan.title}</h2>
          <Tag color="blue">{plan.planType}</Tag>
          {plan.systemCode && <Tag>{plan.systemCode}</Tag>}
        </div>
      </div>

      <DocSectionCard icon={<FileTextOutlined />} color="#1890ff" bg="#e6f7ff" title={t('docKnowledge.systemPlanMeta')}>
        <Descriptions bordered size="small" column={2} items={[
          { key: 'system', label: t('docKnowledge.systemPlanSystem'), children: plan.systemName },
          { key: 'type', label: t('docKnowledge.systemPlanType'), children: plan.planType },
          { key: 'generated', label: t('docKnowledge.systemPlanGeneratedAt'), children: formatDocKnowledgeTime(plan.generatedAt) },
          { key: 'updated', label: t('docKnowledge.updatedAt'), children: formatDocKnowledgeTime(plan.updatedAt) },
          { key: 'file', label: t('docKnowledge.systemPlanFile'), children: plan.fileName },
          { key: 'size', label: t('docKnowledge.fileSize'), children: `${(plan.fileSize / 1024).toFixed(1)} KB` },
          { key: 'source', label: t('docKnowledge.systemPlanSource'), span: 2, children: plan.sourcePath },
          { key: 'hash', label: t('docKnowledge.systemPlanHash'), span: 2, children: plan.contentHash },
        ]} />
      </DocSectionCard>

      <DocSectionCard icon={<FileTextOutlined />} color="#13c2c2" bg="#e6fffb" title={t('docKnowledge.systemPlanContent')}>
        {detail.content ? (
          <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.9 }}>
            <AiRichText text={detail.content} />
          </div>
        ) : <Empty description={t('docKnowledge.noContent')} />}
      </DocSectionCard>
    </div>
  )
}
