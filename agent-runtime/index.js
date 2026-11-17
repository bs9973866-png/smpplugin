const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const fs = require('node:fs')
const path = require('node:path')
const profiles = require('./bots.json')
const { generateChat } = require('./ollama-brain')

const HOST = process.env.MC_HOST || '127.0.0.1'
const PORT = Number(process.env.MC_PORT || 25565)
const VERSION = process.env.MC_VERSION || '26.2'
const MEMORY_FILE = path.join(__dirname, 'memory.json')
const START_MARKER = 'СТАРТ!'
const agents = new Map()
let shuttingDown = false

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const say = (bot, message) => {
  if (bot.entity && message) bot.chat(String(message).slice(0, 180))
}
const emptyAgentMemory = () => ({
  home: null, visited: [], discoveries: [], relationships: {},
  recentEvents: [], stats: { woodCollected: 0, blocksPlaced: 0, journeys: 0 }
})

function loadMemory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
    for (const profile of profiles) parsed[profile.name] ||= emptyAgentMemory()
    return parsed
  } catch {
    return Object.fromEntries(profiles.map(p => [p.name, emptyAgentMemory()]))
  }
}

const memory = loadMemory()
let saveQueued = false
function saveMemory() {
  if (saveQueued) return
  saveQueued = true
  setTimeout(() => {
    saveQueued = false
    const temp = MEMORY_FILE + '.tmp'
    try {
      fs.writeFileSync(temp, JSON.stringify(memory, null, 2), 'utf8')
      fs.renameSync(temp, MEMORY_FILE)
    } catch (error) {
      console.error('[MEMORY] Could not save:', error.message)
    }
  }, 250)
}

function remember(name, event) {
  const record = memory[name]
  if (!record) return
  record.recentEvents.push({ at: new Date().toISOString(), event: String(event).slice(0, 180) })
  if (record.recentEvents.length > 30) record.recentEvents.splice(0, record.recentEvents.length - 30)
  saveMemory()
}

function recordRelationship(profile, otherName, delta, note) {
  if (!memory[profile.name] || !profiles.some(p => p.name === otherName)) return
  const relations = memory[profile.name].relationships
  const current = relations[otherName] || { trust: 0, interactions: 0, notes: [] }
  current.trust = Math.max(-10, Math.min(10, current.trust + delta))
  current.interactions++
  current.notes.push(String(note).slice(0, 100))
  if (current.notes.length > 8) current.notes.shift()
  relations[otherName] = current
  saveMemory()
}

function safePosition(bot) {
  if (!bot.entity) return null
  const p = bot.entity.position
  return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }
}

function rememberPosition(profile, bot) {
  const p = safePosition(bot)
  if (!p) return
  const record = memory[profile.name]
  record.visited.push(p)
  if (record.visited.length > 40) record.visited.shift()
  saveMemory()
}

