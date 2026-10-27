package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.dto.MeetingCheckinDto;
import com.mftb.admin.dto.MeetingSeriesDto;
import com.mftb.admin.service.MeetingBookingService;
import com.mftb.admin.service.MeetingCheckinService;
import com.mftb.admin.service.MeetingSeriesService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 周期会议与 M2 生命周期接口（签到 / 提前结束 / 释放）。
 *
 * <p>权限动作全部用 {@code edit}：菜单种子里只登记了真实存在的动作，
 * 标一个种子里没有的动作会让接口对所有人永久 403（超管走代码直通看不出来，普通角色上线当天才暴露）。
 */
@RestController
@RequestMapping("/api/meeting")
@RequiredArgsConstructor
public class MeetingSeriesController {

    private static final String MY = MeetingConstants.MENU_MY;
    private static final String BOOKING = MeetingConstants.MENU_BOOKING;
    private static final String RECORD = MeetingConstants.MENU_RECORD;

    private final MeetingSeriesService seriesService;
    private final MeetingBookingService bookingService;
    private final MeetingCheckinService checkinService;

    /* ==================== 周期系列 ==================== */

    /** 实例日期预览：与创建共用同一个递推算法，只算不写库 */
    @PostMapping("/series/preview")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<List<MeetingSeriesDto.PreviewVO>> preview(@RequestBody @Valid MeetingSeriesDto.CreateForm form) {
        return Result.success(seriesService.preview(form));
    }

    /** 新建周期会议：一次性物化全部实例，冲突场次跳过并逐条返回原因 */
    @PostMapping("/series")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<MeetingSeriesDto.CreateResult> create(@RequestBody @Valid MeetingSeriesDto.CreateForm form) {
        return Result.success("週期會議已創建", seriesService.create(form));
    }

    /** 系列详情（含实例列表） */
    @GetMapping("/series/{id}")
    @RequirePermission(menu = MY, anyOf = {BOOKING, RECORD})
    public Result<MeetingSeriesDto.VO> detail(@PathVariable long id) {
        return Result.success(seriesService.detail(id));
    }

    /** 修改模板：只重建未来实例，历史实例不动 */
    @PutMapping("/series/{id}")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<MeetingSeriesDto.VO> update(@PathVariable long id,
                                              @RequestBody @Valid MeetingSeriesDto.UpdateForm form) {
        return Result.success("週期會議已更新（僅影響後續場次）", seriesService.update(id, form));
    }

    /** 三档取消：仅此次 / 此次及以后 / 全部 */
    @PostMapping("/series/{id}/cancel")
    @RequirePermission(menu = BOOKING, action = MeetingConstants.ACTION_EDIT, anyOf = {RECORD})
    public Result<Void> cancel(@PathVariable long id, @RequestBody @Valid MeetingSeriesDto.CancelForm form) {
        seriesService.cancel(id, form);
        return Result.success("週期會議已取消", null);
    }

    /* ==================== 签到 / 提前结束 / 释放 ==================== */

    /** 签到：组织者或参会人本人，服务端校验窗口 */
    @PostMapping("/bookings/{id}/checkin")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING})
    public Result<MeetingBookingDto.VO> checkin(@PathVariable long id) {
        return Result.success("簽到成功", bookingService.checkin(id));
    }

    /** 提前结束：写实际结束时间并立即归还剩余窗口 */
    @PostMapping("/bookings/{id}/finish")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING, RECORD})
    public Result<MeetingBookingDto.VO> finish(@PathVariable long id) {
        return Result.success("會議已結束", bookingService.finish(id));
    }

    /** 行政手动释放（与系统自动释放在事实列上分列，必须留原因） */
    @PostMapping("/bookings/{id}/release")
    @RequirePermission(menu = RECORD, action = MeetingConstants.ACTION_EDIT)
    public Result<MeetingBookingDto.VO> release(@PathVariable long id,
                                                @RequestBody @Valid MeetingBookingDto.ReleaseForm form) {
        return Result.success("會議室已釋放", bookingService.release(id, form));
    }

    /** 签发本人的免登签到令牌（前端渲染二维码用；只有参会人能领到自己的） */
    @PostMapping("/bookings/{id}/checkin-token")
    @RequirePermission(menu = MY, action = MeetingConstants.ACTION_EDIT, anyOf = {BOOKING})
    public Result<MeetingCheckinDto.TokenIssued> checkinToken(@PathVariable long id) {
        return Result.success(checkinService.issueOwnToken(id));
    }
}
