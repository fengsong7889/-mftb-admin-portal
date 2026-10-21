package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiPromptTestRunVO;
import com.mftb.admin.entity.AiCapability;
import com.mftb.admin.entity.AiGlossary;
import com.mftb.admin.entity.AiGuardRule;
import com.mftb.admin.entity.AiKnowledgeDoc;
import com.mftb.admin.entity.AiPromptProfile;
import com.mftb.admin.service.agent.AgentOrchestrationService;
import com.mftb.admin.service.agent.AiGuardrailService;
import com.mftb.admin.service.agent.AiKnowledgeService;
import com.mftb.admin.service.agent.AiPromptConfigService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * AI 助手配置中心：能力清单 / 回答骨架 / 术语口径。
 *
 * <p>权限挂 {@code ai-assistant-config}：控制“谁能改配置”；数据权限仍由各业务菜单控制。
 * <p>配置只影响“怎么说”，不影响工具启停、数据权限与安全不变量。
 */
@RestController
@RequestMapping("/api/ai/prompt-config")
@RequiredArgsConstructor
public class AiPromptConfigController {

    private static final String MENU = "ai-assistant-config";

    private final AiPromptConfigService configService;
    private final AgentOrchestrationService orchestrationService;
    private final OperatorResolver operatorResolver;
    private final AiKnowledgeService knowledgeService;
    private final AiGuardrailService guardrailService;

    /** 试跑限流：每账号每小时 10 次（内存级，单实例足够；多实例可放宽到 10×实例数） */
    private final Map<String, Deque<Long>> testRunHistory = new ConcurrentHashMap<>();

    @Data
    public static class TestRunRequest {
        private String profileKey;
        private String question;
        private boolean useTools = true;
    }

    /* ────────────────── 能力清单 ────────────────── */

