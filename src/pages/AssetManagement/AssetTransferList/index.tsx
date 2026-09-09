/**
 * 調撥管理（物資管理 - 調撥交接）
 *
 * Tab 1「調撥記錄」：只讀展示歷史調撥流水（含調撥前後使用人/部門對比）
 * Tab 2「待調撥資產」：在用資產列表，行操作「資產調撥」跳轉現有獨立頁 /asset-transfer
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import TransferLogTab from './TransferLogTab'
import TransferableTab from './TransferableTab'

export default function AssetTransferList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('log')

  const toAsset = (assetNo: string) => navigate(`/asset-list?assetNo=${encodeURIComponent(assetNo)}`)

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        destroyInactiveTabPane
        items={[
          {
            key: 'log',
            label: t('asset.tabTransferLog'),
            children: <TransferLogTab onViewAsset={toAsset} />,
          },
          {
            key: 'transferable',
            label: t('asset.tabTransferable'),
            children: (
              <TransferableTab
                onTransfer={(assetId) => navigate(`/asset-transfer?id=${assetId}`)}
                onDetail={(assetId) => navigate(`/asset-detail?id=${assetId}`)}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
