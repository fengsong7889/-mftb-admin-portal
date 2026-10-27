package com.mftb.admin.service;

import com.mftb.admin.dto.FlashSaleDTOs;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizFlashSalePeriod;

import java.util.List;

/**
 * 秒杀模块服务（登记/统计/汇总/总览/导入）
 */
public interface FlashSaleService {

    /** 期数下拉（按期数倒序） */
    List<BizFlashSalePeriod> listPeriods();

    /** 登记分页列表（含阶梯/黑榜标记） */
    PageResult<FlashSaleDTOs.RegisterVO> listRegisters(Integer periodNo, String subsidyType, String productType,
                                                       String bd, String keyword, long page, long size);

    /** 登记导入（门店引用校验 + BD 自动带出 + 阶梯落库） */
    FlashSaleDTOs.ImportResultVO importRegisters(Integer periodNo, List<FlashSaleDTOs.RegisterRow> rows);

    /** 统计分页列表（含阶梯） */
    PageResult<FlashSaleDTOs.StatsVO> listStats(Integer periodNo, String subsidyType, String bd,
                                                String keyword, long page, long size);

    /** 统计导入（落库后回填登记.current_sales） */
    FlashSaleDTOs.ImportResultVO importStats(Integer periodNo, List<FlashSaleDTOs.StatsRow> rows);

    /** 每日汇总导入（statDate 为 null 的行作为整期合计） */
    FlashSaleDTOs.ImportResultVO importSummary(Integer periodNo, List<FlashSaleDTOs.SummaryRow> rows);

    /** 总览（合计行 + 每日明细 + 系统计算环比/动销率） */
    FlashSaleDTOs.OverviewVO overview(Integer periodNo);
}
