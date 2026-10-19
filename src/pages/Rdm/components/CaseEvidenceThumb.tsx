/**
 * 验收证据缩略图（回显态）。
 *
 * 为什么要点一下才取正文：验收历史一次会渲染整条返工链上的所有用例（返工数轮 × 十余条
 * 用例 × 每条数张图），后端刻意只回元信息正是为了不把正文塞进列表响应；若这里在挂载时
 * 就把每张图都拉下来，等于把刚省下的带宽原样花回去。
 *
 * 编辑态不走本组件：待提交的图片 dataUrl 还在内存里，直接渲染即可。
 */
import { useState } from 'react'
import { Button, Image, Tooltip } from 'antd'
import { FileOutlined, PictureOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchAcceptanceEvidence, type RdmAcceptanceEvidenceMeta } from '../../../api/rdm'

interface EvidenceThumbProps {
  /** 证据所属需求 id：取正文接口按需求做可见权与归属校验 */
  reqId: number
  /** 证据所属用例 id */
  caseId: number
  meta: RdmAcceptanceEvidenceMeta
}

export default function EvidenceThumb({ reqId, caseId, meta }: EvidenceThumbProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const isImage = (meta.type ?? '').startsWith('image/')
  const label = meta.name || `#${meta.index + 1}`

  const load = async () => {
    if (url || loading) return
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetchAcceptanceEvidence(reqId, caseId, meta.index)
      setUrl(res.dataUrl)
    } catch {
      // request.ts 对 403/5xx 已统一弹过，这里只把失败态画出来供重试，不双弹
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (url) {
    return isImage ? (
      <Image
        src={url}
        width={56}
        height={56}
        alt={label}
        style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #e8eaed' }}
      />
    ) : (
      // 非图片附件（pdf/文档等）没有预览语义，直接给下载链接
      <a href={url} download={meta.name || undefined} style={{ fontSize: 12 }}>{meta.name ?? t('rdm.acceptance.evidenceTypeLink')}</a>
    )
  }

  return (
    <Tooltip title={failed ? t('rdm.acceptance.evidenceLoadFailed') : label}>
      <Button
        size="small"
        icon={isImage ? <PictureOutlined /> : <FileOutlined />}
        loading={loading}
        onClick={load}
        style={{ maxWidth: 120, fontSize: 12 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {failed ? t('rdm.acceptance.evidenceLoadFailed') : label}
        </span>
      </Button>
    </Tooltip>
  )
}
