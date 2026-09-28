/**
 * 我的资产（员工个人入口）
 *
 * 三类个人资产数据全部来自真实接口，且都不依赖业务菜单授权，因此所有系统右上角「我的资产」入口均可用：
 *  - 固定资产领用：/api/eam/claims/my（+ /my/stats，服务层固定本人口径）
 *  - 借用：/api/eam/borrows/my（+ /my/stats，后端强制 holderId = 当前登录人）
 *  - 耗材领用：/api/eam/consumables/claims/my（+ /my/stats，后端强制申请人 = 当前登录人）
 * 详情统一走独立视图（?type=&id=），不使用弹窗；领用签署复用 /my-claims 的同一份实现。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Result, Tabs, Tag } from 'antd'
import { DatabaseOutlined, FieldTimeOutlined, InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useAuth } from '../../contexts/AuthContext'
import { fetchMyClaimStats } from '../../api/eamClaim'
import type { ClaimStatsData } from '../AssetManagement/AssetClaim/claimViewTypes'
import { MyClaimDetail } from '../AssetManagement/AssetClaim/MyClaims'
import ConsumableClaimDetail from '../Consumable/Claim/ClaimDetail'
import { positiveId } from '../AssetManagement/AssetTransfer/transferUtils'
import MyClaimPane from './MyClaimPane'
import MyBorrowPane from './MyBorrowPane'
import MyConsumablePane from './MyConsumablePane'
import MyBorrowDetail from './MyBorrowDetail'
import '../AssetManagement/AssetClaim/index.css'

const TAB_CLAIM = 'claim'
const TAB_BORROW = 'borrow'
const TAB_CONSUMABLE = 'consumable'
type MyAssetsTab = typeof TAB_CLAIM | typeof TAB_BORROW | typeof TAB_CONSUMABLE

export default function MyAssets() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const scopeKey = user?.empId ?? 'me'
  const tab = (params.get('tab') as MyAssetsTab) || TAB_CLAIM
  const detailType = (params.get('type') as MyAssetsTab) || TAB_CLAIM
  const detailId = positiveId(params.get('id'))
  /** 领用子页签（待签提醒条跳转） */
  const claimSubTab = params.get('sub') ?? undefined
  /** 来源标记：企业门户顶栏进入时，返回应回到门户而非系统工作台 */
  const fromPortal = params.get('from') === 'portal'

  /** 统一构造查询串，保留 from 来源标记 */
  const buildParams = useCallback((extra: Record<string, string>) => {
    const next = new URLSearchParams(extra)
    if (fromPortal) next.set('from', 'portal')
    return next
  }, [fromPortal])

  /** 领用统计提升到页级：待签提醒条与领用卡片共用同一份数据 */
  const [claimStats, setClaimStats] = useState<ClaimStatsData>()
  useEffect(() => {
    let active = true
    fetchMyClaimStats().then((result) => { if (active) setClaimStats(result) }).catch(() => { if (active) setClaimStats(undefined) })
    return () => { active = false }
  }, [])

  const handleTabChange = useCallback((key: string) => setParams(buildParams({ tab: key })), [buildParams, setParams])

  const openDetail = useCallback((type: MyAssetsTab, id: number) => {
    setParams(buildParams({ tab, type, id: String(id) }))
  }, [buildParams, setParams, tab])

  const backToList = useCallback(() => setParams(buildParams({ tab })), [buildParams, setParams, tab])

  /* ---------- 详情视图（独立页面，不用弹窗） ---------- */
  if (params.has('id')) {
    if (!detailId) {
      return (
        <div className="content-area claim-module">
          <Result status="warning" title={t('transfer.invalidId')} extra={<Button onClick={backToList}>{t('common.back')}</Button>} />
        </div>
      )
    }
    return (
      <div className="content-area claim-module">
        {detailType === TAB_BORROW && <MyBorrowDetail key={`borrow-${detailId}`} id={detailId} onBack={backToList} />}
        {detailType === TAB_CONSUMABLE && <ConsumableClaimDetail key={`consumable-${detailId}`} id={detailId} onBack={backToList} />}
        {detailType === TAB_CLAIM && <MyClaimDetail key={`claim-${detailId}`} id={detailId} onBack={backToList} />}
      </div>
    )
  }

  const pendingCount = claimStats?.pendingSignatureCount ?? 0

  return (
    <div className="content-area claim-module">
      <DetailPageHeader
        title={t('header.myAssets', '我的資產')}
        tags={user?.empId ? <Tag color="blue">{user.empId}</Tag> : undefined}
        meta={[user?.name, user?.department].filter(Boolean).join(' · ') || undefined}
        onBack={() => navigate(fromPortal ? '/portal' : '/')}
      />

      {pendingCount > 0 && (
        <Alert
          type="warning"
          showIcon
          className="claim-notice"
          message={t('myAssets.pendingSignAlert', '您有 {{count}} 條領用待本人簽署', { count: pendingCount })}
          description={t('myAssets.pendingSignDesc', '代辦領用已由管理員登記，需本人補簽確認；請及時簽署以免資產歸屬無法生效。')}
          action={<Button size="small" type="link" onClick={() => setParams(buildParams({ tab: TAB_CLAIM, sub: 'pendingSignature' }))}>{t('myAssets.goHandle', '去處理')}</Button>}
        />
      )}

      <Tabs
        activeKey={tab}
        onChange={handleTabChange}
        items={[
          {
            key: TAB_CLAIM,
            label: <span><InboxOutlined /> {t('myAssets.tabClaim', '固定資產領用')}</span>,
            children: <MyClaimPane stats={claimStats} scopeKey={scopeKey} initialTab={claimSubTab} onOpen={(id) => openDetail(TAB_CLAIM, id)} />,
          },
          {
            key: TAB_BORROW,
            label: <span><FieldTimeOutlined /> {t('myAssets.tabBorrow', '借用')}</span>,
            children: <MyBorrowPane scopeKey={scopeKey} onOpen={(id) => openDetail(TAB_BORROW, id)} />,
          },
          {
            key: TAB_CONSUMABLE,
            label: <span><DatabaseOutlined /> {t('myAssets.tabConsumable', '耗材領用')}</span>,
            children: <MyConsumablePane scopeKey={scopeKey} onOpen={(id) => openDetail(TAB_CONSUMABLE, id)} />,
          },
        ]}
      />
    </div>
  )
}
