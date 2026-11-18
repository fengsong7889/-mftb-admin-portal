/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmReaction;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * CPM 点赞：切换用两步（先按唯一键复活/新插，再反向软删），
 * 不做「查了再写」——并发双击的净效果必须收敛到一个确定状态。
 */
@Mapper
public interface CpmReactionMapper extends BaseMapper<CpmReaction> {

    @Select("SELECT COUNT(*) FROM biz_cpm_reaction WHERE target_type = #{targetType} AND target_id = #{targetId} "
            + "AND user_id = #{userId} AND deleted = 0")
    int countActive(@Param("targetType") String targetType, @Param("targetId") long targetId,
                    @Param("userId") long userId);

    @Update("UPDATE biz_cpm_reaction SET deleted = 1 WHERE target_type = #{targetType} AND target_id = #{targetId} "
            + "AND user_id = #{userId} AND deleted = 0")
    int cancel(@Param("targetType") String targetType, @Param("targetId") long targetId, @Param("userId") long userId);

    /** 复活此前点过又取消的赞（行存在但 deleted=1）；返回 0 说明没有旧行，调用方再 INSERT。 */
    @Update("UPDATE biz_cpm_reaction SET deleted = 0, created_at = NOW() "
            + "WHERE target_type = #{targetType} AND target_id = #{targetId} AND user_id = #{userId} AND deleted = 1")
    int revive(@Param("targetType") String targetType, @Param("targetId") long targetId, @Param("userId") long userId);

    @Select("SELECT COUNT(*) FROM biz_cpm_reaction WHERE target_type = #{targetType} AND target_id = #{targetId} AND deleted = 0")
    int countAll(@Param("targetType") String targetType, @Param("targetId") long targetId);
}
