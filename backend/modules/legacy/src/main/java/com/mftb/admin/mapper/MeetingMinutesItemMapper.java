package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesItem;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 纪要事项 Mapper（行动项 / 跟进事项）。
 *
 * <p>保存用"按 (minutes_id, kind, seq) upsert + 删除多余行"：位置即身份，
 * 编辑纪要时同一位置的内容与负责人被覆盖，而<b>状态与处理结果保留</b>——
 * 组织者改一句措辞不能把负责人已经填好的处理进度清掉。
 *
 * <p>逾期扫描只认三件事：待处理、有时限、今天还没提醒过。时区口径与库一致（CURDATE）。
 */
@Mapper
public interface MeetingMinutesItemMapper extends BaseMapper<MeetingMinutesItem> {

    @Select("SELECT * FROM biz_meeting_minutes_item WHERE deleted = 0 AND minutes_id = #{minutesId} "
            + "ORDER BY kind, COALESCE(NULLIF(display_order, 0), seq), id")
    List<MeetingMinutesItem> findByMinutes(@Param("minutesId") long minutesId);

    /** 批量取多份纪要的事项（列表页/渲染避免 N+1） */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_minutes_item WHERE deleted = 0 AND minutes_id IN "
            + "<foreach collection='minutesIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY minutes_id, kind, COALESCE(NULLIF(display_order, 0), seq), id"
            + "</script>")
    List<MeetingMinutesItem> findByMinutesIds(@Param("minutesIds") Collection<Long> minutesIds);

    /** 还没被读的：待处理 + 已过时限 + 今天没提醒过 */
    @Select("SELECT * FROM biz_meeting_minutes_item WHERE deleted = 0 "
            + "AND status = 'pending' AND due_date IS NOT NULL AND due_date < #{today} "
            + "AND owner_user_id IS NOT NULL "
            + "AND (last_notified_at IS NULL OR DATE(last_notified_at) < CURDATE()) "
            + "ORDER BY due_date, id LIMIT #{limit}")
    List<MeetingMinutesItem> findDueReminders(@Param("today") LocalDate today, @Param("limit") int limit);

    /** 新版事项序号仅分配一次，已移除行也占用序号，绝不能复用其身份。 */
    @Select("SELECT COALESCE(MAX(seq), 0) + 1 FROM biz_meeting_minutes_item "
            + "WHERE minutes_id = #{minutesId} AND kind = #{kind}")
    int nextStableSeq(@Param("minutesId") long minutesId, @Param("kind") String kind);

    /** 更新约定不覆盖办理结果；父纪要行锁与此处版本条件共同保护并发。 */
    @Update("UPDATE biz_meeting_minutes_item SET content = #{item.content}, owner_user_id = #{item.ownerUserId}, "
            + "owner_name = #{item.ownerName}, owner_emp_no = #{item.ownerEmpNo}, due_date = #{item.dueDate}, "
            + "topic_key = #{item.topicKey}, deliverable = #{item.deliverable}, display_order = #{item.displayOrder}, "
            + "version = version + 1, updated_at = NOW() WHERE id = #{item.id} AND minutes_id = #{item.minutesId} "
            + "AND kind = #{item.kind} AND version = #{item.version} AND deleted = 0")
    int updateDefinition(@Param("item") MeetingMinutesItem item);

    /** 发布事务内先建立稳定事项 ID，再插入包含这些 ID 的不可变快照，最后绑定发布版本。 */
    @Update("<script>UPDATE biz_meeting_minutes_item SET published_revision_id = #{revisionId} "
            + "WHERE minutes_id = #{minutesId} AND deleted = 0 AND id IN "
            + "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach></script>")
    int bindPublication(@Param("minutesId") long minutesId, @Param("ids") Collection<Long> ids,
                        @Param("revisionId") long revisionId);

    /** 已移除事项保留历史身份与办理证据，不再参与待办和催办。 */
    @Update("UPDATE biz_meeting_minutes_item SET deleted = 1, version = version + 1, updated_at = NOW() "
            + "WHERE id = #{id} AND minutes_id = #{minutesId} AND version = #{version} AND deleted = 0")
    int retire(@Param("minutesId") long minutesId, @Param("id") long id, @Param("version") int version);

    /** 保存时按位置覆盖内容与负责人；状态/结果/完成人一律不覆盖（属于负责人的事实） */
    @Insert("INSERT INTO biz_meeting_minutes_item "
            + "(minutes_id, booking_id, kind, seq, content, owner_user_id, owner_name, owner_emp_no, due_date, "
            + " status, deleted) "
            + "VALUES (#{minutesId}, #{bookingId}, #{kind}, #{seq}, #{content}, #{ownerUserId}, #{ownerName}, "
            + " #{ownerEmpNo}, #{dueDate}, 'pending', 0) "
            + "ON DUPLICATE KEY UPDATE booking_id = VALUES(booking_id), content = VALUES(content), "
            + " owner_user_id = VALUES(owner_user_id), owner_name = VALUES(owner_name), "
            + " owner_emp_no = VALUES(owner_emp_no), due_date = VALUES(due_date), deleted = 0")
    int upsertRow(@Param("minutesId") long minutesId,
                  @Param("bookingId") long bookingId,
                  @Param("kind") String kind,
                  @Param("seq") int seq,
                  @Param("content") String content,
                  @Param("ownerUserId") Long ownerUserId,
                  @Param("ownerName") String ownerName,
                  @Param("ownerEmpNo") String ownerEmpNo,
                  @Param("dueDate") LocalDate dueDate);

    /** 删除同类里超出本次保存条数的行（用户删掉了第 3 条行动项时同步落库） */
    @Delete("DELETE FROM biz_meeting_minutes_item WHERE minutes_id = #{minutesId} AND kind = #{kind} "
            + "AND seq > #{keepSeq}")
    int deleteSurplus(@Param("minutesId") long minutesId, @Param("kind") String kind, @Param("keepSeq") int keepSeq);

    /** 主行锁之后仍带事项版本，重新指派或重复办理时不能覆盖旧结果。 */
    @Update("UPDATE biz_meeting_minutes_item SET status = #{status}, result = #{result}, "
            + "resolution_note = #{note}, done_at = #{doneAt}, done_by = #{doneBy}, done_by_name = #{doneByName}, "
            + "version = version + 1, updated_at = NOW() WHERE id = #{id} AND deleted = 0 "
            + "AND version = #{version} AND status = 'pending'")
    int markResolvedVersioned(@Param("id") long id, @Param("version") int version,
                              @Param("status") String status, @Param("result") String result,
                              @Param("note") String note, @Param("doneAt") LocalDateTime doneAt,
                              @Param("doneBy") long doneBy, @Param("doneByName") String doneByName);

    /** 负责人/记录人/行政更新处理结果 */
    @Update("UPDATE biz_meeting_minutes_item SET status = #{status}, result = #{result}, "
            + "resolution_note = #{note}, done_at = #{doneAt}, done_by = #{doneBy}, done_by_name = #{doneByName}, "
            + "updated_at = NOW() WHERE id = #{id} AND deleted = 0")
    int markResolved(@Param("id") long id,
                     @Param("status") String status,
                     @Param("result") String result,
                     @Param("note") String note,
                     @Param("doneAt") LocalDateTime doneAt,
                     @Param("doneBy") Long doneBy,
                     @Param("doneByName") String doneByName);

    /**
     * 逾期提醒去重/抢占：同一天只提醒一次。
     * <p>“先抢占再发送”而不是“发完再标记”：多实例同时扫描时，条件更新只有一个能拿到行（返回 1），
     * 另一个直接跳过——否则负责人会在同一分钟收到两条一样的催办。
     */
    @Update("UPDATE biz_meeting_minutes_item SET last_notified_at = #{at}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0 "
            + "AND (last_notified_at IS NULL OR DATE(last_notified_at) < CURDATE())")
    int markNotified(@Param("id") long id, @Param("at") LocalDateTime at);
}
