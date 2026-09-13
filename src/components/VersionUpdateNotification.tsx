import { notification, Button } from 'antd'
import { ReloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef } from 'react'

interface Props {
  updateAvailable: boolean
}

/**
 * 版本更新通知
 * - 檢測到新版本時在右上角彈出提示，引導用戶刷新頁面獲取最新資源
 * - 使用 antd notification API，非阻塞、可手動關閉
 * - 僅在 updateAvailable 變為 true 時觸發一次
 */
export default function VersionUpdateNotification({ updateAvailable }: Props) {
  const { t } = useTranslation()
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (!updateAvailable || notifiedRef.current) return
    notifiedRef.current = true

    const key = 'version-update'
    notification.info({
      key,
      message: t('versionUpdate.title'),
      description: t('versionUpdate.desc'),
      icon: <CloudUploadOutlined style={{ color: '#E8720C' }} />,
      duration: 0, // 不自動關閉，直到用戶手動刷新或關閉
      btn: (
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          size="small"
          onClick={() => {
            notification.destroy(key)
            window.location.reload()
          }}
        >
          {t('versionUpdate.reload')}
        </Button>
      ),
      placement: 'topRight',
    })
  }, [updateAvailable, t])

  return null
}
