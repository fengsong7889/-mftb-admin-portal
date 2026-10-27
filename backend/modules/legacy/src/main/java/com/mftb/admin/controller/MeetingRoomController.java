package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingRoomDto;
import com.mftb.admin.service.MeetingRoomService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 会议室档案与忙闲视图接口。
 *
 * <p>权限分层：菜单动作（{@code @RequirePermission}）管"能不能进这个页面/点这个按钮"，
 * 数据范围（Service 内的守卫）管"这一条是不是你的"。会议室档案是公共资源，全员可读、行政可写，
 * 因此只读接口用 {@code anyOf} 让预约页/我的会议共用，写接口一律要求 {@code meeting-room} 的对应动作。
 *
 * <p>路径顺序说明：{@code /rooms/options} 这类字面量路径与 {@code /rooms/{id}} 模板路径并存，
 * Spring 优先匹配字面量；{@code id} 声明为 long，非数字请求根本进不到方法体，不会被误当成房间 ID。
 */
@RestController
@RequestMapping("/api/meeting/rooms")
@RequiredArgsConstructor
public class MeetingRoomController {

    private static final String ROOM = MeetingConstants.MENU_ROOM;
    private static final String BOOKING = MeetingConstants.MENU_BOOKING;

    private final MeetingRoomService roomService;

    /** 会议室分页 + 同口径统计卡（预约页也可读，用于选房列表） */
    @GetMapping
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<MeetingRoomDto.PageWithStats> page(@ModelAttribute MeetingRoomDto.Query query) {
        return Result.success(roomService.listWithStats(query));
    }

    /** 预约页房间候选：只含可预约且启用的房间，并带回生效规则便于前端即时校验 */
    @GetMapping("/options")
    @RequirePermission(menu = BOOKING, anyOf = {ROOM})
    public Result<List<MeetingRoomDto.VO>> options() {
        return Result.success(roomService.bookableOptions());
    }

    /** 忙闲矩阵：一次请求取回多间房在窗口内的占用情况（选房页核心接口） */
    @PostMapping("/availability")
    @RequirePermission(menu = BOOKING, anyOf = {ROOM})
    public Result<List<MeetingRoomDto.Availability>> availability(@RequestBody @Valid MeetingRoomDto.AvailabilityQuery query) {
        return Result.success(roomService.availability(query));
    }

    /** 城市清单（筛选项与表单候选数据源，禁止前端硬编码城市名） */
    @GetMapping("/cities")
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<List<String>> cities() {
        return Result.success(roomService.cities());
    }

    /** 园区清单；传 city 则只返回该城市下的园区（筛选项数据源，禁止前端硬编码园区名） */
    @GetMapping("/campuses")
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<List<String>> campuses(@RequestParam(required = false) String city) {
        return Result.success(roomService.campuses(city));
    }

    /** 指定园区下的楼栋清单 */
    @GetMapping("/buildings")
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<List<String>> buildings(@RequestParam(required = false) String campus) {
        return Result.success(roomService.buildings(campus));
    }

    /** 指定园区+楼栋下的楼层清单 */
    @GetMapping("/floors")
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<List<String>> floors(@RequestParam(required = false) String campus,
                                       @RequestParam(required = false) String building) {
        return Result.success(roomService.floors(campus, building));
    }

    /** 房间详情（含生效规则来源标记与未来占用数） */
    @GetMapping("/{id}")
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<MeetingRoomDto.VO> detail(@PathVariable long id) {
        return Result.success(roomService.detail(id));
    }

    /** 房间的未来预约（详情页「占用情况」；hide_title 房间只回"已占用"） */
    @GetMapping("/{id}/upcoming")
    @RequirePermission(menu = ROOM, anyOf = {BOOKING})
    public Result<List<MeetingRoomDto.UpcomingVO>> upcoming(@PathVariable long id) {
        return Result.success(roomService.upcoming(id));
    }

    /** 新增会议室（行政专属） */
    @PostMapping
    @RequirePermission(menu = ROOM, action = MeetingConstants.ACTION_CREATE)
    public Result<Long> create(@RequestBody @Valid MeetingRoomDto.Form form) {
        return Result.success("會議室已創建", roomService.create(form));
    }

    /** 编辑会议室：expectVersion 不匹配即拒绝，不静默覆盖 */
    @PutMapping("/{id}")
    @RequirePermission(menu = ROOM, action = MeetingConstants.ACTION_EDIT)
    public Result<Void> update(@PathVariable long id, @RequestBody @Valid MeetingRoomDto.Form form) {
        roomService.update(id, form);
        return Result.success("會議室已保存", null);
    }

    /** 变更房间状态（列表 Switch，前端已二次确认，服务端仍重验） */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = ROOM, action = MeetingConstants.ACTION_EDIT)
    public Result<Void> changeStatus(@PathVariable long id,
                                     @RequestBody @Valid MeetingRoomDto.StatusChange change) {
        roomService.changeStatus(id, change);
        return Result.success("會議室狀態已更新", null);
    }

    /** 删除会议室（逻辑删；存在未结束占用时拒绝并提示先处理） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = ROOM, action = MeetingConstants.ACTION_EDIT)
    public Result<Void> delete(@PathVariable long id, @RequestBody @Valid MeetingRoomDto.DeleteForm form) {
        roomService.delete(id, form);
        return Result.success("會議室已刪除", null);
    }
}
