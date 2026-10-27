package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiQuickPrompt;
import com.mftb.admin.service.agent.AiQuickPromptService;
import com.mftb.admin.service.agent.AiScopeGuard;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 快捷提问：配置页维护（view/edit）+ 首页读取（登录即可）。
 *
 * <p>首页接口不带菜单权限：快捷提问本身就是给全员用的入口，只按 system_code/role_code 收敛；
 * 维护接口单独挂 {@code ai-assistant-quick-prompt}，避免“能看到问题就能改问题”。
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiQuickPromptController {

    private static final String MENU = "ai-assistant-quick-prompt";

    private final AiQuickPromptService promptService;
    private final AiScopeGuard scopeGuard;

    @GetMapping("/quick-prompts")
    @Operation(summary = "首頁快捷提問（按系統/角色收斂，最多 6 條）")
    public Result<List<Map<String, Object>>> visible(@RequestParam(required = false) String systemCode) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AiQuickPrompt row : promptService.visible(systemCode)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getId());
            item.put("question", row.getQuestion());
            out.add(item);
        }
        return Result.success(out);
    }

    @GetMapping("/prompt-config/quick-prompts")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "快捷提問列表（配置）")
    public Result<List<AiQuickPrompt>> list(@RequestParam(required = false) String systemCode,
                                            @RequestParam(required = false) String keyword) {
        return Result.success(promptService.list(systemCode, keyword));
    }

    @PostMapping("/prompt-config/quick-prompts")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "保存快捷提問")
    public Result<AiQuickPrompt> save(@RequestBody AiQuickPrompt body) {
        scopeGuard.assertWritable(body.getSystemCode());
        return Result.success(promptService.save(body));
    }

    @DeleteMapping("/prompt-config/quick-prompts/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "刪除快捷提問")
    public Result<Void> delete(@PathVariable Long id) {
        AiQuickPrompt row = promptService.get(id);
        if (row != null) scopeGuard.assertWritable(row.getSystemCode());
        promptService.delete(id);
        return Result.success();
    }
}
