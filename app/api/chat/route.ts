import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { history, message, systemInstruction } = await req.json();

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return new Response("API_KEY environment variable not set", { status: 500, statusText: "API Key not found" });
    }

    // 添加日志验证 API Key
    console.log('API_KEY is set:', !!apiKey);
    console.log('API_KEY length:', apiKey.length);

    const ai = new GoogleGenAI({ apiKey });
    console.log('GoogleGenAI initialized successfully');

    const contents: Content[] = [
      ...(history || []),
      { role: 'user', parts: [{ text: message }] }
    ];

    console.log('Calling generateContentStream with model/gemini-2.5-flash');

    const stream = await ai.models.generateContentStream({
      model: 'model/gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    console.log('Stream generated successfully');

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
          controller.close();
        } catch (streamError) {
          console.error('Stream processing error:', streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    // 更详细的错误日志
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    
    console.error('API Error:', {
      message: errorMessage,
      stack: errorStack,
      type: error?.constructor?.name,
    });

    // 返回更详细的错误信息到客户端
    const responseMessage = `Error: ${errorMessage}`;
    return new Response(responseMessage, { 
      status: 500, 
      statusText: 'Internal Server Error'
    });
  }
}
