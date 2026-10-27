package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamSupplierContact;
import org.apache.ibatis.annotations.Mapper;

/** 供应商联系人实体（一个供应商可配置多个联系人） —— 表 biz_eam_supplier_contact 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface EamSupplierContactMapper extends BaseMapper<EamSupplierContact> {
}
