const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const bots = require('./bots.json')

const HOST = process.env.MC_HOST || '127.0.0.1'
const PORT = Number(process.env.MC_PORT || 25565)
const VERSION = process.env.MC_VERSION || '26.2'
const START_TAG = '[AI SMP]'
const agents = new Map()

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const say = (bot, message) => {
  if (bot.entity) bot.chat(message.slice(0, 180))
}

function createAgent(profile, index) {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: profile.name,
    auth: 'offline',
    version: VERSION,
    hideErrors: false
  })
  bot.loadPlugin(pathfinder)
  const state = { started: false, busy: false, lastChat: 0 }
  agents.set(profile.name, { bot, profile, state })

  bot.once('spawn', () => {
    const movements = new Movements(bot)
    movements.canDig = true
    movements.allow1by1towers = false
    bot.pathfinder.setMovements(movements)
    console.log(`[JOIN] ${profile.name} connected (${index + 1}/${bots.length})`)
  })

  bot.on('message', json => {
    const message = json.toString()
    if (message.includes(START_TAG) && message.includes('СТАРТ!') && !state.started) {
      state.started = true
      say(bot, profile.greeting)
      runAgent(bot, profile, state).catch(err => console.error(`[${profile.name}] task:`, err.message))
    }
  })

  bot.on('kicked', reason => console.log(`[KICK] ${profile.name}: ${reason}`))
  bot.on('error', err => console.log(`[ERROR] ${profile.name}: ${err.message}`))
  bot.on('end', () => {
    console.log(`[END] ${profile.name} disconnected`)
    agents.delete(profile.name)
  })
  return bot
}

async function moveNear(bot, position, range = 2) {
  if (!bot.entity || !bot.pathfinder) return
  await bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, range))
}

async function gatherWood(bot) {
  const logIds = ['oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log']
    .map(name => bot.registry.blocksByName[name]?.id).filter(id => id !== undefined)
  for (let i = 0; i < 3 && bot.entity; i++) {
    const target = bot.findBlock({ matching: logIds, maxDistance: 24 })
    if (!target) return
    try {
      await moveNear(bot, target.position, 2)
      const block = bot.blockAt(target.position)
      if (block && bot.canDigBlock(block)) await bot.dig(block)
    } catch (err) {
      console.log(`[${bot.username}] gathering: ${err.message}`)
    }
  }
}

async function explore(bot) {
  if (!bot.entity) return
  const p = bot.entity.position
  const dx = Math.floor(Math.random() * 25) - 12
  const dz = Math.floor(Math.random() * 25) - 12
  try {
    await moveNear(bot, p.offset(dx, 0, dz), 3)
  } catch {}
}

async function buildSmallCamp(bot) {
  const log = bot.inventory.items().find(item => /_log$/.test(item.name))
  if (!log) return
  const plankName = log.name.replace('_log', '_planks')
  const plank = bot.registry.itemsByName[plankName]
  if (!plank) return
  try {
    const recipes = bot.recipesFor(plank.id, null, 1, null)
    if (recipes.length) await bot.craft(recipes[0], Math.min(4, log.count))
    const blocks = bot.inventory.items().filter(item => item.name.endsWith('_planks'))
    const material = blocks[0]
    if (!material || !bot.entity) return
    const base = bot.blockAt(bot.entity.position.offset(2, -1, 0))
    if (!base || base.boundingBox !== 'block') return
    await bot.equip(material, 'hand')
    const offsets = [[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]]
    for (const [x,z] of offsets) {
      const reference = bot.blockAt(base.position.offset(x,0,z))
      if (reference && reference.boundingBox === 'block') {
        await bot.placeBlock(reference, {x:0,y:1,z:0})
      }
    }
  } catch (err) {
    console.log(`[${bot.username}] building: ${err.message}`)
  }
}

async function runAgent(bot, profile, state) {
  if (state.busy) return
  state.busy = true
  try {
    while (state.started && bot.entity) {
      if (profile.role === 'gatherer') await gatherWood(bot)
      else if (profile.role === 'builder') {
        await gatherWood(bot)
        await buildSmallCamp(bot)
      } else await explore(bot)
      await wait(2500 + Math.floor(Math.random() * 3500))
    }
  } finally {
    state.busy = false
  }
}

async function main() {
  console.log(`AI SMP agent runtime: ${bots.length} agents -> ${HOST}:${PORT} (MC ${VERSION})`)
  if (bots.length !== 19) throw new Error('bots.json must contain exactly 19 agents')
  for (let i = 0; i < bots.length; i++) {
    createAgent(bots[i], i)
    await wait(1400)
  }
  console.log('All connection attempts have been started. Waiting for the plugin countdown.')
}

process.on('SIGINT', () => {
  console.log('Stopping all agents...')
  for (const { bot } of agents.values()) bot.quit('AI SMP runtime stopping')
  process.exit(0)
})

main().catch(err => { console.error(err); process.exit(1) })
