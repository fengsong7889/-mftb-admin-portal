import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Image, Space, Spin, Upload } from 'antd'
import { FilePdfOutlined, FileWordOutlined, UploadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  deleteMinutesAttachment, fetchMinutesAttachmentAccess, minutesAttachmentFileUrl, uploadMinutesAttachment,
  type MinutesAttachmentVO,
} from '@/api/meetingMinutes'
import { newMeetingRequestKey } from '@/api/meeting'
import './minutes.css'

/**
 * 纪要「补充说明」附件：编辑页真实上传 + 三处阅读端（站内/预览/免登页）共用列表。
 *
 * <p>上传即落库（未绑定态），保存纪要只是把附件号写进正文完成绑定——
 * 这样上传失败可以原地重试，不会出现「点了保存才发现文件没传上去」的回头路。
 *
 * <p>客户端的类型/大小限制只是 UX；服务端会重验扩展名白名单、magic bytes、
 * 真实字节数与幂等键，前端拦不住的伪装文件到不了存储。
 */

const MAX_FILES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPT_EXTENSIONS = ['doc', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']
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

/** 客户端预检（UX 层）：扩展名 + 声明 MIME 一致性 + 大小；服务端仍全量重验 */
function clientCheck(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const expected = Object.prototype.hasOwnProperty.call(FILE_TYPES, extension) ? FILE_TYPES[extension] : undefined
  if (!expected) return false
  if (file.type && file.type !== expected && file.type !== 'application/octet-stream') return false
  return file.size > 0 && file.size <= MAX_FILE_BYTES
}

/** 上传队列里的本地项：失败保留 File 供原地重试（同幂等键，服务端不会重复占存储） */
interface LocalUpload {
  id: string
  file: File
  status: 'uploading' | 'error'
  error?: string
  requestKey: string
}

export interface AttachmentPendingState {
  uploading: number
  failed: number
}

interface EditorProps {
  bookingId?: number
  /** 已随纪要保存（或本次已成功上传）的附件，按提交顺序 */
  value: MinutesAttachmentVO[]
  /**
   * 更新列表：数组直接覆盖；函数形式基于最新列表计算。
   * 多个并发上传完成时必须用函数形式，否则后完成的那个会拿旧快照覆盖先完成的。
   */
  onChange: (next: MinutesAttachmentVO[] | ((prev: MinutesAttachmentVO[]) => MinutesAttachmentVO[])) => void
  /** 上传中/失败数回传外层：外层据此禁用保存与发布，绝不静默丢附件 */
  onPendingChange?: (pending: AttachmentPendingState) => void
  disabled?: boolean
}

export default function MinutesAttachmentEditor({ bookingId, value, onChange, onPendingChange, disabled }: EditorProps) {
  const { t } = useTranslation()
  const [locals, setLocals] = useState<LocalUpload[]>([])
  const [error, setError] = useState<string>()

  const reportPending = useCallback((next: LocalUpload[]) => {
    onPendingChange?.({
      uploading: next.filter(item => item.status === 'uploading').length,
      failed: next.filter(item => item.status === 'error').length,
    })
  }, [onPendingChange])

  const setLocalsTracked = (updater: (current: LocalUpload[]) => LocalUpload[]) => {
    setLocals(current => {
      const next = updater(current)
      reportPending(next)
      return next
    })
  }

  const startUpload = useCallback((entry: LocalUpload) => {
    if (!bookingId) return
    setLocalsTracked(current => current.map(item => (item.id === entry.id ? { ...item, status: 'uploading', error: undefined } : item)))
    void uploadMinutesAttachment(bookingId, entry.file, entry.requestKey)
      .then(uploaded => {
        setLocalsTracked(current => current.filter(item => item.id !== entry.id))
        // 函数式追加：并发上传完成时各自基于最新列表，不拿旧快照互相覆盖；按号去重防幂等重放重复入库
        onChange(prev => (prev.some(row => row.attachmentNo === uploaded.attachmentNo) ? prev : [...prev, uploaded]))
      })
      .catch(e => {
        setLocalsTracked(current => current.map(item => (item.id === entry.id
          ? { ...item, status: 'error', error: e instanceof Error ? e.message : t('meeting.minutes.attachmentUploadFailed') }
          : item)))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, onChange, t])

  const handlePick = (batch: File[]) => {
    if (disabled || !bookingId) return
    const valid = batch.filter(clientCheck)
    const rejectedCount = batch.length - valid.length
    // 名额把"已入库 + 上传中"一起算：否则多选 8 个会全部排队，超上限的在服务端才被拦，体验变成先成功后报错
    const remaining = MAX_FILES - (value.length + locals.length)
    if (valid.length > remaining) {
      setError(t('meeting.minutes.attachmentTooMany', { maxFiles: MAX_FILES }))
    } else if (rejectedCount > 0) {
      setError(t('meeting.minutes.attachmentRejectedTypes'))
    } else {
      setError(undefined)
    }
    const accepted = valid.slice(0, Math.max(0, remaining))
    const entries: LocalUpload[] = accepted.map(file => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, status: 'uploading' as const,
      requestKey: newMeetingRequestKey('mma'),
    }))
    if (entries.length === 0) return
    setLocalsTracked(current => [...current, ...entries])
    // 两条独立的串行链，最多两个并发：钉钉弱网下全部并行只会一起超时，串两路足够快又好排查。
    // 每条链自己“发一个→等 300ms→取下一个”，不共用同一条定时链，避免两路叠加后越滚越多。
    const queue = [...entries]
    const runNext = () => {
      const next = queue.shift()
      if (!next) return
      startUpload(next)
      window.setTimeout(runNext, 300)
    }
    runNext()
    runNext()
  }

  const handleRemoveSaved = (item: MinutesAttachmentVO) => {
    // 同样用函数式移除：刚完成的上传可能还没出现在上一次渲染的 value 里，不能拿旧快照覆盖它
    onChange(prev => prev.filter(row => row.attachmentNo !== item.attachmentNo))
    setError(undefined)
    // 本次会话刚上传、还没随纪要保存的，顺手释放未绑定配额；删失败不打扰用户（服务端有 24h 回收）
    void deleteMinutesAttachment(item.attachmentNo).catch(() => undefined)
  }

  const total = value.length + locals.length
  return (
    <div className="mm-attachments">
      <div className="mm-attachments__toolbar">
        <Upload
          accept={ACCEPT_EXTENSIONS.map(extension => `.${extension}`).join(',')}
          multiple
          disabled={disabled || !bookingId || total >= MAX_FILES}
          showUploadList={false}
          beforeUpload={(_, batch) => {
            // 同一批只处理一次，避免多选时逐个触发互相覆盖
            if (_ !== batch[0]) return Upload.LIST_IGNORE
            handlePick(batch)
            return Upload.LIST_IGNORE
          }}
        >
          <Button icon={<UploadOutlined />} disabled={disabled || !bookingId || total >= MAX_FILES}>
            {t('meeting.minutes.attachmentPick')}
          </Button>
        </Upload>
        <span className="mm-attachments__hint">{t('meeting.minutes.attachmentTypesHint', { maxFiles: MAX_FILES })}</span>
      </div>
      {!bookingId && !disabled && (
        <Alert type="warning" showIcon message={t('meeting.minutes.attachmentNeedMeeting')} />
      )}
      {error && <Alert type="warning" showIcon message={error} />}
      {value.length > 0 && (
        <MinutesAttachmentList
          attachments={value}
          onRemove={disabled ? undefined : handleRemoveSaved}
          resolveUrl={async item => {
            // 编辑页预览走站内票据（同一浏览器、登录态在），不落任何长期地址
            const access = await fetchMinutesAttachmentAccess(item.attachmentNo, 'view')
            return minutesAttachmentFileUrl({ attachmentNo: item.attachmentNo, ticket: access.ticket })
          }}
        />
      )}
      {locals.map(entry => (
        <div className="mm-attachments__item" key={entry.id} role="listitem" aria-label={entry.file.name}>
          <span className="mm-attachments__icon">{entry.status === 'uploading' ? <Spin size="small" /> : <FileWordOutlined />}</span>
          <div className="mm-attachments__info">
            <div className="mm-attachments__name">{entry.file.name}</div>
            <span className="mm-attachments__hint">
              {entry.status === 'uploading' ? t('meeting.minutes.attachmentUploading') : entry.error || t('meeting.minutes.attachmentUploadFailed')}
            </span>
          </div>
          {entry.status === 'error' && (
            <Space size={4}>
              <Button type="link" size="small" onClick={() => startUpload(entry)}>{t('meeting.minutes.attachmentRetry')}</Button>
              <Button type="link" size="small" danger
                aria-label={t('meeting.minutes.attachmentRemoveFile', { name: entry.file.name })}
                onClick={() => setLocalsTracked(current => current.filter(item => item.id !== entry.id))}>
                {t('common.remove')}
              </Button>
            </Space>
          )}
        </div>
      ))}
    </div>
  )
}

/** 附件文件地址解析：站内=异步票据，免登页=同步拼页面自带令牌；返回浏览器可直接打开的地址 */
export type AttachmentUrlResolver = (item: MinutesAttachmentVO, purpose: 'view' | 'download') => string | Promise<string>

interface ListProps {
  attachments: MinutesAttachmentVO[]
  /** 不传则只展示文件名/体积（发送预览），不给查看/下载动作 */
  resolveUrl?: AttachmentUrlResolver
  onRemove?: (item: MinutesAttachmentVO) => void
}

/** 只读附件列表：图片站内放大，PDF/Word 新窗口查看（Word 由服务端转 PDF），下载走原件 */
export function MinutesAttachmentList({ attachments, resolveUrl, onRemove }: ListProps) {
  const { t } = useTranslation()
  if (attachments.length === 0) return null
  return (
    <div className="mm-attachments__list" role="list" aria-label={t('meeting.minutes.attachmentListLabel')}>
      {attachments.map(item => (
        <AttachmentRow key={item.attachmentNo} item={item} resolveUrl={resolveUrl} onRemove={onRemove} />
      ))}
    </div>
  )
}

function AttachmentRow({ item, resolveUrl, onRemove }: { item: MinutesAttachmentVO; resolveUrl?: AttachmentUrlResolver; onRemove?: (item: MinutesAttachmentVO) => void }) {
  const { t } = useTranslation()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [thumbUrl, setThumbUrl] = useState<string>()
  const [busy, setBusy] = useState(false)
  const isImage = item.previewKind === 'image'

  // 图片缩略图也要经鉴权地址，不能给浏览器一个可收藏的裸对象键；URL 5 分钟过期，每次挂载重取
  useEffect(() => {
    if (!isImage || !resolveUrl) return
    let revoked = false
    void (async () => {
      try {
        const url = await resolveUrl(item, 'view')
        if (!revoked) setThumbUrl(url)
      } catch {
        /* 缩略图取不到不拦路：查看/下载按钮各自有独立错误反馈 */
      }
    })()
    return () => { revoked = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.attachmentNo])

  const open = async (purpose: 'view' | 'download') => {
    if (!resolveUrl) return
    setBusy(true)
    try {
      const url = await resolveUrl(item, purpose)
      if (isImage && purpose === 'view') {
        setThumbUrl(url)
        setPreviewOpen(true)
      } else {
        window.open(url, '_blank', 'noopener')
      }
    } catch {
      // request 层已统一提示；这里只恢复按钮可用态
    } finally {
      setBusy(false)
    }
  }

  const sizeText = item.sizeBytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(item.sizeBytes / 1024))} KB`
    : `${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className="mm-attachments__item" role="listitem" aria-label={item.fileName}>
      {isImage && thumbUrl ? (
        <Image
          src={thumbUrl}
          alt={item.fileName}
          width={56}
          height={56}
          style={{ objectFit: 'contain' }}
          preview={{ visible: previewOpen, onVisibleChange: setPreviewOpen }}
        />
      ) : (
        <span className="mm-attachments__icon">
          {item.previewKind === 'pdf' ? <FilePdfOutlined /> : <FileWordOutlined />}
        </span>
      )}
      <div className="mm-attachments__info">
        <div className="mm-attachments__name">{item.fileName}</div>
        <span className="mm-attachments__hint">{sizeText}</span>
      </div>
      <Space size={4} wrap>
        {resolveUrl && (
          <>
            <Button type="link" size="small" loading={busy && !isImage} aria-label={t('meeting.minutes.attachmentViewInBrowser', { name: item.fileName })} onClick={() => void open('view')}>
              {t('common.view')}
            </Button>
            <Button type="link" size="small" aria-label={t('meeting.minutes.attachmentDownloadFile', { name: item.fileName })} onClick={() => void open('download')}>
              {t('docKnowledge.download')}
            </Button>
          </>
        )}
        {onRemove && (
          <Button type="link" size="small" danger aria-label={t('meeting.minutes.attachmentRemoveFile', { name: item.fileName })} onClick={() => onRemove(item)}>
            {t('common.remove')}
          </Button>
        )}
      </Space>
    </div>
  )
}
