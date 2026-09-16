package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamCompensationPayment;
import org.apache.ibatis.annotations.Mapper;

/** 赔付收款/退款流水 Mapper */
@Mapper
public interface EamCompensationPaymentMapper extends BaseMapper<EamCompensationPayment> {
}
