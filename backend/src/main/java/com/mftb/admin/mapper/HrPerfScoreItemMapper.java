package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrPerfScoreItem;
import org.apache.ibatis.annotations.Mapper;

/** 指标级打分明细（自评/上级评各一行内三列，便于逐指标对比）。 Mapper */
@Mapper
public interface HrPerfScoreItemMapper extends BaseMapper<HrPerfScoreItem> {
}
