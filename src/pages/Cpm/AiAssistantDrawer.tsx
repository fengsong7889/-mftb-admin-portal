/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Drawer, Input, Segmented, Select, Slider, Space, Spin, Tabs, Tag, message } from 'antd'
import { AudioOutlined, RobotOutlined, StopOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  confirmCpmAi, extractCpmAi, fetchCpmAiExtraction, fetchCpmAiStatus, transcribeCpmAudio,
  type CpmAiCandidate, type CpmAiStatusVO,
} from '@/api/cpm'
import { CPM_STATUS_LABELS, CpmStatus, type CpmStatusValue } from './meta'

/**
 * P2 AI 助手抽屉（方案 §七-P2，阶段二真实链路）。
 *
 * 交互契约与纪要 AI 完全同构：预检同源（不就绪→按钮置灰+原因）、requestKey 幂等
 * （断线重连只重查不重调）、预览人工确认才落条目（source=ai）。
 *
 * 为什么录音直接产 blob 上传而不落盘：音频是敏感正文，前端任何 localStorage/
 * IndexedDB 缓存都会绕过「payload 7 天限期清除」的后端承诺。
 */

interface Props {
  open: boolean
  onClose: () => void
  dateStr: string
  templateKey?: string
  categories: { key: string; label: string; hint?: string | null }[]
  onConfirmed: () => void
}

interface Candidate extends CpmAiCandidate {
  /** React key：序号而非内容哈希，编辑标题不影响勾选状态 */
  index: number
  included: boolean
}

