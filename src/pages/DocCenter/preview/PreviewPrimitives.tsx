/** 预览专用视图组件；文案待第二阶段 i18n 解耦后重构。 */
import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Empty, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import EmployeeSelect from '@/pages/MeetingManagement/EmployeeSelect'
import { PREVIEW_PEOPLE, type PreviewRevision } from './previewData'

export function PreviewFormHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return <header className="doc-preview__form-header">
    <div className="doc-preview__gradient" />
    <div className="doc-preview__header-inner">
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
      <div className="doc-preview__header-copy"><h2>{title}</h2><p>{subtitle}</p></div>
    </div>
  </header>
}

export function PreviewHeading({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return <header className="doc-preview__heading">
    <span className="doc-preview__heading-icon">{icon}</span>
    <div><h2>{title}</h2><p>{description}</p></div>
  </header>
}

/** 预览不请求真实人员，seed 完整回显固定虚构人员，禁用远程搜索入口。 */
export function PreviewPerson({ recipient = false }: { recipient?: boolean }) {
  return <EmployeeSelect single disabled value={[recipient ? 2 : 1]} seed={PREVIEW_PEOPLE} />
}

export function PreviewUpdated({ owner, at }: { owner: string; at: string }) {
  return <footer className="doc-preview__updated"><span>最後更新人：{owner}</span><span>最後更新時間：{at}</span></footer>
}

export function PreviewTable<T extends { id: string }>({ rows, columns, pageKey, left, right }: {
  rows: T[]; columns: TableColumnsType<T>; pageKey: string; left?: ReactNode; right?: ReactNode
}) {
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  const meta = useMemo(() => columns.map(column => ({ key: String(column.key), title: typeof column.title === 'string' ? column.title : String(column.key) })), [columns])
  const { configComponent, applyConfig } = useColumnConfig(`doc-preview-${pageKey}`, meta, [{ key: 'action', locked: 'tail' }])
  return <>
    <div className="action-section">
      <div className="action-section-left">{left}</div>
      <div className="action-section-right">{right}{configComponent}</div>
    </div>
    <Table<T> rowKey="id" dataSource={rows} columns={applyConfig(columns)} size="middle" scroll={{ x: 'max-content' }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="沒有符合條件的演示記錄" /> }}
      pagination={{ ...pagination, total: rows.length, showSizeChanger: true, showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100'], showTotal: count => `共 ${count} 筆（演示）`,
        onChange: (page, size) => setPagination({ current: size !== pagination.pageSize ? 1 : page, pageSize: size }),
      }} />
  </>
}

/** 固定样稿的排版展示，不自行解析 Markdown；编辑后的原文安全显示为文本。 */
export function PreviewArticle({ revision, title, anchorPrefix = 'doc-section' }: { revision: PreviewRevision; title: string; anchorPrefix?: string }) {
  if (!revision.sections.length) {
    return <article className="doc-preview__article">
      <Alert type="info" showIcon message="目前顯示已編輯的純文字原文；正式 Markdown 渲染於第二階段接入。" />
      <h1>{title}</h1><pre className="doc-preview__source">{revision.markdown}</pre>
    </article>
  }
  return <article className="doc-preview__article">
    <div className="doc-preview__eyebrow">方案樣稿 · {revision.label} · 僅供介面確認</div>
    <h1>{title}</h1>
    {revision.sections.map((section, index) => <section key={section.title} id={`${anchorPrefix}-${index}`}>
      <h2><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</h2>
      {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      {section.bullets && <ul>{section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul>}
    </section>)}
  </article>
}
