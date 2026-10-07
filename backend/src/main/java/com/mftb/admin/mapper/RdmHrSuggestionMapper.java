package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmHrSuggestion;
import org.apache.ibatis.annotations.Mapper;

/** HR 绩效建议 Mapper（聚合→复核→推送→撤回，状态单向流转） */
@Mapper
public interface RdmHrSuggestionMapper extends BaseMapper<RdmHrSuggestion> {
}
