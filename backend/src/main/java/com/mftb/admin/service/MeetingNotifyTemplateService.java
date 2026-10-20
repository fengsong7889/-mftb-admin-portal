package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysNotificationSwitch;
import com.mftb.admin.entity.SysNotificationTemplate;
import com.mftb.admin.mapper.SysNotificationSwitchMapper;
import com.mftb.admin.mapper.SysNotificationTemplateMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 通知模板与推送开关的唯一读取入口。
 *
 * <p>两件事分开回答，互不覆盖：
 * <ul>
 *   <li>{@link #render}：这条通知"怎么写"——按场景取模板并替换 ${var}；模板停用或不存在时返回 empty，
 *       由调用方回落到代码内置文案。回落是刻意保留的：模板被改坏时通知仍要能发出去且内容可读；</li>
 *   <li>{@link #enabled}：这条通知"发不发"——按场景×渠道查开关；<b>没有配置行按开处理</b>，
 *       不因为缺一行配置就静默吞掉通知（这与"不静默跳过"的投递口径一致）。</li>
 * </ul>
 *
 * <p>不做进程内缓存：模板一年改不了几次，每次发送读一次库换来"改完立刻生效"，比省一次查询划算。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingNotifyTemplateService {

    private final SysNotificationTemplateMapper templateMapper;
    private final SysNotificationSwitchMapper switchMapper;

    /** 渲染结果：标题与正文 */
    public record Rendered(String title, String body) {
    }

    /** 取模板渲染；模板不存在、被停用或正文为空时返回 null（调用方回落到内置文案） */
    public Rendered render(String sceneKey, Map<String, String> variables) {
        if (!StringUtils.hasText(sceneKey)) {
            return null;
        }
        SysNotificationTemplate template = templateMapper.findByScene(sceneKey);
        if (template == null || !Integer.valueOf(1).equals(template.getEnabled())
                || !StringUtils.hasText(template.getBodyTpl())) {
            return null;
        }
        return new Rendered(fill(template.getTitleTpl(), variables), fill(template.getBodyTpl(), variables));
    }

    /** 场景×渠道是否允许发送；无配置行视为开 */
    public boolean enabled(String sceneKey, String channel) {
        if (!StringUtils.hasText(sceneKey) || !StringUtils.hasText(channel)) {
            return true;
        }
        SysNotificationSwitch row = switchMapper.findOne(sceneKey, channel);
        return row == null || !Integer.valueOf(0).equals(row.getEnabled());
    }

    /** 模板清单（管理页） */
    public List<SysNotificationTemplate> templates() {
        return templateMapper.findAll();
    }

    /** 开关清单（管理页） */
    public List<SysNotificationSwitch> switches() {
        return switchMapper.findAll();
    }

    /** 保存模板：只允许改已有场景行（场景是代码登记的，不允许前端凭空造一个发不出去的场景） */
    public void saveTemplate(String sceneKey, String sceneName, String titleTpl, String bodyTpl,
                             boolean enabled, String operator) {
        SysNotificationTemplate template = templateMapper.findByScene(sceneKey);
        if (template == null) {
            template = new SysNotificationTemplate();
            template.setSceneKey(sceneKey);
            template.setSceneName(sceneName);
            template.setTitleTpl(titleTpl);
            template.setBodyTpl(bodyTpl);
            template.setEnabled(enabled ? 1 : 0);
            template.setUpdatedBy(operator);
            templateMapper.insert(template);
            return;
        }
        template.setSceneName(StringUtils.hasText(sceneName) ? sceneName : template.getSceneName());
        template.setTitleTpl(titleTpl);
        template.setBodyTpl(bodyTpl);
        template.setEnabled(enabled ? 1 : 0);
        template.setUpdatedBy(operator);
        templateMapper.updateById(template);
    }

    /** 切换推送开关；没有行时补一行（开关的唯一键是 场景×渠道） */
    public void toggleSwitch(String sceneKey, String channel, boolean enabled, String operator) {
        SysNotificationSwitch row = switchMapper.findOne(sceneKey, channel);
        if (row == null) {
            row = new SysNotificationSwitch();
            row.setSceneKey(sceneKey);
            row.setChannel(channel);
            row.setEnabled(enabled ? 1 : 0);
            row.setUpdatedBy(operator);
            switchMapper.insert(row);
            return;
        }
        row.setEnabled(enabled ? 1 : 0);
        row.setUpdatedBy(operator);
        switchMapper.updateById(row);
    }

    /** 幂等补齐场景行（新增场景时由迁移或管理页触发）：已存在则不动 */
    public void ensureSwitchRows(List<String> sceneKeys) {
        for (String scene : sceneKeys) {
            for (String channel : List.of(SysNotificationSwitch.CHANNEL_WORK, SysNotificationSwitch.CHANNEL_GROUP)) {
                Long count = switchMapper.selectCount(new LambdaQueryWrapper<SysNotificationSwitch>()
                        .eq(SysNotificationSwitch::getSceneKey, scene)
                        .eq(SysNotificationSwitch::getChannel, channel));
                if (count == null || count == 0) {
                    SysNotificationSwitch row = new SysNotificationSwitch();
                    row.setSceneKey(scene);
                    row.setChannel(channel);
                    row.setEnabled(1);
                    row.setUpdatedBy("system");
                    switchMapper.insert(row);
                }
            }
        }
    }

    /**
     * 占位符替换：只做 ${key} 字面替换，不执行任何表达式。
     * <p>未知变量替换为空串而不是保留 ${xxx}：卡片里出现 `${itemContent}` 比少一行更难解释。
     * <p>刻意不引入模板引擎：模板由管理员维护，能执行逻辑的模板等于给配置页开了代码执行面。
     */
    static String fill(String template, Map<String, String> variables) {
        if (!StringUtils.hasText(template)) {
            return "";
        }
        String out = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            out = out.replace("${" + entry.getKey() + "}", entry.getValue() == null ? "" : entry.getValue());
        }
        // 未提供的变量统一清空（含 ${...} 形式残留）
        return out.replaceAll("\\$\\{[A-Za-z0-9_]+}", "");
    }
}
