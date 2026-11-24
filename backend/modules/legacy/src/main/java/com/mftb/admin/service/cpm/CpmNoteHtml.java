/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 備註富文本的服务端净化与纯文本降级。
 *
 * <p>为什么服务端必须再做一遍：前端渲染前确实会过一次白名单净化，但存储本身会被
 * 旧版本、导入接口、直接改库这三条路污染；一旦脏数据进了库，Word 导出、钉钉推送、
 * 翻译工作台预览这些**不经过前端渲染器**的出口就会把原始 HTML 带出去。
 * 「前端已净化」从来不是安全边界（同 AGENTS 通用禁止清单）。
 *
 * <p>实现只依赖 JDK：白名单重写而不是黑名单过滤——不认识的一律剥掉标签保留文字，
 * script/style/iframe 这类连内容一起丢弃。不引入新依赖的代价是自己写这个小解析器，
 * 但备注只需要排版标签，用不上完整 HTML 解析。
 */
public final class CpmNoteHtml {

    /** 与前端 noteRich.ts 的白名单逐字一致：两处不同就会有一个出口把另一种的漏网标签渲染出来 */
    private static final Set<String> ALLOWED = Set.of(
            "b", "strong", "i", "em", "u", "s", "span", "br", "div", "p", "font");
    private static final Set<String> DROP_WITH_CONTENT = Set.of(
            "script", "style", "iframe", "object", "embed", "link", "meta");
    private static final Set<String> ALLOWED_STYLE = Set.of(
            "color", "font-weight", "font-size", "font-style", "text-decoration", "font-family");
    /** 净化后长度上限：备注是"为什么延期"的一句话，不是文档；超长即视为粘贴整页 */
    public static final int MAX_LENGTH = 4000;

    private CpmNoteHtml() {
    }

    /** 净化：非法标签剥壳留字，危险属性丢弃，script/style 连内容丢弃。null 视作空串。 */
    public static String sanitize(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        StringBuilder out = new StringBuilder(Math.min(html.length() + 16, MAX_LENGTH + 16));
        int i = 0;
        int limit = html.length();
        while (i < limit) {
            char c = html.charAt(i);
            if (c != '<') {
                appendEscaped(out, c);
                i++;
                continue;
            }
            // HTML 注释整段丢弃：注释里可以藏条件包含，留着等于留一个未知行为
            if (html.startsWith("<!--", i)) {
                int end = html.indexOf("-->", i + 4);
                i = end < 0 ? limit : end + 3;
                continue;
            }
            int close = html.indexOf('>', i);
            if (close < 0) {
                // 没有闭合的 '<' 当字面量处理，否则后面的内容会被整段吞掉
                appendEscaped(out, c);
                i++;
                continue;
            }
            String raw = html.substring(i + 1, close).trim();
            i = close + 1;
            if (raw.startsWith("/")) {
                String name = tagName(raw.substring(1));
                if (DROP_WITH_CONTENT.contains(name)) {
                    continue;
                }
                if (ALLOWED.contains(name) && !name.equals("br")) {
                    // 闭合标签必须与开标签同名降级，否则 <font>…</font> 会变成 <span>…</font>，
                    // 浏览器把多余的 </font> 当噪声吞掉，但 Markdown/Word 导出会留下脏标签
                    out.append("</").append(name.equals("font") ? "span" : name).append('>');
                }
                continue;
            }
            String name = tagName(raw);
            if (DROP_WITH_CONTENT.contains(name)) {
                // 连内容一起丢：留下 <script> 里的文字比丢掉它更糟（会伪装成用户想说的话）
                int end = indexOfClosing(html, name, i);
                i = end < 0 ? limit : end;
                continue;
            }
            if (!ALLOWED.contains(name)) {
                continue;
            }
            if (name.equals("br")) {
                out.append("<br>");
                continue;
            }
            String style = allowedStyle(raw);
            String color = name.equals("font") ? attrValue(raw, "color") : null;
            List<String> styles = new ArrayList<>();
            if (!style.isEmpty()) {
                styles.add(style);
            }
            if (color != null && color.matches("(?i)(#[0-9a-f]{3,8}|[a-z]+)")) {
                styles.add("color:" + color);
            }
            String open = styles.isEmpty() ? "" : " style=\"" + String.join(";", styles) + "\"";
            // FONT 统一降级成 span：HTML5 已废弃 font 标签，留着它等于把兼容负担传给每个渲染出口
            String emit = name.equals("font") ? "span" : name;
            out.append('<').append(emit).append(open).append('>');
        }
        String result = out.toString();
        return result.length() > MAX_LENGTH ? result.substring(0, MAX_LENGTH) : result;
    }

    /** 纯文本降级：搜索、Markdown 导出、CSV 共用，保证「导出文本 = 页面文本」不被标签污染。 */
    public static String toPlainText(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        if (html.indexOf('<') < 0 && html.indexOf('&') < 0) {
            return html.trim();
        }
        String text = sanitize(html)
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(div|p)>", "\n")
                .replaceAll("<[^>]*>", "");
        text = unescape(text);
        return text.replaceAll("\n{3,}", "\n\n").trim();
    }

    private static void appendEscaped(StringBuilder out, char c) {
        switch (c) {
            case '&' -> out.append("&amp;");
            case '<' -> out.append("&lt;");
            case '>' -> out.append("&gt;");
            case '"' -> out.append("&quot;");
            default -> out.append(c);
        }
    }

    private static String tagName(String raw) {
        String head = raw.split("[\\s/]", 2)[0];
        return head.trim().toLowerCase();
    }

    /** 只保留白名单 style 属性，且丢弃含 url()/expression/javascript: 的值 */
    private static String allowedStyle(String rawTag) {
        String value = attrValue(rawTag, "style");
        if (value == null || value.isBlank()) {
            return "";
        }
        List<String> kept = new ArrayList<>();
        for (String pair : value.split(";")) {
            int idx = pair.indexOf(':');
            if (idx < 0) {
                continue;
            }
            String key = pair.substring(0, idx).trim().toLowerCase();
            String val = pair.substring(idx + 1).trim();
            if (ALLOWED_STYLE.contains(key) && !val.isEmpty()
                    && !val.matches("(?i).*(url\\(|expression|javascript:|@).*")) {
                kept.add(key + ":" + val);
            }
        }
        return String.join(";", kept);
    }

    /** 极简属性取值：只支持双引号/单引号包裹，其余形态一律视为非法丢弃（编辑器产出的都是带引号形态） */
    private static String attrValue(String rawTag, String attr) {
        for (String quote : new String[]{"\"", "'"}) {
            int start = indexOfAttr(rawTag, attr, quote);
            if (start < 0) {
                continue;
            }
            int end = rawTag.indexOf(quote, start);
            if (end < 0) {
                return null;
            }
            return rawTag.substring(start, end);
        }
        return null;
    }

    private static int indexOfAttr(String rawTag, String attr, String quote) {
        String needle = attr + "=" + quote;
        int from = 0;
        while (true) {
            int at = rawTag.toLowerCase().indexOf(needle, from);
            if (at < 0) {
                return -1;
            }
            boolean boundary = at == 0 || Character.isWhitespace(rawTag.charAt(at - 1));
            if (boundary) {
                return at + needle.length();
            }
            from = at + 1;
        }
    }

    private static int indexOfClosing(String html, String name, int from) {
        int at = html.toLowerCase().indexOf("</" + name, from);
        if (at < 0) {
            return -1;
        }
        int gt = html.indexOf('>', at);
        return gt < 0 ? html.length() : gt + 1;
    }

    private static String unescape(String text) {
        return text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"");
    }
}
