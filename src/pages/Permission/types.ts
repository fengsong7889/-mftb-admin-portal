/**
 * 兼容转发：权限/菜单契约的真实位置已迁到 `src/contracts/menuPermission.ts`。
 *
 * 迁移动机（分系统独立工程改造方案 §4.1 P2 前置解环）：本文件原先被公共层
 * （contexts / components / hooks / utils / constants / api）直接 import，
 * 使「业务页面目录」反向成为共享依赖的源头——任何登录、菜单、权限相关改动都会把
 * Permission 页面整棵子树拉进编译图，按应用拆分后仍会频繁触发全量验证。
 * 契约内容因此上移到 `src/contracts/`，公共层一律改为引用契约，页面目录只保留此转发。
 *
 * 新代码请勿再引用本路径，直接 `import ... from '@mftb/contracts/menuPermission'`。
 */
export * from '@mftb/contracts/menuPermission'
