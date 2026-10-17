package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceGroupVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.service.AttendanceGroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 考勤组接口。
 * <p>
 * 新增与编辑拆成两个端点，是为了让 {@code @RequirePermission} 的 action 精确对应
 * create / edit 两种授权——一个端点扛两种动作时，只被授「新增」的角色也改得了别人的组。
 */
@RestController
@RequestMapping("/api/attendance/groups")
@RequiredArgsConstructor
public class AttendanceGroupController {

    private final AttendanceGroupService groupService;

    /** 分页列表 */
    @GetMapping
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP)
    public Result<PageResult<AttendanceGroupVO>> list(@RequestParam(defaultValue = "1") long page,
                                                      @RequestParam(defaultValue = "20") long size,
                                                      @RequestParam(required = false) String keyword,
                                                      @RequestParam(required = false) Integer groupType,
                                                      @RequestParam(required = false) String status,
                                                      @RequestParam(required = false) String sortField,
                                                      @RequestParam(required = false) String sortOrder) {
        return Result.success(groupService.list(page, size, keyword, groupType, status, sortField, sortOrder));
    }

    /** 与列表同口径的统计（统计卡必须跟随筛选） */
    @GetMapping("/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP)
    public Result<Map<String, Object>> stats(@RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) Integer groupType,
                                             @RequestParam(required = false) String status) {
        return Result.success(groupService.stats(keyword, groupType, status));
    }

    /** 详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP)
    public Result<AttendanceGroupVO> detail(@PathVariable Long id) {
        return Result.success(groupService.detail(id));
    }

    /** 当前生效成员清单 */
    @GetMapping("/{id}/members")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP)
    public Result<List<AttGroupMember>> members(@PathVariable Long id) {
        return Result.success(groupService.currentMembers(id));
    }

    /** 新建考勤组 */
    @PostMapping
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP, action = "create")
    public Result<AttGroup> create(@RequestBody AttGroup group) {
        group.setId(null);
        return Result.success("考勤組已建立", groupService.save(group));
    }

    /** 编辑考勤组 */
    @PutMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP, action = "edit")
    public Result<AttGroup> update(@PathVariable Long id, @RequestBody AttGroup group) {
        group.setId(id);
        return Result.success("考勤組已保存", groupService.save(group));
    }

    /** 启停 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP, action = "edit")
    public Result<AttGroup> changeStatus(@PathVariable Long id, @RequestParam String status) {
        return Result.success("狀態已更新", groupService.changeStatus(id, status));
    }

    /**
     * 差量维护成员：新增开启新期间、移除闭合生效止。
     * <p>返回 added/closed 计数，界面据此提示「本次影響了幾個人」，不做静默全量覆盖。
     */
    @PutMapping("/{id}/members")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP, action = "edit")
    public Result<Map<String, Object>> syncMembers(@PathVariable Long id, @RequestBody(required = false) List<Long> userIds) {
        return Result.success("成員清單已更新", groupService.syncMembers(id, userIds));
    }

    /** 删除（存在成员或排班时由服务层拒绝） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_GROUP, action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        groupService.delete(id);
        return Result.success("考勤組已刪除", null);
    }
}
