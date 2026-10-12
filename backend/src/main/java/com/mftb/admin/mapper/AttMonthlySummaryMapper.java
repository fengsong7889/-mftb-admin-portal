package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AttMonthlySummary;
import org.apache.ibatis.annotations.Mapper;

/** 月度考勤汇总 Mapper（薪酬取数出口） */
@Mapper
public interface AttMonthlySummaryMapper extends BaseMapper<AttMonthlySummary> {
}
