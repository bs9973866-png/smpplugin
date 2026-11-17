const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'
let queue = Promise.resolve()
let lastRequestAt = 0

const ACTIONS = ['explore', 'gather_wood', 'build_camp', 'visit_agent', 'talk', 'claim_home', 'return_home', 'rest']
const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    goal: { type: 'string' },
    reason: { type: 'string' },
    message: { type: 'string' },
    target: { type: 'string' }
  },
  required: ['action', 'goal', 'reason', 'message', 'target']
}

function cleanText(value, max = 180) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\\r\\n\\t]+/g, ' ').replace(/§[0-9a-fk-or]/gi, '').trim().slice(0, max)
}

function parseDecision(raw, observation) {
  let value
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || !ACTIONS.includes(value.action)) return null
  const target = cleanText(value.target, 32)
  if (value.action === 'visit_agent' && target && !observation.nearbyAgents.some(agent => agent.name === target)) return null
  return {
    action: value.action,
    goal: cleanText(value.goal, 100),
    reason: cleanText(value.reason, 160),
    message: cleanText(value.message, 150),
    target
  }
}

async function askForDecision(profile, memory, observation) {
  const prompt = [
    'Ты — самостоятельный ИИ-агент, управляющий одним реальным персонажем в Minecraft SMP.',
    'Твоя задача — жить в мире, исследовать его, находить место для дома, собирать ресурсы, строить поселение, общаться, сотрудничать и развивать свою фракцию.',
    'Ты сам выбираешь следующий шаг. Не следуй фиксированному сценарию и не повторяй одно действие без причины.',
    'Учитывай собственную память, инвентарь, обстановку, отношения и общую цель фракции.',
    'Действия только мирные: исследование, сбор древесины, строительство, общение, выбор дома, возвращение домой и отдых. Не выбирай боевые действия.',
    'Не выдумывай предметы, события, координаты или действия, которых нет в наблюдении.',
    'Верни строго JSON по заданной схеме. message — короткая русская фраза только если нужно поговорить; target — имя видимого агента для visit_agent, иначе пустая строка.',
    'Профиль: ' + JSON.stringify({ name: profile.name, role: profile.role, personality: profile.style, faction: profile.faction, factionGoal: profile.factionGoal }),
    'Память: ' + JSON.stringify({
      home: memory.home,
      currentGoal: memory.currentGoal || '',
      recentEvents: (memory.recentEvents || []).slice(-8).map(item => item.event),
      discoveries: (memory.discoveries || []).slice(-8),
      relationships: Object.entries(memory.relationships || {}).slice(0, 8).map(([name, rel]) => ({ name, trust: rel.trust, notes: (rel.notes || []).slice(-2) })),
      stats: memory.stats
    }),
    'Наблюдение в игре: ' + JSON.stringify(observation),
    'Выбери одно наиболее разумное действие прямо сейчас.'
  ].join(String.fromCharCode(10))

  const response = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: DECISION_SCHEMA,
      messages: [
        { role: 'system', content: 'Ты принимаешь решения за одного автономного Minecraft-агента. Всегда отвечай валидным JSON на русском языке.' },
        { role: 'user', content: prompt }
      ],
      options: { temperature: 0.35, num_predict: 180 }
    }),
    signal: AbortSignal.timeout(90000)
  })
  if (!response.ok) throw new Error('Ollama HTTP ' + response.status)
  const data = await response.json()
  return parseDecision(data.message?.content || '', observation)
}

async function generateDecision(profile, memory, observation) {
  const task = queue.then(async () => {
    const delay = Math.max(0, 900 - (Date.now() - lastRequestAt))
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    lastRequestAt = Date.now()
    return askForDecision(profile, memory, observation)
  })
  queue = task.catch(() => null)
  try {
    return await task
  } catch (error) {
    if (!generateDecision.warned) {
      console.log('[OLLAMA] Не удалось получить решение модели: ' + error.message)
      generateDecision.warned = true
    }
    return null
  }
}

module.exports = { generateDecision }
