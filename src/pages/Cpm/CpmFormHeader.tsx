/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import './cpm.css'

/**
 * CPM 表单页统一头部（form-page-style §2：橙色渐变顶条 + 返回 + 蓝色标题）。
 * 为什么抽组件：本系统有 3 个表单页（条目编辑/模板编辑/汇报规则），
 * 头部模板若逐页复制，规范微调就要改三处（历史上样式漂移的主要来源）。
 */
export default function CpmFormHeader({ title }: { title: string }) {
  const navigate = useNavigate()
  return (
    <div className="cpm-header">
      <div className="cpm-header__accent" />
      <div className="cpm-header__body">
        <div className="cpm-header__left">
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ backgroundColor: 'var(--brand)', borderColor: 'var(--brand)', borderRadius: 8, height: 36, padding: '0 16px' }}
          >返回</Button>
          <div className="cpm-header__split" />
          <h2 className="cpm-header__title">{title}</h2>
        </div>
      </div>
    </div>
  )
}
