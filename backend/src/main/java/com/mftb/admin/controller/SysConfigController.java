package com.mftb.admin.controller;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RuleConfigKeyRegistry;
import com.mftb.admin.dto.SysConfigUpdateDTO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 系统配置接口
 * 供前端规则配置页面同步配置值到后端 DB。
 * <p>
 * 规则菜单拆分后，读写按 config key 归属的版塊菜單（{@link RuleConfigKeyRegistry}）动态鉴权，
 * 替代旧的静态 {@code menu="rule-config"} 单菜单鉴权，避免持有任一版块即可改全部规则。
 * 无法归类的 key 回退要求旧 {@code rule-config} 菜单权限，保持既有其它消费方（如 UI 偏好）行为不变。
 */
@RestController
@RequestMapping("/api/sys-config")
@RequiredArgsConstructor
public class SysConfigController {

    /** 无法归类 key 的兜底所需菜单（保持拆分前行为） */
    private static final String LEGACY_MENU = "rule-config";

    private final SysConfigService sysConfigService;
    private final PermissionService permissionService;

    /** 读取指定 key 的配置值（规则配置页） */
    @GetMapping("/{key}")
    public Result<Map<String, String>> get(@PathVariable String key) {
        authorizeKey(key, "view");
        String value = sysConfigService.getConfigValue(key);
        return Result.success(Map.of("key", key, "value", value != null ? value : ""));
    }

    /** 更新指定 key 的配置值（规则配置页） */
    @PutMapping("/{key}")
    public Result<Void> update(@PathVariable String key, @RequestBody SysConfigUpdateDTO dto) {
        authorizeKey(key, "edit");
        String value = dto.getValue();
        if (value == null || value.isBlank()) {
            return Result.error(400, "配置值不能為空");
        }
        sysConfigService.updateConfig(key, value);
        return Result.success();
    }

    /**
     * 批量读取配置值。
     * <p>按每个 key 的归属版块做 view 鉴权；任一 key 无权即整体拒绝。
     *
     * @param keys 逗号分隔的 config key 列表
     * @return key → 值；不存在或本地专用（未落库）的 key 不出现在结果中
     */
    @GetMapping("/batch")
    public Result<Map<String, String>> batchGet(@RequestParam List<String> keys) {
        if (keys == null || keys.isEmpty()) {
            return Result.success(Map.of());
        }
        for (String key : keys) {
            authorizeKey(key, "view");
        }
        Map<String, String> values = sysConfigService.getConfigValues(keys);
        return Result.success(values);
    }

    /**
     * 批量更新配置值（单事务）。
     * <p>本地专用布尔 key（支付方式编辑器的 4 个互斥开关）静默跳过不落库；
     * 未知无主 key 拒绝写入；其余按归属版块做 edit 鉴权，任一无权即整体拒绝。
     *
     * @param body key → 新值
     */
    @PutMapping("/batch")
    public Result<Void> batchUpdate(@RequestBody Map<String, String> body) {
        if (body == null || body.isEmpty()) {
            return Result.success();
        }
        Map<String, String> toPersist = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : body.entrySet()) {
            String key = entry.getKey();
            if (key == null || key.isBlank()) {
                continue;
            }
            rejectAppConfigKey(key);
            if (RuleConfigKeyRegistry.isLocalOnly(key)) {
                // 编辑器本地表示, 后端以 payment_mode_{type} 单 key 为准, 跳过
                continue;
            }
            String owner = RuleConfigKeyRegistry.resolveOwnerMenu(key);
            if (owner == null) {
                throw new BusinessException(400, "未知配置項不允許通過批量接口寫入: " + key);
            }
            authorizeKey(key, "edit");
            toPersist.put(key, entry.getValue());
        }
        sysConfigService.updateConfigs(toPersist);
        return Result.success();
    }

    /** 按 key 归属版块校验当前员工对 requiredMenu 的 action 权限 */
    private void authorizeKey(String key, String action) {
        rejectAppConfigKey(key);
        SysUser user = currentUser();
        String owner = RuleConfigKeyRegistry.resolveOwnerMenu(key);
        String requiredMenu = owner != null ? owner : LEGACY_MENU;
        if (!permissionService.hasPermission(user, requiredMenu, action)) {
            throw new PermissionDeniedException(requiredMenu, action);
        }
    }

    private SysUser currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object details = authentication == null ? null : authentication.getDetails();
        if (details instanceof SysUser user) {
            return user;
        }
        throw new PermissionDeniedException(LEGACY_MENU, "view");
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
