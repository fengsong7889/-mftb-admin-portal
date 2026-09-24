package com.mftb.admin.constant;

/**
 * 业务系统编码枚举。
 * <p>
 * 唯一真值来源：{@code docs/system-portal/inventory.md}。新增系统必须同步：
 * (1) 更新本枚举；(2) 更新归属清单文档；(3) 增加 {@code sys_system} 种子迁移；(4) 补测试。
 * <p>
 * {@link #PORTAL} 是哨兵值，用于「個人工作台」/公共入口，不属于业务系统，
 * 系统准入判定遇到 {@code system_code='portal'} 的接口时跳过（仅需登录态）。
 */
public enum SystemCode {

    /** 门户公共入口（个人工作台），不属于业务系统 */
    PORTAL("portal"),
    ADS("ads"),
    MERCHANT("merchant"),
    SEARCH("search"),
    FINANCE("finance"),
    AI("ai"),
    HR("hr"),
    EAM("eam"),
    OA("oa"),
    IAM("iam"),
    PLATFORM("platform"),
    ;

    private final String code;

    SystemCode(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }

    /** 按字符串解析；未知返回 null，由调用方判定为「暂未归属」而非默认放行。 */
    public static SystemCode fromCode(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        for (SystemCode sc : values()) {
            if (sc.code.equalsIgnoreCase(code)) {
                return sc;
            }
        }
        return null;
    }

    /** 是否为业务系统（排除哨兵 portal）。 */
    public boolean isBusinessSystem() {
        return this != PORTAL;
    }
}
