package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesNote;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 个人会议笔记访问。
 *
 * <p>保存走「带 version 条件的单行 UPDATE + 影响行数判定」：多设备并发时后写者拿到 0 行，
 * 服务层据此回冲突并保留本地内容，绝不 last-write-wins 静默覆盖。
 */
@Mapper
public interface MeetingMinutesNoteMapper extends BaseMapper<MeetingMinutesNote> {

    @Select("SELECT * FROM biz_meeting_minutes_note WHERE booking_id = #{bookingId} AND owner_user_id = #{ownerUserId}")
    MeetingMinutesNote findByOwner(@Param("bookingId") long bookingId, @Param("ownerUserId") long ownerUserId);

    /** 乐观锁更新：只有 version 仍是提交时那版才生效，返回 0 表示他端已改，需冲突处理。 */
    @Update("UPDATE biz_meeting_minutes_note SET raw_text = #{rawText}, mentions_json = #{mentionsJson}, "
            + "content_hash = #{contentHash}, last_request_key = #{lastRequestKey}, last_request_hash = #{lastRequestHash}, "
            + "version = version + 1, updated_by = #{operator}, updated_at = UTC_TIMESTAMP(3) "
            + "WHERE id = #{id} AND owner_user_id = #{ownerUserId} AND version = #{expectVersion}")
    int updateWithVersion(@Param("id") long id, @Param("ownerUserId") long ownerUserId,
                          @Param("expectVersion") int expectVersion, @Param("rawText") String rawText,
                          @Param("mentionsJson") String mentionsJson, @Param("contentHash") String contentHash,
                          @Param("lastRequestKey") String lastRequestKey, @Param("lastRequestHash") String lastRequestHash,
                          @Param("operator") String operator);
}
