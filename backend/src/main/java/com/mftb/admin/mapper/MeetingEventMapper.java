package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 会议审计事件 Mapper。
 *
 * <p>只提供插入与查询：审计轨迹一旦被业务页面删改，「谁在什么时候占了哪间房」
 * 就重新变成不可证明的事，因此这里不出现任何 update / delete 方法。
 */
@Mapper
public interface MeetingEventMapper extends BaseMapper<MeetingEvent> {

    /** 一场会议的完整轨迹（详情页「操作记录」模块） */
    @Select("SELECT * FROM biz_meeting_event WHERE booking_id = #{bookingId} ORDER BY occurred_at, id")
    List<MeetingEvent> findByBooking(@Param("bookingId") long bookingId);

    /**
     * 一间会议室的档案轨迹（房间详情页「变更记录」）。
     * <p>容量、可预约窗、是否脱敏主题这些规则都会改变别人的预约结果，
     * 「谁在哪天把上限从 240 调到 60」必须可查。
     */
    @Select("SELECT * FROM biz_meeting_event WHERE room_id = #{roomId} ORDER BY occurred_at DESC, id DESC LIMIT 100")
    List<MeetingEvent> findByRoom(@Param("roomId") long roomId);

    /** 幂等键命中已有轨迹：重复点击/网络重试不得长出两条相同记录 */
    @Select("SELECT COUNT(*) FROM biz_meeting_event WHERE operator_id = #{operatorId} "
            + "AND request_key = #{requestKey}")
    int countByIdempotencyKey(@Param("operatorId") long operatorId, @Param("requestKey") String requestKey);
}
