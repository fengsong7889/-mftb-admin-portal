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

    /**
     * 廣告訂單編號規則映射：必须覆盖各 AdSales*ServiceImpl 下单实际使用的规则 key，
     * 否则存量旧 GD 订单号在 seq:init-v20 回填时会被判为「无对应规则」而留下错号。
     */
    @Test
    void adOrderRuleKey_coversAllOrderSaleModules() {
        assertEquals(BizSeqService.RULE_AD_ORDER_STAR, BizSeqService.adOrderRuleKey(1));
        assertEquals(BizSeqService.RULE_AD_ORDER_NEW_STORE, BizSeqService.adOrderRuleKey(2));
        assertEquals(BizSeqService.RULE_AD_ORDER_REVIVE, BizSeqService.adOrderRuleKey(3));
        assertEquals(BizSeqService.RULE_AD_ORDER_POPULAR, BizSeqService.adOrderRuleKey(5));
        assertEquals(BizSeqService.RULE_AD_ORDER_SIGNBOARD, BizSeqService.adOrderRuleKey(13));
        assertEquals(BizSeqService.RULE_AD_ORDER_TRAFFIC, BizSeqService.adOrderRuleKey(15));
    }

    @Test
    void adOrderRuleKey_nullAndUnknown() {
        assertNull(BizSeqService.adOrderRuleKey(null));
        // 自然流量等无「下单」入口的算法类型不应有订单编号规则
        assertNull(BizSeqService.adOrderRuleKey(7));
        assertNull(BizSeqService.adOrderRuleKey(99));
    }

    @Test
    void giftRuleKey_knownTypes() {
        assertEquals("gift_new_store", BizSeqService.giftRuleKey("new_store"));
        assertEquals("gift_revive", BizSeqService.giftRuleKey("revival"));
        // 前端新增赠送传 popular_merchant, ka 为历史代码, 两者都要能生成赠送ID
        assertEquals("gift_popular", BizSeqService.giftRuleKey("popular_merchant"));
        assertEquals("gift_popular", BizSeqService.giftRuleKey("ka"));
        assertEquals("gift_signboard", BizSeqService.giftRuleKey("golden_signboard"));
        assertEquals("gift_traffic", BizSeqService.giftRuleKey("traffic_ad"));
    }

    @Test
    void giftRuleKey_nullAndUnknown() {
        assertNull(BizSeqService.giftRuleKey(null));
        assertNull(BizSeqService.giftRuleKey("unknown"));
    }
}
