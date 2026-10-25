/**
 * HCM 十系統 · 階段 B 界面預覽（/hcm-blueprint）
 *
 * 為什麼是獨立頁而不是後台某個菜單：階段 B 的產出物就是「十系統信息架構 + 列表/詳情/表單原型」，
 * 這些系統此刻既沒有 sys_system 行、也沒有 sys_menu 種子，掛在後台菜單裡會讓人誤以為已上線；
 * 因此走與 /app-preview 相同的獨立 Layout 分支，只能靠網址進入，全頁標註「預覽 · 未接通後端」。
 *
 * 階段 B 約束：不調接口、不寫庫、不加 i18n key（文案為繁中臨時字面量，第二階段統一換成 t()）。
 * 選中系統寫進 ?code=，方便評審時直接丟連結給 HR/產品對同一屏。
 */
import { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Collapse, Empty, Menu, Segmented, Tag } from 'antd'
import { AppstoreOutlined, ArrowLeftOutlined, ExperimentOutlined } from '@ant-design/icons'
import { renderMenuIcon } from '../../components/MenuIcon'
import {
  HCM_BLUEPRINTS,
  HCM_OPEN_QUESTIONS,
  findBlueprint,
  type HcmSystemBlueprint,
} from './blueprint'
import ListSkeleton from './ListSkeleton'
import DetailSkeleton from './DetailSkeleton'
import FormSkeleton from './FormSkeleton'
import './index.css'

type PreviewView = 'list' | 'detail' | 'form'

const VIEW_OPTIONS: Array<{ label: string; value: PreviewView }> = [
  { label: '列表頁', value: 'list' },
  { label: '詳情頁', value: 'detail' },
  { label: '新增/辦理頁', value: 'form' },
]

/** 十系統卡片：一卡一系統，點擊進入該系統骨架 */
function SystemCard({ item, onOpen }: { item: HcmSystemBlueprint; onOpen: () => void }) {
  const leafCount = item.modules.reduce((sum, group) => sum + group.leaves.length, 0)
  return (
    <button type="button" className="hcm-bp-card" onClick={onOpen} aria-label={`打開${item.name}骨架`}>
      <div className="hcm-bp-card__head">
        <div
          className="hcm-bp-card__icon"
          style={{ background: item.tone.bg, color: item.tone.color }}
        >
          {renderMenuIcon(item.icon)}
        </div>
        <Tag color={item.origin === 'existing' ? 'green' : 'blue'} style={{ marginInlineEnd: 0 }}>
          {item.origin === 'existing' ? '已在系統目錄' : '擬新增系統'}
        </Tag>
      </div>
      <div className="hcm-bp-card__name">{item.name}</div>
      <div className="hcm-bp-card__code">{item.code}</div>
      <div className="hcm-bp-card__meta">{item.modules.length} 個模塊 · {leafCount} 個頁面</div>
      <div className="hcm-bp-card__owner">{item.ownership}</div>
      <div className="hcm-bp-card__foot" style={{ color: item.tone.color }}>
        查看骨架 →
      </div>
    </button>
  )
}

/** 左側模塊樹：模塊分組即側欄一級目錄，葉子即二級菜單；階段 B 點任一葉子都只切回列表原型 */
function ModuleRail({ item, onPick }: { item: HcmSystemBlueprint; onPick: () => void }) {
  const items = useMemo(
    () => item.modules.map((group) => ({
      key: group.key,
      label: group.name,
      children: group.leaves.map((leaf) => ({ key: `${group.key}:${leaf}`, label: leaf })),
    })),
    [item.modules],
  )
  return (
    <Menu
      mode="inline"
      className="hcm-bp-rail__menu"
      defaultOpenKeys={[item.modules[0]?.key ?? '']}
      items={items}
      onClick={onPick}
    />
  )
}