    @GetMapping("/capabilities")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "能力清单列表")
    public Result<List<AiCapability>> capabilities() {
        return Result.success(configService.listCapabilities());
    }

    @PutMapping("/capabilities/{toolKey}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "保存能力清单的 prompt 元数据")
    public Result<AiCapability> saveCapability(@PathVariable String toolKey,
                                               @RequestBody AiCapability body) {
        body.setToolKey(toolKey);
        return Result.success(configService.saveCapability(body));
    }

    /* ────────────────── 回答骨架 ────────────────── */

    @GetMapping("/profiles")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "回答骨架列表（含版本历史）")
    public Result<List<AiPromptProfile>> profiles() {
        return Result.success(configService.listProfiles());
    }

    @PostMapping("/profiles/draft")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "保存回答骨架草稿")
    public Result<AiPromptProfile> saveDraft(@RequestBody AiPromptProfile body) {
        return Result.success(configService.saveDraft(body));
    }

    @PostMapping("/profiles/{profileKey}/publish")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "发布回答骨架草稿")
    public Result<AiPromptProfile> publish(@PathVariable String profileKey) {
        return Result.success(configService.publish(profileKey));
    }

    @PostMapping("/profiles/{profileKey}/rollback/{version}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "回滚回答骨架到指定版本")
    public Result<AiPromptProfile> rollback(@PathVariable String profileKey, @PathVariable int version) {
        return Result.success(configService.rollback(profileKey, version));
    }

    /* ────────────────── 术语与口径 ────────────────── */

    @GetMapping("/glossary")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "术语与口径列表")
    public Result<List<AiGlossary>> glossary(@RequestParam(required = false) String domain,
                                             @RequestParam(required = false) String keyword) {
        return Result.success(configService.listGlossary(domain, keyword));
    }

    @PostMapping("/glossary")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增或保存术语/口径")
    public Result<AiGlossary> saveGlossary(@RequestBody AiGlossary body) {
        return Result.success(configService.saveGlossary(body));
    }

    @DeleteMapping("/glossary/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "删除术语/口径")
    public Result<Boolean> deleteGlossary(@PathVariable Long id) {
        configService.deleteGlossary(id);
        return Result.success(true);
    }

    /* ────────────────── 提示词试跑 ────────────────── */

    /**
     * 用“草稿配置”组装 Prompt，并在 sandbox 里跑一轮问答：
     * 不写会话、不暴露外部工具与推送工具；限流 10 次/小时/账号。
     */
    @PostMapping("/test-run")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "提示詞草稿試跑（sandbox）")
    public Result<AiPromptTestRunVO> testRun(@RequestBody TestRunRequest body) {
        if (body == null || !StringUtils.hasText(body.getQuestion())) {
            throw new BusinessException("請輸入示例問題");
        }
        String account = operatorResolver.currentOperatorAccount();
        checkTestRunRate(account);
        String sections = configService.previewPrompt(body.getProfileKey());
        String prompt = AgentOrchestrationService.basePrompt()
                + (StringUtils.hasText(sections) ? sections + "\n\n" : "")
                + AgentOrchestrationService.safetyRules();

        AgentOrchestrationService.OrchestrateRequest req = new AgentOrchestrationService.OrchestrateRequest();
        req.setMessages(List.of(Map.of("role", "user", "content", body.getQuestion().trim())));
        req.setSystemPromptOverride(prompt);
        req.setSandbox(true);
        req.setDisableTools(!body.isUseTools());
        req.setMode("auto");
        AgentOrchestrationService.OrchestrateResult result = orchestrationService.orchestrate(req, account);

        AiPromptTestRunVO vo = new AiPromptTestRunVO();
        vo.setPrompt(prompt);
        vo.setText(result.getText());
        vo.setModel(result.getModel());
        vo.setTokens(result.getTokens());
        vo.setErrorKind(result.getErrorKind());
        List<Map<String, Object>> traces = new ArrayList<>();
        for (AgentOrchestrationService.ToolTrace t : result.getTraces()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("toolKey", t.getToolKey());
            item.put("elapsedMs", t.getElapsedMs());
            item.put("success", t.isSuccess());
            traces.add(item);
        }
        vo.setTraces(traces);
        return Result.success(vo);
    }

    /* ────────────────── 知识库（RAG） ────────────────── */

    @GetMapping("/knowledge")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "知識庫文檔列表")
    public Result<List<AiKnowledgeDoc>> knowledgeList(@RequestParam(required = false) String keyword,
                                                      @RequestParam(required = false) String systemCode) {
        return Result.success(knowledgeService.list(keyword, systemCode));
    }

    @GetMapping("/knowledge/{id}")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "知識庫文檔詳情")
    public Result<AiKnowledgeDoc> knowledgeDetail(@PathVariable Long id) {
        return Result.success(knowledgeService.get(id));
    }

    @PostMapping("/knowledge")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增/保存知識庫文檔（自動重建分塊）")
    public Result<AiKnowledgeDoc> saveKnowledge(@RequestBody AiKnowledgeDoc body) {
        return Result.success(knowledgeService.save(body, operatorResolver.currentOperatorName()));
    }

    @PutMapping("/knowledge/{id}/status")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "啟用/停用知識庫文檔")
    public Result<AiKnowledgeDoc> knowledgeStatus(@PathVariable Long id, @RequestParam String status) {
        return Result.success(knowledgeService.setStatus(id, status));
    }

    @PostMapping("/knowledge/{id}/rebuild")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "重建知識庫分塊")
    public Result<Map<String, Object>> rebuildKnowledge(@PathVariable Long id) {
        int chunks = knowledgeService.rebuild(id);
        return Result.success(Map.of("chunks", chunks));
    }

    @DeleteMapping("/knowledge/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "刪除知識庫文檔")
    public Result<Void> deleteKnowledge(@PathVariable Long id) {
        knowledgeService.delete(id);
        return Result.success(null);
    }

    @GetMapping("/knowledge/search")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "知識庫檢索（配置頁試搜）")
    public Result<List<AiKnowledgeService.KnowledgeHit>> searchKnowledge(
            @RequestParam String query,
            @RequestParam(required = false) String systemCode,
            @RequestParam(defaultValue = "5") int limit) {
        return Result.success(knowledgeService.search(query, systemCode, limit));
    }

    /* ────────────────── 輸入/輸出護欄 ────────────────── */

    @GetMapping("/guardrails")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "護欄規則列表")
    public Result<List<AiGuardRule>> guardrails() {
        return Result.success(guardrailService.listRules());
    }

    @PostMapping("/guardrails")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "新增/保存護欄規則")
    public Result<AiGuardRule> saveGuardrail(@RequestBody AiGuardRule body) {
        return Result.success(guardrailService.saveRule(body, operatorResolver.currentOperatorName()));
    }

    @DeleteMapping("/guardrails/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "刪除護欄規則")
    public Result<Void> deleteGuardrail(@PathVariable Long id) {
        guardrailService.deleteRule(id);
        return Result.success(null);
    }

    private void checkTestRunRate(String account) {
        long now = System.currentTimeMillis();
        Deque<Long> history = testRunHistory.computeIfAbsent(
                StringUtils.hasText(account) ? account : "anonymous", k -> new ArrayDeque<>());
        synchronized (history) {
            while (!history.isEmpty() && now - history.peekFirst() > 3_600_000L) {
                history.pollFirst();
            }
            if (history.size() >= 10) {
                throw new BusinessException("試跑過於頻繁（每小時最多 10 次），請稍後再試");
            }
            history.addLast(now);
        }
    }
}
