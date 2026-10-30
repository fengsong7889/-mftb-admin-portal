package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesAiExtraction;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * AI 提取请求访问。
 *
 * <p>幂等与并发都靠数据库把守，不靠应用「先查再插」：
 * <ul>
 *   <li>{@code uk(operator_user_id, request_key)}：同键重放命中已有行，直接回原结果，不二次调模型；</li>
 *   <li>所有终态推进都是 {@code WHERE status=0}（处理中）的条件 UPDATE，影响 0 行即视为已被抢先处理，
 *       幂等成功而非异常——并发双击只有一个进入模型调用；</li>
 *   <li>限流按「本用户最近窗口内的请求数」在入口判，前端禁按钮只是 UX。</li>
 * </ul>
 */
@Mapper
public interface MeetingMinutesAiExtractionMapper extends BaseMapper<MeetingMinutesAiExtraction> {

    @Select("SELECT * FROM biz_meeting_minutes_ai_extraction WHERE operator_user_id = #{operatorUserId} AND request_key = #{requestKey}")
    MeetingMinutesAiExtraction findByRequest(@Param("operatorUserId") long operatorUserId, @Param("requestKey") String requestKey);

    @Select("SELECT * FROM biz_meeting_minutes_ai_extraction WHERE id = #{id} AND operator_user_id = #{operatorUserId}")
    MeetingMinutesAiExtraction findByIdAndOperator(@Param("id") long id, @Param("operatorUserId") long operatorUserId);

    /** 最近窗口内该用户的提取次数（限流判定，跨实例以库为准）。 */
    @Select("SELECT COUNT(*) FROM biz_meeting_minutes_ai_extraction WHERE operator_user_id = #{operatorUserId} AND created_at >= #{since}")
    int countRecent(@Param("operatorUserId") long operatorUserId, @Param("since") LocalDateTime since);

    /** 处理中 → 成功：只有仍处理中的行能被落结果。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET status = 1, model_key = #{modelKey}, result_json = #{resultJson}, "
            + "usage_json = #{usageJson}, billing_status = #{billingStatus}, finished_at = UTC_TIMESTAMP(3), "
            + "updated_by = #{operator}, updated_at = UTC_TIMESTAMP(3) WHERE id = #{id} AND status = 0")
    int markSucceeded(@Param("id") long id, @Param("modelKey") String modelKey, @Param("resultJson") String resultJson,
                      @Param("usageJson") String usageJson, @Param("billingStatus") int billingStatus, @Param("operator") String operator);

    /** 处理中 → 失败（未消耗或已释放）。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET status = 2, error_code = #{errorCode}, model_key = #{modelKey}, "
            + "billing_status = #{billingStatus}, finished_at = UTC_TIMESTAMP(3), updated_by = #{operator}, updated_at = UTC_TIMESTAMP(3) "
            + "WHERE id = #{id} AND status = 0")
    int markFailed(@Param("id") long id, @Param("errorCode") String errorCode, @Param("modelKey") String modelKey,
                   @Param("billingStatus") int billingStatus, @Param("operator") String operator);

    /** 处理中 → 结果未知（已发起但拿不到确定结论，不自动重放）。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET status = 3, error_code = #{errorCode}, model_key = #{modelKey}, "
            + "billing_status = #{billingStatus}, finished_at = UTC_TIMESTAMP(3), updated_by = #{operator}, updated_at = UTC_TIMESTAMP(3) "
            + "WHERE id = #{id} AND status = 0")
    int markUnknown(@Param("id") long id, @Param("errorCode") String errorCode, @Param("modelKey") String modelKey,
                    @Param("billingStatus") int billingStatus, @Param("operator") String operator);

    /** 结算状态推进（不改提取结论）：预占→已结算/待核对，用于用量落账后回填。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET billing_status = #{billingStatus}, usage_json = #{usageJson}, "
            + "updated_at = UTC_TIMESTAMP(3) WHERE id = #{id}")
    int updateBilling(@Param("id") long id, @Param("billingStatus") int billingStatus, @Param("usageJson") String usageJson);

    /** 标记已应用：仅成功结果可登记采用条目，同一次保存的幂等锚。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET applied_minutes_id = #{minutesId}, applied_minutes_version = #{minutesVersion}, "
            + "applied_keys_json = #{appliedKeysJson}, applied_at = UTC_TIMESTAMP(3), updated_by = #{operator}, updated_at = UTC_TIMESTAMP(3) "
            + "WHERE id = #{id} AND operator_user_id = #{operatorUserId} AND status = 1 AND applied_minutes_id IS NULL")
    int markApplied(@Param("id") long id, @Param("operatorUserId") long operatorUserId, @Param("minutesId") long minutesId,
                    @Param("minutesVersion") int minutesVersion, @Param("appliedKeysJson") String appliedKeysJson, @Param("operator") String operator);

    /** 按请求号登记已应用（保存同事务调用）：仅本人、成功且未应用过的行可被标记，影响 0 行视为已登记或无权。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET applied_minutes_id = #{minutesId}, applied_minutes_version = #{minutesVersion}, "
            + "applied_keys_json = #{appliedKeysJson}, applied_at = UTC_TIMESTAMP(3), updated_by = #{operator}, updated_at = UTC_TIMESTAMP(3) "
            + "WHERE operator_user_id = #{operatorUserId} AND request_key = #{requestKey} AND status = 1 AND applied_minutes_id IS NULL")
    int markAppliedByRequest(@Param("operatorUserId") long operatorUserId, @Param("requestKey") String requestKey,
                             @Param("minutesId") long minutesId, @Param("minutesVersion") int minutesVersion,
                             @Param("appliedKeysJson") String appliedKeysJson, @Param("operator") String operator);

    /** 崩溃恢复：把超期的处理中请求转「结果未知」，不自动重放付费调用。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET status = 3, error_code = 'stale_processing', "
            + "finished_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE status = 0 AND updated_at < #{cutoff}")
    int expireStaleProcessing(@Param("cutoff") LocalDateTime cutoff);

    /** 载荷过期清理：原文快照与结果超 7 天清空，计量元数据保留。 */
    @Update("UPDATE biz_meeting_minutes_ai_extraction SET source_snapshot = NULL, result_json = NULL, "
            + "status = CASE WHEN status = 1 THEN 4 ELSE status END, updated_at = UTC_TIMESTAMP(3) "
            + "WHERE result_expires_at < UTC_TIMESTAMP(3) AND (source_snapshot IS NOT NULL OR result_json IS NOT NULL)")
    int clearExpiredPayloads();

    @Select("SELECT * FROM biz_meeting_minutes_ai_extraction WHERE booking_id = #{bookingId} AND operator_user_id = #{operatorUserId} "
            + "ORDER BY created_at DESC LIMIT 1")
    MeetingMinutesAiExtraction findLatest(@Param("bookingId") long bookingId, @Param("operatorUserId") long operatorUserId);

    @Select("SELECT * FROM biz_meeting_minutes_ai_extraction WHERE status = 0 AND updated_at < #{cutoff} LIMIT 200")
    List<MeetingMinutesAiExtraction> findStaleProcessing(@Param("cutoff") LocalDateTime cutoff);
}
