import { useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchMerchantGroupOptions } from '../../../api/merchantGroup'
import type { OptionItem } from '../../../api/types'

/**
 * AccountBalance 表单页面共享的通用逻辑：
 * - URL 参数解析 + 返回导航
 * - 集团搜索
 * - 提交成功状态 + 倒计时
 */
export function useApplyFormCommon() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || 'mFood'
  const fromParam = searchParams.get('from') || ''

  const backTarget = fromParam === 'process-center' ? '/process-center' : '/account-balance'
  const goBack = useCallback(() => navigate(backTarget), [navigate, backTarget])
  const isFromProcessCenter = fromParam === 'process-center'

  // 集团搜索
  const [groupSearchOptions, setGroupSearchOptions] = useState<OptionItem[]>([])
  const [groupSearchLoading, setGroupSearchLoading] = useState(false)

  const handleGroupSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setGroupSearchOptions([]); return }
    setGroupSearchLoading(true)
    try {
      const opts = await fetchMerchantGroupOptions(keyword)
      setGroupSearchOptions(opts || [])
    } catch { setGroupSearchOptions([]) }
    setGroupSearchLoading(false)
  }, [])

  const handleGroupChange = useCallback((_value: string) => {
    // 可在外部 form 中设置 groupName
  }, [])

  // 提交成功状态
  const [successVisible, setSuccessVisible] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return {
    groupIdParam,
    groupNameParam,
    brandParam,
    fromParam,
    backTarget,
    goBack,
    isFromProcessCenter,
    groupSearchOptions,
    groupSearchLoading,
    handleGroupSearch,
    handleGroupChange,
    successVisible,
    setSuccessVisible,
    submittedFlowNo,
    setSubmittedFlowNo,
    submitting,
    setSubmitting,
  }
}
