package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.service.FinAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 推广金账户接口（账户余额菜单）
 */
@RestController
@RequestMapping("/api/fin/accounts")
@RequiredArgsConstructor
public class FinAccountController {

    private final FinAccountService finAccountService;

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
        return Result.success("賬戶已凍結", null);
    }

    /** 解冻账户（按集团+品牌） */
    @PutMapping("/{groupId}/unfreeze")
    @RequirePermission(menu = "account-balance", action = "edit")
    public Result<Void> unfreeze(@PathVariable String groupId, @RequestParam String brand) {
        finAccountService.unfreeze(groupId, brand);
        return Result.success("賬戶已解凍", null);
    }

    /** 诊断接口：查询指定集团的所有账户原始数据（含 virtual_balance / actual_balance） */
    @GetMapping("/debug/{groupCode}")
    @RequirePermission(menu = "account-balance")
    public Result<List<FinAccount>> debugAccount(@PathVariable String groupCode) {
        return Result.success(finAccountService.findAccountsByGroupCode(groupCode));
    }
}
