package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.service.AiConversationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
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
@Tag(name = "AI 智能中心 - 会话管理", description = "AI 助手多窗口会话 CRUD 接口")
public class AiConversationController {

    private final AiConversationService conversationService;

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

    /** 更新会话（标题 / 消息 / 模型 / tokens） */
    @PutMapping("/{id}")
    @Operation(summary = "更新会话")
    public Result<Void> update(@PathVariable Long id, @RequestBody UpdateRequest req) {
        conversationService.updateConversation(id, req.getTitle(), req.getMessages(), req.getModelKey(), req.getTotalTokens());
        return Result.success();
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
    @Operation(summary = "管理员审计：分页查询所有会话")
    public Result<Page<AiConversation>> audit(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String username,
            @RequestParam(required = false) String modelKey,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(conversationService.listAllConversations(page, size, username, modelKey, startDate, endDate));
    }

    /** 获取所有已使用过的模型标识列表 */
    @GetMapping("/audit/model-keys")
    @Operation(summary = "获取所有已使用的模型标识")
    public Result<List<String>> modelKeys() {
        return Result.success(conversationService.listDistinctModelKeys());
    }

    /** 获取所有有会话的用户账号列表 */
    @GetMapping("/audit/usernames")
    @Operation(summary = "获取所有有会话的用户账号")
    public Result<List<String>> usernames() {
        return Result.success(conversationService.listDistinctUsernames());
    }

    /** 管理员查看单个会话详情（含所有状态） */
    @GetMapping("/audit/{id}")
    @Operation(summary = "管理员查看单个会话详情")
    public Result<AiConversation> auditDetail(@PathVariable Long id) {
        AiConversation conv = conversationService.getConversationForAudit(id);
        if (conv == null) {
            return Result.error(404, "会话不存在");
        }
        return Result.success(conv);
    }

    @Data
    public static class UpdateRequest {
        private String title;
        private String messages;
        private String modelKey;
        private Integer totalTokens;
    }
}
