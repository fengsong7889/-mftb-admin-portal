package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.BizGiftRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/** 赠送记录实体 Mapper */
@Mapper
public interface BizGiftRecordMapper extends BaseMapper<BizGiftRecord> {

    /**
     * 原子扣减赠送天数: 仅当剩余天数足够时生效
     * <p>
     * SET 子句按顺序求值: status 判断时 remaining_days 已是新值, 恰好扣完则置为已用完(2)
     *
     * @return 影响行数, 0 表示该记录剩余不足(已被并发扣减)
     */
    @Update("UPDATE biz_gift_record " +
            "SET used_days = used_days + #{days}, " +
            "    remaining_days = remaining_days - #{days}, " +
            "    status = IF(remaining_days = 0, 2, status), " +
            "    updated_by = #{operator} " +
            "WHERE id = #{id} AND remaining_days >= #{days}")
    int deductAtomic(@Param("id") Long id,
                     @Param("days") int days,
                     @Param("operator") String operator);
}
