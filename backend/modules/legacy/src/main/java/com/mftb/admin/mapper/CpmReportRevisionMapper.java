/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmReportRevision;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * CPM 汇报版本访问：只有插入与读取，没有任何更新语句。
 *
 * <p>不提供 UPDATE 是设计而不是遗漏——版本一旦能被改，「他收到的那一版」就不再可证。
 */
@Mapper
public interface CpmReportRevisionMapper extends BaseMapper<CpmReportRevision> {

    /** 版本列表（倒序）：界面抬头与历史 tab 都取这份，不在前端排序。 */
    @Select("SELECT * FROM biz_cpm_report_revision WHERE report_id = #{reportId} ORDER BY revision_no DESC")
    List<CpmReportRevision> listByReport(@Param("reportId") long reportId);

    @Select("SELECT * FROM biz_cpm_report_revision WHERE report_id = #{reportId} AND revision_no = #{revisionNo} LIMIT 1")
    CpmReportRevision findByNo(@Param("reportId") long reportId, @Param("revisionNo") int revisionNo);

    /** 幂等重放判定：同键是否已产出过版本（配合服务层的内容摘要比对）。 */
    @Select("SELECT * FROM biz_cpm_report_revision WHERE report_id = #{reportId} AND request_key = #{requestKey} LIMIT 1")
    CpmReportRevision findByRequestKey(@Param("reportId") long reportId, @Param("requestKey") String requestKey);

    /** 当前最大版本号：新编号 = max + 1；并发下由 uk_cpm_revision_no 兜住（重复即失败重试）。 */
    @Select("SELECT COALESCE(MAX(revision_no), 0) FROM biz_cpm_report_revision WHERE report_id = #{reportId}")
    int maxRevisionNo(@Param("reportId") long reportId);

    /**
     * 幂等重放判定的**当前读**版本（只在持有汇报行锁的写入事务里用）。
     *
     * <p>为什么普通 SELECT 不够：REPEATABLE READ 下事务的读视图在第一次一致性读时就固定了，
     * 而 `guard.currentUser()` 这类查询往往先于父行锁发生。于是 T2 排队等到 T1 提交后，
     * 用它那**旧的**快照查 request_key，查不到 → 又插一版 → 版本号长到 V3。
     * 实测正是这条路径（并发修订集成测试 expected 2 but was 3）。
     * 加锁读走当前读，看得见刚提交的那一版；此时父行锁已把并发者挡在外面，不会因此死锁。
     */
    @Select("SELECT * FROM biz_cpm_report_revision WHERE report_id = #{reportId} AND request_key = #{requestKey} LIMIT 1 FOR UPDATE")
    CpmReportRevision findByRequestKeyForUpdate(@Param("reportId") long reportId, @Param("requestKey") String requestKey);

    /** 版本号分配的当前读版本，理由与 {@link #findByRequestKeyForUpdate} 完全相同。 */
    @Select("SELECT COALESCE(MAX(revision_no), 0) FROM biz_cpm_report_revision WHERE report_id = #{reportId} FOR UPDATE")
    int maxRevisionNoForUpdate(@Param("reportId") long reportId);
}
