const profiles = require('./bots.json')
const names = new Set(profiles.map(p => p.name))
const factions = new Set(profiles.map(p => p.faction))
const roles = new Set(['scout', 'gatherer', 'builder'])
const errors = []
if (profiles.length !== 19) errors.push('Expected exactly 19 agents; got ' + profiles.length)
if (names.size !== profiles.length) errors.push('Agent names must be unique')
if (factions.size !== 3) errors.push('Expected exactly 3 civilizations; got ' + factions.size)
for (const p of profiles) {
  if (!p.name || !/^AI_[A-Za-z]+$/.test(p.name)) errors.push('Invalid player name: ' + p.name)
  if (!roles.has(p.role)) errors.push('Invalid role for ' + p.name + ': ' + p.role)
  if (!p.style || !p.greeting || !p.faction || !p.factionGoal) errors.push('Missing profile fields for ' + p.name)
}
for (const faction of factions) {
  const count = profiles.filter(p => p.faction === faction).length
  if (count < 5) errors.push('Civilization ' + faction + ' has too few members: ' + count)
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log('Validated ' + profiles.length + ' agents across ' + factions.size + ' civilizations.')
