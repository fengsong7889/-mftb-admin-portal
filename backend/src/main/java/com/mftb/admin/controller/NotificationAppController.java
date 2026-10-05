package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.NotificationAppDTO.*;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.NotificationAppService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 通知渠道的企业应用配置接口（应用列表/详情/维护 + 通知场景与应用的绑定）。
 * <p>
 * 响应契约 {@code View} 只回传 {@code appSecretConfigured}/{@code tokenSecretConfigured} 两个布尔位，
 * 密钥明文任何情况下不经过本接口下发，因此前端无法拿到也不需要拿到密钥。
 * <p>
 * 写操作统一归到 {@code notification-config:edit}，实际发送能力在 {@link DingTalkAppService}。
 */
@RestController
@RequestMapping("/api/notification-apps")
@RequiredArgsConstructor
public class NotificationAppController {
    private final NotificationAppService service;
    private final DingTalkAppService sender;

    /** 企业应用列表，可按名称模糊匹配与启用状态过滤 */
    @GetMapping
    @RequirePermission(menu = "notification-config")
    public Result<List<View>> list(@RequestParam(required = false) String name, @RequestParam(required = false) Boolean enabled) {
        return Result.success(service.list(name, enabled));
    }

    /** 应用详情（含已绑定的场景 key 清单） */
    @GetMapping("/{id}")
    @RequirePermission(menu = "notification-config")
    public Result<View> detail(@PathVariable long id) { return Result.success(service.detail(id)); }

    /** 新建企业应用（save 首参传 null 即为新增）；AppKey 重复时拒绝并提示改为绑定已有应用 */
    @PostMapping
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Long> create(@Valid @RequestBody Save request) { return Result.success(service.save(null, request)); }

    /** 编辑企业应用基础信息与密钥配置 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> update(@PathVariable long id, @Valid @RequestBody Save request) {
        service.save(id, request);
        return Result.success();
    }

    /** 启用/停用应用；发送端只认「场景已启用 AND 应用已启用」，停用应用后其绑定的场景会真正停止发送 */
    @PatchMapping("/{id}/toggle")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> toggle(@PathVariable long id, @Valid @RequestBody Toggle request) {
        service.toggle(id, request.enabled());
        return Result.success();
    }

    /** 删除应用；Service 会先检查是否仍被通知场景（含已停用场景）绑定，避免留下悬空引用 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> delete(@PathVariable long id) {
        service.delete(id);
        return Result.success();
    }

    /** 连通性测试：绕开 token 缓存真实向钉钉取一次 access token 以验证已存凭据可用，且不向客户端回传 token */
    @PostMapping("/{id}/test")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> test(@PathVariable long id) {
        sender.testConnection(id);
        return Result.success();
    }

    /** 通知场景清单与各场景当前绑定的应用、开关状态 */
    @GetMapping("/scenarios")
    @RequirePermission(menu = "notification-config")
    public Result<List<ScenarioView>> scenarios() { return Result.success(service.scenarios()); }

    /** 绑定/解绑场景：appId 为空表示解除绑定，enabled 控制场景开关 */
    @PutMapping("/scenarios/{key}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> saveScenario(@PathVariable String key, @Valid @RequestBody ScenarioSave request) {
        service.saveScenario(key, request);
        return Result.success();
    }
}
