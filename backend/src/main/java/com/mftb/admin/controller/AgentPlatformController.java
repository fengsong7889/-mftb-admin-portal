package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.platform.AgentRunService;
import com.mftb.admin.service.agent.platform.AiActionProposalService;
import com.mftb.admin.service.agent.platform.AiApplicationService;
import com.mftb.admin.service.agent.platform.AiBudgetPoolService;
import com.mftb.admin.service.agent.platform.AiDataPolicyService;
import com.mftb.admin.service.agent.platform.AiKnowledgeAclService;
import com.mftb.admin.service.agent.platform.AiPlatformOpsService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 企业 Agent 平台控制面：应用/预算/提案/知识 ACL/数据分级与端点批准/运行/评测/运营。
 *
 * <p>权限锚点：
 * <ul>
 *   <li>应用、预算、数据分级、端点批准、评测：AI 管理侧配置菜单（{@code ai-operation-auth} / {@code ai-conversation-audit}）；</li>
 *   <li>提案与运行：本人接口只校验登录身份与归属，不做跨人查询；管理视角需审计菜单；</li>
 *   <li>知识 ACL 维护：知识库菜单 edit；试算与解释：本人 + 对应菜单 view。</li>
 * </ul>
 * 写入接口一律由服务层再做范围/状态校验，前端隐藏按钮不构成安全边界。
 */
@Slf4j
@RestController
@RequestMapping("/api/agent/platform")
@RequiredArgsConstructor
public class AgentPlatformController {

    private static final String MENU_OPERATION = "ai-operation-auth";
    private static final String MENU_AUDIT = "ai-conversation-audit";
    private static final String MENU_KNOWLEDGE = "ai-assistant-knowledge";

    private final AiApplicationService applications;
    private final AiBudgetPoolService budgetPools;
    private final AiActionProposalService proposals;
    private final AiKnowledgeAclService knowledgeAcl;
    private final AiDataPolicyService dataPolicy;
    private final AgentRunService runs;
    private final AiPlatformOpsService ops;
    private final com.mftb.admin.service.agent.platform.AgentActionExecutionService actionExecution;
    private final OperatorResolver operatorResolver;
    /** 个人接口也必须先具备 AI 系统准入，避免任意业务系统账号调用控制面。 */
    private final com.mftb.admin.service.PermissionService permissionService;

    /* ────────────────── WP04 应用与版本 ────────────────── */

