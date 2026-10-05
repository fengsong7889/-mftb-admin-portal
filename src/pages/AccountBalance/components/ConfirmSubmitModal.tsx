import { Modal } from 'antd'
import type { ReactNode } from 'react'

/**
 * 提交確認彈窗（AccountBalance 統一風格）
 *
 * 提取自 DeductAdd / TransferAdd / RechargeAdd / MergeAdd 中重複的 Modal.confirm 模式。
 * 包含：確認圖標、信息卡片、審批停用警告。
 */
export interface ConfirmSubmitModalProps {
  title?: string
  /** 確認信息卡片內容（多行 row） */
  infoRows: ReactNode
  /** 審批流程是否已停用 */
  approvalEnabled: boolean
  /** 停用時的警告文案 */
  directExecDesc?: string
  /** 點擊確認回調 */
  onConfirm: () => Promise<void>
}

/** 確認彈窗默認標題 */
const DEFAULT_TITLE_KEY = 'accountBalance.confirmSubmitTitle'

/** 確認圖標 */
const confirmIcon = (
  <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
)

/** 審批停用警告框 */
export function DirectExecWarning({ desc }: { desc: string }) {
  return (
    <div style={{
      marginTop: 12, padding: '10px 14px', borderRadius: 8,
      background: 'linear-gradient(135deg, #FFF1F0, #FFFAF0)',
      border: '1.5px solid #FF7A45',
      fontSize: 13, color: '#CF1322', lineHeight: 1.6, fontWeight: 500,
    }}>
      ⚡ {desc}
    </div>
  )
}

/**
 * 顯示提交確認彈窗（命令式調用）
 *
 * @param t 翻譯函數
 * @param opts 配置項
 */
export function showConfirmSubmit(
  t: (key: string, opts?: Record<string, unknown>) => string,
  opts: {
    infoRows: ReactNode
    approvalEnabled: boolean
    directExecDesc: string
    onConfirm: () => Promise<void>
  }
) {
  Modal.confirm({
    title: t(DEFAULT_TITLE_KEY),
    icon: confirmIcon,
    centered: true,
    className: 'custom-confirm-modal',
    width: 520,
    okText: t('common:confirmSubmit'),
    cancelText: t('common:cancel'),
    content: (
      <div>
        <div className="confirm-info-card">
          {opts.infoRows}
        </div>
        {!opts.approvalEnabled && (
          <DirectExecWarning desc={opts.directExecDesc} />
        )}
      </div>
    ),
    onOk: opts.onConfirm,
  })
}

/**
 * 處理表單提交錯誤（antd 校驗失敗 vs 業務錯誤）
 *
 * 提取自 DeductAdd / TransferAdd / RechargeAdd / MergeAdd 中重複的 catch 邏輯。
 */
export function handleFormSubmitError(
  err: unknown,
  errorMsg: string,
  errorFn: (msg: string) => void,
) {
  if (!(err && typeof err === 'object' && 'errorFields' in err)) {
    errorFn(err instanceof Error && err.message ? err.message : errorMsg)
  }
}
