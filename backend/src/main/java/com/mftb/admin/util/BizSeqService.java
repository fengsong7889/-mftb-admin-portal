package com.mftb.admin.util;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.mapper.BizSeqMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 业务编号生成器: 前缀 + 年月日 + 4位自增序号（当日从 0000 起，与前端编号规则一致）
 */
@Component
@RequiredArgsConstructor
public class BizSeqService {

    /** 充值流程 */
    public static final String PREFIX_RECHARGE = "CZ";
    /** 扣款流程 */
    public static final String PREFIX_DEDUCT = "KK";
    /** 转账流程 */
    public static final String PREFIX_TRANSFER = "ZZ";
    /** 合并流程 */
    public static final String PREFIX_MERGE = "HB";
    /** 批次 */
    public static final String PREFIX_BATCH = "PC";
    /** 交易明细 */
    public static final String PREFIX_DETAIL = "MX";
    /** 欠款单 */
    public static final String PREFIX_DEBT = "QK";
    /** 广告订单默认前缀（当算法ID无法提取时使用） */
    public static final String PREFIX_AD_ORDER = "GD";
    /** 门店编号 */
    public static final String PREFIX_STORE = "MD";
    /** 赠送记录 */
    public static final String PREFIX_GIFT = "ZS";

    /** 门店编号等非日期维度的固定 dateKey */
    private static final String FIXED_DATE_KEY = "00000000";

    private static final DateTimeFormatter DATE_KEY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter MONTH_KEY = DateTimeFormatter.ofPattern("yyMM");

    private final BizSeqMapper bizSeqMapper;

    /**
     * 生成业务编号（需在调用方事务内执行，自增语句行锁保证并发不重号）
     *
     * @param prefix 编号前缀，如 CZ / PC / MX / QK
     * @return 如 CZ202606160000
     */
    public String next(String prefix) {
        return next(prefix, 4);
    }

    /**
     * 生成业务编号（自定义序号位数）
     *
     * @param prefix   编号前缀
     * @param seqLength 序号位数，如 4 → 0000~9999
     * @return 如 CZ2026061600000（5位时）
     */
    public String next(String prefix, int seqLength) {
        String dateKey = LocalDate.now().format(DATE_KEY);
        bizSeqMapper.initSeq(prefix, dateKey);
        bizSeqMapper.increaseSeq(prefix, dateKey);
        Integer current = bizSeqMapper.selectCurrentValue(prefix, dateKey);
        if (current == null) {
            throw new BusinessException("业务编号生成失败: " + prefix);
        }
        // 表内序号从 1 开始计数，编号序号从 0000 起
        return prefix + dateKey + String.format("%0" + seqLength + "d", current - 1);
    }

    /**
     * 从算法ID中提取字母前缀（如 "WD00001" → "WD"）
     * 用于广告订单编号前缀跟随算法ID前缀
     */
    public static String extractAlgoPrefix(String algoCode) {
        if (algoCode == null || algoCode.isEmpty()) {
            return PREFIX_AD_ORDER;
        }
        StringBuilder sb = new StringBuilder();
        for (char c : algoCode.toCharArray()) {
            if (Character.isLetter(c)) {
                sb.append(c);
            } else {
                break;
            }
        }
        return sb.length() > 0 ? sb.toString() : PREFIX_AD_ORDER;
    }

    /**
     * 生成月度维度业务编号（并发安全，行锁保证不重号）
     *
     * @param prefix 编号前缀
     * @return 如 ZS26080001
     */
    public String nextMonthly(String prefix) {
        String monthKey = LocalDate.now().format(MONTH_KEY);
        bizSeqMapper.initSeq(prefix, monthKey);
        bizSeqMapper.increaseSeq(prefix, monthKey);
        Integer current = bizSeqMapper.selectCurrentValue(prefix, monthKey);
        if (current == null) {
            throw new BusinessException("业务编号生成失败: " + prefix);
        }
        return prefix + monthKey + String.format("%04d", current);
    }

    /**
     * 生成门店编号（并发安全，行锁保证不重号）
     *
     * @return 如 MD00001
     */
    public String nextStoreCode() {
        bizSeqMapper.initSeq(PREFIX_STORE, FIXED_DATE_KEY);
        bizSeqMapper.increaseSeq(PREFIX_STORE, FIXED_DATE_KEY);
        Integer current = bizSeqMapper.selectCurrentValue(PREFIX_STORE, FIXED_DATE_KEY);
        if (current == null) {
            throw new BusinessException("门店编号生成失败");
        }
        return String.format("%s%06d", PREFIX_STORE, current);
    }

    /** 按审批类型取流程编号前缀 */
    public static String flowPrefix(String approvalType) {
        return switch (approvalType) {
            case "recharge" -> PREFIX_RECHARGE;
            case "deduct" -> PREFIX_DEDUCT;
            case "transfer" -> PREFIX_TRANSFER;
            case "merge" -> PREFIX_MERGE;
            default -> "SP";
        };
    }
}
