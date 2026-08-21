import { useTranslation } from 'react-i18next'

/** 团购管理 - 数据看板 */
export default function GroupPurchaseDashboard() {
  const { t } = useTranslation()

  return (
    <div className="content-area">
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
        {t('groupPurchase.dashboard', '數據看板')}
      </h2>
      <p style={{ color: '#8C8C8C' }}>
        {t('common.underDevelopment', '功能開發中...')}
      </p>
    </div>
  )
}
