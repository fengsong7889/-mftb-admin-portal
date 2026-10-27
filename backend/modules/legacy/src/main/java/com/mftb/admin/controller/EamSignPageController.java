package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EamClaimVO;
import com.mftb.admin.dto.EamSignPageDTO;
import com.mftb.admin.service.EamClaimService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 钉钉签署页专用接口（令牌免登）
 * 通过 HMAC 签署令牌校验领用人身份，无需登录后台
 */
@RestController
@RequestMapping("/api/sign-page")
@RequiredArgsConstructor
public class EamSignPageController {

    private final EamClaimService claimService;

    /** 凭令牌读取待签署领用详情 */
    @GetMapping("/detail")
    public Result<EamClaimVO> detail(@RequestParam("token") String token) {
        return Result.success(claimService.signPageDetail(token));
    }

    /** 凭令牌提交签名 */
    @PostMapping("/sign")
    public Result<Void> sign(@RequestBody EamSignPageDTO dto) {
        claimService.signByToken(dto);
        return Result.success();
    }
}
