import { Modal } from 'antd'
import { t } from 'i18next'

/**
 * MCP 外部服務人工確認彈窗（AI 操作授權 L3 治理的前端落地）
 * 由 agent.ts 工具執行器在非組件環境調用，故用 i18next 實例直接取文案
 */
export function confirmExternalCall(name: string, argsJson: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: t('mcpExternal.confirmTitle'),
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>
            {t('mcpExternal.confirmRequest')} <b>{name}</b>
          </p>
          <pre style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, background: '#F5F5F5', padding: 8, borderRadius: 4, margin: '0 0 8px' }}>
            {argsJson}
          </pre>
          <p style={{ color: '#8C8C8C', fontSize: 12, marginBottom: 0 }}>{t('mcpExternal.confirmNote')}</p>
        </div>
      ),
      okText: t('mcpExternal.confirmOk'),
      cancelText: t('mcpExternal.confirmCancel'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}
