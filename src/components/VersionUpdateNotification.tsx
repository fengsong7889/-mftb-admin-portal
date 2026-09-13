import { notification, Button } from 'antd'
import { ReloadOutlined, CloudUploadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useEffect, useRef } from 'react'

interface Props {
  updateAvailable: boolean
}

/**
 * 版本更新通知
 * - 检测到新版本时在右上角弹出提示，引导用户刷新页面获取最新资源
 * - 使用 antd notification API，非阻塞、可手动关闭
 * - 仅在 updateAvailable 变为 true 时触发一次
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
      duration: 0, // 不自动关闭，直到用户手动刷新或关闭
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
