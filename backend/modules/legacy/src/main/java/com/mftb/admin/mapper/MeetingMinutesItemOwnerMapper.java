/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.MeetingMinutesItemOwner;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Collection;
import java.util.List;

/**
 * 纪要事项负责人 Mapper（多负责人真源）。
 *
 * <p>写入只有"先删后插"一种形态：负责人集合是发布时的一次整体约定，逐条 diff 会把
 * 「换了一个人」拆成一次删一次插，中间态下这条事项谁都不是负责人——逾期提醒与办理权限
 * 都读这张表，中间态必须不存在。整体替换在同一事务内完成，配合事项行的首负责人缓存一起生效。
 *
 * <p>读取一律按 {@code seq} 升序：顺序就是"主办在前、协办在后"的展示口径，
 * 也是事项行三列缓存取谁的依据，不能让数据库随意给。
 */
@Mapper
public interface MeetingMinutesItemOwnerMapper extends BaseMapper<MeetingMinutesItemOwner> {

    @Select("SELECT * FROM biz_meeting_minutes_item_owner WHERE item_id = #{itemId} ORDER BY seq, id")
    List<MeetingMinutesItemOwner> findByItem(@Param("itemId") long itemId);

    /** 批量取若干事项的负责人（组装 VO 与渲染卡片用，避免逐条事项再查一次） */
    @Select("<script>"
            + "SELECT * FROM biz_meeting_minutes_item_owner WHERE item_id IN "
            + "<foreach collection='itemIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY item_id, seq, id"
            + "</script>")
    List<MeetingMinutesItemOwner> findByItemIds(@Param("itemIds") Collection<Long> itemIds);

    /** 按纪要批量取负责人：列表页一次看多份纪要时用它把 N 次查询压成 1 次 */
    @Select("<script>"
            + "SELECT o.* FROM biz_meeting_minutes_item_owner o "
            + "JOIN biz_meeting_minutes_item i ON i.id = o.item_id "
            + "WHERE i.minutes_id IN "
            + "<foreach collection='minutesIds' item='id' open='(' separator=',' close=')'>#{id}</foreach>"
            + " ORDER BY o.item_id, o.seq, o.id"
            + "</script>")
    List<MeetingMinutesItemOwner> findByMinutesIds(@Param("minutesIds") Collection<Long> minutesIds);

    /** 当前用户是否在这条事项的负责人集合里：办理权限只按真源裁决，不看首负责人缓存 */
    @Select("SELECT COUNT(*) FROM biz_meeting_minutes_item_owner WHERE item_id = #{itemId} AND user_id = #{userId}")
    int countItemOwner(@Param("itemId") long itemId, @Param("userId") long userId);

    @Delete("DELETE FROM biz_meeting_minutes_item_owner WHERE item_id = #{itemId}")
    int deleteByItem(@Param("itemId") long itemId);

    /** 整体替换的第二步：一条语句写完整组负责人，不留"删了还没插"的中间态 */
    @Insert("<script>"
            + "INSERT INTO biz_meeting_minutes_item_owner (item_id, user_id, user_name, emp_no, seq) VALUES "
            + "<foreach collection='rows' item='row' separator=','>"
            + "(#{row.itemId}, #{row.userId}, #{row.userName}, #{row.empNo}, #{row.seq})"
            + "</foreach></script>")
    int insertBatch(@Param("rows") Collection<MeetingMinutesItemOwner> rows);

    /** 物理删除事项行时同步清掉负责人行：外键是 NO ACTION，留着脏引用会让下次删除直接失败 */
    @Delete("DELETE FROM biz_meeting_minutes_item_owner WHERE item_id IN "
            + "(SELECT id FROM biz_meeting_minutes_item WHERE minutes_id = #{minutesId} AND kind = #{kind} AND seq > #{keepSeq})")
    int deleteSurplus(@Param("minutesId") long minutesId, @Param("kind") String kind, @Param("keepSeq") int keepSeq);

    /** 旧版单负责人路径整体重建的第一步：清掉本纪要本类型下的全部负责人行 */
    @Delete("DELETE FROM biz_meeting_minutes_item_owner WHERE item_id IN "
            + "(SELECT id FROM biz_meeting_minutes_item WHERE minutes_id = #{minutesId} AND kind = #{kind})")
    int deleteByMinutesKind(@Param("minutesId") long minutesId, @Param("kind") String kind);

    /**
     * 旧版单负责人路径整体重建的第二步：把事项行上的首负责人缓存升格成 seq=1 的真源行。
     * <p>这条只服务于 schemaVersion 1 的历史录入路径——它本来就只有一人，但逾期扫描与办理权限
     * 都改读真源表，缓存不落成真源行就会让旧纪要的待办整批静默漏提。
     */
    @Insert("INSERT INTO biz_meeting_minutes_item_owner (item_id, user_id, user_name, emp_no, seq) "
            + "SELECT i.id, i.owner_user_id, i.owner_name, i.owner_emp_no, 1 FROM biz_meeting_minutes_item i "
            + "WHERE i.minutes_id = #{minutesId} AND i.kind = #{kind} AND i.deleted = 0 AND i.owner_user_id IS NOT NULL")
    int rebuildFromItemCache(@Param("minutesId") long minutesId, @Param("kind") String kind);
}
