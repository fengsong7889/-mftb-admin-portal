package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.entity.SysNotificationSwitch;
import com.mftb.admin.entity.SysNotificationTemplate;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingNotifyTemplateService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

/**
 * 通知模板与推送开关（「通知渠道配置」旁的两个二级页）。
 *
 * <p>拆成两个菜单而不是塞进「通知渠道配置」的 Tab：改文案与临时静音是两类操作，
 * 使用者也常常不是同一个人（行政改文案、值班人静音），独立菜单才能各自授权、各自留更新人。
 *
 * <p>模板只做 ${var} 字面替换（见 {@link MeetingNotifyTemplateService#fill}）：
 * 不引入模板引擎，避免配置页变成可执行逻辑的入口。
 */
@Slf4j
@RestController
@RequestMapping("/api/meeting/notify")
@RequiredArgsConstructor
public class MeetingNotifyConfigController {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String MENU_TEMPLATE = "notification-template";
    private static final String MENU_SWITCH = "notification-switch";
    /** 渠道白名单：与 sys_notification_switch 的 CHECK 约束同词表 */
    private static final Set<String> CHANNELS = Set.of("DINGTALK_WORK", "DINGTALK_GROUP");

    private final MeetingNotifyTemplateService templateService;
    private final MeetingAccessGuard guard;

    public record TemplateView(String sceneKey, String sceneName, String titleTpl, String bodyTpl,
                               String variables, Boolean enabled, String updatedBy, String updatedAt) {
    }

    public record SwitchView(String sceneKey, String channel, Boolean enabled, String updatedBy, String updatedAt) {
    }

    public record TemplateSave(@NotBlank String titleTpl, @NotBlank String bodyTpl, Boolean enabled,
                               String sceneName) {
    }

    public record SwitchSave(@NotBlank String sceneKey, @NotBlank String channel, @NotNull Boolean enabled) {
    }

    @GetMapping("/templates")
    @RequirePermission(menu = MENU_TEMPLATE, action = "view")
    public Result<List<TemplateView>> templates() {
        return Result.success(templateService.templates().stream().map(MeetingNotifyConfigController::toView).toList());
    }

    @PutMapping("/templates/{sceneKey}")
    @RequirePermission(menu = MENU_TEMPLATE, action = "edit")
    public Result<List<TemplateView>> saveTemplate(@PathVariable String sceneKey,
                                                   @RequestBody @Valid TemplateSave form) {
        templateService.saveTemplate(sceneKey, form.sceneName(), form.titleTpl(), form.bodyTpl(),
                !Boolean.FALSE.equals(form.enabled()), guard.currentUser().getName());
        return Result.success("模板已保存（下一次發送立即生效）", templateService.templates().stream()
                .map(MeetingNotifyConfigController::toView).toList());
    }

    @GetMapping("/switches")
    @RequirePermission(menu = MENU_SWITCH, action = "view")
    public Result<List<SwitchView>> switches() {
        return Result.success(templateService.switches().stream().map(MeetingNotifyConfigController::toView).toList());
    }

    @PutMapping("/switches")
    @RequirePermission(menu = MENU_SWITCH, action = "edit")
    public Result<List<SwitchView>> saveSwitch(@RequestBody @Valid SwitchSave form) {
        if (!CHANNELS.contains(form.channel())) {
            return Result.error("不支援的推送渠道");
        }
        templateService.toggleSwitch(form.sceneKey().trim(), form.channel(), form.enabled(),
                guard.currentUser().getName());
        return Result.success(form.enabled() ? "已開啟推送" : "已靜音", templateService.switches().stream()
                .map(MeetingNotifyConfigController::toView).toList());
    }

    private static TemplateView toView(SysNotificationTemplate row) {
        return new TemplateView(row.getSceneKey(), row.getSceneName(), row.getTitleTpl(), row.getBodyTpl(),
                row.getVariables(), Integer.valueOf(1).equals(row.getEnabled()), row.getUpdatedBy(),
                row.getUpdatedAt() == null ? null : TIME.format(row.getUpdatedAt()));
    }

    private static SwitchView toView(SysNotificationSwitch row) {
        return new SwitchView(row.getSceneKey(), row.getChannel(), Integer.valueOf(1).equals(row.getEnabled()),
                row.getUpdatedBy(), row.getUpdatedAt() == null ? null : TIME.format(row.getUpdatedAt()));
    }
}
