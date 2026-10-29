package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesAttachment;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 纪要附件元数据访问。
 *
 * <p>所有状态流转都写成「带前态条件的单行 UPDATE」并要求影响行数=1：
 * 并发下两个人同时绑定/解绑同一附件时，后到的那个必须看到失败，
 * 而不是把别人的绑定静默覆盖——与纪要主表乐观锁同一口径。
 */
@Mapper
public interface MeetingMinutesAttachmentMapper extends BaseMapper<MeetingMinutesAttachment> {

    @Select("SELECT * FROM biz_meeting_minutes_attachment WHERE attachment_no = #{attachmentNo}")
    MeetingMinutesAttachment findByNo(@Param("attachmentNo") String attachmentNo);

    @Select("SELECT * FROM biz_meeting_minutes_attachment WHERE booking_id = #{bookingId} AND request_key = #{requestKey}")
    MeetingMinutesAttachment findByRequest(@Param("bookingId") long bookingId, @Param("requestKey") String requestKey);

    /** 按对外标识批量取回；查不到的由调用方按"附件不存在或无权"处理，不静默少一行。 */
    @Select("<script>SELECT * FROM biz_meeting_minutes_attachment WHERE attachment_no IN "
            + "<foreach item='no' collection='nos' open='(' separator=',' close=')'>#{no}</foreach></script>")
    List<MeetingMinutesAttachment> findByNos(@Param("nos") Collection<String> nos);

    /** 未绑定配额按「本场会 + 上传人」计：两个人各自草稿箱互不挤占，绑定上限另在保存时校验。 */
    @Select("SELECT COUNT(*) FROM biz_meeting_minutes_attachment "
            + "WHERE booking_id = #{bookingId} AND upload_user_id = #{userId} AND status = 1")
    int countUnbound(@Param("bookingId") long bookingId, @Param("userId") long userId);

    /** 绑定：仅未绑定且属于本场会、且是本人上传的行可被绑进纪要。 */
    @Update("UPDATE biz_meeting_minutes_attachment SET minutes_id = #{minutesId}, status = 2, updated_by = #{operator} "
            + "WHERE attachment_no = #{attachmentNo} AND booking_id = #{bookingId} AND upload_user_id = #{userId} AND status = 1")
    int bind(@Param("attachmentNo") String attachmentNo, @Param("minutesId") long minutesId,
             @Param("bookingId") long bookingId, @Param("userId") long userId, @Param("operator") String operator);

    /** 解绑回退：只有仍绑定在本纪要草稿态(2)的行能退回未绑定(1)；已发布(3)永不回退。 */
    @Update("UPDATE biz_meeting_minutes_attachment SET minutes_id = NULL, status = 1, updated_by = #{operator} "
            + "WHERE attachment_no = #{attachmentNo} AND minutes_id = #{minutesId} AND status = 2")
    int unbind(@Param("attachmentNo") String attachmentNo, @Param("minutesId") long minutesId,
               @Param("operator") String operator);

    /** 发布定格：绑定在本纪要上的草稿态(2)行进入不可删的发布态(3)。 */
    @Update("UPDATE biz_meeting_minutes_attachment SET status = 3, updated_by = #{operator} "
            + "WHERE attachment_no = #{attachmentNo} AND minutes_id = #{minutesId} AND status = 2")
    int markPublished(@Param("attachmentNo") String attachmentNo, @Param("minutesId") long minutesId,
                      @Param("operator") String operator);

    /** 删除未绑定附件：状态与上传人都在 WHERE 里，越权与并发删除都会落到 0 行。 */
    @Delete("DELETE FROM biz_meeting_minutes_attachment "
            + "WHERE attachment_no = #{attachmentNo} AND status = 1 AND upload_user_id = #{userId}")
    int deleteUnbound(@Param("attachmentNo") String attachmentNo, @Param("userId") long userId);

    /** 清理任务候选：超过保留期仍未绑定的行（解绑会刷新 updated_at，刚移除的不会被误删）。 */
    @Select("SELECT * FROM biz_meeting_minutes_attachment WHERE status = 1 AND updated_at < #{cutoff} LIMIT 200")
    List<MeetingMinutesAttachment> findStaleUnbound(@Param("cutoff") LocalDateTime cutoff);
}
