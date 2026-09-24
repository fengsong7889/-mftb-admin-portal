package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.entity.AiConversationEvent;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.AiConversationService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * AI 助手会话控制器
 * 管理用户的多轮对话历史，支持多窗口会话 CRUD
 */
@RestController
@RequestMapping("/api/ai/conversations")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "AI 智能中心 - 会话管理", description = "AI 助手多窗口会话 CRUD 接口")
public class AiConversationController {

    /** V0 §B.6：PUT messages 上限，防止客户端无节制写入塑入不确定的历史。 */
    private static final int MAX_MESSAGES = 200;
    private static final int MAX_SINGLE_MESSAGE_BYTES = 32 * 1024;
    private static final int MAX_TOTAL_MESSAGES_BYTES = 1024 * 1024;

    private final AiConversationService conversationService;
    private final AiConversationEventService eventService;
    private final ObjectMapper objectMapper;

    /** 列出当前用户所有会话（按更新时间倒序） */
    @GetMapping
    @Operation(summary = "列出我的所有会话")
    public Result<List<AiConversation>> list() {
        return Result.success(conversationService.listMyConversations());
    }

    /** 新建会话 */
    @PostMapping
    @Operation(summary = "新建会话")
    public Result<AiConversation> create() {
        return Result.success(conversationService.createConversation());
    }

    /** 更新会话（标题 / 消息 / 模型 / tokens）；V0 §B.6 新增 messages 长度/条数上限 */
    @PutMapping("/{id}")
    @Operation(summary = "更新会话")
    public Result<Void> update(@PathVariable Long id, @RequestBody UpdateRequest req) {
        validateMessages(req.getMessages());
        conversationService.updateConversation(id, req.getTitle(), req.getMessages(), req.getModelKey(), req.getTotalTokens());
        return Result.success();
    }

    /** messages JSON 上限：条数≤200，单条≤32KB，总长≤1MB；防止客户端无节制写入 */
    private void validateMessages(String messages) {
        if (messages == null || messages.isEmpty() || "[]".equals(messages)) return;
        if (messages.length() > MAX_TOTAL_MESSAGES_BYTES) {
            throw new IllegalArgumentException("会话消息总长度超限（≤ 1MB）");
        }
        try {
            List<Map<String, Object>> rows = objectMapper.readValue(messages, new TypeReference<>() {});
            if (rows.size() > MAX_MESSAGES) {
                throw new IllegalArgumentException("会话消息条数超限（≤ " + MAX_MESSAGES + "）");
            }
            for (Map<String, Object> row : rows) {
                Object content = row.get("content");
                if (content != null && content.toString().length() > MAX_SINGLE_MESSAGE_BYTES) {
                    throw new IllegalArgumentException("单条消息长度超限（≤ 32KB）");
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("会话消息 JSON 解析失败，仅依赖总长度校验: {}", e.getMessage());
        }
    }

    /** 删除指定会话（移至回收站） */
    @DeleteMapping("/{id}")
    @Operation(summary = "删除会话（移至回收站）")
    public Result<Void> delete(@PathVariable Long id) {
        conversationService.deleteConversation(id);
        return Result.success();
    }

    /** 获取最大会话数配置 */
    @GetMapping("/max")
    @Operation(summary = "获取最大会话数")
    public Result<Map<String, Integer>> max() {
        return Result.success(Map.of("max", conversationService.getMaxConversations()));
    }

    /* ── 回收站接口 ── */

    /** 列出我已删除的会话（回收站） */
    @GetMapping("/deleted")
    @Operation(summary = "列出回收站中的会话")
    public Result<List<AiConversation>> deleted() {
        return Result.success(conversationService.listDeletedConversations());
    }

    /** 恢复已删除的会话 */
    @PostMapping("/{id}/restore")
    @Operation(summary = "恢复已删除的会话")
    public Result<Void> restore(@PathVariable Long id) {
        conversationService.restoreConversation(id);
        return Result.success();
    }

    /** 永久删除已删除的会话 */
    @DeleteMapping("/{id}/permanent")
    @Operation(summary = "永久删除会话")
    public Result<Void> permanentDelete(@PathVariable Long id) {
        conversationService.permanentDeleteConversation(id);
        return Result.success();
    }

    /* ── 管理员审计接口 ── */

    /** 管理员分页查询所有会话 */
    @GetMapping("/audit")
    @RequirePermission(menu = "ai-conversation-audit")
    @Operation(summary = "管理员审计：分页查询所有会话")
    public Result<Page<AiConversation>> audit(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String modelKey,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String createStartDate,
            @RequestParam(required = false) String createEndDate,
            @RequestParam(required = false) String updateStartDate,
            @RequestParam(required = false) String updateEndDate) {
        return Result.success(conversationService.listAllConversations(page, size, keyword, modelKey,
                status, createStartDate, createEndDate, updateStartDate, updateEndDate));
    }

    /** 获取所有已使用过的模型标识列表 */
    @GetMapping("/audit/model-keys")
    @RequirePermission(menu = "ai-conversation-audit")
    @Operation(summary = "获取所有已使用的模型标识")
    public Result<List<String>> modelKeys() {
        return Result.success(conversationService.listDistinctModelKeys());
    }

    /** 管理员查看单个会话详情（含所有状态，含员工姓名） */
    @GetMapping("/audit/{id}")
    @RequirePermission(menu = "ai-conversation-audit")
    @Operation(summary = "管理员查看单个会话详情")
    public Result<AiConversation> auditDetail(@PathVariable Long id) {
        AiConversation conv = conversationService.getConversationForAudit(id);
        if (conv == null) {
            return Result.error(404, "會話不存在");
        }
        return Result.success(conv);
    }

    /** V0 §B.6：服务端追加的运行事件（不可篡改），审计详情页使用。 */
    @GetMapping("/audit/{id}/events")
    @RequirePermission(menu = "ai-conversation-audit")
    @Operation(summary = "审计：读取会话服务端执行事件")
    public Result<List<AiConversationEvent>> auditEvents(@PathVariable Long id,
                                                          @RequestParam(defaultValue = "200") int limit) {
        return Result.success(eventService.listByConversation(id, limit));
    }

    @Data
    public static class UpdateRequest {
        private String title;
        private String messages;
        private String modelKey;
        private Integer totalTokens;
    }
}
