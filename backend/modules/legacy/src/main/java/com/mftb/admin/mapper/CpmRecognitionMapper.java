/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmRecognition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** CPM 成果认定访问：写入唯一性由数据库唯一键硬拒，重复认定在落库当场失败。 */
@Mapper
public interface CpmRecognitionMapper extends BaseMapper<CpmRecognition> {

    /** 个人成果档案：收到的认定按时间倒序。 */
    @Select("SELECT r.*, u.name AS fromName FROM biz_cpm_recognition r "
            + "JOIN sys_user u ON u.id = r.from_user_id "
            + "WHERE r.to_user_id = #{userId} AND r.deleted = 0 ORDER BY r.created_at DESC, r.id DESC")
    List<java.util.Map<String, Object>> listArchive(@Param("userId") long userId);

    /** 团队统计口径：某期间我发出的认定数（跟随筛选，不单独无条件请求）。 */
    @Select("SELECT COUNT(*) FROM biz_cpm_recognition WHERE from_user_id = #{fromUserId} "
            + "AND period_tag = #{periodTag} AND deleted = 0")
    int countSentInPeriod(@Param("fromUserId") long fromUserId, @Param("periodTag") String periodTag);

    @Select("SELECT COUNT(*) FROM biz_cpm_recognition WHERE target_type = #{targetType} AND target_id = #{targetId} "
            + "AND from_user_id = #{fromUserId} AND deleted = 0")
    int countSameFromOnTarget(@Param("targetType") String targetType, @Param("targetId") long targetId,
                              @Param("fromUserId") long fromUserId);
}
