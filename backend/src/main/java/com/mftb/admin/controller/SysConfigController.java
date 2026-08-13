package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 系统配置接口
 * 供前端规则配置页面同步配置值到后端 DB
 */
@RestController
@RequestMapping("/api/sys-config")
@RequiredArgsConstructor
public class SysConfigController {

    private final SysConfigService sysConfigService;

    /** 读取指定 key 的配置值 */
    @GetMapping("/{key}")
    public Result<Map<String, String>> get(@PathVariable String key) {
        String value = sysConfigService.getConfigValue(key);
        return Result.success(Map.of("key", key, "value", value != null ? value : ""));
    }

    /** 更新指定 key 的配置值 */
    @PutMapping("/{key}")
    public Result<Void> update(@PathVariable String key, @RequestBody Map<String, String> body) {
        String value = body.get("value");
        if (value == null || value.isBlank()) {
            return Result.error(400, "配置值不能为空");
        }
        sysConfigService.updateConfig(key, value);
        return Result.success();
    }
}
