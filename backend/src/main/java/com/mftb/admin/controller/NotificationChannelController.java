package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.SysNotificationChannelSaveDTO;
import com.mftb.admin.dto.DingTalkAppConfigRequest;
import com.mftb.admin.dto.DingTalkAppConfigVO;
import com.mftb.admin.service.DingTalkAppService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import com.mftb.admin.service.NotificationChannelService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 通知渠道配置接口
 * 支持多平台、多场景、多渠道 CRUD 及测试
 */
@RestController
@RequestMapping("/api/notification-channels")
@RequiredArgsConstructor
public class NotificationChannelController {

    private final NotificationChannelService notificationChannelService;
    private final DingTalkAppService dingTalkAppService;

    @Operation(summary = "读取企业内部应用配置（不含密钥明文）")
    @GetMapping("/app-config")
    @RequirePermission(menu = "notification-config")
    public Result<DingTalkAppConfigVO> getAppConfig() {
        return Result.success(notificationChannelService.getAppConfig());
    }

    @Operation(summary = "保存企业内部应用配置，AppSecret 留空保留，不轮换签署密钥")
    @PutMapping("/app-config")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> saveAppConfig(@Valid @RequestBody DingTalkAppConfigRequest request) {
        notificationChannelService.saveAppConfig(request);
        return Result.success();
    }

    @Operation(summary = "用已保存凭证测试连接，不发送通知，不返回 access_token")
    @PostMapping("/app-config/test")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> testAppConnection() {
        dingTalkAppService.testConnection();
        return Result.success();
    }

    /** 列出所有渠道（支持筛选：channel / name / enabled / updatedBy / updatedAfter / updatedBefore） */
    @GetMapping
    @RequirePermission(menu = "notification-config")
    public Result<List<Map<String, Object>>> list(
            @RequestParam(required = false) String channel,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) Integer enabled,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAfter,
            @RequestParam(required = false) String updatedBefore) {
        return Result.success(notificationChannelService.listFiltered(channel, name, enabled, updatedBy, updatedAfter, updatedBefore));
    }

    /** 按 ID 查详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = "notification-config")
    public Result<Map<String, Object>> detail(@PathVariable Long id) {
        return Result.success(notificationChannelService.getDetail(id));
    }

    /** 新增渠道 */
    @PostMapping
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Long> create(@RequestBody SysNotificationChannelSaveDTO dto) {
        Long id = notificationChannelService.create(dto);
        return Result.success("渠道已創建", id);
    }

    /** 更新渠道 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> update(@PathVariable Long id, @RequestBody SysNotificationChannelSaveDTO dto) {
        notificationChannelService.update(id, dto);
        return Result.<Void>success("渠道已更新", null);
    }

    /** 删除渠道 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> delete(@PathVariable Long id) {
        notificationChannelService.delete(id);
        return Result.<Void>success("渠道已刪除", null);
    }

    /** 启停切换 */
    @PatchMapping("/{id}/toggle")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> toggle(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        Boolean enabled = body.get("enabled");
        if (enabled == null) {
            return Result.error(400, "enabled 参数不能为空");
        }
        notificationChannelService.toggleEnabled(id, enabled);
        return Result.success();
    }

    /** 发送测试消息 */
    @PostMapping("/{id}/test")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<String> test(@PathVariable Long id) {
        String result = notificationChannelService.sendTest(id);
        return Result.success(result);
    }
}
