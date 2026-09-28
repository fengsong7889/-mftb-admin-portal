/**
 * 我的资产 — 固定资产领用页签
 *
 * 数据源 /api/eam/claims/my（后端强制按当前登录人过滤），统计由父级下发（用于待签提醒条）。
 * 列表与详情视图复用领用管理页的表格组件，避免个人端与管理端口径漂移。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import { AppstoreOutlined } from '@ant-design/icons'
import { fetchMyClaims } from '../../api/eamClaim'
import { CLAIM_STATUS, type ClaimQuery, type ClaimStatsData, type ClaimStatus } from '../AssetManagement/AssetClaim/claimViewTypes'
import ClaimRecordTable from '../AssetManagement/AssetClaim/ClaimRecordTable'
import ClaimStats from '../AssetManagement/AssetClaim/ClaimStats'
import { ClaimSection } from '../AssetManagement/AssetClaim/ClaimLayout'
import { useTransferData } from '../AssetManagement/AssetTransfer/useTransferData'
import { TransferError } from '../AssetManagement/AssetTransfer/TransferLayout'

/** 个人视图页签：全部 / 待我簽署（含代辦補簽）/ 在用 / 已歸還 */
const TAB_ALL = 'all'
const TAB_SIGN = 'pendingSignature'
type ClaimTab = typeof TAB_ALL | typeof TAB_SIGN | ClaimStatus

interface Props {
  stats?: ClaimStatsData
  /** 口径标识（工号），切换登录人时重置卡片动画 */
  scopeKey: string
  /** 外部指定的子页签（如待签提醒条跳转「待我簽署」） */
  initialTab?: string
  onOpen: (id: number) => void
}

export default function MyClaimPane({ stats, scopeKey, initialTab, onOpen }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ClaimTab>((initialTab as ClaimTab | undefined) ?? TAB_ALL)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  const query = useMemo<ClaimQuery>(() => ({
    page,
    size,
    status: tab === TAB_ALL || tab === TAB_SIGN ? undefined : tab,
    pendingSignature: tab === TAB_SIGN ? true : undefined,
  }), [page, size, tab])

  const fetcher = useCallback(() => fetchMyClaims(query), [query])
  const { data, loading, error, refresh } = useTransferData(fetcher)

  /** 待签提醒条跳转时同步子页签（仅在外部显式指定时接管，不干扰用户手动切换） */
  useEffect(() => {
    if (initialTab) { setTab(initialTab as ClaimTab); setPage(1) }
  }, [initialTab])

  const handleQuery = useCallback((next: ClaimQuery) => {
    setTab(next.pendingSignature ? TAB_SIGN : next.status ?? TAB_ALL)
    setPage(next.page)
    setSize(next.size)
  }, [])

  const tabs: { key: ClaimTab; label: string }[] = [
    { key: TAB_ALL, label: t('myAssets.tabAll', '全部記錄') },
    { key: TAB_SIGN, label: t('myAssets.tabSign', '待我簽署') },
    { key: CLAIM_STATUS.CLAIMED, label: t('myAssets.tabInUse', '在用資產') },
    { key: CLAIM_STATUS.RETURNED, label: t('myAssets.tabReturned', '已歸還') },
  ]

  return (
    <ClaimSection title={t('myAssets.claimSection', '我的領用記錄')} icon={<AppstoreOutlined />}>
      <ClaimStats personal data={error ? undefined : stats} scopeKey={scopeKey} />
      <TransferError error={error} retry={refresh} />
      <div className="claim-table-tools">
        <span className="claim-muted">{t('myAssets.claimNote', '僅展示本人名下的領用記錄；歸還、遺失報備請聯繫資產管理員辦理。')}</span>
      </div>
      <Tabs
        activeKey={tab}
        items={tabs.map((item) => ({ key: item.key, label: item.label }))}
        onChange={(key) => { setTab(key as ClaimTab); setPage(1) }}
      />
      <ClaimRecordTable
        data={data}
        loading={loading}
        query={query}
        pageKey="my-asset-records"
        onQuery={handleQuery}
        onView={(row) => onOpen(row.id)}
        onSign={(row) => onOpen(row.id)}
      />
    </ClaimSection>
  )
}
