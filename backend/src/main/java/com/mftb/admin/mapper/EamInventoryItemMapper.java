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
