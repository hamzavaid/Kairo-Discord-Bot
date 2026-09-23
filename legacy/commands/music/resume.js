module.exports = {
  name: `resume`,
  names: [`continue`, `res`],
  cooldown: 5,
  desc: `Resumes any current song`,
  async execute(message, args, client) {
    if (!message.member.voice.channel) return message.channel.send(client.embeds.NotInVoice(message))
    if (!message.guild.voice.channel) return message.channel.send(client.embeds.BotNotInVoice(message, client))
    if (message.guild.me.voice.channel.id !== message.member.voice.channel.id) return message.channel.send(client.embeds.NotInSameVoice(message, client))
    if (!client.player.getQueue(message)) return message.channel.send(client.embeds.NoQueue())
    if (!client.player.getQueue(message).paused) return message.channel.send(`Song is already playing`)

    client.player.getQueue(message).pause();
    message.channel.send(`Song Has Been Resumed`)
  }
}