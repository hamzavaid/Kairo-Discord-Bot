module.exports = {
  name: `shuffle`,
  names: [`random`, `shuf`],
  cooldown: 5,
  desc: `Shuffles the queue`,
  async execute(message, args, client) {
    if (!message.member.voice.channel) return message.channel.send(client.embeds.NotInVoice(message))
    if (!message.guild.voice.channel) return message.channel.send(client.embeds.BotNotInVoice(message, client))
    if (message.guild.me.voice.channel.id !== message.member.voice.channel.id) return message.channel.send(client.embeds.NotInSameVoice(message, client))
    if (!client.player.getQueue(message)) return message.channel.send(client.embeds.NoQueue())

    let construct = client.player.getQueue(message)
    
    if (construct.queue.length <= 1) return message.channel.send(`**${client.info.emojis.exclamation_question} No need to shuffle queue if there is only 1 song in queue**`)
    construct.shuffle();
    return message.channel.send(`**Queue Has Been Shuffled**`)

  }
}