/** requestKey：时间戳+随机段，符合后端 ^[A-Za-z0-9_-]{1,64}$ */
const newRequestKey = () => `cpm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export default function AiAssistantDrawer({ open, onClose, dateStr, templateKey, categories, onConfirmed }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'paste' | 'voice'>('paste')
  const [raw, setRaw] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState<CpmAiStatusVO | null>(null)
  const [lastRequestKey, setLastRequestKey] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // 录音（MediaRecorder 原生 API，零新增依赖；产物 webm/ogg 直接上传转写）
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const autoStopTimerRef = useRef<number | null>(null)

  const maxChars = status?.maxInputChars ?? 20000

  useEffect(() => {
    if (!open) return
    let alive = true
    fetchCpmAiStatus()
      .then(vo => { if (alive) setStatus(vo) })
      .catch(() => { if (alive) setStatus(null) })
    return () => { alive = false }
  }, [open])

  const aiReady = !!status?.available

  const applyResult = (result: { candidates: CpmAiCandidate[]; summary?: string | null }) => {
    setCandidates(result.candidates.map((c, i) => ({ ...c, index: i, included: true })))
    setSummary(result.summary ?? '')
  }

  const handleExtract = async () => {
    if (raw.trim().length < 4) {
      message.warning('請先貼上原始工作內容（至少 4 個字）')
      return
    }
    if (!aiReady) {
      message.warning(status?.message ?? 'AI 場景尚未就緒，請聯繫管理員開啟')
      return
    }
    setExtracting(true)
    const requestKey = newRequestKey()
    setLastRequestKey(requestKey)
    try {
      const vo = await extractCpmAi({ requestKey, rawText: raw.trim(), templateKey })
      if (vo.status === 'succeeded') {
        applyResult(vo)
      } else if (vo.status === 'processing') {
        // 断线/超时后重查：处理中不重调模型，稍候按同一 requestKey 取回
        message.info('整理處理中，請稍後點「重試查詢」')
      } else {
        message.error(aiErrorText(vo.errorCode, t))
      }
    } catch {
      // request.ts 已弹错；保留 requestKey 供「重试查询」幂等回捞
      setCandidates(null)
    } finally {
      setExtracting(false)
    }
  }

  const retryFetch = async () => {
    if (!lastRequestKey) return
    setExtracting(true)
    try {
      const vo = await fetchCpmAiExtraction(lastRequestKey)
      if (vo.status === 'succeeded') {
        applyResult(vo)
        message.success('已取回整理結果')
      } else {
        message.info(vo.status === 'processing'
          ? t('cpm.ai.processing', { defaultValue: '整理處理中，請稍後再試' })
          : aiErrorText(vo.errorCode ?? vo.status, t))
      }
    } finally {
      setExtracting(false)
    }
  }

  const patchCandidate = (index: number, patch: Partial<Candidate>) => {
    setCandidates(list => (list ?? []).map(c => (c.index === index ? { ...c, ...patch } : c)))
  }

  const handleConfirm = async () => {
    if (!lastRequestKey) return
    const chosen = (candidates ?? []).filter(c => c.included)
    if (chosen.length === 0) {
      message.warning('請至少保留一條整理結果')
      return
    }
    setConfirming(true)
    try {
      await confirmCpmAi({
        requestKey: lastRequestKey,
        selected: chosen.map(({ index: _index, included: _included, ...rest }) => rest),
        workDate: dateStr,
      })
      message.success(`已添加 ${chosen.length} 條到今天`)
      setCandidates(null)
      setRaw('')
      setLastRequestKey(null)
      onConfirmed()
    } finally {
      setConfirming(false)
    }
  }

  const startRecording = async () => {
    if (status && !status.asrAvailable) {
      message.warning('轉寫服務未配置，請改用「粘貼文本」')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start()
      setRecording(true)
      // 上限由后端把守（时长/体积双闸）；前端到点自动停，减少无效等待
      const maxSeconds = status?.asrMaxSeconds ?? 300
      autoStopTimerRef.current = window.setTimeout(() => stopRecording(), maxSeconds * 1000)
    } catch {
      message.error('無法訪問麥克風，請檢查瀏覽器權限，或改用「粘貼文本」')
    }
  }

  const stopRecording = async () => {
    if (autoStopTimerRef.current) window.clearTimeout(autoStopTimerRef.current)
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false)
      return
    }
    setRecording(false)
    const blob = await new Promise<Blob>(resolve => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      recorder.stop()
      recorder.stream.getTracks().forEach(t => t.stop())
    })
    setTranscribing(true)
    try {
      const result = await transcribeCpmAudio(blob)
      setRaw(prev => (prev ? `${prev}\n${result.text}` : result.text))
      message.success('轉寫完成，可編輯後點「AI 整理」')
    } catch {
      // 失败提示由 request.ts 弹出；这里不双弹
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <Drawer
      title={(
        <Space>
          <RobotOutlined style={{ color: 'var(--brand)' }} />
          AI 工作整理助手
        </Space>
      )}
      placement="right"
      width={560}
      open={open}
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>AI 內容需人工確認後才會記錄</span>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" disabled={!candidates} loading={confirming} onClick={() => void handleConfirm()}>
              添加到今天{candidates ? `（${candidates.filter(c => c.included).length}）` : ''}
            </Button>
          </Space>
        </div>
      )}
    >
      {status && !status.available && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="AI 整理暫不可用"
          description={status.message ?? '場景開關、模型授權或額度未就緒；手動記錄不受影響。'}
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={k => setTab(k as 'paste' | 'voice')}
        items={[
          {
            key: 'paste',
            label: '粘貼文本',
            children: (
              <Input.TextArea
                rows={8}
                value={raw}
                onChange={e => setRaw(e.target.value)}
                maxLength={maxChars}
                showCount
                placeholder={'把流水账、聊天纪要、待办清单直接粘进来，例如：\n上午评审了XX需求，结论通过\n下午联调XX接口，进度 70%\n明天跟进XX缺陷'}
              />
            ),
          },
          {
            key: 'voice',
            label: '錄音轉文字',
            children: (
              <div className="cpm-ai__recorder">
                {recording ? (
                  <Button danger size="large" icon={<StopOutlined />} onClick={() => void stopRecording()}>停止錄音</Button>
                ) : (
                  <Button type="primary" size="large" icon={<AudioOutlined />} disabled={transcribing || (status ? !status.asrAvailable : false)} onClick={() => void startRecording()}>
                    {transcribing ? '轉寫中…' : '開始錄音'}
                  </Button>
                )}
                {transcribing && <Spin />}
                {status && !status.asrAvailable && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>轉寫服務未配置（後端 CPM_ASR_* 留空即 fail-closed），請改用粘貼文本</span>
                )}
                {!recording && !transcribing && status?.asrAvailable && (
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>最長 {Math.round((status.asrMaxSeconds ?? 300) / 60)} 分鐘；音頻僅用於轉寫，不落盤留存</span>
                )}
              </div>
            ),
          },
        ]}
      />

      {tab === 'paste' && (
        <Space style={{ marginTop: 4 }}>
          <Button type="primary" icon={<RobotOutlined />} loading={extracting} onClick={() => void handleExtract()} disabled={!raw.trim() || !aiReady}>
            AI 整理
          </Button>
          {lastRequestKey && (
            <Button onClick={() => void retryFetch()} loading={extracting}>重試查詢</Button>
          )}
        </Space>
      )}
      {tab === 'voice' && raw.trim() && (
        <Space style={{ marginTop: 4 }}>
          <Button type="primary" icon={<RobotOutlined />} loading={extracting} onClick={() => void handleExtract()} disabled={!aiReady}>
            對轉寫結果做 AI 整理
          </Button>
        </Space>
      )}

      {candidates && (
        <>
          <Alert
            type="info"
            style={{ margin: '16px 0' }}
            message={summary || `本次共整理 ${candidates.length} 條候選`}
            description="勾選要保留的條目，可逐條修改分類/狀態/進度；確認前不會寫入任何記錄。"
          />
          {candidates.map(c => (
            <div key={c.index} className="cpm-ai__candidate">
              <div className="cpm-ai__candidate-row" style={{ marginBottom: 8 }}>
                <Checkbox checked={c.included} onChange={e => patchCandidate(c.index, { included: e.target.checked })} />
                <Input
                  value={c.title}
                  size="small"
                  maxLength={200}
                  style={{ flex: 1, minWidth: 200 }}
                  onChange={e => patchCandidate(c.index, { title: e.target.value })}
                />
                <Tag color="purple" style={{ marginInlineEnd: 0 }}>AI 整理</Tag>
                {c.sourceRefs.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>來源 {c.sourceRefs.join('、')}</span>
                )}
              </div>
              <div className="cpm-ai__candidate-row">
                <Select
                  size="small"
                  value={c.category}
                  style={{ width: 120 }}
                  onChange={v => patchCandidate(c.index, { category: v })}
                  options={categories.map(cat => ({ value: cat.key, label: cat.label }))}
                />
                <Segmented
                  size="small"
                  value={c.status}
                  onChange={v => {
                    const statusValue = v as CpmStatusValue
                    patchCandidate(c.index, { status: statusValue, progress: statusValue === CpmStatus.DONE ? 100 : c.progress })
                  }}
                  options={Object.values(CpmStatus).map(s => ({ label: CPM_STATUS_LABELS[s], value: s }))}
                />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <Slider
                    min={0}
                    max={100}
                    value={c.progress}
                    disabled={c.status === CpmStatus.DONE}
                    onChange={v => patchCandidate(c.index, { progress: v })}
                    tooltip={{ formatter: () => `${c.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="cpm-ai__disclosure">
        說明：AI 整理結果僅為候選草稿，經你勾選確認後才寫入工作記錄；來源會標記為「AI 整理」。
      </div>
    </Drawer>
  )
}

/**
 * 后端错误码 → 人话。
 *
 * 错误码集合由服务端 `AiUpstreamErrorCodes` 统一分类（欠费/密钥失效/模型不存在/限流/内容安全/
 * 配额耗尽/超时/网络/坏 JSON/通道配置缺失），前端只负责取词：
 * 用户无需查日志就知道下一步该做什么（这是纪要 AI_REASON_KEYS 的既有口径）。
 * 新增码没来得及入库时回落通用文案，绝不把 `upstream_http_400` 这种原始码显示给人看。
 */
function aiErrorText(code: string | null | undefined, t: TFunction): string {
  const title = t('cpm.ai.failedTitle', { defaultValue: '整理失敗' })
  if (!code) return `${title}：${t('cpm.aiError.unknown', { defaultValue: '原因不明，請稍後重試或聯繫管理員' })}`
  return `${title}：${t(`cpm.aiError.${code}`, { defaultValue: t('cpm.aiError.fallback', { defaultValue: '模型服務暫不可用，請稍後重試或聯繫管理員' }) })}`
}
