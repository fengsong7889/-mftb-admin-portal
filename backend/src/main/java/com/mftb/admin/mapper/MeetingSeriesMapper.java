package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingSeries;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 周期会议系列 Mapper */
@Mapper
public interface MeetingSeriesMapper extends BaseMapper<MeetingSeries> {

    /** 按 id 加行锁读取：取消与修改系列都要在锁边界内决定"哪些实例还算未来" */
    @Select("SELECT * FROM biz_meeting_series WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    MeetingSeries selectForUpdate(@Param("id") long id);

    /** 幂等键命中已有系列：重复点击不再物化第二批实例 */
    @Select("SELECT * FROM biz_meeting_series WHERE organizer_id = #{organizerId} "
            + "AND request_key = #{requestKey} AND deleted = 0 ORDER BY id LIMIT 1")
    MeetingSeries findByIdempotencyKey(@Param("organizerId") long organizerId,
                                       @Param("requestKey") String requestKey);

    /** 某人当前仍生效的系列数（系列详情页与我的会议提示用） */
    @Select("SELECT COUNT(*) FROM biz_meeting_series WHERE deleted = 0 AND status = 'active' "
            + "AND organizer_id = #{organizerId} AND (end_date IS NULL OR end_date >= CURDATE())")
    int countActiveByOrganizer(@Param("organizerId") long organizerId);

    /** 会议室是否已被别的系列长期占用（档案页停用前的守卫之一） */
    @Select("SELECT COUNT(*) FROM biz_meeting_series WHERE deleted = 0 AND status = 'active' "
            + "AND room_id = #{roomId} AND (end_date IS NULL OR end_date >= CURDATE())")
    int countActiveByRoom(@Param("roomId") long roomId);
}
