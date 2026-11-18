/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmComment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** CPM 评论反馈访问。 */
@Mapper
public interface CpmCommentMapper extends BaseMapper<CpmComment> {

    @Select("SELECT c.*, u.name AS authorName FROM biz_cpm_comment c "
            + "JOIN sys_user u ON u.id = c.user_id "
            + "WHERE c.target_type = #{targetType} AND c.target_id = #{targetId} AND c.deleted = 0 "
            + "ORDER BY c.created_at ASC, c.id ASC")
    List<java.util.Map<String, Object>> listThreadLite(@Param("targetType") String targetType,
                                                       @Param("targetId") long targetId);

    @Select("SELECT COUNT(*) FROM biz_cpm_comment WHERE target_type = #{targetType} AND target_id = #{targetId} AND deleted = 0")
    int countActive(@Param("targetType") String targetType, @Param("targetId") long targetId);

    /** 仅作者可删自己的评论（user_id 进 WHERE，非作者 0 行）。 */
    @Update("UPDATE biz_cpm_comment SET deleted = 1 WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int softDeleteOwn(@Param("id") long id, @Param("userId") long userId);
}
