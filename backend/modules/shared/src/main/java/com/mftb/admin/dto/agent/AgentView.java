package com.mftb.admin.dto.agent;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * AI 助手的结构化视图（服务端生成，前端只渲染）。
 *
 * <p>为什么不在前端解析 Markdown 表格：数字与状态标签必须与后台页面同源，
 * 让模型“再写一遍表格”既有幻觉风险，也无法保证列口径；这里由工具直接把
 * 已按权限收敛的数据交给前端渲染。
 *
 * <p>安全约束：视图内所有字段都是纯文本/数字，前端不得当作 HTML 渲染；
 * {@link Link#getRoute()} 仅允许站内以 "/" 开头且不以 "//" 开头的路径。
 */
@Data
public class AgentView {

    /** 工具键 + 参数摘要，用于同一轮多工具时的去重 */
    private String id;

    /** table / metrics / timeline */
    private String kind = "table";

    private String title;

    /** 口径/范围一句话，例如“僅顯示您有權查看的項目” */
    private String subtitle;

    /** 指标卡，最多 6 个 */
    private List<Metric> metrics = new ArrayList<>();

    /** 表格列定义 */
    private List<Column> columns = new ArrayList<>();

    /** 表格行，最多 20 行；单元格为纯文本/数字 */
    private List<Map<String, Object>> rows = new ArrayList<>();

    /** 口径/风险备注，最多 3 条 */
    private List<Note> notes = new ArrayList<>();

    /** 站内跳转（可选） */
    private Link link;

    /** 命中总条数；表格被截断时前端显示“共 N 條，展示前 M 條” */
    private Integer total;

    @Data
    public static class Metric {
        private String label;
        private Object value;
        private String unit;
        /** default / success / warning / danger */
        private String tone;
        /** 指标口径提示 */
        private String hint;
    }

    @Data
    public static class Column {
        private String key;
        private String title;
        /** left / center / right */
        private String align;
        private Integer width;
        /** text / tag / progress / number / date */
        private String type;
        /** 状态文本 → antd Tag 颜色，例如 {"進行中":"processing","逾期":"error"} */
        private Map<String, String> toneMap;
    }

    @Data
    public static class Note {
        /** info / warning / danger */
        private String tone;
        private String text;
    }

    @Data
    public static class Link {
        private String label;
        private String route;
    }
}
