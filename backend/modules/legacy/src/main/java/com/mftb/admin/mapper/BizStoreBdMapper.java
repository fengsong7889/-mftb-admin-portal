package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.BizStoreBd;
import org.apache.ibatis.annotations.Mapper;

/** 门店绑定BD关系实体（一家门店可绑定多个BD） Mapper */
@Mapper
public interface BizStoreBdMapper extends BaseMapper<BizStoreBd> {
}
