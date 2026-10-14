package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingAttendee;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** 参会人 Mapper */
@Mapper
public interface MeetingAttendeeMapper extends BaseMapper<MeetingAttendee> {

    /** 一场会议的全体参会人（详情页与通知名单的唯一取数入口） */
    @Select("SELECT * FROM biz_meeting_attendee WHERE deleted = 0 AND booking_id = #{bookingId} "
            + "ORDER BY FIELD(attendee_type, 'organizer','required','optional','external'), id")
    List<MeetingAttendee> findByBooking(@Param("bookingId") long bookingId);

    /**
     * 批量取多场会议的参会人（列表页一次拿完，避免逐场查询的 N+1）。
     * <p>roomIds 由服务层保证非空，空集合交给调用方短路，不生成 {@code IN ()} 这种非法 SQL。
     */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_attendee WHERE deleted = 0 AND booking_id IN "
            + "<foreach item='id' collection='bookingIds' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY booking_id, id"
            + "</script>")
    List<MeetingAttendee> findByBookings(@Param("bookingIds") List<Long> bookingIds);

    /**
     * 我关联的全部会议 id（列表 scope=mine|attended 的行级范围前置取数）。
     * <p>用在包装器里拼子查询也能做，但把表名与列名写进服务层的条件拼装里，
     * 下次改表就找不到地点了；这里集中取回后由服务层用 IN 过滤。
     */
    @Select("SELECT booking_id FROM biz_meeting_attendee WHERE deleted = 0 AND user_id = #{userId}")
    List<Long> findBookingIdsByUser(@Param("userId") long userId);

    /** 我名下待响应的邀约数（列表 Tab 徽标与红点） */
    @Select("SELECT COUNT(*) FROM biz_meeting_attendee a JOIN biz_meeting_booking b "
            + "ON b.id = a.booking_id AND b.deleted = 0 "
            + "WHERE a.deleted = 0 AND a.user_id = #{userId} AND a.response = 'pending' "
            + "AND a.attendee_type <> 'organizer' AND b.status = 'booked' AND b.start_time > NOW()")
    int countPendingResponse(@Param("userId") long userId);

    /** 某场会的参会人数（详情页待办徽标与 attendee_count 对账用） */
    @Select("SELECT COUNT(*) FROM biz_meeting_attendee WHERE deleted = 0 AND booking_id = #{bookingId}")
    int countByBooking(@Param("bookingId") long bookingId);

    /**
     * 某人是否在这场会的名单里（读取守卫的 IDOR 判定）。
     * <p>外部参会人 user_id 为 NULL，因此必须按 id 等值比对，不能拿姓名或工号判身份。
     */
    @Select("SELECT COUNT(*) FROM biz_meeting_attendee WHERE deleted = 0 "
            + "AND booking_id = #{bookingId} AND user_id = #{userId}")
    int countAttendee(@Param("bookingId") long bookingId, @Param("userId") long userId);

    /**
     * 回写投递态（详情页要能在不打开通知明细的情况下就看出"谁没收到"）。
     * <p>只改指定人的行：未绑定钉钉的人不得影响其他人的状态。
     */
    @Update("<script>"
            + "UPDATE biz_meeting_attendee SET notify_status = #{status}, notify_note = #{note}, updated_at = NOW() "
            + "WHERE deleted = 0 AND booking_id = #{bookingId} AND attendee_type &lt;&gt; 'organizer' "
            + "AND user_id IN <foreach item='u' collection='userIds' open='(' separator=',' close=')'>#{u}</foreach>"
            + "</script>")
    int updateNotifyStatus(@Param("bookingId") long bookingId,
                           @Param("userIds") List<Long> userIds,
                           @Param("status") String status,
                           @Param("note") String note);

    /** 批量回写同一投递态：组内人数不多（<=200），一次 UPDATE 比逐人循环可信 */
    @Update("UPDATE biz_meeting_attendee SET notify_status = #{status}, notify_note = #{note}, updated_at = NOW() "
            + "WHERE deleted = 0 AND booking_id = #{bookingId} AND user_id = #{userId}")
    int updateNotifyForUser(@Param("bookingId") long bookingId,
                            @Param("userId") long userId,
                            @Param("status") String status,
                            @Param("note") String note);
}
