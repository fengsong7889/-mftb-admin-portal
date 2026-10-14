package com.mftb.admin.service;

import com.mftb.admin.dto.MeetingRoomDto;

import java.util.List;

/**
 * 会议室档案服务（会议域的资源台账）。
 *
 * <p>职责边界：只管"房间本身"的档案与可预约性判定。窗口占用（谁在什么时候占了哪间房）
 * 属于 {@link MeetingBookingService}，本服务不写预约表；
 * 规则默认值的回落口径由 {@link MeetingRuleService} 统一裁决，本服务只做维护与回显。
 *
 * <p>可见性口径：会议室档案对全员可见（预约页要浏览选房），但**只有行政可增删改**；
 * {@code hideTitle=1} 的房间在忙闲视图里脱敏主题，这是房间级属性而不是权限，
 * 因此判定必须落在取数处，不能指望前端不显示。
 */
public interface MeetingRoomService {

    /** 列表 + 同口径统计卡（统计必须跟随当前筛选条件，见 AGENTS.md §E.8） */
    MeetingRoomDto.PageWithStats listWithStats(MeetingRoomDto.Query query);

    /** 房间详情（含生效规则来源标记与未来占用数） */
    MeetingRoomDto.VO detail(long id);

    /** 新增房间档案，返回主键 */
    long create(MeetingRoomDto.Form form);

    /** 编辑房间档案：expectVersion 比对失败即报错，不静默覆盖 */
    void update(long id, MeetingRoomDto.Form form);

    /** 变更房间状态（active/maintenance/disabled）；停用不影响历史会议，只挡新预约 */
    void changeStatus(long id, MeetingRoomDto.StatusChange change);

    /**
     * 删除房间（逻辑删）。
     *
     * <p>存在未结束的占用窗口时禁止删除：历史预约引用房间快照，删掉档案后
     * 「这间房当时能坐多少人」就再也查不到，行政也无法核对现场。
     */
    void delete(long id, MeetingRoomDto.DeleteForm form);

    /** 忙闲矩阵：一次请求取回多间房在给定窗口内的占用情况 */
    List<MeetingRoomDto.Availability> availability(MeetingRoomDto.AvailabilityQuery query);

    /** 指定房间的未来预约清单（详情页「占用情况」页签） */
    List<MeetingRoomDto.UpcomingVO> upcoming(long id);

    /** 预约页房间候选（只返回可预约且启用的房间，携带生效规则便于前端预校验） */
    List<MeetingRoomDto.VO> bookableOptions();

    /** 园区清单（筛选项数据源，避免前端硬编码园区名） */
    List<String> campuses();

    /** 指定园区下的楼栋清单 */
    List<String> buildings(String campus);

    /** 指定园区+楼栋下的楼层清单 */
    List<String> floors(String campus, String building);
}
