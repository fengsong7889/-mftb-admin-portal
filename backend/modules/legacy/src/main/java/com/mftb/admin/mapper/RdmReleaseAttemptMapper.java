package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmReleaseAttempt;
import org.apache.ibatis.annotations.Mapper;

/** RDM 追加式部署/验证/开放/回滚事实 Mapper */
@Mapper
public interface RdmReleaseAttemptMapper extends BaseMapper<RdmReleaseAttempt> {
}
