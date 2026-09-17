import { useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Descriptions, Empty, Image, Result, Select, Tag, Upload } from 'antd'
import { FileTextOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ClaimFormHeader, ClaimSection } from '../AssetClaim/ClaimLayout'
import { useAuth } from '../../../contexts/AuthContext'
import type { Evidence } from './returnPreview'
import '../AssetClaim/index.css'
import './index.css'

export function PreviewShell({ children }: { children: ReactNode }) {
  return <div className="content-area claim-module return-module">
    <Alert className="claim-notice" type="info" showIcon message="第一階段 · 界面交互預覽"
      description="所有 DEMO 單據均為演示數據。操作僅在當前頁面會話內生效，刷新後重置；不會修改真實資產、提交業務數據或執行支付。" />
    {children}
  </div>
}
export function ReturnHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <ClaimFormHeader title={title} subtitle="管理員直接驗收 · 實物處置與責任處理獨立" onBack={onBack} />
}
export function ReturnSection({ title, children }: { title: string; children: ReactNode }) {
  return <ClaimSection title={title} icon={<FileTextOutlined />}>{children}</ClaimSection>
}
export function PreviewError({ message = '記錄不存在、已失效或尚未接通真實數據，請從演示列表重新進入。', onBack }: { message?: string; onBack: () => void }) {
  return <Result status="warning" title="無法打開此記錄" subTitle={message} extra={<Button onClick={onBack}>返回列表</Button>} />
}
export function PreviewFooter({ onBack, onSubmit, busy, label = '預覽登記結果' }: { onBack: () => void; onSubmit: () => void; busy: boolean; label?: string }) {
  const { t } = useTranslation()
  return <div className="form-footer"><Button disabled={busy} onClick={onBack}>{t('common.cancel')}</Button><Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={onSubmit}>{label}</Button></div>
}
export function PreviewTag({ value, meta }: { value?: string; meta: Record<string, string> }) {
  const color = value && ['normal', 'completed', 'paid', 'idle', 'returned', 'waived', 'exception_closed'].includes(value) ? 'success'
    : value && ['lost', 'damaged', 'overdue', 'refund_pending'].includes(value) ? 'error' : 'processing'
  return <Tag color={value && meta[value] ? color : 'default'}>{value ? meta[value] ?? `未知狀態（${value}）` : '—'}</Tag>
}
export function PreviewAudit({ operator, updatedAt }: { operator: string; updatedAt: string }) {
  return <ReturnSection title="操作記錄"><Descriptions column={2} items={[
    { key: 'operator', label: '最後更新人', children: operator }, { key: 'time', label: '最後更新時間', children: updatedAt },
  ]} /></ReturnSection>
}
export function useFlowPermission(menu: string) {
  const { user, hasPermission } = useAuth()
  return { canEdit: user?.role === 'admin' || hasPermission(`${menu}:edit`), operator: user?.name || '當前驗收操作人' }
}
export function PreviewSelect({ value, onChange, options, disabled, placeholder }: {
  value?: number | string; onChange?: (value: number | string) => void
  options: { value: number | string; label: string }[]; disabled?: boolean; placeholder?: string
}) {
  const [search, setSearch] = useState('')
  return <Select showSearch allowClear value={value} onChange={onChange} disabled={disabled} placeholder={placeholder || '搜索並選擇（演示）'}
    onSearch={setSearch} filterOption={false} options={options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).slice(0, 20)}
    notFoundContent="暫無匹配的演示數據" />
}
export function EvidencePicker({ value = [], onChange }: { value?: Evidence[]; onChange?: (files: Evidence[]) => void }) {
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const reading = useRef(false)
  return <>
    <Upload accept="image/png,image/jpeg" listType="picture" fileList={value.map(e => ({ ...e, status: 'done' as const }))}
      onRemove={file => { onChange?.(value.filter(e => e.uid !== file.uid)); return false }}
      beforeUpload={async file => {
        if (reading.current) return Upload.LIST_IGNORE
        setError(undefined)
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 512 * 1024 || value.length >= 5) {
          setError('僅支援 PNG/JPEG，最多 5 張，每張不超過 512 KiB。'); return Upload.LIST_IGNORE
        }
        reading.current = true; setBusy(true)
        try {
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('圖片讀取失敗'))
            reader.onerror = () => reject(new Error('圖片讀取失敗，請重試'))
            reader.readAsDataURL(file)
          })
          onChange?.([...value, { uid: file.uid, name: file.name, url }])
        } catch (e) { setError(e instanceof Error ? e.message : '圖片讀取失敗') }
        finally { reading.current = false; setBusy(false) }
        return Upload.LIST_IGNORE
      }}>
      <Button icon={<UploadOutlined />} disabled={value.length >= 5 || busy} loading={busy}>選擇本地憑證（不上傳）</Button>
    </Upload>
    <p className="claim-muted">PNG/JPEG · 最多 5 張 · 每張 ≤ 512 KiB · 請勿使用真實敏感資料</p>
    {error && <Alert type="error" message={error} showIcon />}
  </>
}
export function EvidenceGallery({ evidence }: { evidence: Evidence[] }) {
  return evidence.length ? <Image.PreviewGroup><div className="return-evidence">{evidence.map(e => <Image key={e.uid} src={e.url} alt={e.name} width={120} />)}</div></Image.PreviewGroup> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未附憑證" />
}
