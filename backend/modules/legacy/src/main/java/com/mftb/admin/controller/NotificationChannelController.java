package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.SysNotificationChannelSaveDTO;
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
    /** 阻止旧版页面继续写入已经迁移的单例配置。 */
    @RequestMapping(value = {"/app-config", "/app-config/test"}, method = {RequestMethod.GET, RequestMethod.PUT, RequestMethod.POST})
    @RequirePermission(menu = "notification-config")
    public Result<Void> retiredAppConfig() {
        return Result.error(410, "企業應用配置已升級為列表，請刷新頁面後操作");
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
