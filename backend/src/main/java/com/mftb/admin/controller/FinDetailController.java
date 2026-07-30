package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FinDetailQuery;
import com.mftb.admin.dto.FinDetailVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinDetailService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 交易明细查询接口（明细查询菜单）
 */
@RestController
@RequestMapping("/api/fin/details")
@RequiredArgsConstructor
public class FinDetailController {

    private final FinDetailService finDetailService;

    /** 交易明细列表（分页） */
    @GetMapping
    public Result<PageResult<FinDetailVO>> page(FinDetailQuery query) {
        return Result.success(finDetailService.page(query));
    }
}
