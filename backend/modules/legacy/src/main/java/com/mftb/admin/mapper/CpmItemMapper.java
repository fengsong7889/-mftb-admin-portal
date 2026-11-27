/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * CPM 工作条目访问。
 * <p>更新一律走带 version 的条件 UPDATE（影响 0 行=冲突，服务层转「请刷新重试」），
 * 不做「先查再改」——两个人同时在双端编辑同一条是常态而不是意外。
 */
@Mapper
public interface CpmItemMapper extends BaseMapper<CpmItem> {

    /** 日视图：当天有记录或当天有进度流水的条目（延续/轨迹都从这一口径出）。 */
    @Select("SELECT DISTINCT i.* FROM biz_cpm_item i "
            + "LEFT JOIN biz_cpm_item_update u ON u.item_id = i.id "
            + "WHERE i.deleted = 0 AND (i.work_date = #{date} OR u.update_date = #{date}) AND i.user_id = #{userId}")
    List<CpmItem> listActiveOn(@Param("userId") long userId, @Param("date") LocalDate date);

    /** 延续建议候选：前一活跃日未完结（非 done）且当天尚无流水的条目。 */
    @Select("SELECT i.* FROM biz_cpm_item i WHERE i.deleted = 0 AND i.user_id = #{userId} "
            + "AND i.status <> 'done' "
            + "AND COALESCE((SELECT MAX(u.update_date) FROM biz_cpm_item_update u WHERE u.item_id = i.id), i.work_date) < #{date} "
            + "AND i.id NOT IN (SELECT u2.item_id FROM biz_cpm_item_update u2 WHERE u2.update_date = #{date}) "
            + "ORDER BY COALESCE((SELECT MAX(u3.update_date) FROM biz_cpm_item_update u3 WHERE u3.item_id = i.id), i.work_date) DESC "
            + "LIMIT 12")
    List<CpmItem> listCarryCandidates(@Param("userId") long userId, @Param("date") LocalDate date);

    /** 带乐观锁的字段更新：version 不符影响 0 行，由调用方判定冲突。 */
    @Update("<script>UPDATE biz_cpm_item SET"
            + "<if test='title != null'> title = #{title},</if>"
            + "<if test='detail != null'> detail = #{detail},</if>"
            + "<if test='category != null'> category = #{category},</if>"
            + "<if test='status != null'> status = #{status},</if>"
            + "<if test='progress != null'> progress = #{progress},</if>"
            + "<if test='workHours != null'> work_hours = #{workHours},</if>"
            + "<if test='workDate != null'> work_date = #{workDate},</if>"
            + " version = version + 1, updated_by = #{operator}, updated_at = NOW()"
            + " WHERE id = #{id} AND user_id = #{userId} AND deleted = 0 AND version = #{version}</script>")
    int updateOwnedVersioned(@Param("id") long id, @Param("userId") long userId, @Param("version") int version,
                             @Param("title") String title, @Param("detail") String detail,
                             @Param("category") String category, @Param("status") String status,
                             @Param("progress") Integer progress, @Param("workHours") java.math.BigDecimal workHours,
                             @Param("workDate") LocalDate workDate, @Param("operator") String operator);

