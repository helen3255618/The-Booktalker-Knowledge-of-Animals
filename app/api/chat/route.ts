import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // 解析请求体（可能会抛出）
    const payload = await req.json();
    const { history, message, systemInstruction } = payload ?? {};

    // 基本参数校验
    if (!message && (!history || !Array.isArray(history))) {
      const msg = 'Invalid request: missing "message" and "history".';
      console.error(msg, { payloadSample: JSON.stringify(payload).slice(0, 200) });
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 读取并校验 API Key
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      const msg = 'API_KEY environment variable not set';
      console.error(msg);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 仅记录是否存在及长度（避免泄露密钥）
    console.log('API_KEY set:', true);
    console.log('API_KEY length:', apiKey.length);

    // 初始化 SDK
    let ai: any;
    try {
      ai = new GoogleGenAI({ apiKey });
      console.log('GoogleGenAI initialized');
    } catch (initErr) {
      console.error('GoogleGenAI initialization failed', initErr);
      return new Response(JSON.stringify({ error: 'Failed to initialize GoogleGenAI client' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contents: Content[] = [
      ...(history || []),
      { role: 'user', parts: [{ text: message }] }
    ];

    // 支持通过环境变量切换模型（方便调试/降级）
    const model = process.env.GENAI_MODEL || 'gemini-2.5-flash';
    console.log('Using model:', model);

    // 调用生成流
    let stream: AsyncIterable<any>;
    try {
      stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: systemInstruction,
        },
      });
      console.log('generateContentStream returned');
    } catch (genErr) {
      console.error('generateContentStream error:', genErr);
      const messageText = (genErr && genErr.message) ? genErr.message : 'Error calling generateContentStream';
      return new Response(JSON.stringify({ error: messageText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 将 SDK 的异步流包装为可读流返回给前端
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            try {
              const text = chunk?.text;
              if (text) {
                controller.enqueue(new TextEncoder().encode(text));
              }
            } catch (innerChunkErr) {
              console.error('Error processing chunk:', innerChunkErr);
              // 如果单个 chunk 处理失败，继续尝试下一个 chunk
            }
          }
          controller.close();
        } catch (streamErr) {
          console.error('Stream iteration error:', streamErr);
          try {
            controller.error(streamErr);
          } catch (cErr) {
            console.error('controller.error failed:', cErr);
          }
        }
      },
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    // 捕获任意未处理异常并返回结构化错误（便于前端显示和 Vercel 日志）
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    const stack = error instanceof Error && error.stack ? error.stack : undefined;

    // 详细日志（Vercel runtime logs）
    console.error('Unhandled Chat API error:', { message, stack });

    // 返回 JSON 格式错误，前端可读取 body 获取详细信息
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
