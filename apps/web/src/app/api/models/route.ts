import { NextResponse } from 'next/server';

const DEFAULT_MODELS = [
  {
    id: 'deepseek-r1-distill-qwen-14b',
    name: 'DeepSeek R1 Distill Qwen 14B',
    provider: 'LM Studio',
    description: 'High-performance reasoning model with chain-of-thought thinking.',
    context_length: 32768,
    is_reasoning: true,
  },
  {
    id: 'deepseek-r1-distill-llama-8b',
    name: 'DeepSeek R1 Distill Llama 8B',
    provider: 'LM Studio',
    description: 'Fast, lightweight reasoning model with full thinking capabilities.',
    context_length: 16384,
    is_reasoning: true,
  },
  {
    id: 'llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct',
    provider: 'LM Studio',
    description: 'State-of-the-art general purpose local reasoning and code model.',
    context_length: 131072,
    is_reasoning: false,
  },
  {
    id: 'qwen2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B Instruct',
    provider: 'LM Studio',
    description: 'Exceptional coding, refactoring, and technical architecture model.',
    context_length: 32768,
    is_reasoning: false,
  },
  {
    id: 'mistral-nemo-instruct-2407',
    name: 'Mistral Nemo 12B Instruct',
    provider: 'LM Studio',
    description: 'Fast and versatile multilingual model with large context.',
    context_length: 128000,
    is_reasoning: false,
  },
];

export async function GET() {
  const lmStudioUrl = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${lmStudioUrl}/models`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data) && data.data.length > 0) {
        // Filter out embedding models
        const chatModels = data.data.filter((m: any) => !m.id.toLowerCase().includes('embed'));
        const targetList = chatModels.length > 0 ? chatModels : data.data;

        const liveModels = targetList.map((m: any) => {
          const isReasoning =
            m.id.toLowerCase().includes('r1') ||
            m.id.toLowerCase().includes('reason') ||
            m.id.toLowerCase().includes('deepseek') ||
            m.id.toLowerCase().includes('qwen') ||
            m.id.toLowerCase().includes('think');
          return {
            id: m.id,
            name: m.id
              .replace(/[-_]/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            provider: 'LM Studio (Live)',
            description: isReasoning
              ? 'Chain-of-thought reasoning model running on local GPU.'
              : 'Local instruction-tuned model running on LM Studio.',
            context_length: m.context_length || 32768,
            is_reasoning: isReasoning,
          };
        });

        // Ensure qwen/qwen3-14b or loaded model is first
        liveModels.sort((a: any, b: any) => {
          if (a.id.includes('qwen3-14b')) return -1;
          if (b.id.includes('qwen3-14b')) return 1;
          return 0;
        });

        return NextResponse.json({
          connected: true,
          provider: 'lmstudio',
          base_url: lmStudioUrl,
          models: liveModels,
        });
      }
    }
  } catch (err) {
    // LM Studio server not running or timed out
  }

  return NextResponse.json({
    connected: false,
    provider: 'lmstudio',
    base_url: lmStudioUrl,
    models: DEFAULT_MODELS,
    notice: 'LM Studio server offline on port 1234. Displaying configured models.',
  });
}
