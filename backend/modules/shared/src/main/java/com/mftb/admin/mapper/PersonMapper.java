package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.Person;
import org.apache.ibatis.annotations.Mapper;

/** 人员主数据 Mapper */
@Mapper
public interface PersonMapper extends BaseMapper<Person> {
}
