/**
 * 书籍角（P1）：PDF 书目卡片、续读进度、收藏。
 * 列目录与权限仍由后端 /doc/v3/books 统一过滤，前端不自行拼权限。
 */
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { Alert, Button, Empty, Input, Progress, Select, Space, Spin, Tag, message } from 'antd'
import { BookOutlined, ReloadOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchDocKnowledgeSpaces, type DocKnowledgeSpace } from '@/api/docKnowledge'
import { fetchDocBooks, fetchDocFavorites, toggleDocFavorite, type DocBookMeta } from '@/api/docReading'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

export default function DocBooks() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [spaces, setSpaces] = useState<DocKnowledgeSpace[]>([])
  const [spaceId, setSpaceId] = useState<number | undefined>()
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<DocBookMeta[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size] = useState(20)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (nextPage = page) => {
    setLoading(true)
    try {
      const result = await fetchDocBooks({ spaceId, keyword, page: nextPage, size })
      setRows(result.records)
      setTotal(result.total)
      setPage(result.page)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [spaceId, keyword, page, size, t])

  useEffect(() => {
    void fetchDocKnowledgeSpaces().then(setSpaces).catch(() => setSpaces([]))
    void fetchDocFavorites().then(list => setFavoriteIds(new Set(list.map(item => item.nodeId)))).catch(() => setFavoriteIds(new Set()))
  }, [])
  useEffect(() => { void load(1) }, [spaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFavorite = async (event: MouseEvent, row: DocBookMeta) => {
    event.stopPropagation()
    try {
      const favored = await toggleDocFavorite(row.nodeId)
      setFavoriteIds(prev => {
        const next = new Set(prev)
        if (favored) next.add(row.nodeId)
        else next.delete(row.nodeId)
        return next
      })
      message.success(t(favored ? 'docKnowledge.favoriteAdded' : 'docKnowledge.favoriteRemoved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.favoriteFailed'))
    }
  }

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.booksTitle')} description={t('docKnowledge.booksHint')} />
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<BookOutlined />} title={t('docKnowledge.booksTitle')}
          extra={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('docKnowledge.reload')}</Button>} />
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search allowClear value={keyword} onChange={e => setKeyword(e.target.value)}
            onSearch={() => void load(1)} placeholder={t('docKnowledge.searchPlaceholder')} style={{ width: 260 }} />
          <Select allowClear value={spaceId} onChange={setSpaceId} style={{ width: 220 }}
            placeholder={t('docKnowledge.fieldSpace')}
            options={spaces.map(space => ({ value: space.id, label: space.name }))} />
        </Space>
        {loading && rows.length === 0 ? (
          <div style={{ minHeight: 220, display: 'grid', placeItems: 'center' }}><Spin /></div>
        ) : rows.length === 0 ? (
          <Empty description={t('docKnowledge.booksEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {rows.map(row => (
              <div key={row.nodeId}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/doc-center/knowledge?id=${row.nodeId}`)}
                onKeyDown={event => { if (event.key === 'Enter') navigate(`/doc-center/knowledge?id=${row.nodeId}`) }}
                style={{
                  border: '1px solid #f0f0f0', borderRadius: 12, padding: 16, background: '#fff',
                  cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  display: 'flex', flexDirection: 'column', minHeight: 190,
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.title || t('docKnowledge.untitled')}
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                      {[row.author, row.publisher, row.publishYear ? String(row.publishYear) : null].filter(Boolean).join(' · ') || t('docKnowledge.bookMetaEmpty')}
                    </div>
                  </div>
                  <Button type="text" size="small"
                    icon={favoriteIds.has(row.nodeId) ? <StarFilled style={{ color: '#FAAD14' }} /> : <StarOutlined />}
                    onClick={event => void handleFavorite(event, row)} />
                </div>
                <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.7, marginTop: 10, flex: 1,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {row.summary || t('docKnowledge.noSummary')}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Progress percent={Math.round(row.percent || 0)} size="small" />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <Tag color="blue">{t('docKnowledge.kind.pdf')}</Tag>
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('docKnowledge.continueReading')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {total > size && (
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button disabled={page <= 1} onClick={() => void load(page - 1)}>{t('docKnowledge.prevPage')}</Button>
              <span style={{ color: '#8c8c8c' }}>{page} / {Math.ceil(total / size)}</span>
              <Button disabled={page >= Math.ceil(total / size)} onClick={() => void load(page + 1)}>{t('docKnowledge.nextPage')}</Button>
            </Space>
          </div>
        )}
      </div>
    </div>
  )
}
