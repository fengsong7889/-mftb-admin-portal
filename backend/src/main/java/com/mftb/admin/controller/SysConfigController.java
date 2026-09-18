package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.service.DingTalkAppService;
import java.text.Normalizer;
import java.util.Locale;
import com.mftb.admin.dto.SysConfigUpdateDTO;
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

    /** 读取指定 key 的配置值（规则配置页） */
    @GetMapping("/{key}")
    @RequirePermission(menu = "rule-config")
    public Result<Map<String, String>> get(@PathVariable String key) {
        rejectAppConfigKey(key);
        String value = sysConfigService.getConfigValue(key);
        return Result.success(Map.of("key", key, "value", value != null ? value : ""));
    }

    /** 更新指定 key 的配置值（规则配置页） */
    @PutMapping("/{key}")
    @RequirePermission(menu = "rule-config", action = "edit")
    public Result<Void> update(@PathVariable String key, @RequestBody SysConfigUpdateDTO dto) {
        rejectAppConfigKey(key);
        String value = dto.getValue();
        if (value == null || value.isBlank()) {
            return Result.error(400, "配置值不能為空");
        }
        sysConfigService.updateConfig(key, value);
        return Result.success();
    }

    private void rejectAppConfigKey(String key) {
        // 与数据库不区分大小写/重音的排序规则对齐，防止通用入口绕过密钥脱敏和专属权限。
        String normalized = Normalizer.normalize(key, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "").trim().toLowerCase(Locale.ROOT);
        if (DingTalkAppService.APP_CONFIG_KEYS.contains(normalized)) {
            throw new BusinessException(403, "企業內部應用配置請使用通知配置專用入口");
        }
    }
}
