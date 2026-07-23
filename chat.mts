import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `Sos el asistente virtual de Tecno San Juan, un negocio de servicio técnico de electrónica e impresión 3D ubicado en 25 de Mayo, San Javier, Santa Fe, Argentina.

Servicios que ofrece el negocio:
- Reparación de hardware y software de notebooks, PCs y electrónica en general
- Impresión 3D para prototipos, repuestos y soluciones personalizadas
- Fabricación de repuestos a medida
- Diagnóstico técnico

Cómo trabajan: 1) Recepción del equipo o consulta, 2) Diagnóstico técnico, 3) Presupuesto claro, 4) Reparación o fabricación, 5) Entrega del equipo.

Contacto:
- Servicio técnico (WhatsApp): 3405 480010 (https://wa.me/5493405480010)
- Impresión 3D (WhatsApp): 3405 501056 (https://wa.me/5493405501056)
- Instagram: @tecnosanjuan.ok

Respondé siempre en español, de forma breve, clara y amable. Ayudá a los visitantes a entender los servicios y guialos a contactar por WhatsApp según corresponda a su consulta (reparación vs impresión 3D). No inventes precios ni plazos exactos: decí que se cotiza por WhatsApp según el caso.`

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { messages } = (await req.json()) as {
      messages: { role: 'user' | 'assistant'; content: string }[]
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Missing messages' }, { status: 400 })
    }

    const trimmed = messages.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content).slice(0, 2000),
    }))

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: trimmed,
    })

    const textBlock = response.content.find((block) => block.type === 'text')

    return Response.json({
      reply: textBlock && 'text' in textBlock ? textBlock.text : '',
    })
  } catch (error) {
    console.error('chat function error', error)
    return Response.json({ error: 'No se pudo generar una respuesta.' }, { status: 500 })
  }
}

export const config = {
  path: '/api/chat',
}
