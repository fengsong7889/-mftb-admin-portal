/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmWorklogGroup;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/** 工作項（台账分组）访问：读一律带归属人，写一律带归属人条件，IDOR 在 SQL 层就堵掉。 */
@Mapper
public interface CpmWorklogGroupMapper extends BaseMapper<CpmWorklogGroup> {

    @Select("SELECT * FROM biz_cpm_worklog_group WHERE deleted = 0 AND user_id = #{userId} "
            + "ORDER BY sort_order ASC, id ASC")
    List<CpmWorklogGroup> listMine(@Param("userId") long userId);

    @Select("SELECT * FROM biz_cpm_worklog_group WHERE id = #{id} AND deleted = 0")
    CpmWorklogGroup selectAliveById(@Param("id") long id);

    /** 软删工作項本身；子任务由服务层同事务处理（不级联删事实，只解除归属，见 CpmWorklogService）。 */
    @Update("UPDATE biz_cpm_worklog_group SET deleted = 1, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int softDelete(@Param("id") long id, @Param("userId") long userId, @Param("operator") String operator);

    /** 恢复被删除的工作項连同其子任务（撤销通道）：只按归属人条件生效，跨人不生效。 */
    @Update("UPDATE biz_cpm_worklog_group SET deleted = 0, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 1")
    int restore(@Param("id") long id, @Param("userId") long userId, @Param("operator") String operator);

    /** 行序落库：拖拽结果只有本人可见，按 (id, user_id) 条件更新，跨人不生效。 */
    @Update("UPDATE biz_cpm_worklog_group SET sort_order = #{sortOrder}, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int updateSort(@Param("id") long id, @Param("userId") long userId,
                   @Param("sortOrder") int sortOrder, @Param("operator") String operator);
}
