/**
 * `virtual:build-meta` 的类型声明。
 *
 * 该模块没有对应源文件：值由仓库根的 `vite-build-meta.ts`（buildMetaPlugin）在构建期注入，
 * vite 与 vitest 两侧都已注册同一插件，因此运行时与测试时解析到同一套常量。
 * 旧实现是把 `src/build-meta.ts` 当生成文件写回源码目录，会污染工作区并把验证档位推到全量，已废弃。
 */
declare module 'virtual:build-meta' {
  /** 构建时间戳（ISO），与产物 version.json 的 buildTime 同值 */
  export const BUILD_TIME: string
  /** 构建时所在提交的短哈希，与产物 version.json 的 commitHash 同值 */
  export const COMMIT_HASH: string
}
