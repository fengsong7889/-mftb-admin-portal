package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysBizSeqRule;
import com.mftb.admin.mapper.BizSeqMapper;
import com.mftb.admin.mapper.SysBizSeqRuleMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务编号生成器（规则驱动）
 * <p>
 * 编号格式统一由 sys_biz_seq_rule 表配置（对应前端「规则配置 > 编号生成规则」界面）：
 * 前缀 + 日期段(YYYYMMDD/YYMM/无) + N位自增序号，如 DDWD202608120000、JT000001。
 * 序号行锁自增，同事务内并发不重号。
 */
@Component
@RequiredArgsConstructor
public class BizSeqService {

    /* ==================== 规则 key（与 sys_biz_seq_rule.rule_key / 前端 key 一致） ==================== */

    /** 集团ID */
    public static final String RULE_MERCHANT_GROUP = "merchant_group";
    /** 门店ID */
    public static final String RULE_STORE = "store";
    /** 瀑布流策略 */
    public static final String RULE_WATERFALL = "config_waterfall";
    /** 无敌星星订单 */
    public static final String RULE_AD_ORDER_STAR = "ad_order_star";
    /** 新店广告订单 */
    public static final String RULE_AD_ORDER_NEW_STORE = "ad_order_new_store";
    /** 盘活复苏订单 */
    public static final String RULE_AD_ORDER_REVIVE = "ad_order_revive";
    /** 流量广告订单 */
    public static final String RULE_AD_ORDER_TRAFFIC = "ad_order_traffic";
    /** 人气商家订单 */
    public static final String RULE_AD_ORDER_POPULAR = "ad_order_popular";
    /** 无敌星星定价 */
    public static final String RULE_PRICING_STAR = "config_pricing_star";
    /** 人气商家定价 */
    public static final String RULE_PRICING_HOT = "config_pricing_hot";
    /** 盘活复苏定价 */
    public static final String RULE_PRICING_REVIVE = "config_pricing_revive";
    /** 新店广告赠送ID */
    public static final String RULE_GIFT_NEW_STORE = "gift_new_store";
    /** 人气商家赠送ID */
    public static final String RULE_GIFT_POPULAR = "gift_popular";
    /** 盘活复苏赠送ID */
    public static final String RULE_GIFT_REVIVE = "gift_revive";
    /** 充值批次 */
    public static final String RULE_BATCH_RECHARGE = "batch_recharge";
    /** 转账批次 */
    public static final String RULE_BATCH_TRANSFER = "batch_transfer";
    /** 合并批次 */
    public static final String RULE_BATCH_MERGE = "batch_merge";
    /** 交易明细编号 */
    public static final String RULE_DETAIL = "detail";
    /** 欠款单编号 */
    public static final String RULE_DEBT = "debt";
    /** 工号 */
    public static final String RULE_EMPLOYEE_NO = "employee_no";
    /** 部门编码 */
    public static final String RULE_DEPT_CODE = "dept_code";
    /** 职位ID */
    public static final String RULE_POSITION_ID = "position_id";

    /** 无日期维度规则在序号表中的固定 dateKey */
    private static final String FIXED_DATE_KEY = "00000000";

    private static final DateTimeFormatter FMT_DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter FMT_MONTH = DateTimeFormatter.ofPattern("yyMM");

    private final BizSeqMapper bizSeqMapper;
    private final SysBizSeqRuleMapper ruleMapper;

    /** 规则缓存（规则表数据量小且极少变更，首次使用时加载） */
    private volatile Map<String, SysBizSeqRule> ruleCache;

    /**
     * 按规则 key 生成业务编号（需在调用方事务内执行，自增语句行锁保证并发不重号）
     *
     * @param ruleKey sys_biz_seq_rule.rule_key，如 ad_order_star
     * @return 如 DDWD202608120000
     */
    public String next(String ruleKey) {
        SysBizSeqRule rule = requireRule(ruleKey);
        String datePart = formatDate(rule.getDateFormat());
        String seqDateKey = datePart.isEmpty() ? FIXED_DATE_KEY : datePart;

        bizSeqMapper.initSeq(rule.getPrefix(), seqDateKey);
        bizSeqMapper.increaseSeq(rule.getPrefix(), seqDateKey);
        Integer current = bizSeqMapper.selectCurrentValue(rule.getPrefix(), seqDateKey);
        if (current == null) {
            throw new BusinessException("业务编号生成失败: " + ruleKey);
        }
        // seq_start=0 时表内从 1 计数、编号从 0000 起；seq_start=1 时编号直接用表内值（如 JT000001）
        int seq = current - (rule.getSeqStart() == null || rule.getSeqStart() == 0 ? 1 : 0);
        int length = rule.getSeqLength() == null ? 4 : rule.getSeqLength();
        return rule.getPrefix() + datePart + String.format("%0" + length + "d", seq);
    }

