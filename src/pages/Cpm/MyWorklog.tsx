/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs } from 'antd'
import WorklogGantt from './WorklogGantt'
import WorklogDayView from './WorklogDayView'

/**
 * 工作記錄（cpm-my）统一入口。
 *
 * <p>两个标签读的是同一批事实（biz_cpm_item）：台账按「工作項 × 排期」组织，
 * 日视图按「哪一天」组织。它们是同一张表的两种投影，不是两套数据——
 * 这正是用户要求打破「甘特本地 / 流水后端」双视图隔离后的形态：
 * 一份数据、两种读法，任何一边改了另一边刷新就看到。
 */
export default function MyWorklog() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('ledger')
  return (
    <div className="content-area">
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          { key: 'ledger', label: t('cpm.gantt.tab.ledger', { defaultValue: '工作台账' }), children: <WorklogGantt /> },
          { key: 'day', label: t('cpm.gantt.tab.day', { defaultValue: '日视图' }), children: <WorklogDayView /> },
        ]}
      />
    </div>
  )
}