function makeAgent(profile, state) {
  if (shuttingDown) return
  const bot = mineflayer.createBot({
    host: HOST, port: PORT, username: profile.name,
    auth: 'offline', version: VERSION, hideErrors: false
  })
  state.bot = bot
  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    if (state.bot !== bot) return
    const movement = new Movements(bot)
    movement.canDig = true
    movement.allow1by1towers = false
    bot.pathfinder.setMovements(movement)
    console.log('[ONLINE] ' + profile.name + ' spawned at ' + JSON.stringify(safePosition(bot)))
    if (state.started) runAgent(bot, profile, state).catch(err => console.error('[AI]', profile.name, err.message))
  })

  bot.on('message', json => {
    const text = json.toString()
    if (text.includes('ПАУЗА!')) {
      state.started = false
      remember(profile.name, 'Симуляция приостановлена администратором')
      return
    }
    if (text.includes(START_MARKER) && !state.started) {
      state.started = true
      remember(profile.name, 'Симуляция началась')
      say(bot, profile.greeting)
      runAgent(bot, profile, state).catch(err => console.error('[AI]', profile.name, err.message))
    }
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username || !profiles.some(p => p.name === username)) return
    const lower = message.toLowerCase()
    const other = profiles.find(p => p.name === username)
    const sameFaction = other && other.faction === profile.faction
    const diplomatic = /союз|друж|помощ|вместе|обмен|сотруднич/.test(lower)
    recordRelationship(profile, username, diplomatic ? 2 : sameFaction ? 1 : 0.25, message)
    const addressed = lower.includes(profile.name.toLowerCase())
    const invite = /привет|вместе|союз|лагер|посел|помощ|где ты/.test(lower)
    if (addressed || (invite && Math.random() < 0.22)) {
      const replies = [
        'Я услышал тебя. Давай обсудим это чуть позже.',
        'Хорошая мысль. Запомню!',
        'Я сейчас исследую окрестности, скоро поделюсь находками.',
        'Можем держаться поблизости и помогать друг другу.'
      ]
      if (Date.now() - state.lastChat > 18000) {
        state.lastChat = Date.now()
        say(bot, username + ', ' + replies[rand(0, replies.length - 1)])
      }
    }
  })

  bot.on('kicked', reason => console.log('[KICK] ' + profile.name + ': ' + reason))
  bot.on('error', error => console.log('[ERROR] ' + profile.name + ': ' + error.message))
  bot.once('end', () => {
    console.log('[OFFLINE] ' + profile.name)
    if (state.bot !== bot) return
    state.bot = null
    state.busy = false
    if (!shuttingDown) {
      state.retry = (state.retry || 0) + 1
      const delay = Math.min(30000, 3000 * state.retry)
      console.log('[RECONNECT] ' + profile.name + ' in ' + delay + 'ms')
      setTimeout(() => makeAgent(profile, state), delay)
    }
  })
}

async function moveNear(bot, position, range = 3) {
  if (!bot.entity || !bot.pathfinder) return false
  await bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, range))
  return true
}

async function gatherWood(bot, profile) {
  const names = ['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log','pale_oak_log']
  const ids = names.map(name => bot.registry.blocksByName[name]?.id).filter(id => id !== undefined)
  if (!ids.length) return 0
  let collected = 0
  for (let i = 0; i < 2 && bot.entity; i++) {
    const target = bot.findBlock({ matching: ids, maxDistance: 20 })
    if (!target) break
    try {
      await moveNear(bot, target.position, 2)
      const block = bot.blockAt(target.position)
      if (block && bot.canDigBlock(block)) {
        await bot.dig(block)
        collected++
        memory[profile.name].stats.woodCollected++
      }
    } catch (error) {
      console.log('[GATHER] ' + profile.name + ': ' + error.message)
      break
    }
  }
  if (collected) remember(profile.name, 'Собрал древесину: +' + collected)
  return collected
}

async function explore(bot, profile) {
  if (!bot.entity) return
  const origin = bot.entity.position
  const target = origin.offset(rand(-18, 18), 0, rand(-18, 18))
  try {
    await moveNear(bot, target, 4)
    rememberPosition(profile, bot)
    memory[profile.name].stats.journeys++
    const biome = bot.blockAt(bot.entity.position)?.name || 'неизвестная местность'
    if (!memory[profile.name].discoveries.includes(biome)) {
      memory[profile.name].discoveries.push(biome)
      remember(profile.name, 'Нашёл новую местность: ' + biome)
      if (Date.now() - bot._lastDiscoveryChat > 60000 || !bot._lastDiscoveryChat) {
        bot._lastDiscoveryChat = Date.now()
        say(bot, 'Я исследую местность: ' + biome + '.')
      }
    }
  } catch {}
}

