/** 原生阅读与版本对照界面；仅演示固定样稿，不接正文 API。 */
import { useState } from 'react'
import { Alert, Button, Descriptions, Empty, Radio, Select, Space, Tag, Timeline } from 'antd'
import { FileTextOutlined, HistoryOutlined, LinkOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import HelpPopover from '@/components/HelpPopover'
import DocSectionCard from '../DocSectionCard'
import { PreviewArticle, PreviewUpdated } from './PreviewPrimitives'
import { EXECUTION_LABEL, STATUS_COLOR, STATUS_LABEL, getPreviewRevision, type PreviewDocument, type PreviewNavigate } from './previewData'

export function PlanReaderPreview({ doc, navigate, onTrash }: { doc: PreviewDocument; navigate: PreviewNavigate; onTrash: () => void }) {
  const [selectedId, setSelectedId] = useState(doc.effectiveId ?? doc.draftId)
  const [mode, setMode] = useState('rendered')
  const revision = getPreviewRevision(doc, selectedId)
  const frozen = doc.status === 'archived' || doc.status === 'replaced' || doc.deleted
  return <>
    <DetailPageHeader title="方案詳情" meta={`${doc.code} · ${doc.space} · ${doc.system} / ${doc.menu}`} tags={<Tag color={STATUS_COLOR[doc.status]}>{STATUS_LABEL[doc.status]}</Tag>}
      onBack={() => navigate(doc.source === 'external' ? 'library' : 'plans')} onEdit={doc.source === 'native' && !frozen && doc.status !== 'reviewing' ? () => navigate('edit', doc.id) : undefined} />
    {frozen && <Alert className="doc-preview__notice" type="warning" showIcon message={doc.deleted ? '此演示記錄已在回收站' : `${STATUS_LABEL[doc.status]}：不作為目前執行依據`}
      description={doc.deletionReason ?? '保留歷史內容與版本，避免過期方案被誤用。'} action={doc.replacementId ? <Button size="small" onClick={() => navigate('read', doc.replacementId)}>查看後繼方案</Button> : undefined} />}
    {doc.source === 'external' ? <DocSectionCard title="外部內容" icon={<LinkOutlined />} color="#1890FF" bg="#E6F7FF">
      <Alert type="info" showIcon message="騰訊文檔為正文來源，本系統只保管索引。" description="此為虛構外鏈樣本，預覽不嵌入外部網站，也不產生外部請求。" />
      <Descriptions className="doc-preview__spaced" items={[{ key: 'title', label: '標題', children: doc.title }, { key: 'owner', label: '負責人', children: doc.ownerName }]} />
    </DocSectionCard> : <>
      <div className="doc-preview__version-banner">
        <div><CheckStatus label="目前有效版" value={getPreviewRevision(doc, doc.effectiveId)?.label} present={!!doc.effectiveId} /><span className="doc-preview__muted">一般讀者以此版本為準</span></div>
        <div><CheckStatus label="工作草稿" value={getPreviewRevision(doc, doc.draftId)?.label} present={!!doc.draftId} /><span className="doc-preview__muted">{doc.status === 'reviewing' ? '待確認，修改前須撤回' : '不會覆蓋有效內容'}</span></div>
        <div><CheckStatus label="執行基線" value={getPreviewRevision(doc, doc.adoptedId)?.label} present={!!doc.adoptedId} /><span className="doc-preview__muted">{EXECUTION_LABEL[doc.execution]} · 不自動跟隨新版</span></div>
      </div>
      <div className="doc-preview__reader-layout">
        <aside className="doc-preview__reader-rail">
          <h3>文件目錄</h3>
          {revision?.sections.map((section, index) => <button key={section.title} type="button" onClick={() => document.getElementById(`doc-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{String(index + 1).padStart(2, '0')}{' · '}{section.title}</button>)}
          <div className="doc-preview__rail-divider" />
          <h3>版本與協作</h3>
          <Button type="link" onClick={() => navigate('versions', doc.id)}>查看版本與差異</Button>
          {!frozen && <>
            <Button type="link" disabled={!doc.draftId} onClick={() => navigate('confirm', doc.id)}>{doc.status === 'reviewing' ? '處理版本確認' : '提交版本確認'}</Button>
            <Button type="link" disabled={!doc.effectiveId} onClick={() => navigate('handoff', doc.id)}>按版本交接</Button>
            <Button type="link" danger onClick={onTrash}>移入回收站</Button>
          </>}
          {doc.deleted && <Button type="link" onClick={() => navigate('trash')}>前往回收站</Button>}
          <HelpPopover title="版本使用規則" ariaLabel="版本使用規則說明" content={[{ tone: 'success', label: '已生效', body: '代表授權人已確認這份內容，不代表已實作完成。' }, { tone: 'warn', label: '執行基線', body: '接手人採用的版本固定，新版生效不會偷偷改變執行依據。' }]} />
        </aside>
        <div className="doc-preview__reader-main">
          <div className="doc-preview__reader-toolbar"><Space><FileTextOutlined /><Select aria-label="閱讀版本" value={selectedId} onChange={setSelectedId} options={doc.revisions.map(item => ({ value: item.id, label: `${item.label}${item.id === doc.effectiveId ? ' · 目前有效' : item.id === doc.draftId ? ' · 草稿' : ' · 歷史'}` }))} /></Space>
            <Radio.Group value={mode} onChange={event => setMode(event.target.value)} optionType="button" buttonStyle="solid" options={[{ value: 'rendered', label: '閱讀' }, { value: 'source', label: '原文' }]} />
          </div>
          {revision ? mode === 'source' ? <pre className="doc-preview__source">{revision.markdown}</pre> : <PreviewArticle revision={revision} title={revision.metadata?.title ?? doc.title} /> : <Empty description="沒有可讀取的演示版本" />}
        </div>
      </div>
      <DocSectionCard title="適用範圍與存取" icon={<SafetyCertificateOutlined />} color="#722ED1" bg="#F9F0FF">
        <Descriptions column={3} items={[
          { key: 'scope', label: '適用範圍', children: `${doc.system} / ${doc.menu}` },
          { key: 'access', label: '可見範圍', children: '授權空間成員（示意）' },
          { key: 'owner', label: '負責人', children: doc.ownerName },
          { key: 'alias', label: '歷史檔名', children: doc.alias || '—', span: 3 },
        ]} />
      </DocSectionCard>
    </>}
    <PreviewUpdated owner={doc.ownerName} at={doc.updatedAt} />
  </>
}

function CheckStatus({ label, value, present }: { label: string; value?: string; present: boolean }) {
  return <div className="doc-preview__version-label"><span>{label}</span><strong>{present ? value : '—'}</strong></div>
}

export function PlanVersionsPreview({ doc, navigate, onRestore }: { doc: PreviewDocument; navigate: PreviewNavigate; onRestore: (revisionId: string) => void }) {
  const [leftId, setLeftId] = useState(doc.revisions[0]?.id)
  const [rightId, setRightId] = useState(doc.revisions[doc.revisions.length - 1]?.id)
  const before = getPreviewRevision(doc, leftId)
  const after = getPreviewRevision(doc, rightId)
  const options = doc.revisions.map(revision => ({ value: revision.id, label: revision.label }))
  return <>
    <DetailPageHeader title="版本與差異" meta={`${doc.code} · ${doc.title}`} onBack={() => navigate('read', doc.id)} />
    <div className="doc-preview__two-columns">
      <DocSectionCard title="不可變修訂記錄" icon={<HistoryOutlined />} color="#722ED1" bg="#F9F0FF">
        <Timeline items={[...doc.revisions].reverse().map(revision => ({ color: revision.id === doc.effectiveId ? 'green' : 'blue', children: <>
          <Space><strong>{revision.label}</strong>{revision.id === doc.effectiveId && <Tag color="green">目前有效</Tag>}{revision.id === doc.draftId && <Tag color="orange">工作草稿</Tag>}{revision.id === doc.adoptedId && <Tag color="blue">執行基線</Tag>}</Space>
          <p>{revision.reason}</p><p className="doc-preview__muted">{revision.createdAt} · 示例負責人</p>
          <Button type="link" size="small" disabled={doc.status === 'reviewing' || doc.deleted || ['archived', 'replaced'].includes(doc.status)} onClick={() => onRestore(revision.id)}>以此版本建立草稿</Button>
        </> }))} />
        <Alert type="info" showIcon message="回復不覆蓋歷史；待確認時須先撤回。" />
      </DocSectionCard>
      <DocSectionCard title="本次變更說明" icon={<FileTextOutlined />} color="#1890FF" bg="#E6F7FF">
        <p>{after?.reason}</p><p className="doc-preview__muted">逐行雙欄對照；有差異的文字以新增 / 移除底色標記。</p>
        <Space wrap><span>基準</span><Select aria-label="基準版本" value={leftId} onChange={setLeftId} options={options} /><span>對照</span><Select aria-label="對照版本" value={rightId} onChange={setRightId} options={options} /></Space>
      </DocSectionCard>
    </div>
    {leftId === rightId && <Alert className="doc-preview__notice" type="info" showIcon message="目前選擇相同版本，沒有差異。" />}
    <div className="doc-preview__diff">
      {[{ revision: before, other: after, label: '基準版本', tone: 'removed' }, { revision: after, other: before, label: '對照版本', tone: 'added' }].map(({ revision, other, label, tone }) => <section key={label}>
        <h3>{label} <Tag>{revision?.label}</Tag></h3>
        <pre>{revision?.markdown.split('\n').map((line, index) => <span key={index} className={line && !other?.markdown.split('\n').includes(line) ? `doc-preview__diff-${tone}` : ''}><small>{index + 1}</small>{line || ' '}<br /></span>)}</pre>
      </section>)}
    </div>
    <PreviewUpdated owner={doc.ownerName} at={doc.updatedAt} />
  </>
}
