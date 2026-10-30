/**
 * AI 提取的状态机与竞态管理（方案 §3.3 / §8.2）。
 *
 * 一次提取一个 requestKey；HTTP 中断后按同一 requestKey 查询恢复，不自动新建请求。
 * 记录发起时的笔记版本，回包时若笔记已变更，结果标为「基于旧笔记」禁止直接应用。
 * 「转手动」只停止等待，不声称已取消供应商调用或必然免计费。
 */
import { useCallback, useRef, useState } from 'react'
import {
  extractMinutesAi, fetchMinutesAiExtraction, fetchMinutesAiStatus,
  type MinutesAiExtractionVO, type MinutesAiStatusVO,
} from '@/api/meetingMinutes'
import { newMeetingRequestKey } from '@/api/meeting'

export type AiPhase = 'idle' | 'checking' | 'processing' | 'succeeded' | 'failed' | 'unknown'

interface Params {
  bookingId: number
  noteVersion: number
  baseMinutesId?: number | null
  baseMinutesVersion?: number | null
}

export function useMinutesAiAssist() {
  const [phase, setPhase] = useState<AiPhase>('idle')
  const [status, setStatus] = useState<MinutesAiStatusVO>()
  const [result, setResult] = useState<MinutesAiExtractionVO>()
  const [errorCode, setErrorCode] = useState<string>()
  /** 结果所基于的笔记版本，交由表单与当前版本比对得出 stale（不在此猜当前版本） */
  const [resultNoteVersion, setResultNoteVersion] = useState<number | null>(null)
  /** 发起提取时的笔记版本，用于回包后判断结果是否过期 */
  const sourceVersion = useRef<number | null>(null)
  const currentKey = useRef<string | null>(null)

  const checkStatus = useCallback(async (bookingId: number) => {
    setPhase('checking')
    try {
      const next = await fetchMinutesAiStatus(bookingId)
      setStatus(next)
      setPhase('idle')
      return next
    } catch {
      setStatus({ available: false, reasonCode: 'check_failed', maxInputChars: 20000, enabled: true })
      setPhase('idle')
      return undefined
    }
  }, [])

  const reset = useCallback(() => {
    setPhase('idle'); setResult(undefined); setErrorCode(undefined)
    sourceVersion.current = null; currentKey.current = null
  }, [])

  const apply = useCallback((vo: MinutesAiExtractionVO, noteVersion: number) => {
    setResult(vo)
    if (vo.status === 'succeeded') {
      setPhase('succeeded')
    } else if (vo.status === 'processing') {
      setPhase('processing')
    } else {
      setPhase(vo.status === 'unknown' ? 'unknown' : 'failed')
      setErrorCode(vo.errorCode ?? vo.status)
    }
    // 结果基于旧笔记版本：保留展示但禁止应用（由界面据 stale 判定）
    sourceVersion.current = vo.source?.noteVersion ?? noteVersion
    setResultNoteVersion(vo.source?.noteVersion ?? noteVersion)
  }, [])

  const run = useCallback(async (params: Params) => {
    const requestKey = newMeetingRequestKey('mmai')
    currentKey.current = requestKey
    sourceVersion.current = params.noteVersion
    setPhase('processing'); setResult(undefined); setErrorCode(undefined)
    try {
      const vo = await extractMinutesAi({
        bookingId: params.bookingId, noteVersion: params.noteVersion,
        baseMinutesId: params.baseMinutesId ?? null, baseMinutesVersion: params.baseMinutesVersion ?? null,
        requestKey,
      })
      apply(vo, params.noteVersion)
    } catch (error) {
      setPhase('failed')
      setErrorCode(error instanceof Error ? 'request_failed' : 'request_failed')
    }
  }, [apply])

  /** 重连恢复：按上次 requestKey 查询，不新建请求 */
  const recover = useCallback(async (requestKey: string, params: Params) => {
    currentKey.current = requestKey
    setPhase('processing')
    try {
      const vo = await fetchMinutesAiExtraction(requestKey)
      apply(vo, params.noteVersion)
    } catch {
      setPhase('unknown'); setErrorCode('recover_failed')
    }
  }, [apply])

  return { phase, status, result, errorCode, resultNoteVersion, checkStatus, run, recover, reset }
}
