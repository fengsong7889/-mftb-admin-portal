package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmResourcePlan;
import org.apache.ibatis.annotations.Mapper;

/** 个人工作计划 Mapper（阶段 B-2.5：跨来源负载工时载体） */
@Mapper
public interface RdmResourcePlanMapper extends BaseMapper<RdmResourcePlan> {
}
