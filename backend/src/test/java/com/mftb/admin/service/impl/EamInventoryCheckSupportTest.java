package com.mftb.admin.service.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 盘点核对规则（纯函数）单元测试 */
class EamInventoryCheckSupportTest {

    private final EamInventoryCheckSupport support = new EamInventoryCheckSupport();

    @Test
    void locationResultCoversAllBranches() {
        assertEquals(EamInventoryCheckSupport.RESULT_NA,
                support.locationResult("lost", 5L, "珠海倉", null, null, null));
        assertEquals(EamInventoryCheckSupport.RESULT_PENDING,
                support.locationResult("normal", 5L, "珠海倉", null, null, null));
        assertEquals(EamInventoryCheckSupport.RESULT_CONSISTENT,
                support.locationResult("normal", 5L, "珠海倉", 5L, null, null));
        assertEquals(EamInventoryCheckSupport.RESULT_DIFF,
                support.locationResult("normal", 5L, "珠海倉", 9L, null, null));
        // 无 ID 时按规范化名称比较
        assertEquals(EamInventoryCheckSupport.RESULT_CONSISTENT,
                support.locationResult("normal", null, "珠海 倉", null, "珠海倉", null));
    }

    @Test
    void holderResultCoversBranches() {
        assertEquals(EamInventoryCheckSupport.RESULT_NA,
                support.holderResult("lost", 7L, "張三", "EMPLOYEE", 7L, null));
        assertEquals(EamInventoryCheckSupport.RESULT_PENDING,
                support.holderResult("normal", 7L, "張三", null, null, null));
        assertEquals(EamInventoryCheckSupport.RESULT_CONSISTENT,
                support.holderResult("normal", 7L, "張三", "EMPLOYEE", 7L, null));
        assertEquals(EamInventoryCheckSupport.RESULT_DIFF,
                support.holderResult("normal", 7L, "張三", "EMPLOYEE", 8L, null));
        assertEquals(EamInventoryCheckSupport.RESULT_CONSISTENT,
                support.holderResult("normal", null, null, "NONE", null, null));
        assertEquals(EamInventoryCheckSupport.RESULT_DIFF,
                support.holderResult("normal", 7L, "張三", "NONE", null, null));
        // 账面缺 ID 但有姓名时不自动判一致
        assertEquals(EamInventoryCheckSupport.RESULT_DIFF,
                support.holderResult("normal", null, "張三", "EMPLOYEE", 8L, null));
    }

    @Test
    void checkedAndAnomalySemantics() {
        assertFalse(support.isChecked("pending", null, null, 0));
        // 未找到：位置/持有人 NA 即视为已核对
        assertTrue(support.isChecked("lost", EamInventoryCheckSupport.RESULT_NA, EamInventoryCheckSupport.RESULT_NA, 0));
        // 位置待确认 -> 未核对
        assertFalse(support.isChecked("normal", EamInventoryCheckSupport.RESULT_PENDING, EamInventoryCheckSupport.RESULT_CONSISTENT, 0));
        // 期间变更待复核 -> 未核对
        assertFalse(support.isChecked("normal", EamInventoryCheckSupport.RESULT_CONSISTENT, EamInventoryCheckSupport.RESULT_CONSISTENT, 1));

        assertTrue(support.isAnomaly("lost", EamInventoryCheckSupport.RESULT_NA, EamInventoryCheckSupport.RESULT_NA));
        assertTrue(support.isAnomaly("normal", EamInventoryCheckSupport.RESULT_DIFF, EamInventoryCheckSupport.RESULT_CONSISTENT));
        assertFalse(support.isAnomaly("normal", EamInventoryCheckSupport.RESULT_CONSISTENT, EamInventoryCheckSupport.RESULT_CONSISTENT));
    }
}
