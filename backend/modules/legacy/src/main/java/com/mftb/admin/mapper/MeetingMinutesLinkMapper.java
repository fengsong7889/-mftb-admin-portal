package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesLink;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Collection;
import java.util.List;

/**
 * 纪要关联 Mapper。
 *
 * <p>保存策略与事项一致：先按审批结果重建（物理删旧 + 插新），因为关联是"这次提交选了哪些"，
 * 不是增量操作；重复关联同一份纪要由唯一键挡掉（INSERT IGNORE），避免同一来源在页面上出现两次。
 */
@Mapper
public interface MeetingMinutesLinkMapper extends BaseMapper<MeetingMinutesLink> {

    @Select("SELECT * FROM biz_meeting_minutes_link WHERE minutes_id = #{minutesId} ORDER BY id")
    List<MeetingMinutesLink> findByMinutes(@Param("minutesId") long minutesId);

    @Select("<script>"
            + "SELECT * FROM biz_meeting_minutes_link WHERE minutes_id IN "
            + "<foreach collection='minutesIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY minutes_id, id"
            + "</script>")
    List<MeetingMinutesLink> findByMinutesIds(@Param("minutesIds") Collection<Long> minutesIds);

    /** 重建关联：先把旧的清掉（关联是"这次选了哪些"，不是增量） */
    @Delete("DELETE FROM biz_meeting_minutes_link WHERE minutes_id = #{minutesId}")
    int deleteByMinutes(@Param("minutesId") long minutesId);

    @Insert("INSERT IGNORE INTO biz_meeting_minutes_link "
            + "(minutes_id, linked_minutes_id, linked_minutes_no, linked_booking_no, linked_title, linked_time_text) "
            + "VALUES (#{minutesId}, #{linkedMinutesId}, #{linkedMinutesNo}, #{linkedBookingNo}, "
            + " #{linkedTitle}, #{linkedTimeText})")
    int insertIgnore(@Param("minutesId") long minutesId,
                     @Param("linkedMinutesId") long linkedMinutesId,
                     @Param("linkedMinutesNo") String linkedMinutesNo,
                     @Param("linkedBookingNo") String linkedBookingNo,
                     @Param("linkedTitle") String linkedTitle,
                     @Param("linkedTimeText") String linkedTimeText);
}
