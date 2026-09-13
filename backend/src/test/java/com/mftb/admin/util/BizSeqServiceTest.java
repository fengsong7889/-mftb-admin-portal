package com.mftb.admin.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * BizSeqService 静态映射方法测试（不依赖 Spring 容器和数据库）
 */
class BizSeqServiceTest {

    @Test
    void flowRuleKey_knownTypes() {
        assertEquals("recharge", BizSeqService.flowRuleKey("recharge"));
        assertEquals("deduct", BizSeqService.flowRuleKey("deduct"));
        assertEquals("transfer", BizSeqService.flowRuleKey("transfer"));
        assertEquals("merge", BizSeqService.flowRuleKey("merge"));
        assertEquals("gift_approval", BizSeqService.flowRuleKey("gift"));
        assertEquals("ai_access", BizSeqService.flowRuleKey("ai_access"));
    }

    @Test
    void flowRuleKey_unknownTypeReturnsNull() {
        assertNull(BizSeqService.flowRuleKey("unknown"));
        assertNull(BizSeqService.flowRuleKey(""));
    }

    @Test
    void batchRuleKey_knownTypes() {
        assertEquals("batch_recharge", BizSeqService.batchRuleKey("recharge"));
        assertEquals("batch_transfer", BizSeqService.batchRuleKey("transfer"));
        assertEquals("batch_merge", BizSeqService.batchRuleKey("merge"));
    }

    @Test
    void batchRuleKey_unknownTypeReturnsNull() {
        assertNull(BizSeqService.batchRuleKey("unknown"));
    }

    @Test
    void algoRuleKey_knownTypes() {
        assertEquals("algo_star", BizSeqService.algoRuleKey(1));
        assertEquals("algo_new_store", BizSeqService.algoRuleKey(2));
        assertEquals("algo_revive", BizSeqService.algoRuleKey(3));
        assertEquals("algo_exclusive", BizSeqService.algoRuleKey(4));
        assertEquals("algo_popular", BizSeqService.algoRuleKey(5));
        assertEquals("algo_guess", BizSeqService.algoRuleKey(6));
        assertEquals("algo_organic", BizSeqService.algoRuleKey(7));
        assertEquals("algo_brand", BizSeqService.algoRuleKey(11));
        assertEquals("algo_gold", BizSeqService.algoRuleKey(12));
        assertEquals("algo_signboard", BizSeqService.algoRuleKey(13));
        assertEquals("algo_promo", BizSeqService.algoRuleKey(14));
        assertEquals("algo_traffic", BizSeqService.algoRuleKey(15));
    }

    @Test
    void algoRuleKey_nullAndUnknown() {
        assertNull(BizSeqService.algoRuleKey(null));
        assertNull(BizSeqService.algoRuleKey(99));
        assertNull(BizSeqService.algoRuleKey(0));
    }

    @Test
    void giftRuleKey_knownTypes() {
        assertEquals("gift_new_store", BizSeqService.giftRuleKey("new_store"));
        assertEquals("gift_revive", BizSeqService.giftRuleKey("revival"));
        assertEquals("gift_popular", BizSeqService.giftRuleKey("ka"));
    }

    @Test
    void giftRuleKey_nullAndUnknown() {
        assertNull(BizSeqService.giftRuleKey(null));
        assertNull(BizSeqService.giftRuleKey("unknown"));
    }
}
