// Deterministic mock connections used by both Node fixture tests and the
// browser test page. Five friends, two cliques + one bridge.
module.exports = {
  '111': {
    username: 'alice', tag: '@alice', displayName: 'Alice',
    avatarUrl: 'https://cdn.discordapp.com/avatars/111/avatar.png?size=128',
    id: '111', profileUrl: 'https://discord.com/users/111',
    serverNicknames: [{ guildId: 'g1', nick: 'al' }, { guildId: 'g2', nick: 'A' }],
    mutualServers: [],
    connections: ['222', '333']
  },
  '222': {
    username: 'bob', tag: '@bob', displayName: 'Bob',
    avatarUrl: 'https://cdn.discordapp.com/avatars/222/avatar.png?size=128',
    id: '222', profileUrl: 'https://discord.com/users/222',
    serverNicknames: [],
    mutualServers: [],
    connections: ['111', '333']
  },
  '333': {
    username: 'carol', tag: '@carol', displayName: 'Carol',
    avatarUrl: 'https://cdn.discordapp.com/avatars/333/avatar.png?size=128',
    id: '333', profileUrl: 'https://discord.com/users/333',
    serverNicknames: [],
    mutualServers: [],
    connections: ['111', '222', '444']
  },
  '444': {
    username: 'dave', tag: '@dave', displayName: 'Dave',
    avatarUrl: 'https://cdn.discordapp.com/avatars/444/avatar.png?size=128',
    id: '444', profileUrl: 'https://discord.com/users/444',
    serverNicknames: [],
    mutualServers: [],
    connections: ['333', '555']
  },
  '555': {
    username: 'eve', tag: '@eve', displayName: 'Eve',
    avatarUrl: 'https://cdn.discordapp.com/avatars/555/avatar.png?size=128',
    id: '555', profileUrl: 'https://discord.com/users/555',
    serverNicknames: [],
    mutualServers: [],
    connections: ['444']
  }
};
