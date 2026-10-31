import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  // 10秒超时，Vercel hobby 限制
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const { chartData, dimension } = await req.json()
    const baseUrl = process.env.LLM_BASE_URL || ''
    const apiUrl = new URL('chat/completions', baseUrl)

    const systemPrompt = `
你是精通紫微斗数的命理师，严格遵循倪海厦《天纪》的理论体系进行解读。
解读原则：
1. 以主星为核心，结合辅星、四化综合判断
2. 语言通俗客观，不危言耸听，不夸大其词
3. 只针对指定维度展开，不冗余发散
4. 分点表述，结构清晰，字数控制在 300-500 字
`
    const userPrompt = `
请针对以下命盘，解读【${dimension}】维度：
${JSON.stringify(chartData, null, 2)}
`

    const llmRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL,
        stream: true,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)
    if (!llmRes.ok || !llmRes.body) {
      return NextResponse.json({ error: 'NewAPI 请求失败' }, { status: 500 })
    }

    // 解析 SSE，提取 delta.content，只吐出纯文本给前端（适配这个紫微项目前端）
    const reader = llmRes.body.getReader()
    const decoder = new TextDecoder()
    const stream = new ReadableStream({
      async start(ctrl) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)
              if (dataStr === '[DONE]') continue
              try {
                const json = JSON.parse(dataStr)
                const text = json.choices?.[0]?.delta?.content || ''
                if (text) ctrl.enqueue(new TextEncoder().encode(text))
              } catch (e) {
                // 忽略解析异常行
              }
            }
          }
        }
        ctrl.close()
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache'
      }
    })
  } catch (err: any) {
    clearTimeout(timeout)
    return NextResponse.json({ error: '接口异常', msg: err.message }, { status: 500 })
  }
}