    /** 生成门店编号（规则 store，无日期维度全局自增，如 MD000007） */
    public String nextStoreCode() {
        return next(RULE_STORE);
    }

    /** 读取规则配置（供集团ID等按「表内最大序号+1」生成的场景取前缀与位数） */
    public SysBizSeqRule getRule(String ruleKey) {
        return requireRule(ruleKey);
    }

    /** 规则表变更后刷新缓存 */
    public void refreshRules() {
        ruleCache = null;
    }

    /* ==================== 业务类型 → 规则 key 映射 ==================== */

    /** 按审批类型取流程编号规则 key */
    public static String flowRuleKey(String approvalType) {
        return switch (approvalType) {
            case "recharge" -> "recharge";
            case "deduct" -> "deduct";
            case "transfer" -> "transfer";
            case "merge" -> "merge";
            case "gift" -> "gift_approval";
            default -> null;
        };
    }

    /** 按批次类型取批次编号规则 key */
    public static String batchRuleKey(String batchType) {
        return switch (batchType) {
            case "recharge" -> RULE_BATCH_RECHARGE;
            case "transfer" -> RULE_BATCH_TRANSFER;
            case "merge" -> RULE_BATCH_MERGE;
            default -> null;
        };
    }

    /** 按算法类型取算法ID规则 key（前端 AlgorithmType 枚举值） */
    public static String algoRuleKey(Integer algoType) {
        if (algoType == null) {
            return null;
        }
        return switch (algoType) {
            case 1 -> "algo_star";
            case 2 -> "algo_new_store";
            case 3 -> "algo_revive";
            case 15 -> "algo_traffic";
            case 5 -> "algo_popular";
            case 4 -> "algo_exclusive";
            case 6 -> "algo_guess";
            case 7 -> "algo_organic";
            case 11 -> "algo_brand";
            case 12 -> "algo_gold";
            case 13 -> "algo_signboard";
            case 14 -> "algo_promo";
            default -> null;
        };
    }

    /** 按广告类型取赠送ID规则 key */
    public static String giftRuleKey(String adType) {
        if (adType == null) {
            return null;
        }
        return switch (adType) {
            case "new_store" -> RULE_GIFT_NEW_STORE;
            case "revival" -> RULE_GIFT_REVIVE;
            case "ka" -> RULE_GIFT_POPULAR;
            default -> null;
        };
    }

    /* ==================== 内部方法 ==================== */

    private SysBizSeqRule requireRule(String ruleKey) {
        SysBizSeqRule rule = loadRules().get(ruleKey);
        if (rule == null || rule.getStatus() == null || rule.getStatus() != 1) {
            throw new BusinessException("编号生成规则未配置或已停用: " + ruleKey);
        }
        return rule;
    }

    private Map<String, SysBizSeqRule> loadRules() {
        Map<String, SysBizSeqRule> cache = ruleCache;
        if (cache == null) {
            synchronized (this) {
                cache = ruleCache;
                if (cache == null) {
                    List<SysBizSeqRule> rules = ruleMapper.selectList(
                            new LambdaQueryWrapper<SysBizSeqRule>().eq(SysBizSeqRule::getStatus, 1));
                    cache = new HashMap<>();
                    for (SysBizSeqRule rule : rules) {
                        cache.put(rule.getRuleKey(), rule);
                    }
                    ruleCache = cache;
                }
            }
        }
        return cache;
    }

    /** 规则日期格式 → 当日日期段（空串表示无日期维度） */
    private String formatDate(String dateFormat) {
        if (dateFormat == null || dateFormat.isEmpty()) {
            return "";
        }
        LocalDate today = LocalDate.now();
        return switch (dateFormat) {
            case "YYYYMMDD" -> today.format(FMT_DAY);
            case "YYMM" -> today.format(FMT_MONTH);
            default -> throw new BusinessException("不支持的编号日期格式: " + dateFormat);
        };
    }
}