async function buildStarterCamp(bot, profile) {
  const logs = bot.inventory.items().filter(item => item.name.endsWith('_log'))
  if (!logs.length) return false
  const plankName = logs[0].name.replace('_log', '_planks')
  const plankType = bot.registry.itemsByName[plankName]
  if (!plankType) return false
  try {
    const recipe = bot.recipesFor(plankType.id, null, 1, null)[0]
    if (recipe) await bot.craft(recipe, Math.min(2, logs[0].count), null)
    const planks = bot.inventory.items().find(item => item.name.endsWith('_planks'))
    if (!planks || !bot.entity) return false
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (!below || below.boundingBox !== 'block') return false
    await bot.equip(planks, 'hand')
    const directions = [{x:1,y:0,z:0},{x:0,y:0,z:1},{x:-1,y:0,z:0},{x:0,y:0,z:-1}]
    let placed = 0
    for (const direction of directions) {
      const reference = bot.blockAt(below.position.offset(direction.x, 0, direction.z))
      if (!reference || reference.boundingBox !== 'block') continue
      try {
        await bot.placeBlock(reference, {x:0,y:1,z:0})
        placed++
        memory[profile.name].stats.blocksPlaced++
      } catch {}
      if (placed >= 2) break
    }
    if (placed) {
      remember(profile.name, 'Обустроил первые блоки лагеря')
      return true
    }
  } catch (error) {
    console.log('[BUILD] ' + profile.name + ': ' + error.message)
  }
  return false
}

async function socialMoment(bot, profile, state) {
  if (Date.now() - state.lastChat < 45000) return
  state.lastChat = Date.now()
  const thought = await generateChat(profile, memory[profile.name])
  const phrases = [
    'Как у вас дела? Я продолжаю обустраиваться.',
    'Если найдёте удобное место для поселения, расскажите.',
    'Давайте обмениваться новостями об исследованных местах.',
    'Постепенно собираю ресурсы для своего лагеря.'
  ]
  say(bot, thought || phrases[rand(0, phrases.length - 1)])
}

async function runAgent(bot, profile, state) {
  if (state.busy || !state.started || state.bot !== bot) return
  state.busy = true
  state.retry = 0
  try {
    while (state.started && state.bot === bot && bot.entity) {
      if (profile.role === 'gatherer') {
        await gatherWood(bot, profile)
        if (Math.random() < 0.2) await explore(bot, profile)
      } else if (profile.role === 'builder') {
        await gatherWood(bot, profile)
        if (Math.random() < 0.6) await buildStarterCamp(bot, profile)
        else await explore(bot, profile)
      } else {
        await explore(bot, profile)
        if (Math.random() < 0.3) await gatherWood(bot, profile)
      }
      if (state.bot !== bot || !bot.entity) break
      if (Math.random() < 0.18) await socialMoment(bot, profile, state)
      await wait(rand(3500, 6500))
    }
  } finally {
    if (state.bot === bot) state.busy = false
  }
}

async function main() {
  if (profiles.length !== 19) throw new Error('bots.json must contain exactly 19 agents')
  console.log('[BOOT] ' + profiles.length + ' agents -> ' + HOST + ':' + PORT + ' (Minecraft ' + VERSION + ')')
  for (const profile of profiles) {
    const state = { bot: null, started: false, busy: false, retry: 0, lastChat: 0 }
    agents.set(profile.name, { profile, state })
    makeAgent(profile, state)
    await wait(1200)
  }
  console.log('[BOOT] All connection attempts started. Runtime memory: ' + MEMORY_FILE)
}

process.on('SIGINT', () => {
  shuttingDown = true
  console.log('[STOP] Disconnecting agents...')
  for (const { state } of agents.values()) {
    if (state.bot) state.bot.quit('AI SMP runtime stopping')
  }
  saveMemory()
  setTimeout(() => process.exit(0), 500)
})

process.on('SIGTERM', () => {
  shuttingDown = true
  for (const { state } of agents.values()) if (state.bot) state.bot.quit('AI SMP runtime stopping')
  saveMemory()
  setTimeout(() => process.exit(0), 500)
})

main().catch(error => { console.error(error); process.exit(1) })