    @GetMapping("/applications")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "应用列表")
    public Result<List<Map<String, Object>>> applications(@RequestParam(required = false) String keyword) {
        return Result.success(applications.list(keyword));
    }

    @GetMapping("/applications/{appKey}")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "应用详情（含版本）")
    public Result<Map<String, Object>> application(@PathVariable String appKey) {
        return Result.success(applications.one(appKey));
    }

    @PostMapping("/applications")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "登记/更新应用")
    public Result<Map<String, Object>> saveApplication(@RequestBody Map<String, Object> body) {
        return Result.success(applications.save(body, operator()));
    }

    @PostMapping("/applications/{appKey}/versions")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "创建草稿版本（工具白名单/知识范围/预算范围）")
    public Result<Map<String, Object>> createVersion(@PathVariable String appKey,
                                                      @RequestBody Map<String, Object> body) {
        return Result.success(applications.createVersion(appKey, body, operator()));
    }

    @PostMapping("/applications/{appKey}/versions/{versionNo}/publish")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "发布版本并冻结快照")
    public Result<Map<String, Object>> publish(@PathVariable String appKey, @PathVariable Integer versionNo,
                                                @RequestParam(required = false) String note) {
        return Result.success(applications.publish(appKey, versionNo, operator(), note));
    }

    @PostMapping("/applications/{appKey}/versions/{versionNo}/rollback")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "回滚到指定已发布版本")
    public Result<Map<String, Object>> rollback(@PathVariable String appKey, @PathVariable Integer versionNo,
                                                 @RequestParam(required = false) String note) {
        return Result.success(applications.rollback(appKey, versionNo, operator(), note));
    }

    @GetMapping("/releases")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "发布快照列表（含回滚标记）")
    public Result<List<Map<String, Object>>> releases(@RequestParam(required = false) String appKey) {
        return Result.success(applications.releases(appKey));
    }

    /* ────────────────── WP05 预算池 ────────────────── */

    @GetMapping("/budget-pools")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "预算池列表（含已用/已预占）")
    public Result<List<Map<String, Object>>> budgetPools(@RequestParam(required = false) String scopeType) {
        return Result.success(budgetPools.list(scopeType));
    }

    @PostMapping("/budget-pools")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "设置预算池（并发下为硬上限）")
    public Result<Map<String, Object>> saveBudgetPool(@RequestBody Map<String, Object> body) {
        return Result.success(budgetPools.save(body, operator()));
    }

    /* ────────────────── WP07 动作提案 ────────────────── */

    @GetMapping("/actions")
    @RequirePermission(menu = MENU_AUDIT, action = "view")
    @Operation(summary = "提案列表（管理视角）")
    public Result<List<Map<String, Object>>> actions(@RequestParam(required = false) String requester,
                                                      @RequestParam(required = false) String status) {
        return Result.success(proposals.list(requester, status));
    }

    @GetMapping("/actions/{proposalNo}")
    @Operation(summary = "提案详情（本人或审计权限）")
    public Result<Map<String, Object>> action(@PathVariable String proposalNo) {
        requireAiUser();
        Map<String, Object> row = proposals.get(proposalNo);
        if (!operator().equals(row.get("requester"))) {
            throw new BusinessException(403, "只能查看本人的動作提案");
        }
        return Result.success(row);
    }

    @PostMapping("/actions")
    @Operation(summary = "生成动作提案（冻结参数，不执行）")
    public Result<Map<String, Object>> prepareAction(@RequestBody Map<String, Object> body) {
        requireAiUser();
        Map<String, Object> params = asMap(body.get("params"));
        return Result.success(proposals.prepare(
                text(body.get("toolKey")), params, operator(),
                text(body.get("targetResource")), text(body.get("targetVersion")),
                text(body.get("impactSummary")), intOrNull(body.get("ttlMinutes"))));
    }

    @PostMapping("/actions/{proposalNo}/approve")
    @RequirePermission(menu = MENU_AUDIT, action = "edit")
    @Operation(summary = "登记审批通过（审批事实仍以 OA 为准）")
    public Result<Map<String, Object>> approveAction(@PathVariable String proposalNo,
                                                      @RequestBody Map<String, Object> body) {
        return Result.success(proposals.approve(proposalNo, text(body.get("approvalRef")), operator()));
    }

    @PostMapping("/actions/{proposalNo}/reject")
    @RequirePermission(menu = MENU_AUDIT, action = "edit")
    @Operation(summary = "驳回提案")
    public Result<Map<String, Object>> rejectAction(@PathVariable String proposalNo,
                                                     @RequestBody Map<String, Object> body) {
        return Result.success(proposals.reject(proposalNo, text(body.get("reason")), operator()));
    }

    @PostMapping("/actions/{proposalNo}/execute")
    @Operation(summary = "执行已审批的内建工具提案（参数取冻结值，一次性消费）")
    public Result<Map<String, Object>> executeAction(@PathVariable String proposalNo) {
        requireAiUser();
        return Result.success(actionExecution.executeApproved(proposalNo, operator()));
    }

    @PostMapping("/actions/{proposalNo}/receipt")
    @Operation(summary = "记录执行回执（外部可能已成功时用 unknown，禁止盲目重发）")
    public Result<Map<String, Object>> recordReceipt(@PathVariable String proposalNo,
                                                      @RequestBody Map<String, Object> body) {
        requireAiUser();
        Map<String, Object> proposal = proposals.get(proposalNo);
        if (!operator().equals(proposal.get("requester"))) throw new BusinessException(403, "只能記錄本人提案的回執");
        long id = ((Number) proposal.get("id")).longValue();
        proposals.recordReceipt(id, text(body.get("status")), text(body.get("externalRef")),
                text(body.get("detail")), text(body.get("payloadDigest")));
        return Result.success(proposals.get(proposalNo));
    }

    @PostMapping("/actions/{proposalNo}/reconcile")
    @RequirePermission(menu = MENU_AUDIT, action = "edit")
    @Operation(summary = "人工对账 UNKNOWN 结果")
    public Result<Map<String, Object>> reconcileAction(@PathVariable String proposalNo,
                                                        @RequestBody Map<String, Object> body) {
        proposals.reconcile(proposalNo, Boolean.TRUE.equals(body.get("delivered")), text(body.get("detail")));
        return Result.success(proposals.get(proposalNo));
    }

    /* ────────────────── WP08 知识 ACL ────────────────── */

    @GetMapping("/knowledge/{docId}/acl")
    @RequirePermission(menu = MENU_KNOWLEDGE, action = "view")
    @Operation(summary = "文档 ACL 列表")
    public Result<List<Map<String, Object>>> knowledgeAcl(@PathVariable Long docId) {
        return Result.success(knowledgeAcl.list(docId));
    }

    @PostMapping("/knowledge/{docId}/acl")
    @RequirePermission(menu = MENU_KNOWLEDGE, action = "edit")
    @Operation(summary = "授予文档读取权限（USER/DEPT/ROLE/ROLE_CODE）")
    public Result<Void> grantKnowledge(@PathVariable Long docId, @RequestBody Map<String, Object> body) {
        knowledgeAcl.grant(docId, text(body.get("subjectType")), text(body.get("subjectId")), operator());
        return Result.success(null);
    }

    @DeleteMapping("/knowledge/{docId}/acl")
    @RequirePermission(menu = MENU_KNOWLEDGE, action = "edit")
    @Operation(summary = "撤销文档读取权限（立即生效）")
    public Result<Void> revokeKnowledge(@PathVariable Long docId,
                                        @RequestParam String subjectType, @RequestParam String subjectId) {
        knowledgeAcl.revoke(docId, subjectType, subjectId);
        return Result.success(null);
    }

    /* ────────────────── 数据分级与端点批准 ────────────────── */

    @GetMapping("/data-policies")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "系统数据分级列表")
    public Result<List<Map<String, Object>>> dataPolicies() {
        return Result.success(dataPolicy.listSystemPolicies());
    }

    @PostMapping("/data-policies")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "登记/修改系统数据分级")
    public Result<Map<String, Object>> saveDataPolicy(@RequestBody Map<String, Object> body) {
        return Result.success(dataPolicy.saveSystemPolicy(text(body.get("systemCode")),
                text(body.get("dataClass")), text(body.get("note")), operator()));
    }

    @GetMapping("/endpoints")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "模型端点批准列表")
    public Result<List<Map<String, Object>>> endpoints() {
        return Result.success(dataPolicy.listEndpoints());
    }

    @PostMapping("/endpoints")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "批准模型端点可接收的数据等级（需到期时间）")
    public Result<Map<String, Object>> approveEndpoint(@RequestBody Map<String, Object> body) {
        return Result.success(dataPolicy.approveEndpoint(text(body.get("modelKey")),
                text(body.get("maxDataClass")), text(body.get("residency")),
                intOrNull(body.get("days")), text(body.get("note")), operator()));
    }

    @DeleteMapping("/endpoints/{modelKey}")
    @RequirePermission(menu = MENU_OPERATION, action = "edit")
    @Operation(summary = "撤销端点批准")
    public Result<Void> revokeEndpoint(@PathVariable String modelKey) {
        dataPolicy.revokeEndpoint(modelKey);
        return Result.success(null);
    }

    /* ────────────────── WP09 试算 ────────────────── */

    @PostMapping("/policies/evaluate")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "规则试算：不调模型、不扣费")
    public Result<Map<String, Object>> evaluatePolicy(@RequestBody Map<String, Object> body) {
        return Result.success(ops.evaluatePolicy(text(body.get("systemCode")), text(body.get("modelKey"))));
    }

    /* ────────────────── WP06 运行 ────────────────── */

    @PostMapping("/runs")
    @Operation(summary = "受理运行（幂等键，受理即持久化）")
    public Result<Map<String, Object>> createRun(@RequestBody Map<String, Object> body) {
        requireAiUser();
        return Result.success(runs.create(operator(), text(body.get("systemCode")), text(body.get("appKey")),
                intOrNull(body.get("appVersion")), longOrNull(body.get("conversationPk")),
                asMap(body.get("input")), text(body.get("idempotencyKey"))));
    }

    @GetMapping("/runs")
    @Operation(summary = "我的运行列表")
    public Result<List<Map<String, Object>>> listRuns(@RequestParam(required = false) String status) {
        requireAiUser();
        return Result.success(runs.list(operator(), status));
    }

    @GetMapping("/runs/{runNo}")
    @Operation(summary = "运行详情与步骤")
    public Result<Map<String, Object>> getRun(@PathVariable String runNo) {
        requireAiUser();
        return Result.success(runs.get(runNo, operator()));
    }

    @PostMapping("/runs/{runNo}/cancel")
    @Operation(summary = "取消运行（不撤销已完成的外部动作）")
    public Result<Map<String, Object>> cancelRun(@PathVariable String runNo) {
        requireAiUser();
        return Result.success(runs.cancel(runNo, operator()));
    }

    /* ────────────────── WP10/WP11 评测与运营 ────────────────── */

    @GetMapping("/eval/cases")
    @RequirePermission(menu = MENU_AUDIT, action = "view")
    @Operation(summary = "评测用例列表")
    public Result<List<Map<String, Object>>> evalCases(@RequestParam(required = false) String datasetKey) {
        return Result.success(ops.listCases(datasetKey));
    }

    @PostMapping("/eval/cases")
    @RequirePermission(menu = MENU_AUDIT, action = "edit")
    @Operation(summary = "保存评测用例")
    public Result<Map<String, Object>> saveEvalCase(@RequestBody Map<String, Object> body) {
        return Result.success(ops.saveCase(body, operator()));
    }

    @PostMapping("/eval/run")
    @RequirePermission(menu = MENU_AUDIT, action = "edit")
    @Operation(summary = "按数据集运行策略回归（不调模型）")
    public Result<Map<String, Object>> runEval(@RequestBody Map<String, Object> body) {
        return Result.success(ops.runDataset(text(body.get("datasetKey")), text(body.get("appKey")), operator()));
    }

    @GetMapping("/eval/runs")
    @RequirePermission(menu = MENU_AUDIT, action = "view")
    @Operation(summary = "评测历史")
    public Result<List<Map<String, Object>>> evalRuns(@RequestParam(required = false) String datasetKey) {
        return Result.success(ops.listRuns(datasetKey));
    }

    @GetMapping("/ops/readiness")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "上线就绪：分级/端点/知识 ACL/已发布应用统计与阻断项")
    public Result<Map<String, Object>> opsReadiness() {
        return Result.success(ops.readiness());
    }

    @GetMapping("/ops/summary")
    @RequirePermission(menu = MENU_OPERATION, action = "view")
    @Operation(summary = "运行/提案/拒绝/预算与待对账汇总")
    public Result<Map<String, Object>> opsSummary() {
        return Result.success(ops.summary());
    }

    private void requireAiUser() {
        var user = operatorResolver.currentUser();
        if (user == null || !permissionService.hasSystemAccess(user, "ai")) {
            throw new BusinessException(403, "無權使用 AI 平台功能");
        }
    }

    private String operator() {
        String account = operatorResolver.currentOperatorAccount();
        if (account == null) throw new BusinessException(401, "登入身分不可用");
        return account;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private static String text(Object v) { return v == null ? null : String.valueOf(v).trim(); }

    private static Integer intOrNull(Object v) {
        if (v instanceof Number n) return n.intValue();
        String s = text(v);
        return s != null && s.matches("-?\\d{1,9}") ? Integer.valueOf(s) : null;
    }

    private static Long longOrNull(Object v) {
        if (v instanceof Number n) return n.longValue();
        String s = text(v);
        return s != null && s.matches("\\d{1,19}") ? Long.valueOf(s) : null;
    }
}
