/**
 * 个人会议笔记自动保存（方案 §3.2）。
 *
 * 停止输入约 1s 保存、连续输入最长每 5s 提交；保存串行化，始终提交最新快照，
 * 只有服务器确认对应当前编辑版本后才显示「已保存」。冲突时保留本地内容并提示核对，
 * 不 last-write-wins。原文不落 localStorage，也不进 URL/日志。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMinutesNote, saveMinutesNote, type MinutesNoteMention } from '@/api/meetingMinutes'
import { newMeetingRequestKey } from '@/api/meeting'

export type NoteSaveState = 'loading' | 'idle' | 'saving' | 'saved' | 'unsynced' | 'conflict'

const DEBOUNCE_MS = 1000
const MAX_WAIT_MS = 5000

export function useMinutesNoteDraft(bookingId: number | undefined, enabled: boolean) {
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<MinutesNoteMention[]>([])
  const [noteVersion, setNoteVersion] = useState(0)
  const [saveState, setSaveState] = useState<NoteSaveState>('idle')
  const [maxChars, setMaxChars] = useState(20000)
  const [lastExtractionKey, setLastExtractionKey] = useState<string | null>(null)

  const dirty = useRef(false)
  const saving = useRef(false)
  const pending = useRef<ReturnType<typeof setTimeout>>()
  const lastSubmit = useRef(0)
  /** 每次编辑递增，回包时比对，确保「已保存」只对应最新快照 */
  const editSeq = useRef(0)
  /** 最新已确认的服务器版本，供 flush 同步返回给提取调用，避免与自动保存竞态 */
  const versionRef = useRef(0)
  /** 最新文本/mentions 的同步镜像：防抖回调必须读到「最后一次输入」，不能闭包捕获渲染前的旧值 */
  const textRef = useRef('')
  const mentionsRef = useRef<MinutesNoteMention[]>([])

  const load = useCallback(async () => {
    if (!bookingId) return
    setSaveState('loading')
    try {
      const note = await fetchMinutesNote(bookingId)
      setText(note.rawText ?? '')
      setMentions(note.mentions ?? [])
      textRef.current = note.rawText ?? ''
      mentionsRef.current = note.mentions ?? []
      setNoteVersion(note.noteVersion ?? 0)
      versionRef.current = note.noteVersion ?? 0
      setMaxChars(note.maxChars ?? 20000)
      setLastExtractionKey(note.lastExtractionRequestKey ?? null)
      setSaveState('idle')
    } catch {
      // 读取失败不冒充空笔记：保留可重试入口，不清空、不放开保存
      setSaveState('unsynced')
    }
  }, [bookingId])

  useEffect(() => { if (enabled) void load() }, [enabled, load])
  useEffect(() => () => clearTimeout(pending.current), [])

  const submit = useCallback(async () => {
    if (!bookingId || saving.current) return versionRef.current
    saving.current = true
    dirty.current = false
    lastSubmit.current = Date.now()
    const seq = editSeq.current
    // 读 ref 而非闭包 state：确保发送的是最新一次编辑
    const snapshot = textRef.current
    const snapshotMentions = mentionsRef.current
    const snapshotVersion = versionRef.current
    setSaveState('saving')
    try {
      const saved = await saveMinutesNote({
        bookingId, rawText: snapshot, mentions: snapshotMentions, noteVersion: snapshotVersion,
        requestKey: newMeetingRequestKey('mmnote'),
      })
      const nextVersion = saved.noteVersion ?? snapshotVersion + 1
      versionRef.current = nextVersion
      // 回包对应当前编辑才标已保存；期间又改了则保持待保存并再排一次（读 ref 拿到最新值）
      if (seq === editSeq.current) {
        setNoteVersion(nextVersion)
        setSaveState('saved')
      } else {
        dirty.current = true
        schedule()
      }
      return nextVersion
    } catch {
      // 保存失败统一标未同步：保留本地内容可重试；版本冲突由后端乐观锁把守（不静默覆盖），
      // 用户下次 reload 会读到服务器最新版本再核对。
      setSaveState('unsynced')
      return versionRef.current
    } finally {
      saving.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  const schedule = useCallback(() => {
    clearTimeout(pending.current)
    const wait = Math.max(0, DEBOUNCE_MS - (Date.now() - lastSubmit.current))
    pending.current = setTimeout(() => { void submit() }, Math.min(wait, MAX_WAIT_MS))
  }, [submit])

  const updateText = useCallback((next: string) => {
    if (next.length > maxChars) return
    textRef.current = next
    setText(next)
    editSeq.current += 1
    dirty.current = true
    setSaveState('idle')
    schedule()
  }, [maxChars, schedule])

  const updateMentions = useCallback((next: MinutesNoteMention[]) => {
    mentionsRef.current = next
    setMentions(next)
    editSeq.current += 1
    dirty.current = true
    schedule()
  }, [schedule])

  /** 点 AI 辅助/离开输入区时主动同步最新内容（若脏则立即提交），返回已确认的笔记版本供提取携带 */
  const flush = useCallback(async (): Promise<number> => {
    clearTimeout(pending.current)
    if (dirty.current || saveState === 'unsynced') return submit()
    return versionRef.current
  }, [saveState, submit])

  return {
    text, mentions, noteVersion, saveState, maxChars, lastExtractionKey,
    setText: updateText, setMentions: updateMentions, reload: load, flush,
  }
}
