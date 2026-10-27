package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrPerfCycle;
import org.apache.ibatis.annotations.Mapper;

/** 考核周期（如 2026 年第三季度），计划发起的时间容器。 Mapper */
@Mapper
public interface HrPerfCycleMapper extends BaseMapper<HrPerfCycle> {
}
