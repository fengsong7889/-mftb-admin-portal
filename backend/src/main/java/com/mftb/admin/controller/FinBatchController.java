package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.FinBatchQuery;
import com.mftb.admin.dto.FinBatchVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.FinBatchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 批次查询接口（批次查询菜单）
 */
@RestController
@RequestMapping("/api/fin/batches")
@RequiredArgsConstructor
public class FinBatchController {

    private final FinBatchService finBatchService;

    /** 批次列表（分页） */
    @GetMapping
    public Result<PageResult<FinBatchVO>> page(FinBatchQuery query) {
        return Result.success(finBatchService.page(query));
    }

    /** 批次明细（转账/合并批次双方共享批次号时可传 groupId 定位具体一方） */
    @GetMapping("/{batchNo}")
    public Result<FinBatchVO> detail(@PathVariable String batchNo,
                                    @RequestParam(required = false) String groupId) {
        return Result.success(finBatchService.detail(batchNo, groupId));
    }
}
