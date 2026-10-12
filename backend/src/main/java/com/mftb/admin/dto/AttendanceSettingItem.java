package com.mftb.admin.dto;

import lombok.Data;

/**
 * 假勤设置项。
 * <p>
 * 契约原则：**后端只给值与结构，不给文案**。
 * 界面文字必须走五语言 i18n，因此 label / hint / 只读说明文字全部由前端按 {@code key}
 * 从语言包取（见 {@code src/pages/Attendance/settingMeta.ts}），后端下发繁体句子会让
 * 其它四种语言永远显示中文——这类缺陷在编译期与测试里都看不出来。
 * <p>
 * {@code editable=false} 的项是**口径说明**而不是配置：它们的真值由代码逻辑或其它菜单决定，
 * 做成可编辑就是「改了没人读」的假闭环。界面上必须按只读渲染。
 * <p>
 * {@code value} 与 {@code valueKey} 二选一：
 * 可编辑项与运行时数据（如同步 cron）用 {@code value}；纯说明项用 {@code valueKey}，
 * 由前端翻译后展示。
 */
@Data
public class AttendanceSettingItem {

    /** 前端稳定标识（label/hint 的 i18n 键由它推导） */
    private String key;

    /** 分组码：calculation / overtime / source / payroll / retention（前端映射成分组标题） */
    private String group;

    /** 当前值：可编辑项为 sys_config 值（未配置时为引擎默认值），只读项为运行时数据 */
    private String value;

    /** 只读说明项的 i18n 键；有该键时前端忽略 value */
    private String valueKey;

    private boolean editable;

    /** 可编辑项对应的 sys_config.config_key；只读项为 null */
    private String configKey;

    /** 只读口径说明：值由前端翻译 */
    public static AttendanceSettingItem readOnly(String key, String group, String valueKey) {
        AttendanceSettingItem item = new AttendanceSettingItem();
        item.setKey(key);
        item.setGroup(group);
        item.setValueKey(valueKey);
        item.setEditable(false);
        return item;
    }

    /** 只读运行时数据：值来自部署配置，必须原样展示（如同步 cron） */
    public static AttendanceSettingItem runtime(String key, String group, String value) {
        AttendanceSettingItem item = new AttendanceSettingItem();
        item.setKey(key);
        item.setGroup(group);
        item.setValue(value);
        item.setEditable(false);
        return item;
    }

    public static AttendanceSettingItem editable(String key, String group, String value, String configKey) {
        AttendanceSettingItem item = new AttendanceSettingItem();
        item.setKey(key);
        item.setGroup(group);
        item.setValue(value);
        item.setEditable(true);
        item.setConfigKey(configKey);
        return item;
    }
}
