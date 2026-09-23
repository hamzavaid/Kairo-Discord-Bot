const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message } = require(`discord.js`);
const { Playlist, Library, IdMaker } = require(`../../util/playlist.js`);

module.exports = {
  name: `lib-info`,
  cooldown: 5,
  desc: `Info about Libraries`,
  /**
   * @param {Message} message 
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, guild, channel } = message;

    let Lib = await Libraries.findOne({ author: author.id });
    if (Lib == undefined) return channel.send({ embeds: [client.embeds.NoLibrary()] })

    let embed = new MessageEmbed()
      .setColor(client.info.color)
      .setFooter(client.info.footer)
      .setTimestamp()
      .setTitle(`${message.member.displayName}'s Library`)
      .addField(`**Library Details**`, `**Owner:** \`${author.username} - (${author.id})\`\n**Number of Playlists:** \`${Lib.playlists.length} Playlists\`\n**Number of Liked Songs:** \`${Lib.songs.length} Songs\``);

    Lib.playlists.length > 0 ? embed.addField(`**Playlists**`, Lib.playlists.map((pl, i) => `**${i+1}.)** ${pl.name} - ${pl.id}`).join(`\n`)) : null
    Lib.liked.length > 0 ? embed.addField(`**Liked Playlists**`, Lib.liked.map((pl, i) => `**${i+1}.)** ${pl.name} - ${pl.id}`).join(`\n`)) : null
    Lib.songs.length > 0 ? embed.addField(`**Liked Songs**`, Lib.songs.map((pl, i) => `**${i+1}.)** ${pl.title} - ${pl.url}`).join(`\n`)) : null

    channel.send({ embeds: [embed] })

  }
}