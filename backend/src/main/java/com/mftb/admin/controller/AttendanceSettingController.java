package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceSettingItem;
import com.mftb.admin.service.AttendanceSettingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 假勤设置接口（口径参数）。
 * <p>
 * 不提供审批流程相关的任何写入：审批节点与审批人由流程审批系统的「流程配置」维护，
 * 两个系统各留一个入口必然出现配置漂移。
 */
@RestController
@RequestMapping("/api/attendance/settings")
@RequiredArgsConstructor
public class AttendanceSettingController {

    private final AttendanceSettingService settingService;

    /** 全部设置项（含只读口径说明，前端按 editable 渲染） */
    @GetMapping
    @RequirePermission(menu = AttendanceConstants.MENU_SETTING)
    public Result<List<AttendanceSettingItem>> list() {
        return Result.success(settingService.list());
    }

    /** 保存可编辑项；含只读项或未知 key 整体拒绝 */
    @PutMapping
    @RequirePermission(menu = AttendanceConstants.MENU_SETTING, action = "edit")
    public Result<Map<String, Object>> update(@RequestBody Map<String, String> values) {
        return Result.success("口徑參數已保存", settingService.update(values));
    }
}
