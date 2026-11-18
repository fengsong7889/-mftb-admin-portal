/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** CPM 岗位模板访问（内置模板不可删除由服务层按 is_builtin 挡）。 */
@Mapper
public interface CpmTemplateMapper extends BaseMapper<CpmTemplate> {

    @Select("SELECT * FROM biz_cpm_template WHERE deleted = 0 AND enabled = 1 ORDER BY is_builtin DESC, id ASC")
    List<CpmTemplate> listEnabled();

    @Select("SELECT * FROM biz_cpm_template WHERE template_key = #{templateKey} AND deleted = 0 LIMIT 1")
    CpmTemplate findByKey(@Param("templateKey") String templateKey);
}
