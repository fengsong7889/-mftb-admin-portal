package com.mftb.admin.util;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * 车牌格式规则（港澳牌与内地牌共用一列存储，这里做服务端裁决）。
 *
 * <p>为什么必须有服务端这一层：前端按"省份简称 + 牌体"分段录入并按能源类型限制位数，
 * 那只是 UX。真正防止脏数据的是这里——否则换客户端、脚本导入或前端 bug 都会把
 * "粤B123"这类残缺牌写进台账，之后按车牌追责任人就追不到。
 *
 * <p>刻意不做的事：不校验发证机关字母是否与省份匹配（如「粤Z」是港澳入境专用号段这类
 * 细分规则），也不校验校验位——内地车牌没有校验位。把不确定规则写死成硬校验，
 * 只会让合法车牌保存不了，那是比"少校验一项"更糟的失败模式。
 */
public final class VehiclePlateRules {

    /** 内地省份简称（含使/领/挂等专用字），与前端下拉保持同一份 */
    public static final String PROVINCE_ABBREVIATIONS =
            "京津冀晋蒙辽吉黑沪苏浙皖闽赣鲁豫鄂湘粤桂琼渝川贵云藏陕甘青宁新使领学警挂";

    private static final Pattern MAINLAND = Pattern.compile(
            "^([" + PROVINCE_ABBREVIATIONS + "])[ ]?([A-Z])([A-Z0-9]{5})$");

    /** 港澳牌：字母数字与连字符组成，4~10 位且至少含一个数字（覆盖澳门 MX-xx-xx / 港式 AB-1234） */
    private static final Pattern HK_MO = Pattern.compile("^[A-Z0-9][A-Z0-9-]{2,9}$");

    /** 新能源(插混/纯电)上 8 位牌；其余上 7 位牌 */
    private static final int MAINLAND_LEN_FUEL = 7;
    private static final int MAINLAND_LEN_NEW_ENERGY = 8;

    private VehiclePlateRules() {
    }

    /** 繁体「粵」与车牌实际字形「粤」归一，避免繁体输入被误判成港澳牌 */
    private static final char TRAD_YUE = '\u7cb5';
    private static final char SIMP_YUE = '\u7ca4';

    /** 是否内地车牌（首字符为省份简称） */
    public static boolean isMainland(String plateNo) {
        if (plateNo == null || plateNo.isEmpty()) {
            return false;
        }
        return PROVINCE_ABBREVIATIONS.indexOf(plateNo.charAt(0)) >= 0;
    }

    /**
     * 归一化：去空格并转大写。
     *
     * <p>内地牌里的空格是可选排版习惯（粤B·12345 的中间点不在此列，直接不收录），
     * 归一化后再比对，才能让"粤B 12345"与"粤B12345"落在同一个唯一键上。
     */
    public static String normalize(String plateNo) {
        return plateNo == null ? null : plateNo.replaceAll("[\s·]", "").toUpperCase();
    }

    /**
     * 校验车牌；返回 null 表示通过，否则返回可直接展示给用户的中文原因。
     *
     * @param plateNo    完整车牌（可含空格，内部会归一化）
     * @param energyType 能源类型，可为空；为空时按位数自适应校验，不猜
     */
    public static String validate(String plateNo, String energyType, Set<String> newEnergyTypes) {
        String plate = normalize(plateNo);
        if (plate == null || plate.isEmpty()) {
            return "請填寫車牌號碼";
        }
        if (isMainland(plate)) {
            var m = MAINLAND.matcher(plate);
            if (!m.matches()) {
                return "內地車牌格式應為「省份簡稱 + 1位字母 + 5位字母數字」，如 粵B12345";
            }
            if (energyType != null && !energyType.isBlank()) {
                boolean newEnergy = newEnergyTypes.contains(energyType);
                int expected = newEnergy ? MAINLAND_LEN_NEW_ENERGY : MAINLAND_LEN_FUEL;
                if (plate.length() != expected) {
                    return newEnergy
                            ? "新能源（插電混合/純電）須為 8 位新能源專用號牌，如 粵BD12345"
                            : "燃油/油電混合車輛須為 7 位普通號牌，如 粵B12345";
                }
            }
            return null;
        }
        if (!HK_MO.matcher(plate).matches() || plate.chars().noneMatch(Character::isDigit)) {
            return "港澳車牌格式不正確（應為字母與數字組合，4~10 位），如 MX-12-34";
        }
        return null;
    }
}
