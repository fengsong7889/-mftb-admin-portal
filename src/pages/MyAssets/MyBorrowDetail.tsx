/**
 * 我的资产 — 本人借用详情（只读）
 *
 * 归属由 /api/eam/borrows/my/{id} 在服务端校验，越权返回「僅能查看與操作本人的資料」。
 * 续借、归还属于资产管理动作（需 asset-borrow 编辑权限），个人端不提供入口。
 */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import BorrowDetail from '../AssetManagement/AssetBorrow/BorrowDetail'
import { fetchMyBorrowDetail } from '../../api/eamBorrow'
import { useTransferData } from '../AssetManagement/AssetTransfer/useTransferData'

interface Props {
  id?: number
  onBack: () => void
}

export default function MyBorrowDetail({ id, onBack }: Props) {
  const { t } = useTranslation()
  const fetcher = useCallback(
    () => (id ? fetchMyBorrowDetail(id) : Promise.reject(new Error(t('transfer.invalidId')))),
    [id, t],
  )
  const { data: record, loading, error } = useTransferData(fetcher)
  return <BorrowDetail record={record} loading={loading} error={error} canViewReturnOrder={false} onBack={onBack} />
}
