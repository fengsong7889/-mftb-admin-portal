package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.NotificationItemVO;
import com.mftb.admin.entity.BizGiftRecord;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.BizGiftRecordMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.NotificationService;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 系统通知服务实现
 * 当前仅包含赠送到期提醒（gift_expire），后续可扩展其它通知类型
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

    private final BizGiftRecordMapper giftRecordMapper;
    private final BizStoreMapper storeMapper;
    private final SysConfigService sysConfigService;

    /** 广告类型显示名映射 */
    private static final Map<String, String> AD_TYPE_LABELS = Map.of(
            "new_store", "新店廣告",
            "revival", "盤活復蘇",
            "popular_merchant", "人氣商家",
            "exclusive", "獨家商家",
            "gold", "點金廣告"
    );

    /** 提醒频率配置 key（与前端规则配置对应） */
    private static final String KEY_GIFT_REMIND_FREQUENCY = "gift_expire_remind_frequency";

    /** 默认提醒频率：距到期前 15、7、1 天 */
    private static final String DEFAULT_FREQUENCY = "15,7,1";

    @Override
    public List<NotificationItemVO> listNotifications() {
        List<NotificationItemVO> notifications = new ArrayList<>();

        // 1. 赠送到期提醒
        notifications.addAll(generateGiftExpiryNotifications());

        // 后续可在此追加其它通知类型:
        // notifications.addAll(generateApprovalPendingNotifications());
        // notifications.addAll(generateRechargeNotifications());

        return notifications;
    }

    /**
     * 生成赠送到期提醒通知
     * 1. 从系统配置读取梯度提醒频率（如 "15,7,1"）
     * 2. 查询所有可用且未到期的赠送记录
     * 3. 对每条记录计算距到期天数，命中梯度则生成通知
     * 4. 到期当天始终提醒
     */
    private List<NotificationItemVO> generateGiftExpiryNotifications() {
        // 读取梯度提醒频率
        Set<Integer> freqDays = parseFrequency(
                sysConfigService.getConfigValue(KEY_GIFT_REMIND_FREQUENCY));

        LocalDate today = LocalDate.now();
        int maxRemindDays = freqDays.stream().mapToInt(Integer::intValue).max().orElse(15);
        LocalDate maxDate = today.plusDays(maxRemindDays);

        // 查询所有可用、有余额、到期日在今天到最大提醒日期之间的赠送记录
        List<BizGiftRecord> records = giftRecordMapper.selectList(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getStatus, 1)
                        .gt(BizGiftRecord::getRemainingDays, 0)
                        .ge(BizGiftRecord::getExpireDate, today)
                        .le(BizGiftRecord::getExpireDate, maxDate));

        if (records.isEmpty()) {
            return List.of();
        }

        // 补充门店编号（storeCode）
        Map<Long, BizStore> storeMap = storeMapper.selectList(
                new LambdaQueryWrapper<BizStore>()
                        .in(BizStore::getId, records.stream()
                                .map(BizGiftRecord::getStoreId).collect(Collectors.toSet())))
                .stream().collect(Collectors.toMap(BizStore::getId, s -> s, (a, b) -> a));

        List<NotificationItemVO> notifs = new ArrayList<>();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd");

        for (BizGiftRecord record : records) {
            int daysLeft = (int) ChronoUnit.DAYS.between(today, record.getExpireDate());
            String adTypeLabel = AD_TYPE_LABELS.getOrDefault(record.getAdType(), record.getAdType());
            BizStore store = storeMap.get(record.getStoreId());
            String storeCode = store != null ? store.getStoreCode() : "";
            String storeName = store != null ? store.getStoreName() : record.getStoreName();

            boolean shouldNotify;
            String content;

            if (daysLeft == 0) {
                // 到期当天始终提醒
                shouldNotify = true;
                content = String.format("門店 %s（%s）的%s贈送推廣天數今日到期，請立即處理，詳細可到推廣贈送菜單查看。",
                        storeCode, storeName, adTypeLabel);
            } else if (freqDays.contains(daysLeft)) {
                // 命中梯度频率
                shouldNotify = true;
                content = String.format("門店 %s（%s）的%s贈送推廣天數有%d天將於 %s 到期，請留意，詳細可到推廣贈送菜單查看。",
                        storeCode, storeName, adTypeLabel, daysLeft, record.getExpireDate().format(fmt));
            } else {
                shouldNotify = false;
                content = "";
            }

            if (shouldNotify) {
                NotificationItemVO item = new NotificationItemVO();
                item.setId("gift-expire-" + record.getId() + "-" + daysLeft + "d");
                item.setType("gift_expire");
                item.setTitle("贈送天數到期提醒");
                item.setContent(content);
                item.setStoreId(record.getStoreId());
                item.setStoreCode(storeCode);
                item.setStoreName(storeName);
                item.setAdType(record.getAdType());
                item.setExpireDate(record.getExpireDate());
                item.setDaysLeft(daysLeft);
                item.setCreatedAt(java.time.LocalDateTime.now().toString());
                notifs.add(item);
            }
        }

        return notifs;
    }

    /**
     * 解析逗号分隔的频率配置字符串为整数集合
     * 例如 "15,7,1" -> {1, 7, 15}
     */
    private Set<Integer> parseFrequency(String freqStr) {
        String raw = (freqStr != null && !freqStr.isBlank()) ? freqStr : DEFAULT_FREQUENCY;
        try {
            return java.util.Arrays.stream(raw.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .map(Integer::parseInt)
                    .filter(n -> n >= 0)
                    .collect(Collectors.toSet());
        } catch (NumberFormatException e) {
            log.warn("赠送到期提醒频率配置值格式错误: {}，使用默认值: {}", raw, DEFAULT_FREQUENCY);
            return java.util.Arrays.stream(DEFAULT_FREQUENCY.split(","))
                    .map(String::trim)
                    .map(Integer::parseInt)
                    .collect(Collectors.toSet());
        }
    }
}
