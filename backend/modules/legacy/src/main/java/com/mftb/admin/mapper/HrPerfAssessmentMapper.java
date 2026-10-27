package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrPerfAssessment;
import org.apache.ibatis.annotations.Mapper;

/** 每人一张考核单，承载四阶段评分与最终结果。 Mapper */
@Mapper
public interface HrPerfAssessmentMapper extends BaseMapper<HrPerfAssessment> {
}
