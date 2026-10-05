package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableReturn;
import org.apache.ibatis.annotations.Mapper;

/** 耗材退料单 —— 表 biz_eam_consumable_return 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface EamConsumableReturnMapper extends BaseMapper<EamConsumableReturn> {
}
