package com.mftb.admin.config;

import com.mftb.admin.dto.RdmDailyReportVO.Rule;
import com.mftb.admin.dto.RdmDailyReportVO.TriggerResult;
import com.mftb.admin.service.RdmDailyReportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalTime;
import java.util.List;

/**
 * RDM 進度日報推送作業（按規則逐条执行）。
 *
 * <p><b>为什么是「每分钟 tick + 比对规则时间」而不是 cron 到点</b>：推送时间由用户在
 * 「進度日報 &gt; 推送配置」里按规则维护，且可新增多条规则。Spring 的
 * {@code @Scheduled(cron=...)} 在启动时固化，改时间就得重启；动态注册/注销 cron 任务
 * （{@code ScheduledTaskRegistrar}）能解决但要自己管生命周期与并发，复杂度不划算。
 * 因此 cron 只负责「每分钟醒来一次」，「这一分钟有哪些规则到点」由
 * {@link RdmDailyReportService#rulesDueAt} 读库判定——改完时间下一分钟即生效，无需重启。
 *
 * <p><b>重复触发不会重复推送</b>：命中后由服务层按「当日该规则该档快照已存在则跳过」幂等
 * （快照表唯一键 {@code (report_date, report_type, scope_key)} 兜底），因此每分钟扫一次是安全的，
 * 多实例并发触发也只会有一份快照、一次出站。与 {@code RdmTodoNotifyJob} 同理，本作业
 * <b>刻意不依赖</b> MySQL 命名锁——{@code GET_LOCK} 与连接的绑定行为在本项目已被列为待验证项，
 * 正确性必须由数据库唯一约束保证。
 *
 * <p><b>异常隔离分两层</b>：入口整体 try-catch 防止打断后续调度；<b>单条规则再包一层</b>，
 * 避免某条规则配置坏掉（如项目被删、模板停用）时，同一分钟到点的其它规则也一起不发。
 *
 * <p><b>三层开关</b>：yml {@code rdm.daily-report.enabled}（环境级，本类判）、
 * 页面全局开关（服务层 {@code rulesDueAt} 判）、{@code rdm.notify.dry-run}（服务层判）。
 *
 * <p>时区跟随服务器（与 {@code MeetingDailyCloseJob} 同口径）：生产镜像固定 Asia/Shanghai。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RdmDailyReportJob {

    private final RdmDailyReportService dailyReportService;

    /** 环境级总开关：联调/本地默认不跑，避免把测试消息推到真实钉钉群 */
    @Value("${rdm.daily-report.enabled:false}")
    private boolean enabled;

    /**
     * 每分钟第 0 秒醒来一次，找出此刻到点的规则并逐条推送。
     * <p>刻意用秒级 cron（{@code 0 * * * * ?}）而不是 fixedDelay：fixedDelay 的触发时刻会随
     * 上一轮耗时漂移，可能整分钟跳过配置时点；cron 对齐到每分钟整点，与 HH:mm 严格可比。
     */
    @Scheduled(cron = "${rdm.daily-report.tick-cron:0 * * * * ?}")
    public void tick() {
        if (!enabled) {
            return;
        }
        try {
            LocalTime now = LocalTime.now();
            List<Rule> due = dailyReportService.rulesDueAt(now);
            if (due.isEmpty()) {
                return;
            }
            log.info("RDM 進度日報作業命中 {} 條規則: time={}", due.size(), now.withSecond(0).withNano(0));
            for (Rule rule : due) {
                try {
                    TriggerResult outcome = dailyReportService.runRule(rule.getId());
                    log.info("RDM 進度日報作業完成: ruleId={}, name={}, project={}, iteration={}, 项目={}, "
                                    + "群报={}, 个人发送={}, 个人跳过={}, 结论={}",
                            rule.getId(), rule.getName(), rule.getProjectId(), rule.getIterationCode(),
                            outcome.getProjectCount(), outcome.isGroupDispatched(),
                            outcome.getPersonalSent(), outcome.getPersonalSkipped(), outcome.getMessage());
                } catch (Exception e) {
                    // 单条规则失败不拖累同分钟到点的其它规则
                    log.error("RDM 進度日報規則推送失敗（其它規則不受影響，可手動補發）: ruleId={}, name={}, error={}",
                            rule.getId(), rule.getName(), e.getMessage(), e);
                }
            }
        } catch (Exception e) {
            // 吞异常但留全量线索：漏发的规则可由管理员在「手动触发」页补发
            log.error("RDM 進度日報作業失敗（不影响后续调度，可在手动触发页补发）: error={}", e.getMessage(), e);
        }
    }
}
