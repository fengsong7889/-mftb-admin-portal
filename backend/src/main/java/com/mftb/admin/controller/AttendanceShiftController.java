package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceShiftVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.service.AttendanceShiftService;
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
 * 班次接口（假勤基础数据）。
 */
@RestController
@RequestMapping("/api/attendance/shifts")
@RequiredArgsConstructor
public class AttendanceShiftController {

    private final AttendanceShiftService shiftService;

    /** 分页列表 */
    @GetMapping
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT)
    public Result<PageResult<AttendanceShiftVO>> list(@RequestParam(defaultValue = "1") long page,
                                                      @RequestParam(defaultValue = "20") long size,
                                                      @RequestParam(required = false) String keyword,
                                                      @RequestParam(required = false) Integer flexFlag,
                                                      @RequestParam(required = false) String status) {
        return Result.success(shiftService.list(page, size, keyword, flexFlag, status));
    }

    /** 与列表同口径的统计（统计卡必须跟随筛选） */
    @GetMapping("/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT)
    public Result<Map<String, Object>> stats(@RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) Integer flexFlag,
                                             @RequestParam(required = false) String status) {
        return Result.success(shiftService.stats(keyword, flexFlag, status));
    }

    /** 详情（编辑/详情页取数，不让前端拉全量列表再挑一条） */
    @GetMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT,
            anyOf = {AttendanceConstants.MENU_GROUP, AttendanceConstants.MENU_SCHEDULE})
    public Result<AttendanceShiftVO> detail(@PathVariable Long id) {
        return Result.success(shiftService.detail(id));
    }

    /**
     * 启用中的班次下拉。
     * <p>考勤组与排班表单都消费它，故放开到 anyOf：持有考勤组或排班菜单即可查看，
     * 但不给班次菜单也拿不到全量列表（列表里含停用班次与备注）。
     */
    @GetMapping("/options")
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT,
            anyOf = {AttendanceConstants.MENU_GROUP, AttendanceConstants.MENU_SCHEDULE})
    public Result<List<Map<String, Object>>> options() {
        return Result.success(shiftService.options());
    }

    /** 新建班次 */
    @PostMapping
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT, action = "create")
    public Result<AttendanceShiftVO> create(@RequestBody AttShift shift) {
        shift.setId(null);
        return Result.success("班次已建立", shiftService.save(shift));
    }

    /** 编辑班次（编码为稳定身份，服务层以库中值为准） */
    @PutMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT, action = "edit")
    public Result<AttendanceShiftVO> update(@PathVariable Long id, @RequestBody AttShift shift) {
        shift.setId(id);
        return Result.success("班次已保存", shiftService.save(shift));
    }

    /** 启停 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT, action = "edit")
    public Result<AttendanceShiftVO> changeStatus(@PathVariable Long id, @RequestParam String status) {
        return Result.success("狀態已更新", shiftService.changeStatus(id, status));
    }

    /** 删除（被考勤组或排班引用时由服务层拒绝） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_SHIFT, action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        shiftService.delete(id);
        return Result.success("班次已刪除", null);
    }
}
