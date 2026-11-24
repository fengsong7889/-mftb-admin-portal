/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分，属专有代码。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState } from 'react'
import { Button, ConfigProvider, Modal } from 'antd'
import { CalculatorOutlined } from '@ant-design/icons'
import ReturnPreview from './ReturnPreview'
import type { PreviewBinding, PrototypeValues } from './prototype'
import { useTagDecayPolicy } from '../TagDecaySettings/store'

/** 与投流试算一致：只读详情仍可试算，弹窗关闭卸载且不改表单。 */
export default function SimilarTrialButton({ values, binding, columns, disabled = false }: {
  values: PrototypeValues; binding: PreviewBinding; columns?: 1 | 2; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { policy } = useTagDecayPolicy()
  return <>
    <Button type="link" size="small" disabled={disabled} aria-label="相似推薦試算" icon={<CalculatorOutlined aria-hidden />} onClick={() => setOpen(true)}>試算</Button>
    <Modal open={open} title="相似推薦試算" onCancel={() => setOpen(false)} footer={null} width={960} destroyOnClose>
      <ConfigProvider componentDisabled={false}>
        {open && <div className="traffic-trial similar-prototype__trial-modal">
          <p className="traffic-config__hint">匿名示例，不產生標籤增量或真實曝光。共用全局衰變規則 V{policy.revision}；本例使用已生效標籤，不再重複衰變。</p>
          <ReturnPreview key={policy.revision} values={values} binding={binding} columns={columns} />
        </div>}
      </ConfigProvider>
    </Modal>
  </>
}
