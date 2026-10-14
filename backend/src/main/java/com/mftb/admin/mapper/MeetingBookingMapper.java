package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingBooking;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 会议预约单 Mapper。
 *
 * <p>本接口里的重叠判定 SQL 是冲突防护的第二层（第一层是 {@code selectForUpdate} 拿到的房间行锁），
 * 所有重叠条件一律写成 {@code start < :end AND end > :start} 的左闭右开形态，
 * 与 {@code MeetingConstants.OCCUPYING_STATUSES} 绑定使用：状态集合或边界任一处漂移，
 * 都会同时出现「能重复订同一间房」和「房间空着却报冲突」两种相反错误。
 */
@Mapper
public interface MeetingBookingMapper extends BaseMapper<MeetingBooking> {

    /** 按 id 加行锁读取（改期/取消/签到必须在同一锁边界内判定与推进） */
    @Select("SELECT * FROM biz_meeting_booking WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    MeetingBooking selectForUpdate(@Param("id") long id);

    /** 幂等键命中已有预约：重复点击/网络重试直接返回原结果，不再二次占用窗口 */
    @Select("SELECT * FROM biz_meeting_booking WHERE organizer_id = #{organizerId} "
            + "AND request_key = #{requestKey} AND deleted = 0 ORDER BY id LIMIT 1")
    MeetingBooking findByIdempotencyKey(@Param("organizerId") long organizerId,
                                       @Param("requestKey") String requestKey);

    /**
     * 指定房间在给定窗口内的占用冲突单（锁内当前读）。
     *
     * <p>只返回冲突单本身，供服务层拼「与谁的哪场会冲突」的可读提示；
     * 状态条件必须与 {@code MeetingConstants.OCCUPYING_STATUSES} 一致。
     */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_booking "
            + "WHERE deleted = 0 AND room_id = #{roomId} "
            + "AND status IN ('booked','checked_in') "
            + "AND start_time &lt; #{end} AND end_time &gt; #{start} "
            + "<if test='excludeId != null'> AND id &lt;&gt; #{excludeId} </if>"
            + "ORDER BY start_time LIMIT 10"
            + "</script>")
    List<MeetingBooking> findRoomConflicts(@Param("roomId") long roomId,
                                           @Param("start") LocalDateTime start,
                                           @Param("end") LocalDateTime end,
                                           @Param("excludeId") Long excludeId);

