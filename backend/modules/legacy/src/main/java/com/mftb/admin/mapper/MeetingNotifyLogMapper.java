package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingNotifyLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 会议通知投递留痕 Mapper（同时充当重试队列）。
 *
 * <p>多实例安全的做法与 RDM 通知队列一致：<b>不靠命名锁</b>，靠「条件更新抢占」——
 * {@code GET_LOCK} 与连接的绑定关系跨连接行为不可靠，而 {@code UPDATE ... WHERE send_status IN (...)}
 * 的影响行数只会被一个执行者拿到 1，天然保证同一任务只被投递一次。
 */
@Mapper
public interface MeetingNotifyLogMapper extends BaseMapper<MeetingNotifyLog> {

    /**
     * 幂等插入：同一（会议, 事件, 接收人）只有一行。
     *
     * <p>返回 0 表示已存在，调用方去读那一条决定要不要补发；这条唯一键是
     * 「开始前提醒只发一次」的底线，缺了它每轮 Job 都会给全员重发一遍。
     *
     * <p>{@code errorMsg} 在插入时就写入：skipped 是终态，没有原因就变成
     * 「状态说没发、没人说为什么」；pending 传 NULL。
     */
    @Insert("INSERT IGNORE INTO biz_meeting_notify_log "
            + "(booking_id, booking_no, event_code, scenario, channel, receiver_user_id, receiver_name, "
            + " receiver_emp_no, receiver_dingtalk_id, send_status, retry_count, next_retry_at, error_msg) "
            + "VALUES (#{bookingId}, #{bookingNo}, #{eventCode}, #{scenario}, 'DINGTALK', #{receiverUserId}, "
            + " #{receiverName}, #{receiverEmpNo}, #{receiverDingtalkId}, #{sendStatus}, 0, #{nextRetryAt}, #{errorMsg})")
    int insertIgnore(@Param("bookingId") long bookingId,
                     @Param("bookingNo") String bookingNo,
                     @Param("eventCode") String eventCode,
                     @Param("scenario") String scenario,
                     @Param("receiverUserId") Long receiverUserId,
                     @Param("receiverName") String receiverName,
                     @Param("receiverEmpNo") String receiverEmpNo,
                     @Param("receiverDingtalkId") String receiverDingtalkId,
                     @Param("sendStatus") String sendStatus,
                     @Param("nextRetryAt") LocalDateTime nextRetryAt,
                     @Param("errorMsg") String errorMsg);

    /** 按幂等键读取已有留痕行 */
    @Select("SELECT * FROM biz_meeting_notify_log WHERE deleted = 0 AND booking_id = #{bookingId} "
            + "AND event_code = #{eventCode} AND receiver_user_id = #{receiverUserId} LIMIT 1")
    MeetingNotifyLog findByDedupKey(@Param("bookingId") long bookingId,
                                    @Param("eventCode") String eventCode,
                                    @Param("receiverUserId") long receiverUserId);

    /** 到期待投递的任务 id（next_retry_at 为空视为立即可发） */
    @Select("SELECT id FROM biz_meeting_notify_log WHERE deleted = 0 "
            + "AND send_status IN ('pending','failed') "
            + "AND (next_retry_at IS NULL OR next_retry_at <= NOW()) "
            + "AND retry_count < #{maxRetry} ORDER BY next_retry_at, id LIMIT #{limit}")
    List<Long> findDueIds(@Param("limit") int limit, @Param("maxRetry") int maxRetry);

    /** 抢占任务：影响 1 行才归本执行者发送，其余执行者拿到 0 直接跳过 */
    @Update("UPDATE biz_meeting_notify_log SET send_status = 'sending', updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0 AND send_status IN ('pending','failed')")
    int claim(@Param("id") long id);

    /** 执行者重启遗留的 sending 回收：超过 stuckMinutes 分钟视为丢失，退回 failed 补发 */
    @Update("UPDATE biz_meeting_notify_log SET send_status = 'failed', next_retry_at = NOW(), updated_at = NOW() "
            + "WHERE deleted = 0 AND send_status = 'sending' "
            + "AND updated_at < DATE_SUB(NOW(), INTERVAL #{stuckMinutes} MINUTE)")
    int recoverStuck(@Param("stuckMinutes") int stuckMinutes);

    @Update("UPDATE biz_meeting_notify_log SET send_status = 'success', error_msg = NULL, next_retry_at = NULL, "
            + "updated_at = NOW() WHERE id = #{id} AND deleted = 0")
    int markSuccess(@Param("id") long id);

    /** 跳过（未绑定钉钉/场景未启用等）：终态，不进入重试，但必须留原因可排查 */
    @Update("UPDATE biz_meeting_notify_log SET send_status = 'skipped', error_msg = #{reason}, "
            + "next_retry_at = NULL, updated_at = NOW() WHERE id = #{id} AND deleted = 0")
    int markSkipped(@Param("id") long id, @Param("reason") String reason);

    /** 失败：递增重试次数并给出下次重试时间；退避由服务层计算，避免 SQL 里做算术 */
    @Update("UPDATE biz_meeting_notify_log SET send_status = 'failed', error_msg = #{errorMsg}, "
            + "retry_count = retry_count + 1, next_retry_at = #{nextRetryAt}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0")
    int markFailed(@Param("id") long id,
                   @Param("errorMsg") String errorMsg,
                   @Param("nextRetryAt") LocalDateTime nextRetryAt);

    /** 一场会议的投递明细（详情页「通知投递状态」，让「没收到」变成可核对的事实） */
    @Select("SELECT * FROM biz_meeting_notify_log WHERE deleted = 0 AND booking_id = #{bookingId} "
            + "ORDER BY event_code, receiver_name")
    List<MeetingNotifyLog> findByBooking(@Param("bookingId") long bookingId);

    /**
     * 邀约场景下未送达的<b>人数</b>（详情页顶部提示「N 人未收到邀約」）。
     *
     * <p>只统计 meeting_invite：提醒与告知类通知本来就不发给个别人（未绑定钉钉等），
     * 把它们混进来会让组织者误以为「邀约没发出去」。
     *
     * <p>必须按人算而不是按留痕行算：一个人同时有「建立」与「取消」两条 skipped 记录时，
     * 数行会得到「2 人未收到」而实际只有 1 人（现场踩过）。同理，只要他有过一条成功投递，
     * 就不能再说没收到。
     */
    @Select("SELECT COUNT(*) FROM ("
            + "SELECT receiver_user_id FROM biz_meeting_notify_log "
            + "WHERE deleted = 0 AND booking_id = #{bookingId} AND scenario = 'meeting_invite' "
            + "AND receiver_user_id IS NOT NULL GROUP BY receiver_user_id "
            + "HAVING SUM(send_status = 'skipped') > 0 AND SUM(send_status = 'success') = 0) unpaid")
    int countInviteSkipped(@Param("bookingId") long bookingId);
}
