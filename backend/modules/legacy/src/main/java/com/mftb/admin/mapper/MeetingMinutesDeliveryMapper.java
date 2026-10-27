package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesDelivery;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 会议纪要投递明细 Mapper（同时充当重试队列）。
 *
 * <p>与 {@code MeetingNotifyLogMapper} 同构但不共用表：邀约投递的去重键是
 * {@code (booking_id, event_code, receiver_user_id)}，而纪要的去重键必须带批次
 * ——同一份纪要允许发很多批，每批里同一个人只能有一次。两套键放一张表，
 * 第二批一开始就会被 IGNORE 掉，表现是"再发一次没反应"。
 *
 * <p>多实例安全靠「条件更新抢占」（{@link #claim}），不靠命名锁：{@code GET_LOCK}
 * 与连接的绑定关系跨连接行为不可靠，而 {@code UPDATE ... WHERE send_status IN (...)}
 * 的影响行数只会被一个执行者拿到 1。
 */
@Mapper
public interface MeetingMinutesDeliveryMapper extends BaseMapper<MeetingMinutesDelivery> {

    /**
     * 收件人行幂等插入。
     *
     * <p>{@code errorMsg} 在插入时就写：skipped 是终态，没有原因等于「状态说没发、没人说为什么」；
     * pending 传 NULL。
     */
    @Insert("INSERT IGNORE INTO biz_meeting_minutes_delivery "
            + "(send_id, minutes_id, booking_id, target_type, receiver_user_id, receiver_name, receiver_emp_no, "
            + " receiver_department, receiver_dingtalk_id, scenario, send_status, retry_count, next_retry_at, error_msg) "
            + "VALUES (#{sendId}, #{minutesId}, #{bookingId}, 'USER', #{receiverUserId}, #{receiverName}, "
            + " #{receiverEmpNo}, #{receiverDepartment}, #{receiverDingtalkId}, #{scenario}, #{sendStatus}, "
            + " 0, #{nextRetryAt}, #{errorMsg})")
    int insertUserIgnore(@Param("sendId") long sendId,
                         @Param("minutesId") long minutesId,
                         @Param("bookingId") long bookingId,
                         @Param("receiverUserId") long receiverUserId,
                         @Param("receiverName") String receiverName,
                         @Param("receiverEmpNo") String receiverEmpNo,
                         @Param("receiverDepartment") String receiverDepartment,
                         @Param("receiverDingtalkId") String receiverDingtalkId,
                         @Param("scenario") String scenario,
                         @Param("sendStatus") String sendStatus,
                         @Param("nextRetryAt") LocalDateTime nextRetryAt,
                         @Param("errorMsg") String errorMsg);

    /**
     * 群投递行幂等插入：{@code receiver_user_id} 固定写 0（见 MeetingConstants.MINUTES_GROUP_RECEIVER），
     * 姓名位放渠道名称，让"发给谁"这一列在群里也读得出内容。
     */
    @Insert("INSERT IGNORE INTO biz_meeting_minutes_delivery "
            + "(send_id, minutes_id, booking_id, target_type, receiver_user_id, receiver_name, "
            + " receiver_emp_no, receiver_department, receiver_dingtalk_id, group_channel_id, scenario, "
            + " send_status, retry_count, next_retry_at, error_msg) "
            + "VALUES (#{sendId}, #{minutesId}, #{bookingId}, 'GROUP', 0, #{channelName}, '', '', '', "
            + " #{channelId}, '', #{sendStatus}, 0, #{nextRetryAt}, #{errorMsg})")
    int insertGroupIgnore(@Param("sendId") long sendId,
                          @Param("minutesId") long minutesId,
                          @Param("bookingId") long bookingId,
                          @Param("channelId") long channelId,
                          @Param("channelName") String channelName,
                          @Param("sendStatus") String sendStatus,
                          @Param("nextRetryAt") LocalDateTime nextRetryAt,
                          @Param("errorMsg") String errorMsg);

    /** 某批次的投递明细（详情页展开行） */
    @Select("SELECT * FROM biz_meeting_minutes_delivery WHERE deleted = 0 AND send_id = #{sendId} "
            + "ORDER BY target_type, receiver_name, id")
    List<MeetingMinutesDelivery> findBySend(@Param("sendId") long sendId);

    /** 批量取多个批次的明细，避免发送历史逐批查询 */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_minutes_delivery WHERE deleted = 0 AND send_id IN "
            + "<foreach collection='sendIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY send_id, target_type, receiver_name, id"
            + "</script>")
    List<MeetingMinutesDelivery> findBySends(@Param("sendIds") Collection<Long> sendIds);

    /** 到期待投递的任务 id（next_retry_at 为空视为立即可发） */
    @Select("SELECT id FROM biz_meeting_minutes_delivery WHERE deleted = 0 "
            + "AND send_status IN ('pending','failed') "
            + "AND (next_retry_at IS NULL OR next_retry_at <= NOW()) "
            + "AND retry_count < #{maxRetry} ORDER BY next_retry_at, id LIMIT #{limit}")
    List<Long> findDueIds(@Param("limit") int limit, @Param("maxRetry") int maxRetry);

    /** 抢占任务：影响 1 行才归本执行者发送，其余执行者拿到 0 直接跳过 */
    @Update("UPDATE biz_meeting_minutes_delivery SET send_status = 'sending', updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0 AND send_status IN ('pending','failed')")
    int claim(@Param("id") long id);

    /** 执行者重启遗留的 sending 回收：超过 stuckMinutes 分钟视为丢失，退回 failed 补发 */
    @Update("UPDATE biz_meeting_minutes_delivery SET send_status = 'failed', next_retry_at = NOW(), updated_at = NOW() "
            + "WHERE deleted = 0 AND send_status = 'sending' "
            + "AND updated_at < DATE_SUB(NOW(), INTERVAL #{stuckMinutes} MINUTE)")
    int recoverStuck(@Param("stuckMinutes") int stuckMinutes);

    @Update("UPDATE biz_meeting_minutes_delivery SET send_status = 'success', error_msg = NULL, "
            + "next_retry_at = NULL, updated_at = NOW() WHERE id = #{id} AND deleted = 0")
    int markSuccess(@Param("id") long id);

    /** 跳过（未绑定钉钉/场景未启用/渠道停用等）：终态不重试，但必须留原因可排查 */
    @Update("UPDATE biz_meeting_minutes_delivery SET send_status = 'skipped', error_msg = #{reason}, "
            + "next_retry_at = NULL, updated_at = NOW() WHERE id = #{id} AND deleted = 0")
    int markSkipped(@Param("id") long id, @Param("reason") String reason);

    /** 失败：递增重试次数并给出下次重试时间；退避由服务层计算，不在 SQL 里做算术 */
    @Update("UPDATE biz_meeting_minutes_delivery SET send_status = 'failed', error_msg = #{errorMsg}, "
            + "retry_count = retry_count + 1, next_retry_at = #{nextRetryAt}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0")
    int markFailed(@Param("id") long id,
                   @Param("errorMsg") String errorMsg,
                   @Param("nextRetryAt") LocalDateTime nextRetryAt);

    /**
     * 这个人是否被发送过这场纪要（站内只读可见性的判据）。
     *
     * <p>只要进过任一批次的名单就算可读，包括当时未送达的：需求明确要"发给没参会的人"，
     * 若按投递成功才算可读，未绑定钉钉的人既收不到消息又打不开链接，等于这条需求没做。
     * skipped 的行仍保留"他没收到"的事实，由发送历史表说明。
     */
    @Select("SELECT COUNT(*) FROM biz_meeting_minutes_delivery WHERE deleted = 0 "
            + "AND minutes_id = #{minutesId} AND target_type = 'USER' AND receiver_user_id = #{userId}")
    int countSentToUser(@Param("minutesId") long minutesId, @Param("userId") long userId);
}
