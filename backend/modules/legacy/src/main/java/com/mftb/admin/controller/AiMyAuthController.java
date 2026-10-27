package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.service.AiMyCenterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 智能中心「我的授权」控制器
 * 首页智能路由的模型候选来源：仅返回当前账号被授权且启用的模型
 */
@RestController
@RequestMapping("/api/ai/auth")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 我的授权", description = "当前账号授权模型查询接口")
public class AiMyAuthController {

    private final AiMyCenterService myCenterService;

    /**
     * 查询当前账号被授权的模型列表（部门策略组/职位/角色/员工四维度并集）
     */
    @GetMapping("/my-models")
    @Operation(summary = "查询我的授权模型列表")
    public Result<List<AiMyCenterDTO.MyModelVO>> myModels() {
        return Result.success(myCenterService.myModels());
    }
}
