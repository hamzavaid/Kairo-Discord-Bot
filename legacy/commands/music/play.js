module.exports = {
  name: `play`,
  names: [`p`],
  cooldown: 5,
  desc: `Plays a song`,
  async execute(message, args, client) {
    if (!args[0]) return message.channel.send(`No Song Added`);

    if (!message.member.voice.channel) return message.channel.send(client.embeds.NotInVoice(message));
    if (message.guild.me.voice.channel && message.guild.me.voice.channel.id !== message.member.voice.channel.id) return message.channel.send(client.embeds.NotInSameVoice(message, client))

    let queue = client.player.getQueue(message.guild);
    queue = queue == undefined ? client.player.createQueue(message.guild, { metadata: { channel: message.channel } }) : queue;

    try {
      if (!queue.connection) await queue.connect(message.member.voice.channel);
    } catch {
      queue.destroy();
      return await message.channel.send({ content: "Could not join your voice channel!" });
    }

    let search = args.join(` `);
    const track = await client.player.search(search, { requestedBy: message.author }).then(x => x.tracks[0])
    if (!track) return await message.channel.send({ content: `Song could not be found` })

    queue.play(track)

    message.channel.send(`**${client.info.emojis.headphones} Searching for \`${search}\`**`)
  }
}