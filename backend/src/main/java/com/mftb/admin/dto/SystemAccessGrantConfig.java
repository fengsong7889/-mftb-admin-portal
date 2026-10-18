package com.mftb.admin.dto;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.SystemAccessConstants;
import com.mftb.admin.util.JsonUtils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 审批人在流程上配置的授权对象（目前只有「授权角色」一种）。
 * <p>
 * 载体是 {@code biz_oa_request.form_data} 里的 {@code approvedGrant} 字段：审批接口本来就有
 * formData 通道（AI 使用申请的「审批即授权」用的就是它），不必为这一个流程另开写入口。
 * <p>
 * 两个刻意的口径：
 * <ol>
 *   <li><b>只取 approvedGrant，不整包覆盖</b>：{@link #mergeGrant} 从审批人提交的 payload 里
 *       只挑出授权配置合并进原有 form_data，申请内容（系统/勾选菜单/说明/凭证数）原样保留，
 *       审批人无法借审批接口改写申请人的申请事实。</li>
 *   <li><b>格式非法即拒，不静默忽略</b>：{@link #read} 遇到字段缺失/类型非法直接抛错。
 *       静默丢弃的后果是审批人以为配好了、终审兑现时才发现「未配置授权角色」，
 *       流程已通过但权限没下发，比当场拒绝难查得多。</li>
 * </ol>
 *
 * @param targetType 授权对象类型，目前仅 {@code role}
 * @param targetId   角色 ID（sys_role.id）
 * @param targetName 角色名称快照（仅展示用，落库前一律以 DB 查回的名称为准）
 */
public record SystemAccessGrantConfig(String targetType, Long targetId, String targetName) {

    /**
     * 从 form_data JSON 中读取授权配置。
     *
     * @param formDataJson biz_oa_request.form_data
     * @return 未配置时返回 {@code null}；配置存在但非法时抛 {@link BusinessException}
     */
    public static SystemAccessGrantConfig read(String formDataJson) {
        Map<String, Object> form = JsonUtils.parseMap(formDataJson);
        Object raw = form.get(SystemAccessConstants.FORM_KEY_APPROVED_GRANT);
        if (raw == null) {
            return null;
        }
        if (!(raw instanceof Map<?, ?> grant)) {
            throw new BusinessException("授權配置格式錯誤，請重新選擇授權角色");
        }
        Object typeRaw = grant.get(SystemAccessConstants.FORM_KEY_TARGET_TYPE);
        Object idRaw = grant.get(SystemAccessConstants.FORM_KEY_TARGET_ID);
        String targetType = typeRaw == null ? null : String.valueOf(typeRaw).trim();
        if (targetType == null || targetType.isEmpty()) {
            // 前端可能只传了 targetId：单一授权对象类型下按角色处理，但仍要求白名单内
            targetType = SystemAccessConstants.TARGET_TYPE_ROLE;
        }
        if (!SystemAccessConstants.ALLOWED_TARGET_TYPES.contains(targetType)) {
            throw new BusinessException("不支持的授權對象類型: " + targetType);
        }
        Long targetId = toPositiveLong(idRaw);
        if (targetId == null) {
            throw new BusinessException("請選擇要授權的角色");
        }
        Object nameRaw = grant.get(SystemAccessConstants.FORM_KEY_TARGET_NAME);
        String targetName = nameRaw == null ? null : String.valueOf(nameRaw);
        return new SystemAccessGrantConfig(targetType, targetId, targetName);
    }

    /**
     * 把审批人提交的授权配置合并进原有 form_data（只合并 approvedGrant，其余键原样保留）。
     *
     * @param existingJson 现有 form_data（申请内容）
     * @param incomingJson 审批接口传入的 formData（可能只含 approvedGrant，也可能是整包）
     * @return 合并后的 JSON；审批人未配置授权时返回原 JSON 不变
     */
    public static String mergeGrant(String existingJson, String incomingJson) {
        SystemAccessGrantConfig config = read(incomingJson);
        if (config == null) {
            return existingJson;
        }
        return config.mergeInto(existingJson);
    }

    /**
     * 把本配置写进已有 form_data（只覆盖 approvedGrant 一个键）。
     * <p>服务端校验完角色后用它回写「以 DB 名称为准」的归一化配置，
     * 避免前端传的角色名快照与落库名称不一致。
     */
    public String mergeInto(String existingJson) {
        Map<String, Object> merged = new LinkedHashMap<>(JsonUtils.parseMap(existingJson));
        merged.put(SystemAccessConstants.FORM_KEY_APPROVED_GRANT, toMap());
        return JsonUtils.toJson(merged);
    }

    /** 归一化为写入 form_data 的 Map（键名与前端约定一致） */
    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put(SystemAccessConstants.FORM_KEY_TARGET_TYPE, targetType);
        map.put(SystemAccessConstants.FORM_KEY_TARGET_ID, targetId);
        map.put(SystemAccessConstants.FORM_KEY_TARGET_NAME, targetName);
        return map;
    }

    /** 只接受正整数 ID：0/负数/字符串数字之外的脏值一律视为未选择 */
    private static Long toPositiveLong(Object raw) {
        if (raw instanceof Number number) {
            long value = number.longValue();
            return value > 0 ? value : null;
        }
        if (raw instanceof String text && !text.isBlank()) {
            try {
                long value = Long.parseLong(text.trim());
                return value > 0 ? value : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