    /** 软删：只能删自己的（user_id 进 WHERE，IDOR 在 SQL 层再挡一次）。 */
    @Update("UPDATE biz_cpm_item SET deleted = 1, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int softDeleteOwned(@Param("id") long id, @Param("userId") long userId, @Param("operator") String operator);

    /** 期末状态缓存回写（聚合收敛后调用；不动 version，避免与人工编辑互撞时丢编辑）。 */
    @Update("UPDATE biz_cpm_item SET status = #{status}, progress = #{progress} "
            + "WHERE id = #{id} AND deleted = 0")
    int syncLatestCache(@Param("id") long id, @Param("status") String status, @Param("progress") int progress);

    /**
     * 行内工时写入（user_id 进 WHERE，与软删同一条 IDOR 防线）。
     * <p>刻意不动 version：工时是「投入侧分布统计」的旁路字段，不该让只想补个工时的人
     * 跟另一端的正文编辑互相顶回草稿；也不进任何评价口径。
     */
    @Update("UPDATE biz_cpm_item SET work_hours = #{workHours}, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int updateWorkHoursOwned(@Param("id") long id, @Param("userId") long userId,
                             @Param("workHours") java.math.BigDecimal workHours,
                             @Param("operator") String operator);

    /**
     * 工时来源标记写入：时段存在时把 work_hours 交回给时段回算，手工值退居估算。
     *
     * <p>与 {@link #updateWorkHoursOwned} 同一条 WHERE（归属人 + 未删），同样刻意不动 version：
     * 工时口径不该让「补个时间」和「改正文」互相顶回草稿。
     */
    @Update("UPDATE biz_cpm_item SET work_hours = #{workHours}, work_hours_source = #{source}, "
            + "first_start_at = #{firstStartAt}, last_end_at = #{lastEndAt}, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int syncTimeCache(@Param("id") long id, @Param("userId") long userId,
                      @Param("workHours") java.math.BigDecimal workHours,
                      @Param("source") String source,
                      @Param("firstStartAt") LocalDateTime firstStartAt,
                      @Param("lastEndAt") LocalDateTime lastEndAt,
                      @Param("operator") String operator);

    /**
     * RDM 回写结果落列。
     *
     * <p>不动 version 且不带 status/progress：回写是「记录之后发生的副作用」，
     * 它失败或成功都不该让本人的正文编辑撞乐观锁。
     */
    @Update("UPDATE biz_cpm_item SET rdm_sync_state = #{state}, rdm_sync_message = #{message}, "
            + "rdm_synced_at = NOW(), rdm_progress_seen = #{rdmProgress}, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int updateRdmSyncResult(@Param("id") long id, @Param("userId") long userId,
                            @Param("state") String state, @Param("message") String message,
                            @Param("rdmProgress") Integer rdmProgress, @Param("operator") String operator);

    /** 回写开关切换（导入时默认置 1，用户可关；关掉后仍保留 taskId 以便再次打开）。 */
    @Update("UPDATE biz_cpm_item SET rdm_sync_enabled = #{enabled}, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int updateRdmSyncEnabled(@Param("id") long id, @Param("userId") long userId,
                             @Param("enabled") int enabled, @Param("operator") String operator);

    @Select("SELECT * FROM biz_cpm_item WHERE id = #{id} AND deleted = 0")
    CpmItem selectAliveById(@Param("id") long id);

    /**
     * 加行锁取条目（仅写入路径用，必须在事务内）。
     *
     * <p>为什么时段写入要先锁条目行：{@code biz_cpm_time_entry.item_id} 上有外键，
     * INSERT 子行时 InnoDB 会给父行加 **共享** 锁，随后的缓存 UPDATE 要把它升级成排他锁。
     * 同一父行的两个并发时段写入各持 S 锁互等 X 锁 —— 实测就是
     * {@code DeadlockLoserDataAccessException}（并发时段集成测试钉住）。
     * 先对父行取 X 锁把顺序固定成「父 → 子」，两个事务改成排队而不是互咬，
     * 顺带把「两个事务各自回算缓存、后写覆盖前写」这条更隐蔽的错也一起堵掉。
     */
    @Select("SELECT * FROM biz_cpm_item WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    CpmItem selectAliveForUpdate(@Param("id") long id);

    /* ==================== 台账（cpm:schema:v1.3） ==================== */

    /**
     * 台账默认窗口：活动任务全量保留，完成/取消任务只保留窗口起点之后更新的记录。
     *
     * <p>SQL 按日期倒序取最近 limit 条，服务层再恢复升序；这样达到上限时截掉的是最早记录，
     * 不会再让新增任务因为旧 LIMIT 静默消失。
     */
    @Select("<script>SELECT * FROM biz_cpm_item WHERE deleted = 0 AND user_id = #{userId} "
            + "<if test='rangeFrom == null and rangeTo == null'>"
            + "AND ((status NOT IN ('done','cancelled') AND progress &lt; 100) "
            + "OR ((status IN ('done','cancelled') OR progress >= 100) AND updated_at >= #{windowStart})) </if>"
            + "<if test='rangeFrom != null or rangeTo != null'>"
            + "AND plan_start IS NOT NULL AND plan_end IS NOT NULL "
            + "<if test='rangeFrom != null'>AND plan_end &gt;= #{rangeFrom}</if> "
            + "<if test='rangeTo != null'>AND plan_start &lt;= #{rangeTo}</if> </if>"
            + "<if test='keyword != null'>AND (title LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!' "
            + "OR note_text LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!') </if>"
            + "<if test='status != null'>"
            + "<choose>"
            + "<when test='status.equals(\"done\")'>AND status &lt;&gt; 'cancelled' AND progress >= 100 </when>"
            + "<when test='status.equals(\"doing\")'>AND status &lt;&gt; 'cancelled' AND progress > 0 AND progress &lt; 100 AND plan_start IS NOT NULL AND plan_end IS NOT NULL </when>"
            + "<when test='status.equals(\"todo\")'>AND status &lt;&gt; 'cancelled' AND progress = 0 AND plan_start IS NOT NULL AND plan_end IS NOT NULL </when>"
            + "<when test='status.equals(\"plan\")'>AND status &lt;&gt; 'cancelled' AND (plan_start IS NULL OR plan_end IS NULL) </when>"
            + "<when test='status.equals(\"cancelled\")'>AND status = 'cancelled' </when>"
            + "</choose></if>"
            + "<if test='planType != null'>"
            + "<choose>"
            + "<when test='planType.equals(\"follow\")'>AND follow_up = 1 </when>"
            + "<otherwise>AND plan_type = #{planType} </otherwise>"
            + "</choose></if>"
            + "<if test='groupId != null'>"
            + "<choose><when test='groupId == 0'>AND (group_id IS NULL OR group_id = 0) </when>"
            + "<otherwise>AND group_id = #{groupId} </otherwise></choose></if>"
            + "ORDER BY COALESCE(plan_start, work_date) DESC, id DESC LIMIT #{limit}</script>")
    List<CpmItem> listLedgerWindow(@Param("userId") long userId, @Param("windowStart") LocalDate windowStart,
                                   @Param("rangeFrom") LocalDate rangeFrom, @Param("rangeTo") LocalDate rangeTo,
                                   @Param("keyword") String keyword, @Param("status") String status,
                                   @Param("planType") String planType, @Param("groupId") Long groupId,
                                   @Param("limit") int limit);

    /** 与窗口查询同一条件的总数，用于如实告诉用户“已载入 N / 当前口径 M”。 */
    @Select("<script>SELECT COUNT(*) FROM biz_cpm_item WHERE deleted = 0 AND user_id = #{userId} "
            + "<if test='rangeFrom == null and rangeTo == null'>"
            + "AND ((status NOT IN ('done','cancelled') AND progress &lt; 100) "
            + "OR ((status IN ('done','cancelled') OR progress >= 100) AND updated_at >= #{windowStart})) </if>"
            + "<if test='rangeFrom != null or rangeTo != null'>"
            + "AND plan_start IS NOT NULL AND plan_end IS NOT NULL "
            + "<if test='rangeFrom != null'>AND plan_end &gt;= #{rangeFrom}</if> "
            + "<if test='rangeTo != null'>AND plan_start &lt;= #{rangeTo}</if> </if>"
            + "<if test='keyword != null'>AND (title LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!' "
            + "OR note_text LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!') </if>"
            + "<if test='status != null'>"
            + "<choose>"
            + "<when test='status.equals(\"done\")'>AND status &lt;&gt; 'cancelled' AND progress >= 100 </when>"
            + "<when test='status.equals(\"doing\")'>AND status &lt;&gt; 'cancelled' AND progress > 0 AND progress &lt; 100 AND plan_start IS NOT NULL AND plan_end IS NOT NULL </when>"
            + "<when test='status.equals(\"todo\")'>AND status &lt;&gt; 'cancelled' AND progress = 0 AND plan_start IS NOT NULL AND plan_end IS NOT NULL </when>"
            + "<when test='status.equals(\"plan\")'>AND status &lt;&gt; 'cancelled' AND (plan_start IS NULL OR plan_end IS NULL) </when>"
            + "<when test='status.equals(\"cancelled\")'>AND status = 'cancelled' </when>"
            + "</choose></if>"
            + "<if test='planType != null'>"
            + "<choose>"
            + "<when test='planType.equals(\"follow\")'>AND follow_up = 1 </when>"
            + "<otherwise>AND plan_type = #{planType} </otherwise>"
            + "</choose></if>"
            + "<if test='groupId != null'>"
            + "<choose><when test='groupId == 0'>AND (group_id IS NULL OR group_id = 0) </when>"
            + "<otherwise>AND group_id = #{groupId} </otherwise></choose></if></script>")
    int countLedgerWindow(@Param("userId") long userId, @Param("windowStart") LocalDate windowStart,
                          @Param("rangeFrom") LocalDate rangeFrom, @Param("rangeTo") LocalDate rangeTo,
                          @Param("keyword") String keyword, @Param("status") String status,
                          @Param("planType") String planType, @Param("groupId") Long groupId);

    /** 更早归档：只查窗口起点之前完成/取消的记录，使用日期 + id 游标避免 OFFSET 漂移。 */
    @Select("<script>SELECT * FROM biz_cpm_item WHERE deleted = 0 AND user_id = #{userId} "
            + "AND (status IN ('done','cancelled') OR progress >= 100) AND updated_at &lt; #{windowStart} "
            + "<if test='cursorDate != null and cursorId != null'>"
            + "AND (COALESCE(plan_start, work_date) &lt; #{cursorDate} "
            + "OR (COALESCE(plan_start, work_date) = #{cursorDate} AND id &lt; #{cursorId})) </if>"
            + "<if test='keyword != null'>AND (title LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!' "
            + "OR note_text LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!') </if>"
            + "<if test='status != null'>"
            + "<choose>"
            + "<when test='status.equals(\"done\")'>AND status &lt;&gt; 'cancelled' AND progress >= 100 </when>"
            + "<when test='status.equals(\"cancelled\")'>AND status = 'cancelled' </when>"
            + "<otherwise>AND 1 = 0 </otherwise>"
            + "</choose></if>"
            + "<if test='planType != null'>"
            + "<choose>"
            + "<when test='planType.equals(\"follow\")'>AND follow_up = 1 </when>"
            + "<otherwise>AND plan_type = #{planType} </otherwise>"
            + "</choose></if>"
            + "<if test='groupId != null'>"
            + "<choose><when test='groupId == 0'>AND (group_id IS NULL OR group_id = 0) </when>"
            + "<otherwise>AND group_id = #{groupId} </otherwise></choose></if>"
            + "ORDER BY COALESCE(plan_start, work_date) DESC, id DESC LIMIT #{limit}</script>")
    List<CpmItem> listLedgerArchive(@Param("userId") long userId, @Param("windowStart") LocalDate windowStart,
                                    @Param("cursorDate") LocalDate cursorDate, @Param("cursorId") Long cursorId,
                                    @Param("keyword") String keyword, @Param("status") String status,
                                    @Param("planType") String planType, @Param("groupId") Long groupId,
                                    @Param("limit") int limit);

    /** 与归档列表同一条件的总数。 */
    @Select("<script>SELECT COUNT(*) FROM biz_cpm_item WHERE deleted = 0 AND user_id = #{userId} "
            + "AND (status IN ('done','cancelled') OR progress >= 100) AND updated_at &lt; #{windowStart} "
            + "<if test='keyword != null'>AND (title LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!' "
            + "OR note_text LIKE CONCAT('%', #{keyword}, '%') ESCAPE '!') </if>"
            + "<if test='status != null'>"
            + "<choose>"
            + "<when test='status.equals(\"done\")'>AND status &lt;&gt; 'cancelled' AND progress >= 100 </when>"
            + "<when test='status.equals(\"cancelled\")'>AND status = 'cancelled' </when>"
            + "<otherwise>AND 1 = 0 </otherwise>"
            + "</choose></if>"
            + "<if test='planType != null'>"
            + "<choose>"
            + "<when test='planType.equals(\"follow\")'>AND follow_up = 1 </when>"
            + "<otherwise>AND plan_type = #{planType} </otherwise>"
            + "</choose></if>"
            + "<if test='groupId != null'>"
            + "<choose><when test='groupId == 0'>AND (group_id IS NULL OR group_id = 0) </when>"
            + "<otherwise>AND group_id = #{groupId} </otherwise></choose></if></script>")
    int countLedgerArchive(@Param("userId") long userId, @Param("windowStart") LocalDate windowStart,
                           @Param("keyword") String keyword, @Param("status") String status,
                           @Param("planType") String planType, @Param("groupId") Long groupId);

    /** 汇报/导入去重仍需读取全部事实；台账页面不再消费这个无界查询。 */
    @Select("SELECT * FROM biz_cpm_item WHERE deleted = 0 AND user_id = #{userId} "
            + "ORDER BY COALESCE(plan_start, work_date) ASC, id ASC")
    List<CpmItem> listAllForUser(@Param("userId") long userId);

    /** 导入会议去重：按工作项、标题与计划起日精确查，不能依赖有界台账窗口漏判。 */
    @Select("<script>SELECT COUNT(*) FROM biz_cpm_item WHERE deleted = 0 AND user_id = #{userId} "
            + "AND title = #{title} "
            + "<choose><when test='groupId == null or groupId == 0'>AND (group_id IS NULL OR group_id = 0) </when>"
            + "<otherwise>AND group_id = #{groupId} </otherwise></choose>"
            + "<choose><when test='planStart == null'>AND plan_start IS NULL </when>"
            + "<otherwise>AND plan_start = #{planStart} </otherwise></choose></script>")
    int countLedgerDuplicate(@Param("userId") long userId, @Param("groupId") Long groupId,
                             @Param("title") String title, @Param("planStart") LocalDate planStart);

    /** 台账字段更新：带归属人与乐观锁，version 不符影响 0 行由服务层转「请刷新重试」。 */
    @Update("<script>UPDATE biz_cpm_item SET"
            + "<if test='groupId != null'> group_id = #{groupId},</if>"
            + "<if test='title != null'> title = #{title},</if>"
            + "<if test='category != null'> category = #{category},</if>"
            + "<if test='planStart != null'> plan_start = #{planStart},</if>"
            + "<if test='planEnd != null'> plan_end = #{planEnd},</if>"
            + "<if test='planType != null'> plan_type = #{planType},</if>"
            + "<if test='status != null'> status = #{status},</if>"
            + "<if test='progress != null'> progress = #{progress},</if>"
            + "<if test='noteHtml != null'> note_html = #{noteHtml},</if>"
            + "<if test='noteText != null'> note_text = #{noteText},</if>"
            + "<if test='clearStart'> plan_start = NULL,</if>"
            + "<if test='clearEnd'> plan_end = NULL,</if>"
            + "<if test='clearInsertedAt'> inserted_at = NULL,</if>"
            + "<if test='insertedAt != null'> inserted_at = #{insertedAt},</if>"
            + " version = version + 1, updated_by = #{operator}, updated_at = NOW()"
            + " WHERE id = #{id} AND user_id = #{userId} AND deleted = 0 AND version = #{version}</script>")
    int updateLedgerFields(@Param("id") long id, @Param("userId") long userId, @Param("version") int version,
                           @Param("groupId") Long groupId, @Param("title") String title,
                           @Param("category") String category,
                           @Param("planStart") java.time.LocalDate planStart, @Param("planEnd") java.time.LocalDate planEnd,
                           @Param("clearStart") boolean clearStart, @Param("clearEnd") boolean clearEnd,
                           @Param("planType") String planType, @Param("insertedAt") java.time.LocalDate insertedAt,
                           @Param("clearInsertedAt") boolean clearInsertedAt,
                           @Param("status") String status, @Param("progress") Integer progress,
                           @Param("noteHtml") String noteHtml, @Param("noteText") String noteText,
                           @Param("operator") String operator);

    /**
     * 台账标记更新：跟进/阻塞/取消原因 + status 重算，带归属与乐观锁。
     * <p>blocked 不占 status（进度每次更新都会重算 status）；取消复用 cancelled，
     * 恢复时按当前 progress 回到 done/doing/todo。SQL 用当前 progress 列，避免服务层
     * 旧快照把刚更新的进度状态覆盖回旧值。
     */
    @Update("<script>UPDATE biz_cpm_item SET"
            + " follow_up = #{followUp}, blocked = #{blocked}, blocked_reason = #{blockedReason}, cancel_reason = #{cancelReason},"
            + " status = CASE WHEN #{cancelled} = 1 THEN 'cancelled' WHEN progress >= 100 THEN 'done'"
            + " WHEN progress &gt; 0 THEN 'doing' ELSE 'todo' END,"
            + " version = version + 1, updated_by = #{operator}, updated_at = NOW()"
            + " WHERE id = #{id} AND user_id = #{userId} AND deleted = 0 AND version = #{version}</script>")
    int updateWorklogMarks(@Param("id") long id, @Param("userId") long userId, @Param("version") int version,
                           @Param("followUp") int followUp, @Param("blocked") int blocked,
                           @Param("blockedReason") String blockedReason, @Param("cancelled") int cancelled,
                           @Param("cancelReason") String cancelReason, @Param("operator") String operator);

    /** 恢复一条被误删的条目（台账删除供的「撒销」走这里，不新建重复事实）。 */
    @Update("UPDATE biz_cpm_item SET deleted = 0, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 1")
    int restoreOwned(@Param("id") long id, @Param("userId") long userId, @Param("operator") String operator);

    /** 批量软删某工作項下的子任务（删除工作項时与分组同事务，避免留下无主的排期）。 */
    @Update("UPDATE biz_cpm_item SET deleted = 1, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE group_id = #{groupId} AND user_id = #{userId} AND deleted = 0")
    int softDeleteByGroup(@Param("groupId") long groupId, @Param("userId") long userId,
                          @Param("operator") String operator);

    /** 恢复某工作項下的子任务（撒销删除）。 */
    @Update("UPDATE biz_cpm_item SET deleted = 0, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE group_id = #{groupId} AND user_id = #{userId} AND deleted = 1")
    int restoreByGroup(@Param("groupId") long groupId, @Param("userId") long userId,
                       @Param("operator") String operator);

    /** 子任务改排期后同步首次记录日：汇报聚合仍按 work_date 分组，计划日与归属日不能各说一套。 */
    @Update("UPDATE biz_cpm_item SET work_date = #{workDate}, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int updateWorkDate(@Param("id") long id, @Param("userId") long userId,
                       @Param("workDate") java.time.LocalDate workDate, @Param("operator") String operator);

    /**
     * 台账耗时列写入：手工值与「清除覆盖」共用一条 UPDATE。
     *
     * <p>走自己的语句而不是塞进 {@code updateLedgerFields}：那条带乐观锁，而工时是投入侧旁路字段，
     * 不该让「我只改个小时数」与另一端的正文编辑互相顶回草稿（与 {@code updateWorkHoursOwned} 同一理由）。
     *
     * <p>必须同时写 {@code work_hours_source}：不写来源就分不清哪个数字是用户量过的、
     * 哪个是工作日推出来的，台账会失去唯一一条能解释「为什么不是 8 的倍数」的线索。
     * 传入 NULL + {@code cleared=true} 即退回工作日口径（清列而不是留个 0，0 小时也是一种断言）。
     */
    @Update("<script>UPDATE biz_cpm_item SET"
            + "<choose><when test='cleared'> work_hours = NULL, work_hours_source = 'none',</when>"
            + "<otherwise> work_hours = #{workHours}, work_hours_source = 'manual',</otherwise></choose>"
            + " updated_by = #{operator}, updated_at = NOW()"
            + " WHERE id = #{id} AND user_id = #{userId} AND deleted = 0</script>")
    int updateLedgerHours(@Param("id") long id, @Param("userId") long userId,
                          @Param("workHours") java.math.BigDecimal workHours,
                          @Param("cleared") boolean cleared, @Param("operator") String operator);

    /**
     * 台账读取时的会议取消对账：把已取消/已释放会议对应的条目落成 cancelled。
     *
     * <p>WHERE 带 user_id：只能改自己的条目，即使有人递进别人的 bookingId 也不会跨人写库。
     * <p>条件里写 {@code status <> 'cancelled'} 而不是先查后改：一次 UPDATE 就是幂等的，
     * 重复读取不会反复推高 updated_at 把台账改成「今天全部动过」的假象。
     * <p>不重算 progress：取消一场会不会把已做的 60% 抹掉，那是删事实。
     */
    @Update("<script>UPDATE biz_cpm_item SET status = 'cancelled', updated_by = #{operator}, updated_at = NOW() "
            + "WHERE user_id = #{userId} AND source_type = #{sourceType} AND deleted = 0 "
            + "AND status &lt;&gt; 'cancelled' AND source_ref IN "
            + "<foreach item='ref' collection='sourceRefs' open='(' separator=',' close=')'>#{ref}</foreach></script>")
    int markCancelledBySourceRefs(@Param("userId") long userId, @Param("sourceType") String sourceType,
                                  @Param("sourceRefs") Collection<String> sourceRefs,
                                  @Param("operator") String operator);

    /**
     * 本人在指定来源上的条目（只取对账需要的三列）。
     *
     * <p>不按 deleted 过滤以外的条件：对账要看到所有曾经导入过的会，包括已经排到未来或早已完成的。
     */
    @Select("SELECT id, source_ref, status FROM biz_cpm_item "
            + "WHERE user_id = #{userId} AND source_type = #{sourceType} AND deleted = 0")
    List<CpmItem> listBySource(@Param("userId") long userId, @Param("sourceType") String sourceType);
}
