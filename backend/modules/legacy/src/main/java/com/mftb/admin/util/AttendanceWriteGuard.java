package com.mftb.admin.util;

import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttHoliday;
import com.mftb.admin.entity.AttShift;

/**
 * 考勤域写入守卫：把客户端不得掌控的字段清空后再落库。
 * <p>
 * 为什么需要：主数据接口直接用实体当 {@code @RequestBody}（省一层 DTO），代价是整张表的列
 * 都对前端开放。其中三类字段绝不能由请求决定：
 * <ol>
 *   <li>{@code deleted}——MyBatis-Plus 的 {@code updateById} 本身会排除逻辑删除列，
 *       但 {@code insert} 不会：提交 {@code deleted:1} 会长出一条"隐形记录"
 *       （任何列表都查不到，却占住软删感知唯一键，后续同名新增全部撞键）；</li>
 *   <li>{@code createdBy/createdAt}——审计事实，只能由服务端按当前登录人写入；</li>
 *   <li>{@code updatedBy/updatedAt}——同上，且 {@code updatedAt} 由数据库 ON UPDATE 维护。</li>
 * </ol>
 * <p>清空而不是抛错：这些字段正常情况下前端根本不会传，抛错会把无害的序列化差异
 * （例如某些表单库回填整行数据）变成用户可见的失败。清空后由服务层重新赋值，语义唯一。
 * <p>置 null 对更新路径同样安全：MyBatis-Plus 默认更新策略跳过 null 字段，不会把列写成 NULL。
 */
public final class AttendanceWriteGuard {

    private AttendanceWriteGuard() {
    }

    /** 班次：{@code shiftCode} 是稳定身份，由服务层单独锁定，这里只管审计与软删字段 */
    public static void strip(AttShift entity) {
        if (entity == null) {
            return;
        }
        entity.setDeleted(null);
        entity.setCreatedBy(null);
        entity.setCreatedAt(null);
        entity.setUpdatedBy(null);
        entity.setUpdatedAt(null);
    }

    /** 节假日：{@code yearNo} 由服务端按日期推导，不在此处处理 */
    public static void strip(AttHoliday entity) {
        if (entity == null) {
            return;
        }
        entity.setDeleted(null);
        entity.setCreatedBy(null);
        entity.setCreatedAt(null);
        entity.setUpdatedBy(null);
        entity.setUpdatedAt(null);
    }

    /** 考勤组：{@code groupNo} 由编号规则生成，成员归属走独立接口，这里只管审计与软删字段 */
    public static void strip(AttGroup entity) {
        if (entity == null) {
            return;
        }
        entity.setDeleted(null);
        entity.setCreatedBy(null);
        entity.setCreatedAt(null);
        entity.setUpdatedBy(null);
        entity.setUpdatedAt(null);
    }
}
