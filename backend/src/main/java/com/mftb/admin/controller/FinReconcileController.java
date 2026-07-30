package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FinReconcileQuery;
import com.mftb.admin.dto.FinReconcileVO;
import com.mftb.admin.service.FinReconcileService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 对账报表接口（充消对账菜单）
 */
@RestController
@RequestMapping("/api/fin/reconcile")
@RequiredArgsConstructor
public class FinReconcileController {

    private final FinReconcileService finReconcileService;

    /** 充消对账日报（分页 + 周期总账汇总） */
    @GetMapping("/writeoff")
    public Result<FinReconcileVO> writeoff(FinReconcileQuery query) {
        return Result.success(finReconcileService.writeoff(query));
    }
}
