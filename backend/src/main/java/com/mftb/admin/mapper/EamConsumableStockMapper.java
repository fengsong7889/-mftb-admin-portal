package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableStock;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 耗材库存 Mapper
 * <p>
 * 所有数量变更均走「条件 SQL 原子更新」，返回受影响行数用于判定并发是否成功：
 *   0 行 = 条件不满足（库存不足 / 已被并发扣减），调用方需回滚事务并报错，杜绝超卖。
 */
@Mapper
public interface EamConsumableStockMapper extends BaseMapper<EamConsumableStock> {

    /** 按耗材+仓库定位库存行并加行锁（事务内使用） */
    @Select("SELECT * FROM biz_eam_consumable_stock WHERE item_id = #{itemId} AND location_id = #{locationId} FOR UPDATE")
    EamConsumableStock selectForUpdate(@Param("itemId") long itemId, @Param("locationId") long locationId);

    /**
     * 入库（采购/手工/盘盈）：不存在则插入，存在则累加。
     * ON DUPLICATE KEY 依赖 uk_item_location 唯一键，保证并发下只有一行。
     */
    @Update("INSERT INTO biz_eam_consumable_stock (item_id, location_id, location_name, qty, locked_qty, version) "
            + "VALUES (#{itemId}, #{locationId}, #{locationName}, #{qty}, 0, 0) "
            + "ON DUPLICATE KEY UPDATE qty = qty + #{qty}, location_name = VALUES(location_name), version = version + 1")
    int inbound(@Param("itemId") long itemId, @Param("locationId") long locationId,
                @Param("locationName") String locationName, @Param("qty") int qty);

    /** 领用提交时占用库存：仅当「可用量(qty-locked_qty) >= 申请量」时锁定成功 */
    @Update("UPDATE biz_eam_consumable_stock SET locked_qty = locked_qty + #{qty}, version = version + 1 "
            + "WHERE item_id = #{itemId} AND location_id = #{locationId} AND (qty - locked_qty) >= #{qty}")
    int lock(@Param("itemId") long itemId, @Param("locationId") long locationId, @Param("qty") int qty);

    /** 出库核销：同时扣减实际库存与占用量，双重条件防超卖 */
    @Update("UPDATE biz_eam_consumable_stock SET qty = qty - #{qty}, locked_qty = locked_qty - #{qty}, version = version + 1 "
            + "WHERE item_id = #{itemId} AND location_id = #{locationId} AND qty >= #{qty} AND locked_qty >= #{qty}")
    int deductOnIssue(@Param("itemId") long itemId, @Param("locationId") long locationId, @Param("qty") int qty);

    /** 释放占用（驳回/撤销领用）：仅回退 locked_qty，不动实际库存 */
    @Update("UPDATE biz_eam_consumable_stock SET locked_qty = locked_qty - #{qty}, version = version + 1 "
            + "WHERE item_id = #{itemId} AND location_id = #{locationId} AND locked_qty >= #{qty}")
    int releaseLock(@Param("itemId") long itemId, @Param("locationId") long locationId, @Param("qty") int qty);

    /** 库存调整（盘盈/盘亏）：直接增减 qty，条件保证结果非负 */
    @Update("UPDATE biz_eam_consumable_stock SET qty = qty + #{delta}, version = version + 1 "
            + "WHERE item_id = #{itemId} AND location_id = #{locationId} AND (qty + #{delta}) >= 0")
    int adjust(@Param("itemId") long itemId, @Param("locationId") long locationId, @Param("delta") int delta);

    /** 汇总某耗材在所有仓库的可用库存（看板/预警用） */
    @Select("SELECT COALESCE(SUM(qty - locked_qty), 0) FROM biz_eam_consumable_stock WHERE item_id = #{itemId}")
    int sumAvailableByItem(@Param("itemId") long itemId);

    /** 汇总某耗材在所有仓库的实际库存 */
    @Select("SELECT COALESCE(SUM(qty), 0) FROM biz_eam_consumable_stock WHERE item_id = #{itemId}")
    int sumQtyByItem(@Param("itemId") long itemId);
}
