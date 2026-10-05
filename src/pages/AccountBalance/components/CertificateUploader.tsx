/**
 * 凭证文件选取器（图片/PDF 缩略卡片 + 删除 + 继续添加）。
 *
 * 受控组件：文件列表完全由调用方持有（files / setFiles），本组件只负责展示与增删。
 * 按扩展名区分 PDF / 图片图标，文件名超长自动省略号。
 *
 * ⚠️ 待改进：本组件只保留 uid 与 name，不保存文件内容，也没有配置 action /
 * customRequest；而 shared.beforeUpload 校验通过时返回 true，antd 仍会走默认上传
 * 流程并发出一个无目标的请求。真正接通凭证存储时，需要在这里显式阻断或改成
 * 受控上传，不要直接沿用当前行为。
 */
import { Button, Upload, type UploadFile } from 'antd'
import { UploadOutlined, FileImageOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { beforeUpload } from './shared'

interface CertificateUploaderProps {
  files: UploadFile[]
  /** 直接覆盖式回传新数组（组件内不做累加，以保证调用方是单一数据源） */
  setFiles: (files: UploadFile[]) => void
  /** 上限，满额后隐藏“继续添加”格子 */
  maxCount?: number
}

export default function CertificateUploader({ files, setFiles, maxCount = 5 }: CertificateUploaderProps) {
  const { t } = useTranslation()

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {files.map((file) => (
        <div key={file.uid} style={{
          width: 88, height: 88, border: '1px solid #e8e8e8', borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', background: '#fafafa',
        }}>
          {file.name?.endsWith('.pdf')
            ? <FilePdfOutlined style={{ fontSize: 28, color: '#E53935' }} />
            : <FileImageOutlined style={{ fontSize: 28, color: '#1976D2' }} />
          }
          <span style={{ fontSize: 10, color: '#999', marginTop: 4, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          <Button type="text" size="small" danger
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setFiles(files.filter(f => f.uid !== file.uid))}
          >×</Button>
        </div>
      ))}
      {files.length < maxCount && (
        <Upload
          accept=".png,.jpg,.jpeg,.pdf"
          showUploadList={false}
          beforeUpload={beforeUpload}
          onChange={(info) => {
            if (info.file.status !== 'removed') {
              setFiles([...files, { uid: info.file.uid, name: info.file.name }])
            }
          }}
        >
          <div style={{
            width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa',
            transition: 'all 0.3s',
          }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = '#E8720C'; el.style.background = '#fff7e6'; el.style.color = '#E8720C' }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = '#d9d9d9'; el.style.background = '#fafafa'; el.style.color = '#999' }}
          >
            <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: 'inherit' }} />
            <span>{t('accountBalance.upload')}</span>
          </div>
        </Upload>
      )}
    </div>
  )
}
