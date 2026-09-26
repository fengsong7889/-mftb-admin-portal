/**
 * 门户顶栏（Round 2）。
 *
 * 场景：/portal 路径下不注入 Sidebar/MenuTabs，但仍需要品牌区 + 基础用户操作。
 * 本组件保持极小：品牌 Logo + 企业门户标题 + 基础用户操作，不展示业务系统名。
 *
 * 与 HeaderBar 分离的原因：门户页无侧边栏折叠按钮、也无系统内切换需求；
 * 强行复用 HeaderBar 会引入 Sidebar 状态依赖，让 App.tsx 的分支渲染复杂化。
 * 用户头像/通知/语言等在进入系统后使用 HeaderBar 完整版即可。
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Layout, Button, Empty, Select, Spin } from 'antd'
import { GlobalOutlined, LogoutOutlined, TranslationOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import BrandLogo from './BrandLogo'
import { useAuth } from '../contexts/AuthContext'
import { changeAppLanguage, ensureLanguageBundle } from '../i18n'
import { fetchLanguages, LANGUAGES_CHANGED_EVENT, type LanguageVO } from '../api/translation'
import { COUNTRY_INFO, countrySysName, getCountryOfLanguage, LANG_INFO } from '../utils/translationConfig'
import './PortalTopBar.css'

const { Header } = Layout

/** 门户和所有业务系统共用选择器，语言列表只认翻译系统返回的已启用语言。 */
export function PortalLocaleControls() {
  const { t, i18n } = useTranslation()
  const controlId = useId()
  const [languages, setLanguages] = useState<LanguageVO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const requestId = useRef(0)
  const [country, setCountry] = useState(() => {
    const saved = localStorage.getItem('selected_country')
    if (saved && COUNTRY_INFO[saved]) return saved
    return saved && LANG_INFO[saved] ? getCountryOfLanguage(saved) : 'usa'
  })
  const countryOptions = Object.entries(COUNTRY_INFO).map(([code, info]) => ({
    value: code,
    label: `${info.flag} ${countrySysName(code, i18n.language)}`,
  }))
  const languageOptions = languages.map(lang => ({ value: lang.code, label: lang.name || lang.code }))

  const handleLanguageChange = useCallback(async (lang: string) => {
    // 先同步选择，异步语言包返回时不得覆盖用户后续选择或阻塞系统导航。
    changeAppLanguage(lang)
    await ensureLanguageBundle(lang)
    if (i18n.language === lang) await i18n.changeLanguage(lang)
  }, [i18n])

  const fetchConfiguredLanguages = useCallback(async () => {
    const ticket = ++requestId.current
    setLoading(true)
    setLoadError(false)
    try {
      const configured = await fetchLanguages()
      if (ticket !== requestId.current) return
      // 接口不可用时不补入本地默认语言，避免显示未配置项。
      setLanguages(configured ?? [])
      setLoadError(configured === null)
      if (configured?.length && !configured.some(lang => lang.code === i18n.language)) {
        const fallback = configured.find(lang => lang.code === 'en') ?? configured[0]
        void handleLanguageChange(fallback.code)
      }
    } catch {
      if (ticket !== requestId.current) return
      setLanguages([])
      setLoadError(true)
    } finally {
      if (ticket === requestId.current) setLoading(false)
    }
  }, [handleLanguageChange, i18n])

  useEffect(() => {
    void fetchConfiguredLanguages()
    const handleRefresh = () => { void fetchConfiguredLanguages() }
    window.addEventListener(LANGUAGES_CHANGED_EVENT, handleRefresh)
    return () => {
      requestId.current += 1
      window.removeEventListener(LANGUAGES_CHANGED_EVENT, handleRefresh)
    }
  }, [fetchConfiguredLanguages])

  const handleCountryChange = (value: string) => {
    setCountry(value)
    localStorage.setItem('selected_country', value)
    window.dispatchEvent(new CustomEvent('countryChange', { detail: value }))
  }

  return (
    <div className="portal-locale-controls">
      <div className="portal-locale-field">
        <label htmlFor={`${controlId}-country`}><GlobalOutlined aria-hidden="true" />{t('portal.country')}</label>
        <Select
          id={`${controlId}-country`}
          aria-label={t('portal.country')}
          value={country}
          onChange={handleCountryChange}
          options={countryOptions}
          showSearch
          optionFilterProp="label"
          popupMatchSelectWidth={false}
          className="portal-country-select"
        />
      </div>
      <div className="portal-locale-field">
        <label htmlFor={`${controlId}-language`}><TranslationOutlined aria-hidden="true" />{t('portal.language')}</label>
        <Select
          id={`${controlId}-language`}
          aria-label={t('portal.language')}
          value={languages.find(lang => lang.code === i18n.language)?.code}
          placeholder={t('portal.language')}
          onChange={handleLanguageChange}
          options={languageOptions}
          loading={loading}
          onOpenChange={open => { if (open) void fetchConfiguredLanguages() }}
          notFoundContent={loading ? <Spin size="small" /> : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(loadError ? 'header.languagesLoadError' : 'header.noLanguages')} />
          )}
          popupMatchSelectWidth={false}
          className="portal-language-select"
        />
      </div>
    </div>
  )
}

export default function PortalTopBar() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

  return (
    <Header className="portal-top-bar">
      <div className="portal-top-bar-inner">
        <div className="portal-top-bar-left">
          <span aria-hidden="true"><BrandLogo size={30} /></span>
          <span className="portal-top-bar-title">{t('portal.title', '企業門戶')}</span>
        </div>
        <div className="portal-top-bar-right">
          <PortalLocaleControls />
          <div className="portal-user-controls">
            {user?.name ? (
              <span className="portal-top-bar-user">
                <span className="portal-top-bar-avatar" aria-hidden="true">{user.name.trim().charAt(0)}</span>
                <span className="portal-top-bar-user-name">{user.name}</span>
              </span>
            ) : null}
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => void logout()}
              className="portal-top-bar-logout"
            >
              {t('portal.logout')}
            </Button>
          </div>
        </div>
      </div>
    </Header>
  )
}
