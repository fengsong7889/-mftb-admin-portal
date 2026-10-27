package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutes;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 会议纪要主表 Mapper。
 *
 * <p>读写都只按"唯一的那条"取：{@code uk_meeting_minutes_booking} 保证一场会一条，
 * 因此这里不提供"取最新一条"的兜底查询——真有两条并存时该撞约束报错，而不是静默挑一条。
 */
@Mapper
public interface MeetingMinutesMapper extends BaseMapper<MeetingMinutes> {

    /** 按会议单取纪要（一场会最多一条有效） */
    @Select("SELECT * FROM biz_meeting_minutes WHERE deleted = 0 AND booking_id = #{bookingId} LIMIT 1")
    MeetingMinutes findByBooking(@Param("bookingId") long bookingId);

    /**
     * 批量按会议单取纪要：列表页要给每行标"已錄入紀要"，逐行查会变成 N+1 请求。
     * 空集合由调用方挡在门外（MyBatis 的 IN () 空列表是非法 SQL）。
     */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_minutes WHERE deleted = 0 AND booking_id IN "
            + "<foreach collection='bookingIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + "</script>")
    List<MeetingMinutes> findByBookings(@Param("bookingIds") Collection<Long> bookingIds);

    /**
     * 同一周期系列的纪要（按 seriesSeq 升序）：满足"开了多场要连着看"的体验诉求。
     * series_id 为 NULL 的单场会议不参与，调用方需先判空。
     */
    @Select("SELECT * FROM biz_meeting_minutes WHERE deleted = 0 AND series_id = #{seriesId} "
            + "ORDER BY series_seq, id")
    List<MeetingMinutes> findBySeries(@Param("seriesId") long seriesId);

    /** 令牌版本递增（作废历史免登链接）：带旧版本条件，避免并发下两个操作者互相覆盖 */
    @Update("UPDATE biz_meeting_minutes SET token_version = token_version + 1, "
            + "updated_by = #{updatedBy}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0 AND token_version = #{expectVersion}")
    int bumpTokenVersion(@Param("id") long id,
                         @Param("expectVersion") int expectVersion,
                         @Param("updatedBy") String updatedBy);

    /** 发送结果回写：批次数 +1 并刷新状态与最近发送时间（只在批次落库成功后调用） */
    @Update("UPDATE biz_meeting_minutes SET status = 'sent', "
            + "send_count = send_count + 1, last_send_at = #{sentAt}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0")
    int markSent(@Param("id") long id, @Param("sentAt") LocalDateTime sentAt);
}
