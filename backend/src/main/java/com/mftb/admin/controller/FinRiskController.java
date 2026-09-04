package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FinRiskConfigDTO;
import com.mftb.admin.dto.FinRiskQuery;
import com.mftb.admin.dto.FinRiskVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinRiskService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金消费风控接口（消费风控菜单）
 */
@RestController
@RequestMapping("/api/fin/risk")
@RequiredArgsConstructor
public class FinRiskController {

    private final FinRiskService finRiskService;

    /** 消费风控列表（分页） */
    @GetMapping
    @RequirePermission(menu = "consume-risk")
    public Result<PageResult<FinRiskVO>> page(FinRiskQuery query) {
        return Result.success(finRiskService.page(query));
    }

    /** 风控概览统计已下线（列表页不再展示统计卡） */

    /** 单集团风控配置与额度明细（配置弹窗/扣款页可用额度提示） */
    @GetMapping("/config")
    @RequirePermission(menu = "consume-risk")
    public Result<FinRiskVO> config(@RequestParam String groupId, @RequestParam String brand) {
        return Result.success(finRiskService.getConfig(groupId, brand));
    }

    /** 保存风控配置（模式切换/额度修改/白名单维护；新增默认启用） */
    @PutMapping("/config")
    @RequirePermission(menu = "consume-risk", action = "edit")
    public Result<Void> saveConfig(@RequestBody FinRiskConfigDTO dto) {
        finRiskService.saveConfig(dto);
        return Result.success("风控配置已保存", null);
    }

    /** 启用/停用风控登记（停用后不限制消费） */
    @PutMapping("/config/status")
    @RequirePermission(menu = "consume-risk", action = "edit")
    public Result<Void> updateStatus(@RequestParam String groupId,
                                     @RequestParam String brand,
                                     @RequestParam String status) {
        finRiskService.updateStatus(groupId, brand, status);
        return Result.success("enabled".equals(status) ? "已启用" : "已停用", null);
    }

    /** 转账欠款批次检查（转账申请页提示：返回会触碰的欠款批次，空数组=放行） */
    @GetMapping("/transfer-check")
    @RequirePermission(menu = "account-balance")
    public Result<List<FinRiskService.FinTransferBlock>> transferCheck(@RequestParam String groupId,
                                                                       @RequestParam BigDecimal amount) {
        return Result.success(finRiskService.checkTransferBatches(groupId, amount));
    }
}
