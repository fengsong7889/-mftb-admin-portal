/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmPushRecord;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;

/**
 * CPM 投递记录访问。
 * <p>催办幂等由服务层两步写（先 INSERT 占位、抢到插入权才出站）：
 * 多实例并发 tick 时，同一 (event_type, user_id, period_start) 只有一个实例能插入成功，
 * 其余拿到 0 影响行数即视为「今天已提醒过」直接跳过——钉钉一天只会收到一条催办。
 */
@Mapper
public interface CpmPushRecordMapper extends BaseMapper<CpmPushRecord> {

    /**
     * 抢占式占位：同日同事件同接收人只登记一次（IGNORE + 唯一键挡住并发重发），返回 1=本实例拿到出站权。
     *
     * <p>阶段三带上 {@code revisionId}：通知必须绑定「发出去的是哪一版」。
     * 没有这一列，修订重发布之后旧卡片链接会随指针指向新版，
     * 「他当时收到的是什么」就再也问不出来了——版本机制在送达这一层就白建了。
     */
    @Insert("INSERT IGNORE INTO biz_cpm_push_record "
            + "(event_type, user_id, period_start, ref_id, revision_id, status, channel, created_at, updated_at) "
            + "VALUES (#{eventType}, #{userId}, #{periodStart}, #{refId}, #{revisionId}, 'queued', 'dingtalk', NOW(), NOW())")
    int claimSlot(@Param("eventType") String eventType, @Param("userId") long userId,
                  @Param("periodStart") LocalDate periodStart, @Param("refId") Long refId,
                  @Param("revisionId") Long revisionId);

    @Update("UPDATE biz_cpm_push_record SET status = #{status}, reason = #{reason}, "
            + "sent_at = CASE WHEN #{status} = 'sent' THEN NOW() ELSE sent_at END, updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'queued'")
    int finishQueued(@Param("id") long id, @Param("status") String status, @Param("reason") String reason);

    @Select("SELECT COUNT(*) FROM biz_cpm_push_record WHERE event_type = #{eventType} "
            + "AND user_id = #{userId} AND period_start = #{periodStart} AND status IN ('queued','sent')")
    int countActive(@Param("eventType") String eventType, @Param("userId") long userId,
                   @Param("periodStart") LocalDate periodStart);
}
