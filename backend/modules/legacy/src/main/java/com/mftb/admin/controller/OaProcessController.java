package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.OaProcessVO;
import com.mftb.admin.service.OaProcessService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * OA流程中心接口（展示可用流程类型）
 */
@RestController
@RequestMapping("/api/oa/processes")
@RequiredArgsConstructor
public class OaProcessController {

    private final OaProcessService oaProcessService;

    /** 查询所有可用流程类型列表 */
    @GetMapping
    @RequirePermission(menu = "process-center")
    public Result<List<OaProcessVO>> list() {
        return Result.success(oaProcessService.listProcesses());
    }

    /** 查询单个流程类型详情 */
    @GetMapping("/{code}")
    @RequirePermission(menu = "process-center")
    public Result<OaProcessVO> detail(@PathVariable String code) {
        return Result.success(oaProcessService.getProcess(code));
    }
}
