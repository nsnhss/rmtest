/**
 * Provider 抽象 —— AI 只是"翻译器"的提供者，可插拔、默认关、挂了产品照跑。
 * 实现：Ollama（本地，零成本）/ 任何 OpenAI 兼容端点；测试用 Mock。
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
}

export interface ChatProvider {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
}

export class OllamaProvider implements ChatProvider {
  constructor(
    private readonly baseUrl = "http://127.0.0.1:11434",
    private readonly model = "qwen3:1.7b",
  ) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    return body.message?.content ?? "";
  }
}

/** 测试用：按脚本或函数回放回复 */
export class MockProvider implements ChatProvider {
  private index = 0;

  constructor(private readonly script: string[] | ((messages: ChatMessage[]) => string)) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    if (typeof this.script === "function") return this.script(messages);
    const reply = this.script[this.index] ?? this.script[this.script.length - 1] ?? "";
    this.index++;
    return reply;
  }
}
