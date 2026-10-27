package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysBizSeqRule;
import org.apache.ibatis.annotations.Mapper;

/** 编号生成规则配置实体（对应「规则配置 > 编号生成规则」菜单） Mapper */
@Mapper
public interface SysBizSeqRuleMapper extends BaseMapper<SysBizSeqRule> {
}
