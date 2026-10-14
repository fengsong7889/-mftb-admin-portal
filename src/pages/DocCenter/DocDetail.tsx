/**
 * 文檔詳情（非菜單子頁：/doc-center/detail?id=）
 *
 * 正文在騰訊文檔側（單一事實源），本頁只展示元數據索引與在線預覽；
 * 查閱留痕仍在後台記錄（審計與 P2 培訓統計口徑），但不再在頁面展示——
 * 能進到本頁即已通過菜單門禁，留痕列表對閱讀者沒有額外信息量。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Descriptions, Space, Spin, Tag, Typography } from 'antd'
import { ExportOutlined, EyeOutlined, FileTextOutlined, LinkOutlined, ProfileOutlined } from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import DocSectionCard from './DocSectionCard'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchDocNode, reportViewDuration,
  DOC_STATUS_COLOR,
  type DocNode, type DocStatus, type DocType,
} from '@/api/docCenter'
import '@/styles/components.css'

/** ID 校驗：僅接受正整數，防無效深鏈打進接口 */
function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function DocDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  // 編輯入口與列表頁同口徑（doc-library:edit）；後端仍有服務端校驗
  const canEdit = hasPermission('doc-library:edit')
  const [params] = useSearchParams()
  const id = parseId(params.get('id'))

  const [node, setNode] = useState<DocNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      setError(t('doc.missingId'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const n = await fetchDocNode(id)
      if (!n) {
        setNode(null)
        setError(t('doc.loadFailed'))
        return
      }
      setNode(n)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('doc.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => {
    void load()
  }, [load])

  /** 停留時長上報：卸載時回填最近一筆未計時留痕；失敗靜默（api 層已 catch） */
  const enteredAt = useRef(Date.now())
  useEffect(() => {
    if (!id) return
    const t0 = enteredAt.current
    return () => {
      void reportViewDuration(id, Math.round((Date.now() - t0) / 1000))
    }
  }, [id])

  if (loading) {
    return (
      <div className="content-area" style={{ padding: '20px 24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !node) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <Alert
          type="error"
          showIcon
          message={error ?? t('doc.loadFailed')}
          description={t('doc.notFoundHint')}
          action={<Button size="small" onClick={() => navigate('/doc-center')}>{t('doc.backToLibrary')}</Button>}
        />
      </div>
    )
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <DetailPageHeader
        title={node.title}
        tags={
          <>
            <Tag color={DOC_STATUS_COLOR[node.status]}>{t(`doc.status.${node.status}`)}</Tag>
            <Tag>{t(`doc.type.${node.docType}`)}</Tag>
            {node.tags.map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}
          </>
        }
        meta={`${node.spaceName} · ${node.category} · ${t('doc.metaOwner')} ${node.ownerName} · ${t('doc.metaUpdated')} ${node.updatedAt}`}
        onBack={() => navigate('/doc-center')}
        extra={
          <Space>
            {node.bizType === 'REQ' && node.bizId && (
              <Button icon={<LinkOutlined />} onClick={() => navigate(`/rdm-detail?id=${node.bizId}`)}>
                {t('doc.viewLinkedReq')}
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => navigate(`/doc-center/edit?id=${node.id}`)}>{t('doc.edit')}</Button>
            )}
            <Button type="primary" icon={<ExportOutlined />} onClick={() => window.open(node.tencentUrl, '_blank', 'noopener')}>
              {t('doc.openTencentDoc')}
            </Button>
          </Space>
        }
      />

      <DocSectionCard icon={<FileTextOutlined />} color="#1890ff" bg="#e6f7ff" title={t('doc.overview')}
        hint={t('doc.overviewHint')}>
        <Descriptions
          bordered
          size="small"
          column={2}
          items={[
            { key: 'space', label: t('doc.fieldSpace'), children: node.spaceName },
            { key: 'category', label: t('doc.fieldCategory'), children: node.category },
            { key: 'type', label: t('doc.fieldType'), children: t(`doc.type.${node.docType as DocType}`) },
            { key: 'status', label: t('doc.fieldStatus'), children: <Tag color={DOC_STATUS_COLOR[node.status as DocStatus]}>{t(`doc.status.${node.status}`)}</Tag> },
            { key: 'owner', label: t('doc.fieldOwner'), children: node.ownerName },
            { key: 'updated', label: t('doc.fieldUpdated'), children: node.updatedAt },
            {
              key: 'biz', label: t('doc.fieldBiz'),
              children: node.bizType === 'REQ' && node.bizId
                ? <a onClick={() => navigate(`/rdm-detail?id=${node.bizId}`)}>{node.bizLabel ?? `REQ-${node.bizId}`}</a>
                : '-',
            },
            {
              key: 'url', label: t('doc.fieldUrl'), span: 2,
              children: <Typography.Text copyable={{ text: node.tencentUrl }} style={{ fontSize: 12 }}>{node.tencentUrl}</Typography.Text>,
            },
          ]}
        />
      </DocSectionCard>

      {/* 在線預覽（P1）：內嵌騰訊文檔頁面；實測其響應頭無 X-Frame-Options/CSP 拦截，
          但仍可能被登錄態/瀏覽器策略阻斷，故保留頭部「打開騰訊文檔」作為兜底出口 */}
      <DocSectionCard icon={<EyeOutlined />} color="#13c2c2" bg="#e6fffb" title={t('doc.preview')}
        hint={t('doc.previewHint')}>
        <iframe
          src={node.tencentUrl}
          title={node.title}
          loading="lazy"
          allowFullScreen
          style={{ width: '100%', height: '80vh', border: '1px solid #e8eaed', borderRadius: 8, background: '#fff' }}
        />
      </DocSectionCard>

      {node.summary && (
        <DocSectionCard icon={<ProfileOutlined />} color="#52c41a" bg="#f6ffed" title={t('doc.summaryTitle')}>
          <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.8 }}>{node.summary}</div>
        </DocSectionCard>
      )}
    </div>
  )
}
