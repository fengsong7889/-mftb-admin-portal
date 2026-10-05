import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchMerchantGroupOptions } from '../../../api/merchantGroup'
import type { OptionItem } from '../../../api/types'
import type { UploadFile } from 'antd'

/**
 * AccountBalance 表單頁通用 Hook
 *
 * 提取 DeductAdd / TransferAdd / RechargeAdd / MergeAdd 共享邏輯：
 *   - URL 參數解析（groupId, groupName, brand, from）
 *   - 返回導航（流程中心 vs 賬戶餘額）
 *   - 集團搜索（從流程中心進入時啟用）
 *   - 提交狀態管理（submitting, successVisible, submittedFlowNo, certificateFiles）
 */
export interface AccountFormCommonResult {
  /** URL 參數 */
  groupIdParam: string
  groupNameParam: string
  brandParam: string
  fromParam: string
  /** 導航 */
  goBack: () => void
  isFromProcessCenter: boolean
  /** 集團搜索（從流程中心進入時啟用） */
  groupSearchOptions: OptionItem[]
  groupSearchLoading: boolean
  handleGroupSearch: (keyword: string) => Promise<void>
  /** 提交狀態 */
  certificateFiles: UploadFile[]
  setCertificateFiles: (files: UploadFile[]) => void
  successVisible: boolean
  setSuccessVisible: (v: boolean) => void
  submitting: boolean
  setSubmitting: (v: boolean) => void
  submittedFlowNo: string
  setSubmittedFlowNo: (v: string) => void
}

export function useAccountFormCommon(opts?: {
  /** 集團選擇變更時同步設置的表單字段名，默認 'groupId' */
  groupIdFieldName?: string
  groupNameFieldName?: string
  /** 自定義返回目標 */
  backTarget?: string
}): AccountFormCommonResult {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || 'mFood'
  const fromParam = searchParams.get('from') || ''

  const backTarget = opts?.backTarget ?? (fromParam === 'process-center' ? '/process-center' : '/account-balance')
  const goBack = useCallback(() => navigate(backTarget), [navigate, backTarget])
  const isFromProcessCenter = fromParam === 'process-center'

  // 集團搜索
  const [groupSearchOptions, setGroupSearchOptions] = useState<OptionItem[]>([])
  const [groupSearchLoading, setGroupSearchLoading] = useState(false)

  const handleGroupSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setGroupSearchOptions([]); return }
    setGroupSearchLoading(true)
    try {
      const opts = await fetchMerchantGroupOptions(keyword.trim())
      setGroupSearchOptions(opts || [])
    } catch { setGroupSearchOptions([]) }
    finally { setGroupSearchLoading(false) }
  }, [])

  // 提交狀態
  const [certificateFiles, setCertificateFiles] = useState<UploadFile[]>([])
  const [successVisible, setSuccessVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')

  return {
    groupIdParam, groupNameParam, brandParam, fromParam,
    goBack, isFromProcessCenter,
    groupSearchOptions, groupSearchLoading, handleGroupSearch,
    certificateFiles, setCertificateFiles,
    successVisible, setSuccessVisible,
    submitting, setSubmitting,
    submittedFlowNo, setSubmittedFlowNo,
  }
}
