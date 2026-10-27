/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /**
   * 按应用构建的作用域（方案 §4.1/§4.2）。为空 = 整站构建；
   * 取值 rdm/eam/hr 时只注册该应用的路由，供 `npm run build:apps` 产出 dist-apps/<app>。
   */
  readonly VITE_APP_SCOPE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
