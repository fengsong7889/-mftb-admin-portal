/**
 * 兼容转发：流程配置契约的真实位置已迁到 `src/contracts/workflowConfig.ts`。
 *
 * 迁移动机同 `src/pages/Permission/types.ts`：`hooks/useWorkflowConfig`、
 * `utils/resolveCurrentApprover`、`utils/workflowEnabled`、`constants/defaultWorkflows`
 * 这些公共层文件原先直接 import 本页面目录下的类型，使 OA 流程配置页面成为公共依赖源头。
 * 契约上移后，公共层一律引用 `@mftb/contracts/workflowConfig`。
 */
export * from '@mftb/contracts/workflowConfig'
