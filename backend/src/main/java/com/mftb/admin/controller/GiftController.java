package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.GiftConsumeVO;
import com.mftb.admin.dto.GiftDeductRequest;
import com.mftb.admin.dto.GiftRecordRequest;
import com.mftb.admin.dto.GiftRecordVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.GiftService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 赠送管理接口
 */
@RestController
@RequestMapping("/api/gifts")
@RequiredArgsConstructor
public class GiftController {

    private final GiftService giftService;

    /** 推广赠送列表（分页） */
    @GetMapping
    public Result<PageResult<GiftRecordVO>> listRecords(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long storeId,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String adType) {
        return Result.success(giftService.listRecords(page, size, groupId, storeId, brand, adType));
    }

    /** 新增赠送申请 */
    @PostMapping
    public Result<GiftRecordVO> createRecord(@Valid @RequestBody GiftRecordRequest request) {
        return Result.success("赠送申请已提交", giftService.createRecord(request));
    }

    /** 赠送明细详情 */
    @GetMapping("/{id}")
    public Result<GiftRecordVO> getRecordDetail(@PathVariable Long id) {
        return Result.success(giftService.getRecordDetail(id));
    }

    /** 扣除赠送天数 */
    @PostMapping("/{id}/deduct")
    public Result<Void> deductDays(@PathVariable Long id, @Valid @RequestBody GiftDeductRequest request) {
        giftService.deductDays(id, request);
        return Result.success();
    }

    /** 消费明细列表（分页） */
    @GetMapping("/consume")
    public Result<PageResult<GiftConsumeVO>> listConsume(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long storeId,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String adType,
            @RequestParam(required = false) String tradeType,
            @RequestParam(required = false) String giftId,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String algorithmId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return Result.success(giftService.listConsume(page, size, groupId, storeId, brand, adType,
                tradeType, giftId, orderNo, algorithmId, startDate, endDate));
    }
}
