package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.AiPushTemplate;
import com.mftb.admin.service.agent.AiPushTemplateService;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 推送模板：只改“推送长什么样”，不改变推送对象与发送校验。
 *
 * <p>模板缺失时运行时回落内置文案；页面通过 {@code builtin} 参数取内置模板用于“還原”。
 */
@RestController
@RequestMapping("/api/ai/prompt-config/push-templates")
@RequiredArgsConstructor
public class AiPushTemplateController {

    private static final String MENU = "ai-assistant-push-template";

    private final AiPushTemplateService templateService;
    private final AiScopeGuard scopeGuard;

    @GetMapping
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "推送模板列表（含未配置的內置模板）")
    public Result<List<AiPushTemplate>> list(@RequestParam(required = false) String systemCode) {
        return Result.success(templateService.list(systemCode));
    }

    @GetMapping("/builtin")
    @RequirePermission(menu = MENU, action = "view")
    @Operation(summary = "內置模板與可用佔位符")
    public Result<Map<String, Object>> builtin(@RequestParam String templateKey) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("template", templateService.defaultTemplate(templateKey));
        out.put("placeholders", templateService.placeholders());
        return Result.success(out);
    }

    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "保存推送模板")
    public Result<AiPushTemplate> save(@RequestBody AiPushTemplate body) {
        scopeGuard.assertWritable(body.getSystemCode());
        return Result.success(templateService.save(body));
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = MENU, action = "edit")
    @Operation(summary = "刪除推送模板（回落內置模板）")
    public Result<Void> delete(@PathVariable Long id) {
        AiPushTemplate row = templateService.get(id);
        if (row != null) scopeGuard.assertWritable(row.getSystemCode());
        templateService.delete(id);
        return Result.success();
    }
}
