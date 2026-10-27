package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.service.MeetingBookingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 会议预约接口（预约、变更、取消、我的日程）。
 *
 * <p><b>请求体里没有 organizerId</b>：组织者、响应人、取消人一律由服务端从 JWT 解析。
 * 相信前端传的"我是谁"等于允许任何人替任何人发起或取消会议。
 *
 * <p>菜单与动作对应关系：预约页/记录页的写动作都用 {@code edit}（菜单种子只登记了 view/edit 等
 * 真实存在的动作）；标注一个种子里没有的动作会让接口对所有人永久 403。
 * 数据范围（只看自己相关的单）在 Service 层收敛，注解只挡页面入口。
 */
@RestController
@RequestMapping("/api/meeting")
@RequiredArgsConstructor
public class MeetingBookingController {

    private static final String MY = MeetingConstants.MENU_MY;
    private static final String BOOKING = MeetingConstants.MENU_BOOKING;
    private static final String RECORD = MeetingConstants.MENU_RECORD;

    private final MeetingBookingService bookingService;

    /* ==================== 预约单 ==================== */

    /**
     * 预约列表 + 同口径统计卡。
     *
     * <p>{@code scope} 由服务端解释：非行政视野传 {@code all} 也只会拿到与自己相关的单，
     * 前端拿不到"绕过"的口子。
     */
    @GetMapping("/bookings")
    @RequirePermission(menu = RECORD, anyOf = {MY, BOOKING})
    public Result<MeetingBookingDto.PageWithStats> page(@ModelAttribute MeetingBookingDto.Query query) {
        return Result.success(bookingService.listWithStats(query));
    }

    /** 会议详情：参会人名单、邀约投递状态、审计轨迹；非相关人拒绝（防 IDOR） */
    @GetMapping("/bookings/{id}")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingBookingDto.VO> detail(@PathVariable long id) {
        return Result.success(bookingService.detail(id));
    }

    /** 一场会议的操作轨迹（详情页「操作记录」模块） */
    @GetMapping("/bookings/{id}/events")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<List<MeetingBookingDto.EventVO>> events(@PathVariable long id) {
        return Result.success(bookingService.events(id));
    }

    /** 新建预约：免审批即时占用窗口，冲突时返回被占用的会议信息 */
    @PostMapping("/bookings")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<MeetingBookingDto.CreateResult> create(@RequestBody @Valid MeetingBookingDto.CreateForm form) {
        return Result.success("會議已預約", bookingService.create(form));
    }

    /** 变更会议（时间/房间/参会人）：会议开始后不可变更 */
    @PutMapping("/bookings/{id}")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<MeetingBookingDto.VO> update(@PathVariable long id,
                                               @RequestBody @Valid MeetingBookingDto.UpdateForm form) {
        return Result.success("會議已更新", bookingService.update(id, form));
    }

    /** 取消会议：原因必填，窗口立即归还 */
    @PostMapping("/bookings/{id}/cancel")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<Void> cancel(@PathVariable long id, @RequestBody @Valid MeetingBookingDto.CancelForm form) {
        bookingService.cancel(id, form);
        return Result.success("會議已取消", null);
    }

    /** 参会人响应邀约：只能替自己表态 */
    @PostMapping("/bookings/{id}/attendees/me/response")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING})
    public Result<MeetingBookingDto.VO> respond(@PathVariable long id,
                                                @RequestBody @Valid MeetingBookingDto.ResponseForm form) {
        return Result.success("響應已記錄", bookingService.respond(id, form));
    }

    /* ==================== 我的会议 ==================== */

    /** 我某一天的日程（日历单元格数据，含我发起与我参与） */
    @GetMapping("/my/schedule")
    @RequirePermission(menu = MY)
    public Result<List<MeetingBookingDto.ScheduleVO>> schedule(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return Result.success(bookingService.schedule(date));
    }

    /** 首页工作台与「我的会议」顶部摘要 */
    @GetMapping("/my/summary")
    @RequirePermission(menu = MY)
    public Result<MeetingBookingDto.MySummary> mySummary() {
        return Result.success(bookingService.mySummary());
    }
}
