package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.CardOrderSaveDTO;
import com.mftb.admin.service.CardOrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 卡片排序接口（全局共享，按菜单+Tab维度保存）
 */
@RestController
@RequestMapping("/api/card-order")
@RequiredArgsConstructor
public class CardOrderController {

    private final CardOrderService cardOrderService;

    /** 获取卡片排序 */
    @GetMapping("/{menuKey}/{tabKey}")
    public Result<List<Integer>> getOrder(@PathVariable String menuKey,
                                          @PathVariable String tabKey) {
        return Result.success(cardOrderService.getOrder(menuKey, tabKey));
    }

    /** 保存卡片排序 */
    @PutMapping("/{menuKey}/{tabKey}")
    public Result<Void> saveOrder(@PathVariable String menuKey,
                                  @PathVariable String tabKey,
                                  @RequestBody CardOrderSaveDTO dto) {
        List<Integer> order = dto.getOrder();
        if (order == null) {
            return Result.error("缺少 order 參數");
        }
        cardOrderService.saveOrder(menuKey, tabKey, order);
        return Result.success();
    }
}
