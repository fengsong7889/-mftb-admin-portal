package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceHolidayVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.AttHoliday;
import com.mftb.admin.service.AttendanceHolidayService;
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
 * 节假日日历接口（假勤基础数据）。
 */
@RestController
@RequestMapping("/api/attendance/holidays")
@RequiredArgsConstructor
public class AttendanceHolidayController {

    private final AttendanceHolidayService holidayService;

    /** 分页列表 */
    @GetMapping
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY)
    public Result<PageResult<AttendanceHolidayVO>> list(@RequestParam(defaultValue = "1") long page,
                                                        @RequestParam(defaultValue = "20") long size,
                                                        @RequestParam(required = false) Integer yearNo,
                                                        @RequestParam(required = false) Integer holidayType,
                                                        @RequestParam(required = false) String keyword,
                                                        @RequestParam(required = false) String status) {
        return Result.success(holidayService.list(page, size, yearNo, holidayType, keyword, status));
    }

    /** 与列表同口径的统计（统计卡必须跟随筛选） */
    @GetMapping("/stats")
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY)
    public Result<Map<String, Object>> stats(@RequestParam(required = false) Integer yearNo,
                                             @RequestParam(required = false) Integer holidayType,
                                             @RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) String status) {
        return Result.success(holidayService.stats(yearNo, holidayType, keyword, status));
    }

    /** 详情（编辑/详情页取数） */
    @GetMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY,
            anyOf = {AttendanceConstants.MENU_SCHEDULE, AttendanceConstants.MENU_DAILY})
    public Result<AttendanceHolidayVO> detail(@PathVariable Long id) {
        return Result.success(holidayService.detail(id));
    }

    /**
     * 某年度启用日历。
     * <p>排班与汇总计算按年整批加载，避免逐日查库；排班菜单也需读取日历判断应出勤，故放开 anyOf。
     */
    @GetMapping("/year/{yearNo}")
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY,
            anyOf = {AttendanceConstants.MENU_SCHEDULE, AttendanceConstants.MENU_DAILY, AttendanceConstants.MENU_MONTHLY})
    public Result<List<AttendanceHolidayVO>> listByYear(@PathVariable Integer yearNo) {
        return Result.success(holidayService.listByYear(yearNo));
    }

    /** 新建（yearNo 由服务端按日期推导，前端传了也不算） */
    @PostMapping
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY, action = "create")
    public Result<AttendanceHolidayVO> create(@RequestBody AttHoliday holiday) {
        holiday.setId(null);
        return Result.success("節假日已建立", holidayService.save(holiday));
    }

    /** 编辑 */
    @PutMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY, action = "edit")
    public Result<AttendanceHolidayVO> update(@PathVariable Long id, @RequestBody AttHoliday holiday) {
        holiday.setId(id);
        return Result.success("節假日已保存", holidayService.save(holiday));
    }

    /** 启停 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY, action = "edit")
    public Result<AttendanceHolidayVO> changeStatus(@PathVariable Long id, @RequestParam String status) {
        return Result.success("狀態已更新", holidayService.changeStatus(id, status));
    }

    /** 删除 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = AttendanceConstants.MENU_HOLIDAY, action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        holidayService.delete(id);
        return Result.success("節假日已刪除", null);
    }
}
