package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesSend;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.Collection;
import java.util.List;

/**
 * 会议纪要发送批次 Mapper。
 *
 * <p>批次结论不靠"发的时候以为成功"，由 {@link #refreshOutcome} 从明细行反算：
 * 投递是异步的，写回只在渠道回调里发生，批次状态永远是明细的函数。
 */
@Mapper
public interface MeetingMinutesSendMapper extends BaseMapper<MeetingMinutesSend> {

    /** 一场纪要的发送历史（最近一批在前） */
    @Select("SELECT * FROM biz_meeting_minutes_send WHERE deleted = 0 AND minutes_id = #{minutesId} "
            + "ORDER BY batch_seq DESC, id DESC")
    List<MeetingMinutesSend> findByMinutes(@Param("minutesId") long minutesId);

    /**
     * 最近一批发过群的批次：事项完成通知要回到"当初发纪要的那个群"，没人会在处理一条待办时
     * 重新选一遍群；没有发过群则返回 null（此时不通知群，只留审计）。
     */
    @Select("SELECT * FROM biz_meeting_minutes_send WHERE minutes_id = #{minutesId} "
            + "AND group_channel_id IS NOT NULL AND deleted = 0 ORDER BY batch_seq DESC LIMIT 1")
    MeetingMinutesSend findLastGroupBatch(@Param("minutesId") long minutesId);

    /** 列表页批量取批次（纪要状态与「已發送 N 次」由主表冗余列提供，这里只服务详情页） */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_minutes_send WHERE deleted = 0 AND minutes_id IN "
            + "<foreach collection='minutesIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY minutes_id, batch_seq DESC"
            + "</script>")
    List<MeetingMinutesSend> findByMinutesIds(@Param("minutesIds") Collection<Long> minutesIds);

    /**
     * 下一批次号。
     * <p>只读不锁：两个人同时点发送会拿到同一个值，此时 {@code uk_meeting_minutes_send_seq}
     * 让后写入者撞唯一键，服务层捕获后重算一次再写——宁可撞键重来，不要静默覆盖对方的批次。
     */
    @Select("SELECT COALESCE(MAX(batch_seq), 0) + 1 FROM biz_meeting_minutes_send "
            + "WHERE deleted = 0 AND minutes_id = #{minutesId}")
    int nextBatchSeq(@Param("minutesId") long minutesId);

    /**
     * 由明细反算批次结论。
     *
     * <p>为什么写在 SQL 里而不是"读明细—算状态—回写"：每条投递都在各自的渠道回调里完成，
     * Java 侧的读算写三步之间有窗口，先到的回调会被后到的旧计数覆盖，页面会长期停在
     * 「发送中」或退回已经过去的结论。让数据库自己按当前明细算，就没有这个窗口。
     */
    @Update("UPDATE biz_meeting_minutes_send SET "
            + "success_count = (SELECT COUNT(*) FROM biz_meeting_minutes_delivery d "
            + "               WHERE d.deleted = 0 AND d.send_id = #{sendId} AND d.send_status = 'success'), "
            + "failed_count  = (SELECT COUNT(*) FROM biz_meeting_minutes_delivery d "
            + "               WHERE d.deleted = 0 AND d.send_id = #{sendId} AND d.send_status = 'failed'), "
            + "skipped_count = (SELECT COUNT(*) FROM biz_meeting_minutes_delivery d "
            + "               WHERE d.deleted = 0 AND d.send_id = #{sendId} AND d.send_status = 'skipped'), "
            + "send_status = CASE "
            + "  WHEN EXISTS (SELECT 1 FROM biz_meeting_minutes_delivery d "
            + "                 WHERE d.deleted = 0 AND d.send_id = #{sendId} "
            + "                 AND d.send_status IN ('pending','sending')) THEN 'sending' "
            + "  WHEN NOT EXISTS (SELECT 1 FROM biz_meeting_minutes_delivery d "
            + "                 WHERE d.deleted = 0 AND d.send_id = #{sendId}) THEN 'skipped' "
            + "  WHEN NOT EXISTS (SELECT 1 FROM biz_meeting_minutes_delivery d "
            + "                 WHERE d.deleted = 0 AND d.send_id = #{sendId} AND d.send_status <> 'success') "
            + "      THEN 'success' "
            + "  WHEN NOT EXISTS (SELECT 1 FROM biz_meeting_minutes_delivery d "
            + "                 WHERE d.deleted = 0 AND d.send_id = #{sendId} AND d.send_status = 'success') "
            + "      THEN CASE WHEN EXISTS (SELECT 1 FROM biz_meeting_minutes_delivery d "
            + "                 WHERE d.deleted = 0 AND d.send_id = #{sendId} AND d.send_status = 'failed') "
            + "                 THEN 'failed' ELSE 'skipped' END "
            + "  ELSE 'partial' END, "
            + "updated_at = NOW() WHERE id = #{sendId} AND deleted = 0")
    int refreshOutcome(@Param("sendId") long sendId);

    /** 批次级失败原因（渠道整体拒绝、凭据失效等；明细各自的原因留在明细表） */
    @Update("UPDATE biz_meeting_minutes_send SET error_msg = #{errorMsg}, updated_at = NOW() "
            + "WHERE id = #{sendId} AND deleted = 0")
    int markError(@Param("sendId") long sendId, @Param("errorMsg") String errorMsg);
}