    /**
     * 同一组织者在给定窗口内的其他会议（对标钉钉「限制同时段预定多会议室」）。
     *
     * <p>一个人同时占两间房并不能让他同时出现在两个会场，因此这条判定与房间冲突同级：
     * 任一命中即拒绝。跨房间检查无法用生成列唯一键兜底，只能靠这里。
     */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_booking "
            + "WHERE deleted = 0 AND organizer_id = #{organizerId} "
            + "AND status IN ('booked','checked_in') "
            + "AND start_time &lt; #{end} AND end_time &gt; #{start} "
            + "<if test='excludeId != null'> AND id &lt;&gt; #{excludeId} </if>"
            + "ORDER BY start_time LIMIT 10"
            + "</script>")
    List<MeetingBooking> findOrganizerConflicts(@Param("organizerId") long organizerId,
                                                @Param("start") LocalDateTime start,
                                                @Param("end") LocalDateTime end,
                                                @Param("excludeId") Long excludeId);

    /**
     * 忙闲矩阵：一次请求取回多间房在给定窗口内的全部占用段。
     *
     * <p>故意不按 roomId 逐间查：预约页一屏十几间房，逐间查就是十几个往返，
     * 而且"先查空闲再下单"之间隔着多次网络往返，抢位窗口被拉到秒级。
     */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_booking "
            + "WHERE deleted = 0 AND status IN ('booked','checked_in') "
            + "AND start_time &lt; #{end} AND end_time &gt; #{start} "
            + "AND room_id IN <foreach item='r' collection='roomIds' open='(' separator=',' close=')'>#{r}</foreach> "
            + "ORDER BY room_id, start_time"
            + "</script>")
    List<MeetingBooking> findOccupiedSlots(@Param("roomIds") List<Long> roomIds,
                                           @Param("start") LocalDateTime start,
                                           @Param("end") LocalDateTime end);

    /**
     * 我参与或我发起的会议（日程视图取数）。
     *
     * <p>走 {@code biz_meeting_attendee} 关联而不是 organizer_id OR 判断：组织者也会落一行
     * {@code attendee_type=organizer}，因此一条 JOIN 就覆盖两种身份，不会出现「我发起的能看见、
     * 我参与的看不见」这类漏人错误。
     */
    @Select("SELECT b.* FROM biz_meeting_booking b "
            + "JOIN biz_meeting_attendee a ON a.booking_id = b.id AND a.deleted = 0 AND a.user_id = #{userId} "
            + "WHERE b.deleted = 0 AND b.end_time >= #{from} AND b.start_time <= #{to} "
            + "ORDER BY b.start_time")
    List<MeetingBooking> findUserSchedule(@Param("userId") long userId,
                                          @Param("from") LocalDateTime from,
                                          @Param("to") LocalDateTime to);

    /** 指定房间的未来占用数：删除会议室前的守卫（有未结束的占用不允许删） */
    @Select("SELECT COUNT(*) FROM biz_meeting_booking WHERE deleted = 0 "
            + "AND room_id = #{roomId} AND status IN ('booked','checked_in') AND end_time > NOW()")
    int countFutureOccupyingByRoom(@Param("roomId") long roomId);

    /**
     * 带状态条件的推进（来源状态 + 版本双条件）。
     *
     * <p>状态条件不是冗余：只校验 version 时，两个并发请求各自读到不同 version 也能双双推进；
     * 加上 fromStatus 才能保证「同一状态只被推进一次」。受影响 0 行必须报错，不能静默覆盖。
     */
    @Update("UPDATE biz_meeting_booking SET status = #{toStatus}, version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND status = #{fromStatus} AND version = #{expectVersion} AND deleted = 0")
    int updateStatusVersioned(@Param("id") long id,
                              @Param("fromStatus") String fromStatus,
                              @Param("toStatus") String toStatus,
                              @Param("expectVersion") int expectVersion,
                              @Param("operator") String operator);

    /**
     * 列表页统计卡：一次聚合拿到各口径计数。
     *
     * <p><b>必须与列表共用同一组条件</b>（AGENTS.md §E.8）：单独发一次不带筛选的统计，
     * 用户看到的就是一屏未被过滤的全量数字，改条件也不动。
     * 状态维度不参与过滤（卡片展示的正是状态 breakdown），时间/房间/范围/关键字照同。
     *
     * <p>{@code finished} 含“已过结束时间但尚未收尾”的占用单：收尾 Job 每分钟才跑一轮，
     * 只按 status 计会让“已完成的会”在卡片区少算一偏。
     */
    @Select("<script>"
            + "SELECT COUNT(*) AS total, "
            + " SUM(status IN ('booked','checked_in') AND start_time &gt; #{now}) AS pending, "
            + " SUM(status IN ('booked','checked_in') AND start_time &lt;= #{now} AND end_time &gt; #{now}) AS ongoing, "
            + " SUM(status = 'finished' OR (status IN ('booked','checked_in') AND end_time &lt;= #{now})) AS finished, "
            + " SUM(status = 'cancelled') AS cancelled, "
            + " SUM(status = 'released') AS released "
            + "FROM biz_meeting_booking WHERE deleted = 0 "
            + "<if test='bookingIds != null'> AND id IN <foreach item='b' collection='bookingIds' open='(' separator=',' close=')'>#{b}</foreach> </if>"
            + "<if test='organizerId != null'> AND organizer_id = #{organizerId} </if>"
            + "<if test='roomId != null'> AND room_id = #{roomId} </if>"
            + "<if test='departmentId != null'> AND department_id = #{departmentId} </if>"
            + "<if test='bizType != null'> AND biz_type = #{bizType} </if>"
            + "<if test='from != null'> AND end_time &gt;= #{from} </if>"
            + "<if test='to != null'> AND start_time &lt;= #{to} </if>"
            + "<if test='keyword != null'> AND (booking_no LIKE #{keyword} OR title LIKE #{keyword}) </if>"
            + "</script>")
    Map<String, Object> countByStatus(@Param("now") LocalDateTime now,
                                      @Param("bookingIds") List<Long> bookingIds,
                                      @Param("organizerId") Long organizerId,
                                      @Param("roomId") Long roomId,
                                      @Param("departmentId") Long departmentId,
                                      @Param("bizType") String bizType,
                                      @Param("from") LocalDateTime from,
                                      @Param("to") LocalDateTime to,
                                      @Param("keyword") String keyword);

    /**
     * 我的会议摘要计数（一次取回今日/未来/待响应，不为三个数字发三次查询）。
     *
     * <p>今日与未来都走 {@code biz_meeting_attendee} 关联而不是 organizer_id：组织者也会落一行
     * {@code attendee_type=organizer}，一条 JOIN 就覆盖“我发起的 + 我参与的”，不会出现只看到自己发起的偏误。
     * <p>{@code pendingResponseCount} 只算已发出仍未结束的邀约：组织者自己不应被计入待响应。
     */
    @Select("SELECT "
            + " (SELECT COUNT(*) FROM biz_meeting_booking b JOIN biz_meeting_attendee a "
            + "   ON a.booking_id = b.id AND a.deleted = 0 AND a.user_id = #{userId} "
            + "   WHERE b.deleted = 0 AND b.status IN ('booked','checked_in') "
            + "   AND DATE(b.start_time) = CURDATE()) AS todayCount, "
            + " (SELECT COUNT(*) FROM biz_meeting_booking b JOIN biz_meeting_attendee a "
            + "   ON a.booking_id = b.id AND a.deleted = 0 AND a.user_id = #{userId} "
            + "   WHERE b.deleted = 0 AND b.status IN ('booked','checked_in') AND b.start_time > NOW() "
            + "   AND b.start_time < DATE_ADD(NOW(), INTERVAL 7 DAY)) AS upcomingCount, "
            + " (SELECT COUNT(*) FROM biz_meeting_attendee a JOIN biz_meeting_booking b ON b.id = a.booking_id "
            + "   AND b.deleted = 0 WHERE a.deleted = 0 AND a.user_id = #{userId} AND a.response = 'pending' "
            + "   AND a.attendee_type <> 'organizer' AND b.status = 'booked' AND b.start_time > NOW()) AS pendingResponseCount")
    Map<String, Object> countMySummary(@Param("userId") long userId);

    /* ==================== M2：周期实例 / 签到释放 / 每日收尾 ==================== */

    /**
     * 一个系列的全部实例（详情页「已生成 N 场」列表）。
     *
     * <p>按 {@code series_seq} 而不是时点排序：序号才是"第几次"的真值，
     * 单独改期某一场后它的时点会变，但它在系列里的位置不应该变。
     */
    @Select("SELECT * FROM biz_meeting_booking WHERE deleted = 0 AND series_id = #{seriesId} "
            + "ORDER BY series_seq")
    List<MeetingBooking> findSeriesInstances(@Param("seriesId") long seriesId);

    /** 系列内当前最大序号（修改模板新增未来实例时接着往后排，不能从 1 重新数） */
    @Select("SELECT COALESCE(MAX(series_seq), 0) FROM biz_meeting_booking WHERE deleted = 0 AND series_id = #{seriesId}")
    int maxSeriesSeq(@Param("seriesId") long seriesId);

    /** 「此次及以后」用的目标集：未开始的实例（已开始与已结束的按历史事实保留，不得被改动） */
    @Select("SELECT * FROM biz_meeting_booking WHERE deleted = 0 AND series_id = #{seriesId} "
            + "AND status IN ('booked','checked_in') AND start_time > #{now} ORDER BY series_seq")
    List<MeetingBooking> findFutureInstances(@Param("seriesId") long seriesId,
                                            @Param("now") LocalDateTime now);

    /**
     * 近 N 天的爽约次数（自动拉黑阈值的数据源）。
     *
     * <p>只算 {@code no_show_flag=1} 的释放单：主动取消与提前结束都不是爽约，
     * 把它们算进去会让"经常改安排的人"被误锁，而真正的占坑不来反而看不出来。
     */
    @Select("SELECT COUNT(*) FROM biz_meeting_booking WHERE deleted = 0 AND organizer_id = #{organizerId} "
            + "AND status = 'released' AND no_show_flag = 1 AND release_at >= #{since}")
    int countNoShowSince(@Param("organizerId") long organizerId, @Param("since") LocalDateTime since);

    /**
     * 超时未签到待释放的会议（房间启用签到时）。
     *
     * <p>释放分钟数的回落口径在 SQL 里用 {@code COALESCE(房间列, 传入默认值)} 完成：
     * 与 {@code MeetingRuleService} 同一思路，但 Job 要批量取数，不可能逐条再走一次服务层回落。
     */
    @Select("SELECT b.* FROM biz_meeting_booking b JOIN biz_meeting_room r ON r.id = b.room_id AND r.deleted = 0 "
            + "WHERE b.deleted = 0 AND b.status = 'booked' AND r.checkin_required = 1 "
            + "AND DATE_ADD(b.start_time, INTERVAL COALESCE(r.release_after_minutes, #{defaultReleaseMinutes}) MINUTE) <= NOW() "
            + "AND b.start_time < NOW() ORDER BY b.start_time LIMIT #{limit}")
    List<MeetingBooking> findReleasable(@Param("defaultReleaseMinutes") int defaultReleaseMinutes,
                                        @Param("limit") int limit);

    /** 即将开始且未提醒的会议（提醒投递靠通知留痕表唯一键保证只发一次，本查询可以每轮重复命中） */
    @Select("SELECT * FROM biz_meeting_booking WHERE deleted = 0 AND status = 'booked' "
            + "AND start_time > NOW() AND start_time <= DATE_ADD(NOW(), INTERVAL #{remindMinutes} MINUTE) "
            + "ORDER BY start_time LIMIT #{limit}")
    List<MeetingBooking> findRemindDue(@Param("remindMinutes") int remindMinutes, @Param("limit") int limit);

    /** 已过结束时间但仍标为占用中的单（每日收尾 Job：未启用签到的房间直接计 finished） */
    @Select("SELECT * FROM biz_meeting_booking WHERE deleted = 0 AND status IN ('booked','checked_in') "
            + "AND end_time <= #{now} ORDER BY end_time LIMIT #{limit}")
    List<MeetingBooking> findStaleOccupying(@Param("now") LocalDateTime now, @Param("limit") int limit);

    /**
     * 待标记离职的参会人行（每日收尾：未来会议 + 账号已停用）。
     *
     * <p>返回行后由服务层逐人置 {@code response=invalid}：历史会议不改写，
     * 只把未来邀约的名单标失效，否则"人已离职但日程里还在开会"会永远挂着。 */
    @Select("SELECT a.* FROM biz_meeting_attendee a "
            + "JOIN biz_meeting_booking b ON b.id = a.booking_id AND b.deleted = 0 "
            + "JOIN sys_user u ON u.id = a.user_id AND u.deleted = 0 "
            + "WHERE a.deleted = 0 AND b.status IN ('booked','checked_in') AND b.start_time > NOW() AND u.status <> 1 "
            + "ORDER BY a.id LIMIT #{limit}")
    List<com.mftb.admin.entity.MeetingAttendee> findDeactivatedAttendees(@Param("limit") int limit);
}
