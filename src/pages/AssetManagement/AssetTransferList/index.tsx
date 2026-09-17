/**
 * 調撥管理（物資管理 - 調撥交接）
 *
 * Tab 1「調撥記錄」：只讀展示歷史調撥流水（含調撥前後使用人/部門對比）
 * Tab 2「待調撥資產」：在用資產列表，行操作「資產調撥」跳轉現有獨立頁 /asset-transfer
 */
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import TransferLogTab from './TransferLogTab'
import TransferableTab from './TransferableTab'
import { fetchTransferOptions } from '../../../api/asset'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { withTransferFrom } from '../AssetTransfer/transferUtils'

export default function AssetTransferList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') === 'transferable' ? 'transferable' : 'log'
  const options = useTransferData(fetchTransferOptions)
  const from = `${location.pathname}${location.search}`
  const toAsset = (id: number) => navigate(withTransferFrom(`/asset-detail?id=${id}`, from, true))
  const toDetail = (id: number) => navigate(withTransferFrom(`/asset-transfer/detail?id=${id}`, from))

  return (
    <div className="content-area">
      <TransferError error={options.error} retry={options.refresh} />
      <Tabs
        activeKey={activeTab}
        onChange={tab => setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', tab); return next })}
        destroyInactiveTabPane
        items={[
          {
            key: 'log',
            label: t('asset.tabTransferLog'),
            children: <TransferLogTab options={options.data} onViewAsset={toAsset} onViewDetail={toDetail}
              onCancel={id => navigate(withTransferFrom(`/asset-transfer/cancel?id=${id}`, from))} />,
          },
          {
            key: 'transferable',
            label: t('asset.tabTransferable'),
            children: (
              <TransferableTab
                options={options.data}
                onTransfer={assetId => navigate(withTransferFrom(`/asset-transfer?id=${assetId}`, from))}
                onDetail={toAsset}
              />
            ),
          },
        ]}
      />
    </div>
  )
}