export default function HcmBlueprint() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const code = params.get('code')
  const view = (params.get('view') as PreviewView | null) ?? 'list'
  const current = findBlueprint(code)

  const openSystem = useCallback((nextCode: string) => {
    setParams({ code: nextCode, view: 'list' })
  }, [setParams])

  const backToWall = useCallback(() => setParams({}), [setParams])

  const changeView = useCallback((nextView: PreviewView) => {
    if (!current) return
    setParams({ code: current.code, view: nextView })
  }, [current, setParams])

  return (
    <div className="hcm-bp">
      <div className="hcm-bp__topbar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/portal')}>返回企業門戶</Button>
        <div className="hcm-bp__title">
          <ExperimentOutlined />
          <span>HCM 十系統 · 階段 B 界面預覽</span>
        </div>
        <Tag color="orange" style={{ marginInlineEnd: 0 }}>預覽 · 未接通後端</Tag>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="本頁只交付界面骨架"
        description="不含接口、數據庫與 i18n；文案為繁中臨時字面量。示範數據僅用於評審列、字段與分組是否夠用，不代表真實員工資料。"
      />

      {!current && (
        <>
          <div className="hcm-bp__section-title">
            <AppstoreOutlined />
            <span>十個獨立業務系統</span>
            <span className="hcm-bp__section-hint">
              已存在 2 個（人事管理 / 考勤假勤），擬新增 8 個；點卡片進入該系統骨架
            </span>
          </div>
          <div className="hcm-bp__grid">
            {HCM_BLUEPRINTS.map((item) => (
              <SystemCard key={item.code} item={item} onOpen={() => openSystem(item.code)} />
            ))}
          </div>

          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'questions',
                label: `階段 B 待確認事項（${HCM_OPEN_QUESTIONS.length} 項）`,
                children: (
                  <div className="hcm-bp__questions">
                    {HCM_OPEN_QUESTIONS.map((question) => (
                      <div key={question.topic} className="hcm-bp__question">
                        <div className="hcm-bp__question-topic">{question.topic}</div>
                        <div className="hcm-bp__question-detail">{question.detail}</div>
                        <div className="hcm-bp__question-decision">暫定：{question.decision}</div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {current && (
        <div className="hcm-bp__workbench">
          <aside className="hcm-bp-rail">
            <Button size="small" onClick={backToWall} style={{ margin: '12px 12px 8px' }}>
              返回十系統
            </Button>
            <div className="hcm-bp-rail__brand">
              <div
                className="hcm-bp-rail__icon"
                style={{ background: current.tone.bg, color: current.tone.color }}
              >
                {renderMenuIcon(current.icon)}
              </div>
              <div>
                <div className="hcm-bp-rail__name">{current.name}</div>
                <div className="hcm-bp-rail__code">{current.code}</div>
              </div>
            </div>
            <ModuleRail item={current} onPick={() => changeView('list')} />
          </aside>

          <section className="hcm-bp-pane">
            <div className="hcm-bp-pane__head">
              <div>
                <div className="hcm-bp-pane__title">
                  {current.name}
                  <Tag color={current.origin === 'existing' ? 'green' : 'blue'}>
                    {current.origin === 'existing' ? '已在系統目錄' : '擬新增系統'}
                  </Tag>
                </div>
                <div className="hcm-bp-pane__sub">
                  寫入方表前綴 {current.tablePrefix} · 示範實體「{current.demo.entity}」
                </div>
              </div>
              <Segmented
                options={VIEW_OPTIONS}
                value={view}
                onChange={(next) => changeView(next as PreviewView)}
              />
            </div>

            {view === 'list' && (
              <ListSkeleton
                key={`${current.code}-list`}
                demo={current.demo}
                pageKey={`hcm-bp-${current.code}`}
              />
            )}
            {view === 'detail' && (
              <DetailSkeleton key={`${current.code}-detail`} blueprint={current} demo={current.demo} />
            )}
            {view === 'form' && (
              <FormSkeleton key={`${current.code}-form`} blueprint={current} demo={current.demo} />
            )}
          </section>
        </div>
      )}

      {!current && code && (
        <Empty style={{ marginTop: 48 }} description={`未登記的系統編碼：${code}`} />
      )}
    </div>
  )
}
