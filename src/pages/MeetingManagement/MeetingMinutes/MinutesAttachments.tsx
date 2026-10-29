import { useEffect, useState } from 'react'
import { Alert, Button, Image, Space, Upload } from 'antd'
import { FilePdfOutlined, FileWordOutlined, UploadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import './minutes.css'

const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const FILE_TYPES: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** 这里只做选择时的 UX 校验；正式上传后，后端必须重验魔数、大小、权限和资源归属。 */
function fileMime(file: File): string | undefined {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const expected = Object.prototype.hasOwnProperty.call(FILE_TYPES, extension) ? FILE_TYPES[extension] : undefined
  if (!expected || (file.type && file.type !== expected && file.type !== 'application/octet-stream')) return undefined
  return expected
}

interface EditorProps {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

/** 第一阶段只在当前页面保留 File，不写 localStorage，不调用上传接口、不伪造已上传状态。 */
export default function MinutesAttachmentEditor({ files, onChange, disabled }: EditorProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string>()

  return (
    <div className="mm-attachments">
      <div className="mm-attachments__toolbar">
        <Upload
          accept={Object.keys(FILE_TYPES).map(extension => `.${extension}`).join(',')}
          multiple
          disabled={disabled || files.length >= MAX_FILES}
          showUploadList={false}
          beforeUpload={(file, batch) => {
            // 同一批文件只处理一次，避免多选时闭包覆盖前一个文件或重复追加。
            if (disabled || file !== batch[0]) return Upload.LIST_IGNORE
            const valid = batch.filter(item => fileMime(item) && item.size > 0 && item.size <= MAX_FILE_BYTES)
            const remaining = MAX_FILES - files.length
            const errors: string[] = []
            if (valid.length !== batch.length) errors.push(t('meeting.minutes.attachmentRejectedTypes'))
            if (valid.length > remaining) errors.push(t('meeting.minutes.attachmentTooMany', { maxFiles: MAX_FILES }))
            setError(errors.join(' ') || undefined)
            onChange([...files, ...valid.slice(0, remaining)])
            return Upload.LIST_IGNORE
          }}
        >
          <Button icon={<UploadOutlined />} disabled={disabled || files.length >= MAX_FILES}>{t('meeting.minutes.attachmentPick')}</Button>
        </Upload>
        <span className="mm-attachments__hint">{t('meeting.minutes.attachmentTypesHint', { maxFiles: MAX_FILES })}</span>
      </div>
      {/* 附件文案已全部走 i18n；未接上传服务前仍要明说「只是本页预览」，不能让“选了文件”被误认为已存进纪要。 */}
      <Alert
        type="info"
        showIcon
        message={t('meeting.minutes.attachmentPreviewTitle')}
        description={t('meeting.minutes.attachmentPreviewNote')}
      />
      {error && <Alert type="warning" showIcon message={error} />}
      <MinutesAttachmentList files={files} onRemove={disabled ? undefined : file => {
        onChange(files.filter(item => item !== file))
        setError(undefined)
      }} />
      {files.length > 0 && (
        <div className="mm-attachments__hint">
          {t('meeting.minutes.attachmentUsageHint', { downloadLabel: t('docKnowledge.download') })}
        </div>
      )}
    </div>
  )
}

/** 表单预览与纪要只读内容共用同一套附件布局，文件不交给第三方在线预览服务。 */
export function MinutesAttachmentList({ files, onRemove }: { files: File[]; onRemove?: (file: File) => void }) {
  // hook 必须在空列表早返回之前取，否则切换附件数量时会改变 hook 调用顺序。
  const { t } = useTranslation()
  if (files.length === 0) return null
  return (
    <div className="mm-attachments__list" role="list" aria-label={t('meeting.minutes.attachmentListLabel')}>
      {files.map((file, index) => (
        <AttachmentRow key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file} onRemove={onRemove} />
      ))}
    </div>
  )
}

function AttachmentRow({ file, onRemove }: { file: File; onRemove?: (file: File) => void }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const mime = fileMime(file)
  const isImage = mime?.startsWith('image/') === true

  useEffect(() => {
    if (!mime) return
    // 使用白名单 MIME 构造本地地址，避免空 MIME 让浏览器把伪装文件按 HTML 嗅探执行。
    const nextUrl = URL.createObjectURL(new Blob([file], { type: mime }))
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file, mime])

  return (
    <div className="mm-attachments__item" role="listitem" aria-label={file.name}>
      {isImage && url ? (
        <Image
          src={url}
          alt={file.name}
          width={56}
          height={56}
          style={{ objectFit: 'contain' }}
          preview={{ visible: previewOpen, onVisibleChange: setPreviewOpen }}
        />
      ) : (
        <span className="mm-attachments__icon">
          {mime === 'application/pdf' ? <FilePdfOutlined /> : <FileWordOutlined />}
        </span>
      )}
      <div className="mm-attachments__info">
        <div className="mm-attachments__name">{file.name}</div>
        <span className="mm-attachments__hint">
          {file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`} · {t('meeting.minutes.attachmentLocalPreview')}
        </span>
      </div>
      <Space size={4} wrap>
        {isImage ? (
          <Button type="link" size="small" disabled={!url} aria-label={t('meeting.minutes.attachmentViewImage', { name: file.name })} onClick={() => setPreviewOpen(true)}>
            {t('common.view')}
          </Button>
        ) : (
          <Button type="link" size="small" disabled={!url} href={url || undefined} target="_blank" rel="noopener noreferrer" aria-label={t('meeting.minutes.attachmentViewInBrowser', { name: file.name })}>
            {t('common.view')}
          </Button>
        )}
        <Button type="link" size="small" disabled={!url} href={url || undefined} download={file.name} aria-label={t('meeting.minutes.attachmentDownloadFile', { name: file.name })}>
          {t('docKnowledge.download')}
        </Button>
        {onRemove && (
          <Button type="link" size="small" danger aria-label={t('meeting.minutes.attachmentRemoveFile', { name: file.name })} onClick={() => onRemove(file)}>
            {t('common.remove')}
          </Button>
        )}
      </Space>
    </div>
  )
}
