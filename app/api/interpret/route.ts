import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { chartData, dimension } = await req.json()

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

    const llmRes = await fetch(process.env.LLM_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'deepseek-chat',
        stream: true,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!llmRes.ok) {
      return NextResponse.json({ error: '大模型接口请求失败' }, { status: 500 })
    }
    return new Response(llmRes.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: '解读失败', msg: err.message }, { status: 500 })
  }
}
