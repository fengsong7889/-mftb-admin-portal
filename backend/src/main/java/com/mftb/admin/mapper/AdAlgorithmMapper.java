package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdAlgorithm;
import org.apache.ibatis.annotations.Mapper;

/** 推广算法登记实体（共享核心层，对应「算法库」菜单） Mapper */
@Mapper
public interface AdAlgorithmMapper extends BaseMapper<AdAlgorithm> {
}
