import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    // 本机内存紧张（Ollama 模型常驻 + 多套 Electron 套件），文件级串行避免争抢
    fileParallelism: false,
    server: {
      deps: {
        inline: ["@rmtest/core", "@rmtest/adapter-mv", "@rmtest/adapter-rgss", "@rmtest/adapter-tyrano", "@rmtest/adapter-gbs", "@rmtest/adapter-godot", "@rmtest/checkers", "@rmtest/report", "@rmtest/dsl", "@rmtest/freshness", "@rmtest/runtime", "@rmtest/ai"],
      },
    },
  },
});
