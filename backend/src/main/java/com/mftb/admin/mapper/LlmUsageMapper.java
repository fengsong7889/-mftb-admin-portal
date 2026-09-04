package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.LlmUsage;
import org.apache.ibatis.annotations.Mapper;

/**
 * AI 助手使用统计明细 Mapper
 */
@Mapper
public interface LlmUsageMapper extends BaseMapper<LlmUsage> {
}
