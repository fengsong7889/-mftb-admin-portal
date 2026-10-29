package com.mftb.admin.mapper;

import com.mftb.admin.entity.MeetingMinutesRevision;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 正式版本只追加，不继承包含更新/删除能力的通用 Mapper。所有读取都绑定纪要归属。 */
@Mapper
public interface MeetingMinutesRevisionMapper {
    @Insert("INSERT INTO biz_meeting_minutes_revision (minutes_id, revision_no, schema_version, document_snapshot, "
            + "digest, change_note, publisher_user_id, publisher_name, publisher_emp_no, published_at, "
            + "draft_version, draft_hash, request_key, request_hash, created_by, updated_by) "
            + "VALUES (#{minutesId}, #{revisionNo}, #{schemaVersion}, #{documentSnapshot}, #{digest}, #{changeNote}, "
            + "#{publisherUserId}, #{publisherName}, #{publisherEmpNo}, #{publishedAt}, #{draftVersion}, #{draftHash}, "
            + "#{requestKey}, #{requestHash}, #{createdBy}, #{updatedBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(MeetingMinutesRevision revision);

    @Select("SELECT * FROM biz_meeting_minutes_revision WHERE minutes_id = #{minutesId} AND id = #{id}")
    MeetingMinutesRevision find(@Param("minutesId") long minutesId, @Param("id") long id);

    @Select("SELECT * FROM biz_meeting_minutes_revision WHERE minutes_id = #{minutesId} AND request_key = #{requestKey}")
    MeetingMinutesRevision findByRequest(@Param("minutesId") long minutesId, @Param("requestKey") String requestKey);

    /** 元数据列表不重复传输每个版本的完整正文；点击具体版本后再按 ID 读取。 */
    @Select("SELECT id, minutes_id, revision_no, schema_version, change_note, publisher_name, publisher_emp_no, published_at "
            + "FROM biz_meeting_minutes_revision WHERE minutes_id = #{minutesId} ORDER BY revision_no DESC")
    List<MeetingMinutesRevision> summaries(@Param("minutesId") long minutesId);

    /** 调用前必须持有对应纪要主行锁；唯一键作为并发的数据库最后防线。 */
    @Select("SELECT COALESCE(MAX(revision_no), 0) + 1 FROM biz_meeting_minutes_revision WHERE minutes_id = #{minutesId}")
    int nextRevisionNo(@Param("minutesId") long minutesId);
}
