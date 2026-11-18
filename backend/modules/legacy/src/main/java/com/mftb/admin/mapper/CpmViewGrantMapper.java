/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmViewGrant;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * CPM 团队可见性访问。
 * <p>dept_manager 行由同步作业按部门主管关系幂等重建（先删旧推导行再插新行），
 * explicit 行只由授权页人工增删——两类来源分开管理，重建推导线永远不动人工线。
 */
@Mapper
public interface CpmViewGrantMapper extends BaseMapper<CpmViewGrant> {

    @Select("SELECT target_user_id FROM biz_cpm_view_grant WHERE viewer_user_id = #{viewerUserId} AND deleted = 0")
    List<Long> listTargetUserIds(@Param("viewerUserId") long viewerUserId);

    @Select("SELECT COUNT(*) FROM biz_cpm_view_grant WHERE viewer_user_id = #{viewerUserId} "
            + "AND target_user_id = #{targetUserId} AND deleted = 0")
    int countActive(@Param("viewerUserId") long viewerUserId, @Param("targetUserId") long targetUserId);

    @Insert("INSERT IGNORE INTO biz_cpm_view_grant (viewer_user_id, target_user_id, grant_type, granted_by, created_at, deleted) "
            + "VALUES (#{viewerUserId}, #{targetUserId}, #{grantType}, #{grantedBy}, NOW(), 0)")
    int insertIgnore(@Param("viewerUserId") long viewerUserId, @Param("targetUserId") long targetUserId,
                     @Param("grantType") String grantType, @Param("grantedBy") String grantedBy);

    /** 显式授权撤销：只动 explicit 线，主管推导行由组织结构决定，不给人工撤销入口。 */
    @Delete("DELETE FROM biz_cpm_view_grant WHERE viewer_user_id = #{viewerUserId} "
            + "AND target_user_id = #{targetUserId} AND grant_type = 'explicit'")
    int removeExplicit(@Param("viewerUserId") long viewerUserId, @Param("targetUserId") long targetUserId);

    /** 重建推导线第一步：清掉旧的 dept_manager 行（与插入同事务，行集合永远等于当前组织事实）。 */
    @Delete("DELETE FROM biz_cpm_view_grant WHERE grant_type = 'dept_manager'")
    int purgeDerived();
}
