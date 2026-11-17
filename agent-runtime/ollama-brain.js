const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
let queue = Promise.resolve()
let lastRequestAt = 0

function cleanLine(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\r\n\t]+/g, ' ').replace(/§[0-9a-fk-or]/gi, '').trim().slice(0, 150)
}

async function askModel(profile, memory) {
  const relationNames = Object.keys(memory.relationships || {}).slice(0, 5)
  const recent = (memory.recentEvents || []).slice(-5).map(item => item.event).join('; ')
  const prompt = [
    'Ты управляешь одним персонажем в Minecraft SMP.',
    'Отвечай только по-русски, естественно, коротко и от первого лица.',
    'Ты самостоятельный мирный житель-исследователь. Не описывай реальные опасные действия и не давай инструкций по причинению вреда.',
    'Не утверждай, что сделал то, чего нет в памяти. Не используй команды, markdown и эмодзи.',
    'Верни только одну короткую реплику для общего чата (до 140 символов).',
    'Имя: ' + profile.name + '. Роль: ' + profile.role + '. Характер: ' + profile.style + '.',
    'Недавние события: ' + (recent || 'только начал путь'),
    'Знакомые персонажи: ' + (relationNames.join(', ') || 'пока никого'),
    'Напиши подходящую реплику:'
  ].join('\n')

  const response = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [
        { role: 'system', content: 'Ты отыгрываешь одного персонажа Minecraft. Пиши только краткую русскую реплику.' },
        { role: 'user', content: prompt }
      ],
      options: { temperature: 0.85, num_predict: 90 }
    }),
    signal: AbortSignal.timeout(18000)
  })
  if (!response.ok) throw new Error('Ollama HTTP ' + response.status)
  const data = await response.json()
  return cleanLine(data.message?.content)
}

async function generateChat(profile, memory) {
  const task = queue.then(async () => {
    const delay = Math.max(0, 3500 - (Date.now() - lastRequestAt))
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    lastRequestAt = Date.now()
    return askModel(profile, memory)
  })
  queue = task.catch(() => '')
  try {
    return await task
  } catch (error) {
    if (!generateChat.warned) {
      console.log('[OLLAMA] Локальная модель недоступна; используются встроенные реплики. ' + error.message)
      generateChat.warned = true
    }
    return ''
  }
}

module.exports = { generateChat }
