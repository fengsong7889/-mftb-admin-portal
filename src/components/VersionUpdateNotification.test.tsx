import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { CommitChange, VersionInfo } from '../hooks/useVersionCheck'
import VersionUpdateNotification from './VersionUpdateNotification'

/** 用例固定繁体语境：弹窗文案已接入 i18n，英文态不得残留中文 */
beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

const current: VersionInfo = {
  hash: 'ed665945',
  buildTime: '2026-10-11T13:25:36.780Z',
  changes: [],
}

function buildLatest(changes: CommitChange[]): VersionInfo {
  return { hash: 'e3f4098f', buildTime: '2026-10-12T01:58:18.000Z', changes }
}

describe('版本更新弹窗', () => {
  it('未检测到新版本时既不渲染弹窗也不渲染胶囊', () => {
    render(<VersionUpdateNotification updateAvailable={false} current={current} latest={null} />)
    expect(screen.queryByText(i18n.t('versionUpdate.title'))).toBeNull()
    expect(document.querySelector('.version-update-pill')).toBeNull()
  })

  it('检测到新版本时居中弹窗，并只列出当前版本之后的提交', () => {
    render(
      <VersionUpdateNotification
        updateAvailable
        current={current}
        latest={buildLatest([
          { hash: 'e3f4098f', subject: '考勤假勤系统独立入口' },
          { hash: 'ed665945', subject: '用车管理缺陷修复' },
          { hash: 'eea266fc', subject: '推广赠送口径收口' },
        ])}
      />,
    )

    // 居中：antd 把 ant-modal-centered 加在 .ant-modal-wrap 上
    expect(document.querySelector('.ant-modal-wrap.ant-modal-centered')).toBeTruthy()
    expect(screen.getByText(i18n.t('versionUpdate.changesTitle'))).toBeTruthy()
    expect(screen.getByText('考勤假勤系统独立入口')).toBeTruthy()
    // 当前版本及其更早的提交属于「已经看过的内容」，不得重复出现在更新清单里
    expect(screen.queryByText('用车管理缺陷修复')).toBeNull()
    expect(screen.queryByText('推广赠送口径收口')).toBeNull()
  })

  it('旧版 version.json 没有提交清单时隐藏更新内容区块，收起后保留常驻胶囊', () => {
    render(<VersionUpdateNotification updateAvailable current={current} latest={buildLatest([])} />)
    expect(screen.queryByText(i18n.t('versionUpdate.changesTitle'))).toBeNull()

    fireEvent.click(screen.getByText(i18n.t('versionUpdate.snooze')))
    // 收起后必须留下常驻胶囊，否则提示会彻底消失、用户再也找不到刷新入口
    // （弹窗本体由 antd 退场动画异步摘除，不在本用例的断言范围）
    expect(document.querySelectorAll('.version-update-pill')).toHaveLength(1)
  })
})
