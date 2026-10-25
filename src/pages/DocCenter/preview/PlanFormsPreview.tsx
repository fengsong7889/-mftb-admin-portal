/** 编辑、确认与交接的独立页面预览；所有提交仅回调内存演示状态。 */
import { useState } from 'react'
import { Alert, Button, Checkbox, Descriptions, Form, Input, Radio, Select, Steps, Tag } from 'antd'
import { FileTextOutlined, LockOutlined, SaveOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import RemarkTextArea from '@/components/RemarkTextArea'
import DocSectionCard from '../DocSectionCard'
import { PreviewArticle, PreviewFormHeader, PreviewPerson } from './PreviewPrimitives'
import { confirmPreview } from './previewActions'
import { getPreviewRevision, type PreviewDocument, type PreviewNavigate } from './previewData'

export interface PreviewEditValues { title: string; system: string; menu: string; space: string; category: string; markdown: string; reason: string }
export interface PreviewHandoffValues { done: string; remaining: string; risk: string; acknowledged: boolean }

export function PlanEditorPreview({ doc, navigate, onSave, onDirty }: {
  doc: PreviewDocument; navigate: PreviewNavigate; onSave: (values: PreviewEditValues) => void; onDirty: (dirty: boolean) => void
}) {
  const [form] = Form.useForm<PreviewEditValues>()
  const original = getPreviewRevision(doc, doc.draftId ?? doc.effectiveId)
  const [mode, setMode] = useState('source')
  const [markdown, setMarkdown] = useState(original?.markdown ?? '')
  const blocked = doc.status === 'reviewing' || doc.deleted || ['archived', 'replaced'].includes(doc.status)
  return <>
    <PreviewFormHeader title="編輯方案草稿" subtitle={`${doc.code} · 編輯只影響草稿，不改動有效版本`} onBack={() => navigate('read', doc.id)} />
    {blocked ? <Alert type="warning" showIcon message="目前記錄不可編輯" description="待確認版本須先撤回；已歸檔、被替代或回收站記錄不可直接修改。" action={<Button onClick={() => navigate('confirm', doc.id)}>查看確認狀態</Button>} /> : <>
      <Alert className="doc-preview__notice" type="info" showIcon message="介面預覽：不啟用自動儲存，也不將原文寫入瀏覽器儲存。請勿輸入真實敏感資料。" />
      <Form form={form} layout="vertical" initialValues={{ title: doc.title, system: doc.system, menu: doc.menu, space: doc.space, category: doc.category, ...original?.metadata, markdown, reason: '' }}
        onValuesChange={() => onDirty(true)} onFinish={values => { onDirty(false); onSave(values) }}>
        <DocSectionCard title="基本資料" icon={<FileTextOutlined />} color="#1890FF" bg="#E6F7FF">
          <div className="doc-preview__form-grid">
            <Form.Item className="doc-preview__full-row" name="title" label="方案標題" rules={[{ required: true, whitespace: true, message: '請填寫方案標題' }, { max: 200 }]}><Input maxLength={200} showCount /></Form.Item>
            <Form.Item name="system" label="涉及系統" rules={[{ required: true }]}><Select options={['文檔中心', '人力資源', '資產管理', '搜尋系統', '待歸類'].map(value => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="menu" label="涉及菜單"><Input placeholder="尚未確定可留空" maxLength={64} /></Form.Item>
            <Form.Item name="space" label="知識空間" rules={[{ required: true }]}><Select options={['產品與研發', '人事制度'].map(value => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="category" label="方案類型"><Select options={['系統重構', '功能實施', '整改方案'].map(value => ({ value, label: value }))} /></Form.Item>
            <Form.Item label="負責人（固定示例）"><PreviewPerson /></Form.Item>
            <Form.Item label="草稿可見範圍"><div className="doc-preview__field-value"><LockOutlined /> 作者與指定參與人</div></Form.Item>
          </div>
        </DocSectionCard>
        <DocSectionCard title="Markdown 原文" icon={<FileTextOutlined />} color="#E8720C" bg="#FFF7E6"
          hint={<Radio.Group value={mode} onChange={event => setMode(event.target.value)} optionType="button" options={[{ value: 'source', label: '編輯原文' }, { value: 'preview', label: '閱讀預覽' }]} />}>
          <Form.Item name="markdown" label="方案內容" hidden={mode !== 'source'} rules={[{ required: true, whitespace: true, message: '請填寫方案內容' }, { max: 20000, message: '演示原文上限 20,000 字' }]}>
            <Input.TextArea className="doc-preview__editor" rows={22} maxLength={20000} showCount onChange={event => setMarkdown(event.target.value)} />
          </Form.Item>
          {mode === 'preview' && original && <PreviewArticle title={form.getFieldValue('title') as string} revision={{ ...original, markdown, sections: markdown === original.markdown ? original.sections : [] }} anchorPrefix="editor-section" />}
          <span className="doc-preview__muted">正式版本將接入安全 Markdown 渲染、自動儲存與伺服器回執。</span>
        </DocSectionCard>
        <DocSectionCard title="變更說明" icon={<SafetyCertificateOutlined />} color="#722ED1" bg="#F9F0FF">
          <Form.Item name="reason" label="本次調整原因" rules={[{ required: true, whitespace: true, message: '請說明本次變更原因' }, { max: 200 }]}><RemarkTextArea placeholder="例如：補充權限邊界與驗收條件" /></Form.Item>
        </DocSectionCard>
        <div className="form-footer"><Button onClick={() => navigate('read', doc.id)}>取消</Button><Button type="primary" htmlType="submit" icon={<SaveOutlined />}>保存草稿（演示）</Button></div>
      </Form>
    </>}
  </>
}

export function PlanConfirmationPreview({ doc, navigate, onDecision }: {
  doc: PreviewDocument; navigate: PreviewNavigate; onDecision: (action: 'submit' | 'approve' | 'reject' | 'withdraw', note: string) => void
}) {
  const [form] = Form.useForm<{ note: string }>()
  const [acknowledged, setAcknowledged] = useState(false)
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve')
  const revision = getPreviewRevision(doc, doc.draftId)
  const reviewing = doc.status === 'reviewing'
  const eligible = !!doc.draftId && !doc.deleted && !['archived', 'replaced'].includes(doc.status)
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (!acknowledged || !revision || !eligible) return
      const action = reviewing ? decision : 'submit'
      confirmPreview(reviewing ? decision === 'approve' ? '確認此版本生效？' : '退回此版本？' : '提交版本確認？',
        <><p>{doc.code} · {revision.label}</p><p>{doc.title}</p><p>執行基線不變，歷史版本保留。</p></>, () => onDecision(action, values.note), decision === 'reject')
    } catch { /* 字段错误由表单展示，不重复弹提示。 */ }
  }
  return <>
    <PreviewFormHeader title={reviewing ? '處理版本確認' : '提交版本確認'} subtitle={`${doc.code} · 確認對象是特定版本，不是任意「最新版」`} onBack={() => navigate('read', doc.id)} />
    {!eligible ? <Alert type="info" showIcon message="目前沒有可提交或處理的草稿。" /> : <>
      <Steps className="doc-preview__steps" current={reviewing ? 1 : 0} items={[{ title: '草稿完成' }, { title: '人工確認' }, { title: '版本生效' }]} />
      <DocSectionCard title="待確認內容" icon={<FileTextOutlined />} color="#1890FF" bg="#E6F7FF">
        <Descriptions column={3} items={[
          { key: 'title', label: '方案', children: doc.title }, { key: 'version', label: '指定版本', children: <Tag color="orange">{revision?.label}</Tag> },
          { key: 'effective', label: '目前有效版', children: doc.effectiveId ? getPreviewRevision(doc, doc.effectiveId)?.label : '尚無' },
          { key: 'reason', label: '變更原因', children: revision?.reason, span: 3 },
        ]} />
        <Button type="link" onClick={() => navigate('versions', doc.id)}>查看完整版本差異</Button>
      </DocSectionCard>
      {revision && <div className="doc-preview__confirmation-content"><PreviewArticle revision={revision} title={revision.metadata?.title ?? doc.title} anchorPrefix="confirmation-section" /></div>}
      <Form form={form} layout="vertical" initialValues={{ note: '' }}>
        <DocSectionCard title="人工確認" icon={<SafetyCertificateOutlined />} color="#52C41A" bg="#F6FFED">
          <Form.Item label="指定確認人（固定示例）"><PreviewPerson /></Form.Item>
          <Alert className="doc-preview__notice" type="warning" showIcon message="AI 集成身分不可批准；正式流程須由後端校驗確認人與版本。" />
          {reviewing && <Form.Item label="確認結論"><Radio.Group value={decision} onChange={event => setDecision(event.target.value)} options={[{ value: 'approve', label: '確認生效' }, { value: 'reject', label: '退回修改' }]} /></Form.Item>}
          <Form.Item name="note" label="確認意見" rules={[{ required: reviewing && decision === 'reject', whitespace: true, message: '退回必須填寫原因' }, { max: 200 }]}><RemarkTextArea placeholder={decision === 'reject' ? '請說明需要補充或調整的內容' : '選填，補充此次確認的限制或注意事項'} /></Form.Item>
          <Checkbox checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}>我已核對 {revision?.label} 的內容及影響，理解生效不代表已實作完成</Checkbox>
        </DocSectionCard>
        <div className="form-footer"><Button onClick={() => navigate('read', doc.id)}>取消</Button>
          {reviewing && <Button onClick={() => confirmPreview('撤回本次確認？', <p>撤回後 {revision?.label} 回到可編輯草稿。</p>, () => onDecision('withdraw', '演示撤回'))}>撤回（演示）</Button>}
          <Button type="primary" danger={reviewing && decision === 'reject'} disabled={!acknowledged} onClick={handleSubmit}>{reviewing ? decision === 'approve' ? '確認生效（演示）' : '退回修改（演示）' : '提交確認（演示）'}</Button>
        </div>
      </Form>
    </>}
  </>
}

export function PlanHandoffPreview({ doc, navigate, onHandoff }: { doc: PreviewDocument; navigate: PreviewNavigate; onHandoff: (values: PreviewHandoffValues) => void }) {
  const [form] = Form.useForm<PreviewHandoffValues>()
  const revision = getPreviewRevision(doc, doc.adoptedId ?? doc.effectiveId)
  const eligible = !!doc.effectiveId && !doc.deleted && !['archived', 'replaced'].includes(doc.status)
  return <>
    <PreviewFormHeader title={doc.handoffPending ? '接收方案交接' : '按版本交接'} subtitle={`${doc.code} · 交接綁定 ${revision?.label ?? '尚無有效版本'}，不傳本地檔案`} onBack={() => navigate('read', doc.id)} />
    {!eligible ? <Alert type="warning" showIcon message="需要有效版本且記錄仍有效，才能進行交接。" /> : <Form form={form} layout="vertical" initialValues={{ done: '已完成介面與版本規則討論。', remaining: '補齊 API 契約、權限測試與資料遷移。', risk: '不得把介面預覽當成已上線功能。', ...doc.handoff, acknowledged: false }} onFinish={values => confirmPreview(doc.handoffPending ? '確認接收交接？' : '發起版本交接？', <><p>{doc.code} · 採用 {revision?.label}</p><p>示例負責人 → 示例接手人</p><p>不自動授予任何文檔權限。</p></>, () => onHandoff(values))}>
      <DocSectionCard title="交接範圍" icon={<TeamOutlined />} color="#1890FF" bg="#E6F7FF">
        <Descriptions column={3} items={[{ key: 'title', label: '方案', children: doc.title }, { key: 'baseline', label: '採用版本', children: <Tag color="blue">{revision?.label}</Tag> }, { key: 'source', label: '進度來源', children: '文檔交接記錄（示例）' }]} />
        <div className="doc-preview__two-columns"><Form.Item label="交出人"><PreviewPerson /></Form.Item><Form.Item label="接手人（固定示例）"><PreviewPerson recipient /></Form.Item></div>
        <Alert type="info" showIcon message="正式版使用在職員工搜尋；此階段固定示例人員，不讀取真實名單。" />
      </DocSectionCard>
      <DocSectionCard title="已完成、剩餘項與風險" icon={<FileTextOutlined />} color="#E8720C" bg="#FFF7E6">
        <Form.Item label="已完成內容" name="done" rules={[{ required: true, whitespace: true, message: '請填寫已完成內容' }]}><RemarkTextArea /></Form.Item>
        <Form.Item label="下一步 / 剩餘項" name="remaining" rules={[{ required: true, whitespace: true, message: '請填寫下一步' }]}><RemarkTextArea /></Form.Item>
        <Form.Item label="風險與注意事項" name="risk"><RemarkTextArea /></Form.Item>
        <Form.Item name="acknowledged" valuePropName="checked" rules={[{ validator: (_, value: boolean) => value ? Promise.resolve() : Promise.reject(new Error('請先核對採用版本')) }]}><Checkbox>已核對採用版本；後續新版不自動替換執行基線</Checkbox></Form.Item>
      </DocSectionCard>
      <div className="form-footer"><Button onClick={() => navigate('read', doc.id)}>取消</Button><Button type="primary" htmlType="submit">{doc.handoffPending ? '確認接手（演示）' : '發起交接（演示）'}</Button></div>
    </Form>}
  </>
}
