package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FlashSaleDTOs;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizFlashSalePeriod;
import com.mftb.admin.service.FlashSaleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 秒杀模块接口（登记/统计/汇总/总览）
 */
@RestController
@RequestMapping("/api/flash-sale")
@RequiredArgsConstructor
public class FlashSaleController {

    private final FlashSaleService flashSaleService;

    /** 期数下拉 */
    @GetMapping("/periods")
    public Result<List<BizFlashSalePeriod>> periods() {
        return Result.success(flashSaleService.listPeriods());
    }

    /** 登记分页列表 */
    @GetMapping("/registers")
    @RequirePermission(menu = "flash-sale-register")
    public Result<PageResult<FlashSaleDTOs.RegisterVO>> registers(
            @RequestParam(required = false) Integer periodNo,
            @RequestParam(required = false) String subsidyType,
            @RequestParam(required = false) String productType,
            @RequestParam(required = false) String bd,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size) {
        return Result.success(flashSaleService.listRegisters(periodNo, subsidyType, productType, bd, keyword, page, size));
    }

    /** 登记导入 */
    @PostMapping("/registers/import")
    @RequirePermission(menu = "flash-sale-register", action = "create")
    public Result<FlashSaleDTOs.ImportResultVO> importRegisters(@RequestBody FlashSaleDTOs.RegisterImportRequest request) {
        return Result.success("導入完成", flashSaleService.importRegisters(request.getPeriodNo(), request.getRows()));
    }

    /** 统计分页列表 */
    @GetMapping("/stats")
    @RequirePermission(menu = "flash-sale-stats")
    public Result<PageResult<FlashSaleDTOs.StatsVO>> stats(
            @RequestParam(required = false) Integer periodNo,
            @RequestParam(required = false) String subsidyType,
            @RequestParam(required = false) String bd,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size) {
        return Result.success(flashSaleService.listStats(periodNo, subsidyType, bd, keyword, page, size));
    }

    /** 统计导入 */
    @PostMapping("/stats/import")
    @RequirePermission(menu = "flash-sale-stats", action = "create")
    public Result<FlashSaleDTOs.ImportResultVO> importStats(@RequestBody FlashSaleDTOs.StatsImportRequest request) {
        return Result.success("導入完成", flashSaleService.importStats(request.getPeriodNo(), request.getRows()));
    }

    /** 每日汇总导入 */
    @PostMapping("/summary/import")
    @RequirePermission(menu = "group-purchase-dashboard", action = "create")
    public Result<FlashSaleDTOs.ImportResultVO> importSummary(@RequestBody FlashSaleDTOs.SummaryImportRequest request) {
        return Result.success("導入完成", flashSaleService.importSummary(request.getPeriodNo(), request.getRows()));
    }

    /** 数据总览（合计+每日明细+环比） */
    @GetMapping("/overview")
    @RequirePermission(menu = "group-purchase-dashboard")
    public Result<FlashSaleDTOs.OverviewVO> overview(@RequestParam(required = false) Integer periodNo) {
        return Result.success(flashSaleService.overview(periodNo));
    }
}
