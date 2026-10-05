package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamInventoryItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Collection;
import java.util.List;

/** 资产盘点明细 Mapper */
@Mapper
public interface EamInventoryItemMapper extends BaseMapper<EamInventoryItem> {

    /**
     * 按 id 加行锁读取盘点明细。
     * <p>
     * 与其他 selectForUpdate 不同，本句**不带 deleted=0**（该表无逻辑删除列），
     * 因此已删行依然会被锁住。
     */
    @Select("SELECT * FROM biz_eam_inventory_item WHERE id = #{id} FOR UPDATE")
    EamInventoryItem selectForUpdate(@Param("id") long id);

    /** 按 ID 升序加锁读取明细，保证并发事务加锁顺序一致 */
    @Select({
        "<script>SELECT * FROM biz_eam_inventory_item WHERE id IN "
        + "<foreach item='i' collection='ids' open='(' separator=',' close=')'>#{i}</foreach> "
        + "ORDER BY id FOR UPDATE</script>"
    })
    List<EamInventoryItem> selectForUpdateByIds(@Param("ids") Collection<Long> ids);
}
