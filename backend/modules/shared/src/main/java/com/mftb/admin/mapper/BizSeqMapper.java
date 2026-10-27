package com.mftb.admin.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 业务编号序号 Mapper（sys_biz_seq）
 * 生成步骤: 播种行 -> 自增 -> 查回当前值；自增语句持有行锁，同事务内并发安全
 */
@Mapper
public interface BizSeqMapper {

    /** 播种当日序号行（已存在时忽略） */
    @Insert("INSERT IGNORE INTO sys_biz_seq (prefix, date_key, current_value) "
            + "VALUES (#{prefix}, #{dateKey}, 0)")
    int initSeq(@Param("prefix") String prefix, @Param("dateKey") String dateKey);

    /** 序号自增 1 */
    @Update("UPDATE sys_biz_seq SET current_value = current_value + 1 "
            + "WHERE prefix = #{prefix} AND date_key = #{dateKey}")
    int increaseSeq(@Param("prefix") String prefix, @Param("dateKey") String dateKey);

    /** 查询自增后的当前序号 */
    @Select("SELECT current_value FROM sys_biz_seq "
            + "WHERE prefix = #{prefix} AND date_key = #{dateKey}")
    Integer selectCurrentValue(@Param("prefix") String prefix, @Param("dateKey") String dateKey);
}
