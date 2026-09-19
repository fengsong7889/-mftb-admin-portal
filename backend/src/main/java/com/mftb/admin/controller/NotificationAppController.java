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

@RestController
@RequestMapping("/api/notification-apps")
@RequiredArgsConstructor
public class NotificationAppController {
    private final NotificationAppService service;
    private final DingTalkAppService sender;

    @GetMapping
    @RequirePermission(menu = "notification-config")
    public Result<List<View>> list(@RequestParam(required = false) String name, @RequestParam(required = false) Boolean enabled) {
        return Result.success(service.list(name, enabled));
    }

    @GetMapping("/{id}")
    @RequirePermission(menu = "notification-config")
    public Result<View> detail(@PathVariable long id) { return Result.success(service.detail(id)); }

    @PostMapping
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Long> create(@Valid @RequestBody Save request) { return Result.success(service.save(null, request)); }

    @PutMapping("/{id}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> update(@PathVariable long id, @Valid @RequestBody Save request) {
        service.save(id, request);
        return Result.success();
    }

    @PatchMapping("/{id}/toggle")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> toggle(@PathVariable long id, @Valid @RequestBody Toggle request) {
        service.toggle(id, request.enabled());
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> delete(@PathVariable long id) {
        service.delete(id);
        return Result.success();
    }

    @PostMapping("/{id}/test")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> test(@PathVariable long id) {
        sender.testConnection(id);
        return Result.success();
    }

    @GetMapping("/scenarios")
    @RequirePermission(menu = "notification-config")
    public Result<List<ScenarioView>> scenarios() { return Result.success(service.scenarios()); }

    @PutMapping("/scenarios/{key}")
    @RequirePermission(menu = "notification-config", action = "edit")
    public Result<Void> saveScenario(@PathVariable String key, @Valid @RequestBody ScenarioSave request) {
        service.saveScenario(key, request);
        return Result.success();
    }
}
