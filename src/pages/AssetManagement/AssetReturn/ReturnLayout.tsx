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
    <Alert className="claim-notice" type="info" showIcon message="第一阶段 · 界面交互预览"
      description="所有 DEMO 单据均为演示数据。操作仅在当前页面会话内生效，刷新后重置；不会修改真实资产、提交业务数据或执行支付。" />
    {children}
  </div>
}
export function ReturnHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <ClaimFormHeader title={title} subtitle="管理员直接验收 · 实物处置与责任处理独立" onBack={onBack} />
}
export function ReturnSection({ title, children }: { title: string; children: ReactNode }) {
  return <ClaimSection title={title} icon={<FileTextOutlined />}>{children}</ClaimSection>
}
export function PreviewError({ message = '记录不存在、已失效或尚未接通真实数据，请从演示列表重新进入。', onBack }: { message?: string; onBack: () => void }) {
  return <Result status="warning" title="无法打开此记录" subTitle={message} extra={<Button onClick={onBack}>返回列表</Button>} />
}
export function PreviewFooter({ onBack, onSubmit, busy, label = '预览登记结果' }: { onBack: () => void; onSubmit: () => void; busy: boolean; label?: string }) {
  const { t } = useTranslation()
  return <div className="form-footer"><Button disabled={busy} onClick={onBack}>{t('common.cancel')}</Button><Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={onSubmit}>{label}</Button></div>
}
export function PreviewTag({ value, meta }: { value?: string; meta: Record<string, string> }) {
  const color = value && ['normal', 'completed', 'paid', 'idle', 'returned', 'waived', 'exception_closed'].includes(value) ? 'success'
    : value && ['lost', 'damaged', 'overdue', 'refund_pending'].includes(value) ? 'error' : 'processing'
  return <Tag color={value && meta[value] ? color : 'default'}>{value ? meta[value] ?? `未知状态（${value}）` : '—'}</Tag>
}
export function PreviewAudit({ operator, updatedAt }: { operator: string; updatedAt: string }) {
  return <ReturnSection title="操作记录"><Descriptions column={2} items={[
    { key: 'operator', label: '最后更新人', children: operator }, { key: 'time', label: '最后更新时间', children: updatedAt },
  ]} /></ReturnSection>
}
export function useFlowPermission(menu: string) {
  const { user, hasPermission } = useAuth()
  return { canEdit: user?.role === 'admin' || hasPermission(`${menu}:edit`), operator: user?.name || '当前验收操作人' }
}
export function PreviewSelect({ value, onChange, options, disabled, placeholder }: {
  value?: number | string; onChange?: (value: number | string) => void
  options: { value: number | string; label: string }[]; disabled?: boolean; placeholder?: string
}) {
  const [search, setSearch] = useState('')
  return <Select showSearch allowClear value={value} onChange={onChange} disabled={disabled} placeholder={placeholder || '搜索并选择（演示）'}
    onSearch={setSearch} filterOption={false} options={options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).slice(0, 20)}
    notFoundContent="暂无匹配的演示数据" />
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
          setError('仅支持 PNG/JPEG，最多 5 张，每张不超过 512 KiB。'); return Upload.LIST_IGNORE
        }
        reading.current = true; setBusy(true)
        try {
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
            reader.onerror = () => reject(new Error('图片读取失败，请重试'))
            reader.readAsDataURL(file)
          })
          onChange?.([...value, { uid: file.uid, name: file.name, url }])
        } catch (e) { setError(e instanceof Error ? e.message : '图片读取失败') }
        finally { reading.current = false; setBusy(false) }
        return Upload.LIST_IGNORE
      }}>
      <Button icon={<UploadOutlined />} disabled={value.length >= 5 || busy} loading={busy}>选择本地凭证（不上传）</Button>
    </Upload>
    <p className="claim-muted">PNG/JPEG · 最多 5 张 · 每张 ≤ 512 KiB · 请勿使用真实敏感资料</p>
    {error && <Alert type="error" message={error} showIcon />}
  </>
}
export function EvidenceGallery({ evidence }: { evidence: Evidence[] }) {
  return evidence.length ? <Image.PreviewGroup><div className="return-evidence">{evidence.map(e => <Image key={e.uid} src={e.url} alt={e.name} width={120} />)}</div></Image.PreviewGroup> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未附凭证" />
}
