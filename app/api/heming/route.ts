import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const { chartA, chartB, dimension } = await req.json()
    const baseUrl = process.env.LLM_BASE_URL || ''
    const apiUrl = new URL('chat/completions', baseUrl)

    const systemPrompt = `你是紫微斗数合盘分析师，对比两张命盘，分析两人关系，客观理性，不恐吓。`
    const userPrompt = `维度：${dimension}\n命盘A：${JSON.stringify(chartA)}\n命盘B：${JSON.stringify(chartB)}`

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
    if (!llmRes.ok || !llmRes.body) return NextResponse.json({ error: '合盘请求失败' }, { status: 500 })

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
              } catch (e) {}
            }
          }
        }
        ctrl.close()
      }
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    clearTimeout(timeout)
    return NextResponse.json({ error: '合盘异常', msg: e.message }, { status: 500 })
  }
}
