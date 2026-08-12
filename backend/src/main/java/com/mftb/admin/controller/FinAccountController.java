package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.entity.FinBatch;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.FinBatchMapper;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.FinAccountService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 推广金账户接口（账户余额菜单）
 */
@RestController
@RequestMapping("/api/fin/accounts")
@RequiredArgsConstructor
public class FinAccountController {

    private final FinAccountService finAccountService;
    private final FinDetailMapper finDetailMapper;
    private final FinBatchMapper finBatchMapper;

    /** 账户余额列表（分页） */
    @GetMapping
    @RequirePermission(menu = "account-balance")
    public Result<PageResult<FinAccountVO>> page(FinAccountQuery query) {
        return Result.success(finAccountService.page(query));
    }

    /** 冻结账户（按集团+品牌） */
    @PutMapping("/{groupId}/freeze")
    @RequirePermission(menu = "account-balance", action = "edit")
    public Result<Void> freeze(@PathVariable String groupId, @RequestParam String brand) {
        finAccountService.freeze(groupId, brand);
        return Result.success("账户已冻结", null);
    }

    /** 解冻账户（按集团+品牌） */
    @PutMapping("/{groupId}/unfreeze")
    @RequirePermission(menu = "account-balance", action = "edit")
    public Result<Void> unfreeze(@PathVariable String groupId, @RequestParam String brand) {
        finAccountService.unfreeze(groupId, brand);
        return Result.success("账户已解冻", null);
    }

    /** 诊断接口：查询指定集团的所有账户原始数据（含 virtual_balance / actual_balance） */
    @GetMapping("/debug/{groupCode}")
    public Result<List<FinAccount>> debugAccount(@PathVariable String groupCode) {
        return Result.success(finAccountService.findAccountsByGroupCode(groupCode));
    }

    /** 数据修复：修正充值审批 CZ202608120001 的错误数据（删除多余的扣款明细 + 修正账户余额） */
    @PostMapping("/fix/CZ202608120001")
    public Result<Map<String, Object>> fixCZ202608120001() {
        Map<String, Object> result = new LinkedHashMap<>();

        // 1. 查找该充值对应的批次号
        FinBatch batch = finBatchMapper.selectOne(
                new LambdaQueryWrapper<FinBatch>()
                        .eq(FinBatch::getFlowNo, "CZ202608120001"));
        if (batch == null) {
            return Result.success("未找到批次记录", null);
        }
        String batchNo = batch.getBatchNo();
        result.put("batchNo", batchNo);

        // 2. 删除 change_type = '充值批次扣款' 的明细记录
        int deleted = finDetailMapper.delete(
                new LambdaQueryWrapper<FinDetail>()
                        .eq(FinDetail::getBatchNo, batchNo)
                        .eq(FinDetail::getChangeType, "充值批次扣款"));
        result.put("deletedDetails", deleted);

        // 3. 修正账户余额：virtualBalance = 10000, actualBalance = 9000
        FinAccount account = finAccountService.find("JT000003", "mFood");
        if (account != null) {
            BigDecimal oldVirtual = account.getVirtualBalance();
            BigDecimal oldActual = account.getActualBalance();
            account.setVirtualBalance(new BigDecimal("10000"));
            account.setActualBalance(new BigDecimal("9000"));
            finAccountService.fixBalance("JT000003", "mFood", account);
            result.put("oldVirtual", oldVirtual);
            result.put("newVirtual", "10000");
            result.put("oldActual", oldActual);
            result.put("newActual", "9000");
        }

        return Result.success("修复完成", result);
    }
}
