package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamPurchaseOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 采购订单实体 Mapper */
@Mapper
public interface EamPurchaseOrderMapper extends BaseMapper<EamPurchaseOrder> {
    /** 同一订单的验收与执行更新串行化，锁持有至事务结束。 */
    @Select("SELECT * FROM biz_eam_purchase_order WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamPurchaseOrder selectForUpdate(@Param("id") long id);
}
