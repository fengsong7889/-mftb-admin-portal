/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/** CPM 汇报规则访问：全表一行（唯一键保证），作业与页面读的是同一行。 */
@Mapper
public interface CpmRuleMapper extends BaseMapper<CpmRule> {

    @Select("SELECT * FROM biz_cpm_rule WHERE rule_slot = 'default' LIMIT 1")
    CpmRule findDefault();
}
