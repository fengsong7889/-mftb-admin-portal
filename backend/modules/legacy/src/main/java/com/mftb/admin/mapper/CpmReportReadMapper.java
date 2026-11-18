/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmReportRead;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * CPM 已读回执：INSERT IGNORE 幂等（唯一键 report_id+reader），
 * 重复打开不刷新 read_at——统计口径要的是「首次已读」而不是「最后动作」。
 */
@Mapper
public interface CpmReportReadMapper extends BaseMapper<CpmReportRead> {

    @Insert("INSERT IGNORE INTO biz_cpm_report_read (report_id, reader_user_id, read_at) "
            + "VALUES (#{reportId}, #{readerUserId}, NOW())")
    int insertIgnore(@Param("reportId") long reportId, @Param("readerUserId") long readerUserId);

    @Select("SELECT COUNT(*) FROM biz_cpm_report_read WHERE report_id = #{reportId}")
    int countRead(@Param("reportId") long reportId);
}
