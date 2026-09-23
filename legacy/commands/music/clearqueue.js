module.exports = {
  name: `clearqueue`,
  names: [`clear`, `cl`],
  cooldown: 5,
  desc: `Clears the queue`,
  async execute(message, args, client) {
    if (!message.member.voice.channel) return message.channel.send(client.embeds.NotInVoice(message))
    if (message.guild.me.voice.channel && message.guild.me.voice.channel.id !== message.member.voice.channel.id) return message.channel.send(client.embeds.NotInSameVoice(message, client))
    if (!client.player.getQueue(message)) return message.channel.send(client.embeds.NoQueue())
    
    let construct = client.player.getQueue(message);
    construct.clear();
    message.channel.send(`**Queue has been cleared**`)
  }
}