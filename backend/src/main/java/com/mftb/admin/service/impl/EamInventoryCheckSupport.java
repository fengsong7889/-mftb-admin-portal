package com.mftb.admin.service.impl;

import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.util.JsonUtils;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 盘点核对规则支持：账面快照、台账指纹、位置/持有人核对结论、已核对/异常判定。
 * <p>纯函数式，便于单元测试；不触碰数据库。</p>
 */
@Component
public class EamInventoryCheckSupport {

    public static final String RESULT_CONSISTENT = "CONSISTENT";
    public static final String RESULT_DIFF = "DIFF";
    public static final String RESULT_PENDING = "PENDING";
    public static final String RESULT_NA = "NA";

    /** 位置核对结论 */
    public String locationResult(String itemStatus, Long bookLocationId, String bookLocationName,
                                Long actualLocationId, String actualLocationName, String actualLocationOther) {
        if ("lost".equals(itemStatus)) return RESULT_NA;
        boolean provided = actualLocationId != null || StringUtils.hasText(actualLocationOther)
                || StringUtils.hasText(actualLocationName);
        if (!provided) return RESULT_PENDING;
        // 有 ID 优先按 ID 比较；否则按规范化名称精确比较
        if (actualLocationId != null && bookLocationId != null) {
            return Objects.equals(actualLocationId, bookLocationId) ? RESULT_CONSISTENT : RESULT_DIFF;
        }
        String actual = normalize(firstText(actualLocationName, actualLocationOther));
        String book = normalize(bookLocationName);
        if (actual.isEmpty() || book.isEmpty()) return RESULT_DIFF;
        return actual.equals(book) ? RESULT_CONSISTENT : RESULT_DIFF;
    }

    /** 持有人核对结论；bookHolderId 可为 null（账面无人） */
    public String holderResult(String itemStatus, Long bookHolderId, String bookHolderName,
                               String actualHolderType, Long actualHolderId, String actualHolderExternal) {
        if ("lost".equals(itemStatus)) return RESULT_NA;
        if (!StringUtils.hasText(actualHolderType) || "PENDING".equals(actualHolderType)) return RESULT_PENDING;
        switch (actualHolderType) {
            case "EMPLOYEE" -> {
                if (bookHolderId != null) {
                    return Objects.equals(bookHolderId, actualHolderId) ? RESULT_CONSISTENT : RESULT_DIFF;
                }
                // 账面缺 ID 但有姓名：标记资料待核查（按差异处理，不自动判一致）
                return StringUtils.hasText(bookHolderName) ? RESULT_DIFF : RESULT_CONSISTENT;
            }
            case "NONE" -> {
                boolean bookNone = bookHolderId == null && !StringUtils.hasText(bookHolderName);
                return bookNone ? RESULT_CONSISTENT : RESULT_DIFF;
            }
            case "EXTERNAL" -> {
                boolean bookExternal = bookHolderId != null || StringUtils.hasText(bookHolderName);
                if (!StringUtils.hasText(actualHolderExternal)) return RESULT_PENDING;
                return bookExternal ? RESULT_CONSISTENT : RESULT_DIFF;
            }
            default -> {
                return RESULT_PENDING;
            }
        }
    }

    /** 是否已完整核对：实物结果已确认 + 适用维度均已确认 + 无待复核 */
    public boolean isChecked(String status, String locationResult, String holderResult, int recheckRequired) {
        if (!StringUtils.hasText(status) || "pending".equals(status)) return false;
        if (recheckRequired != 0) return false;
        return !RESULT_PENDING.equals(locationResult) && !RESULT_PENDING.equals(holderResult);
    }

    /** 是否异常资产（任一已确认异常：未找到/损坏/位置差异/持有人差异） */
    public boolean isAnomaly(String status, String locationResult, String holderResult) {
        if ("lost".equals(status) || "damaged".equals(status)) return true;
        return RESULT_DIFF.equals(locationResult) || RESULT_DIFF.equals(holderResult);
    }

    /** 发起时账面快照 JSON */
    public String bookSnapshotJson(EamAsset a, String holderEmpNo, String locationName) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", a.getStatus());
        m.put("holdType", a.getHoldType());
        m.put("locationId", a.getLocationId());
        m.put("locationName", locationName);
        m.put("categoryId", a.getCategoryId());
        m.put("categoryCode", a.getCategoryCode());
        m.put("categoryName", a.getAssetType());
        m.put("brandId", a.getBrandId());
        m.put("brand", a.getBrand());
        m.put("companyBrand", a.getCompanyBrand());
        m.put("department", a.getDepartment());
        m.put("adminDepartment", a.getAdminDepartment());
        m.put("holderId", a.getCurrentHolderId());
        m.put("holderName", a.getUserName());
        m.put("holderEmpNo", holderEmpNo);
        m.put("activeClaimId", a.getActiveClaimId());
        return JsonUtils.toJson(m);
    }

    /** 台账关键业务字段指纹（不含图片/备注等无关变更；不使用 holdVersion 以免误报） */
    public String ledgerFingerprint(EamAsset a) {
        String raw = String.join("|",
                str(a.getStatus()), str(a.getHoldType()), str(a.getLocationId()), str(a.getDepartment()),
                str(a.getCurrentHolderId()), str(a.getActiveClaimId()), str(a.getCompanyBrand()));
        return md5(raw);
    }

    /** 当前台账快照 JSON（供差异对照/结束冻结） */
    public String currentSnapshotJson(EamAsset a, String holderEmpNo, String locationName) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", a.getStatus());
        m.put("locationId", a.getLocationId());
        m.put("locationName", locationName);
        m.put("department", a.getDepartment());
        m.put("holderId", a.getCurrentHolderId());
        m.put("holderName", a.getUserName());
        m.put("holderEmpNo", holderEmpNo);
        m.put("activeClaimId", a.getActiveClaimId());
        return JsonUtils.toJson(m);
    }

    private String firstText(String a, String b) {
        return StringUtils.hasText(a) ? a : b;
    }

    private String normalize(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").trim();
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private String md5(String raw) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("MD5")
                    .digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("指紋計算失敗", e);
        }
    }
}
