package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmPrdSnapshot;
import org.apache.ibatis.annotations.Mapper;

/** PRD 定稿快照 Mapper（快照只增不改，写入集中在评审结论落定时） */
@Mapper
public interface RdmPrdSnapshotMapper extends BaseMapper<RdmPrdSnapshot> {
}
