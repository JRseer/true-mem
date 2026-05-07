/**
 * v3.0 主动能力冒烟测试
 * 验证: 模式检测 → 意图预测 → 建议注入 完整流程
 */
import { describe, expect, test } from "vitest";

import { ClusterEngine } from "../../src/pipeline/cluster-engine";
import { PatternSummarizer } from "../../src/pipeline/pattern-summarizer";
import { SuggestionQueue, createSuggestion } from "../../src/pipeline/suggestion";
import { wrapProactiveContext } from "../../src/adapters/opencode/injection";
import type { SuggestionCreateInput } from "../../src/pipeline/suggestion";

const EXAMPLE_SUGGESTION_INPUT: SuggestionCreateInput = {
  type: "suggestion",
  priority: 0.85,
  summary: "基于研究模式，推荐论文 X",
  detail: "论文详情",
  confidence: 0.8,
  sourcePatternIds: ["pat_001"],
};

describe("v3.0 Proactive Smoke", () => {
  // ================================================================
  // L1: ClusterEngine 聚类
  // ================================================================
  test("ClusterEngine clusters similar memories", () => {
    const engine = new ClusterEngine({
      similarityThreshold: 0.7,
      minClusterSize: 2,
    });

    const memories = [
      { id: "m1", embedding: new Float32Array([0.9, 0.1, 0.0]), summary: "" },
      { id: "m2", embedding: new Float32Array([0.8, 0.2, 0.1]), summary: "" },
      { id: "m3", embedding: new Float32Array([0.85, 0.15, 0.05]), summary: "" },
      { id: "m4", embedding: new Float32Array([0.1, 0.9, 0.0]), summary: "" },
      { id: "m5", embedding: new Float32Array([0.15, 0.85, 0.1]), summary: "" },
    ];

    const clusters = engine.cluster(memories as any);
    expect(clusters.length).toBe(2);

    const bigCluster = clusters.find(c => c.size >= 3);
    expect(bigCluster).toBeDefined();
    if (bigCluster) {
      expect(bigCluster.memoryIds).toContain("m1");
      expect(bigCluster.memoryIds).toContain("m2");
      expect(bigCluster.memoryIds).toContain("m3");
      expect(bigCluster.density).toBeGreaterThan(0.7);
    }
  });

  // ================================================================
  // L2: PatternSummarizer 摘要
  // ================================================================
  test("PatternSummarizer generates rule-based summary", () => {
    const summarizer = new PatternSummarizer();
    const cluster = {
      id: "c1",
      size: 3,
      memoryIds: ["a1", "a2", "a3"],
      density: 0.85,
      centroid: new Float32Array(0),
    };

    const allMemories = [
      { id: "a1", summary: "用户偏好 TypeScript 而非 JavaScript" },
      { id: "a2", summary: "TypeScript 类型系统更严格" },
      { id: "a3", summary: "项目使用 TypeScript strict mode" },
    ];

    const result = summarizer.summarize(cluster, allMemories as any);
    expect(result.text).toBeTruthy();
    expect(result.method).toBe("rule");
    expect(result.text).toContain("TypeScript");
  });

  test("PatternSummarizer caps at 200 chars", () => {
    const summarizer = new PatternSummarizer();
    const longSummary = "A".repeat(100);

    const cluster2 = {
      id: "c2",
      size: 3,
      memoryIds: ["b1", "b2", "b3"],
      density: 0.8,
      centroid: new Float32Array(0),
    };

    const allMemories2 = [
      { id: "b1", summary: longSummary },
      { id: "b2", summary: longSummary },
      { id: "b3", summary: longSummary },
    ];

    const result2 = summarizer.summarize(cluster2, allMemories2 as any);
    expect(result2.text.length).toBeLessThanOrEqual(200);
  });

  // ================================================================
  // L3: SuggestionQueue 生命周期
  // ================================================================
  test("SuggestionQueue enqueue/dequeue lifecycle", () => {
    const queue = new SuggestionQueue({ maxSize: 10 });

    const s = queue.enqueue(EXAMPLE_SUGGESTION_INPUT);
    expect(s).toBeDefined();
    if (!s) return;
    expect(s.status).toBe("pending");
    expect(queue.pendingCount).toBe(1);

    const active = queue.getActive();
    expect(active.length).toBe(1);
    expect(active[0].summary).toBe("基于研究模式，推荐论文 X");

    // Dequeue marks as injected
    const dequeued = queue.dequeue(1);
    expect(dequeued.length).toBe(1);
    expect(dequeued[0].status).toBe("injected");
  });

  test("SuggestionQueue expires stale suggestions", async () => {
    const queue = new SuggestionQueue({ maxSize: 10, now: () => new Date() });

    const s = queue.enqueue({
      type: "reminder",
      priority: 0.7,
      summary: "任务提醒",
      detail: "",
      confidence: 0.7,
      sourcePatternIds: [],
      ttlMs: 1,
    });
    expect(s).toBeDefined();

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        queue.expireStale();
        expect(queue.getActive().length).toBe(0);
        expect(queue.all[0].status).toBe("expired");
        resolve();
      }, 10);
    });
  });

  test("SuggestionQueue respects maxSize", () => {
    const queue = new SuggestionQueue({ maxSize: 3 });

    for (let i = 0; i < 5; i++) {
      queue.enqueue({
        type: "suggestion",
        priority: 0.5 + i * 0.1,
        summary: `Suggestion ${i}`,
        detail: "",
        confidence: 0.7,
        sourcePatternIds: [],
      });
    }

    expect(queue.size()).toBeLessThanOrEqual(3);
  });

  // ================================================================
  // L4: proactive_context XML
  // ================================================================
  test("wrapProactiveContext generates valid XML", () => {
    const s1 = createSuggestion({
      type: "suggestion",
      priority: 0.9,
      summary: "基于模式检测，推荐查看相关文档",
      detail: "",
      confidence: 0.85,
      sourcePatternIds: ["p1"],
    });

    const s2 = createSuggestion({
      type: "alert",
      priority: 0.75,
      summary: "注意：依赖版本过期",
      detail: "",
      confidence: 0.7,
      sourcePatternIds: ["p2"],
    });

    const xml = wrapProactiveContext([s1, s2]);

    expect(xml).toContain("<proactive_context>");
    expect(xml).toContain("</proactive_context>");
    expect(xml).toContain("基于模式检测，推荐查看相关文档");
    expect(xml).toContain("注意：依赖版本过期");
    expect(xml).toContain('type="suggestion"');
    expect(xml).toContain('type="alert"');
    expect(xml).toContain('data-suggestion-id="' + s1.id + '"');
  });

  test("wrapProactiveContext escapes XML special chars", () => {
    const s = createSuggestion({
      type: "suggestion",
      priority: 0.8,
      summary: '检查 <script>alert("xss")</script> 和 &amp; 编码',
      detail: "",
      confidence: 0.7,
      sourcePatternIds: [],
    });

    const xml = wrapProactiveContext([s]);
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
    expect(xml).toContain("&amp;amp;");
  });

  test("wrapProactiveContext sorts by priority desc", () => {
    const s1 = createSuggestion({
      type: "suggestion",
      priority: 0.5,
      summary: "low",
      detail: "",
      confidence: 0.7,
      sourcePatternIds: [],
    });
    const s2 = createSuggestion({
      type: "suggestion",
      priority: 0.9,
      summary: "high",
      detail: "",
      confidence: 0.7,
      sourcePatternIds: [],
    });

    const xml = wrapProactiveContext([s1, s2]);
    const highIdx = xml.indexOf("high");
    const lowIdx = xml.indexOf("low");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  // ================================================================
  // L5: 端到端
  // ================================================================
  test("Full proactive flow: cluster → summarize → suggest → inject", () => {
    const engine = new ClusterEngine({
      similarityThreshold: 0.7,
      minClusterSize: 2,
    });

    const memoryObjs = [
      { id: "a1", embedding: new Float32Array([0.9, 0.1]), summary: "RAG 优化论文" },
      { id: "a2", embedding: new Float32Array([0.85, 0.15]), summary: "检索增强生成" },
      { id: "a3", embedding: new Float32Array([0.1, 0.9]), summary: "Token 分析器重构" },
    ];

    const clusters = engine.cluster(memoryObjs as any);
    expect(clusters.length).toBe(1);

    const summarizer = new PatternSummarizer();
    const result = summarizer.summarize(clusters[0], memoryObjs as any);
    expect(result.text).toContain("RAG");

    const input: SuggestionCreateInput = {
      type: "suggestion",
      priority: 0.85,
      summary: `基于模式[${result.text}]，推荐继续深入研究 RAG`,
      detail: "最近浏览的论文和代码都围绕检索增强生成优化",
      confidence: 0.8,
      sourcePatternIds: ["mock_pattern_id"],
    };

    const queue = new SuggestionQueue({ maxSize: 10 });
    const sug = queue.enqueue(input);
    expect(sug).toBeDefined();
    if (!sug) return;

    const xml = wrapProactiveContext([sug]);
    expect(xml).toContain("<proactive_context>");
    expect(xml).toContain("RAG");
    expect(xml).toContain(sug.id);

    const dequeued = queue.dequeue(1);
    expect(dequeued.length).toBe(1);
    expect(dequeued[0].status).toBe("injected");
  });
});
