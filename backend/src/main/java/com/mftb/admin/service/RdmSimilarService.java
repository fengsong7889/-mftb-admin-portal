package com.mftb.admin.service;

import com.mftb.admin.dto.RdmAssistantVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * RDM 相似需求查重（M4+ AI 辅助之一，但**不使用大模型**）。
 *
 * <p>为什么不用 LLM：查重的作用是「拦下重复提单」，它必须满足三点——
 * 可复现（同样的输入同样的结果，否则用户无法理解为什么这次提示上次不提示）、
 * 可解释（要说清命中了哪些词）、离线可用（大模型熔断时提单流程不能被打断）。
 *
 * <p>算法：中文按二元组 + 西文按单词切词，标题做 Dice 系数为主（0.75 权重），
 * 正文期望做辅助（0.25），同一提出人再加 0.08（重复提单高发于同一人），
 * 命中阈值 0.2 才返回；在途需求且相似度 ≥ 0.45 才判「疑似重复」。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmSimilarService {

    /** 参与比对的历史窗口条数（按提交时间倒序，控制单次查询规模） */
    private static final int CANDIDATE_LIMIT = 400;
    /** 返回给前端的候选条数 */
    private static final int TOP_N = 5;
    /** 低于该相似度不值得打扰用户 */
    private static final double MIN_SCORE = 0.2;
    /** 判「疑似重复」的门槛（且必须是在途需求） */
    private static final double DUPLICATE_SCORE = 0.45;
    /** 终态：这些状态的历史需求只作参考，不构成重复 */
    private static final Set<String> FINISHED_STATUS = Set.of("released", "verified", "closed", "intake_rejected", "rejected");

    private final JdbcTemplate jdbcTemplate;

    /**
     * 按标题（可选带期望描述）查相似需求。
     *
     * @param title        待提交的标题
     * @param expectText   期望结果/描述正文，可为空
     * @param excludeId    编辑场景下排除自身
     * @param currentUser  当前登录人姓名，用于判断“自己重复提同一件事”
     */
    public RdmAssistantVO.SimilarResult findSimilar(String title, String expectText, Long excludeId, String currentUser) {
        RdmAssistantVO.SimilarResult result = new RdmAssistantVO.SimilarResult();
        result.setQueryTitle(title);
        result.setMethod("中文二元组 + 西文分詞的 Dice 相似係數（標題 0.75 / 期望 0.25，同提出人 +0.08），非大模型結果");
        if (!StringUtils.hasText(title) || title.trim().length() < 2) {
            result.setDuplicateSuspect(false);
            return result;
        }
        Set<String> titleTokens = tokenize(title);
        Set<String> expectTokens = tokenize(expectText);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, req_no, title, status, req_type, priority, submitter_name, submit_dept_name, "
                        + " assignee_pm_name, submit_time, expect_result "
                        + "FROM rdm_requirement WHERE deleted = 0 AND id <> ? "
                        + "ORDER BY id DESC LIMIT " + CANDIDATE_LIMIT,
                excludeId == null ? -1L : excludeId);

        List<RdmAssistantVO.SimilarItem> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            double titleScore = dice(titleTokens, tokenize((String) row.get("title")));
            double overall = titleScore * 0.75
                    + dice(expectTokens, tokenize((String) row.get("expect_result"))) * 0.25;
            if (title.trim().equals(String.valueOf(row.get("title")).trim())) {
                overall = 1.0; // 完全同名，直接置顶
            }
            // 同一人重复提同一件事是最高发的场景，适度加权
            boolean sameSubmitter = StringUtils.hasText(currentUser)
                    && currentUser.equals(row.get("submitter_name"));
            if (sameSubmitter) {
                overall += 0.08;
            }
            if (overall < MIN_SCORE) {
                continue;
            }
            items.add(buildItem(row, Math.min(overall, 1.0), titleTokens, sameSubmitter));
        }
        items.sort(Comparator.comparingDouble(RdmAssistantVO.SimilarItem::getSimilarity).reversed());
        List<RdmAssistantVO.SimilarItem> top = items.size() > TOP_N ? new ArrayList<>(items.subList(0, TOP_N)) : items;
        result.setItems(top);
        result.setDuplicateSuspect(top.stream().anyMatch(i -> Boolean.TRUE.equals(i.getInProgress())
                && i.getSimilarity() != null && i.getSimilarity() >= DUPLICATE_SCORE));
        return result;
    }

    private RdmAssistantVO.SimilarItem buildItem(Map<String, Object> row, double score,
                                                  Set<String> queryTokens, boolean sameSubmitter) {
        RdmAssistantVO.SimilarItem item = new RdmAssistantVO.SimilarItem();
        item.setReqId(((Number) row.get("id")).longValue());
        item.setReqNo((String) row.get("req_no"));
        item.setTitle((String) row.get("title"));
        item.setStatus((String) row.get("status"));
        item.setReqType((String) row.get("req_type"));
        item.setPriority((String) row.get("priority"));
        item.setSubmitterName((String) row.get("submitter_name"));
        item.setSubmitDeptName((String) row.get("submit_dept_name"));
        item.setPmName((String) row.get("assignee_pm_name"));
        item.setSubmitTime(row.get("submit_time") == null ? null : String.valueOf(row.get("submit_time")));
        item.setSimilarity(Math.round(score * 100) / 100.0);
        item.setMatchedTerms(matchedTerms(queryTokens, (String) row.get("title")));
        item.setSameSubmitter(sameSubmitter);
        item.setInProgress(!FINISHED_STATUS.contains(String.valueOf(row.get("status"))));
        return item;
    }

    /** 命中的关键词（让分数可解释，用户能自己判断是不是真重复） */
    private List<String> matchedTerms(Set<String> queryTokens, String otherTitle) {
        Set<String> other = tokenize(otherTitle);
        List<String> matched = new ArrayList<>();
        for (String token : queryTokens) {
            if (other.contains(token) && token.length() >= 2 && matched.size() < 8) {
                matched.add(token);
            }
        }
        return matched;
    }

    /**
     * 分词：CJK 取相邻二字组合（中文没有空格，二元组是成本最低的可用近似），
     * 西文/数字按词切，标点与空白丢弃。
     */
    static Set<String> tokenize(String text) {
        Set<String> tokens = new HashSet<>();
        if (!StringUtils.hasText(text)) {
            return tokens;
        }
        String normalized = text.toLowerCase();
        StringBuilder latin = new StringBuilder();
        List<Character> cjk = new ArrayList<>();
        for (int i = 0; i < normalized.length(); i++) {
            char ch = normalized.charAt(i);
            if (isCjk(ch)) {
                flushLatin(tokens, latin);
                cjk.add(ch);
            } else if (Character.isLetterOrDigit(ch)) {
                flushCjk(tokens, cjk);
                latin.append(ch);
            } else {
                flushLatin(tokens, latin);
                flushCjk(tokens, cjk);
            }
        }
        flushLatin(tokens, latin);
        flushCjk(tokens, cjk);
        return tokens;
    }

    private static boolean isCjk(char ch) {
        return ch >= 0x4E00 && ch <= 0x9FFF;
    }

    private static void flushLatin(Set<String> tokens, StringBuilder latin) {
        if (latin.length() >= 2) {
            tokens.add(latin.toString());
        }
        latin.setLength(0);
    }

    /** 相邻二字组合，长度 1 的孤立汉字也保留（如「牛」「房」等单字词） */
    private static void flushCjk(Set<String> tokens, List<Character> cjk) {
        if (cjk.size() == 1) {
            tokens.add(String.valueOf(cjk.get(0)));
        }
        for (int i = 1; i < cjk.size(); i++) {
            tokens.add("" + cjk.get(i - 1) + cjk.get(i));
        }
        cjk.clear();
    }

    /** Dice 相似系数：2|A∩B| / (|A|+|B|) */
    static double dice(Set<String> a, Set<String> b) {
        if (a.isEmpty() || b.isEmpty()) {
            return 0;
        }
        int hit = 0;
        Set<String> smaller = a.size() <= b.size() ? a : b;
        Set<String> larger = a.size() <= b.size() ? b : a;
        for (String token : smaller) {
            if (larger.contains(token)) {
                hit++;
            }
        }
        return 2.0 * hit / (a.size() + b.size());
    }
}
