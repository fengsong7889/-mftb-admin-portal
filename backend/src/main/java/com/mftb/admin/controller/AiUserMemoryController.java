package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiUserMemory;
import com.mftb.admin.service.agent.AiPromptConfigService;
import com.mftb.admin.service.agent.AiUserMemoryService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 我的記憶（自助）：查看/新增/编辑/停用/删除自己的长期记忆。
 *
 * <p>只要求登录，不挂管理员菜单：记忆是个人数据，服务层按 user_id 隔离。
 * <p>记忆只注入 Prompt 的“偏好”一节，不能覆盖权限与安全规则。
 */
@RestController
@RequestMapping("/api/ai/memories")
@RequiredArgsConstructor
public class AiUserMemoryController {

    private final AiUserMemoryService memoryService;
    private final AiPromptConfigService promptConfigService;

    @GetMapping
    @Operation(summary = "我的記憶列表")
    public Result<List<AiUserMemory>> list() {
        return Result.success(memoryService.listMine());
    }

    @PostMapping
    @Operation(summary = "新增記憶")
    public Result<AiUserMemory> create(@RequestBody AiUserMemory body) {
        AiUserMemory saved = memoryService.create(body);
        promptConfigService.evict();
        return Result.success(saved);
    }

    @PutMapping("/{id}")
    @Operation(summary = "編輯/停用記憶")
    public Result<AiUserMemory> update(@PathVariable Long id, @RequestBody AiUserMemory body) {
        AiUserMemory saved = memoryService.update(id, body);
        promptConfigService.evict();
        return Result.success(saved);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "刪除記憶")
    public Result<Boolean> delete(@PathVariable Long id) {
        memoryService.delete(id);
        promptConfigService.evict();
        return Result.success(true);
    }
}
