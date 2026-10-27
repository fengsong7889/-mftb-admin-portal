package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AiBudgetLedger;
import org.apache.ibatis.annotations.Mapper;

/** AI 预算流水（V0 网关侧预占/结算/释放） —— 表 ai_budget_ledger 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface AiBudgetLedgerMapper extends BaseMapper<AiBudgetLedger> {}
