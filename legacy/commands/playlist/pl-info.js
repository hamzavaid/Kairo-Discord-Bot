const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message } = require(`discord.js`);
const { Playlist, Library, IdMaker } = require(`../../util/playlist.js`);

module.exports = {
  name: `pl-info`,
  cooldown: 5,
  desc: `Info about Playlists`,
  /**
   * @param {Message} message 
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, guild, channel } = message;

    if (!args[0]) return channel.send({ embeds: [client.embeds.NoArgument()] })
    let search = args.join(` `);

    let Lib = new Library(message, client);
    let playlist = await Lib.findGlobalPlaylist(search)
    if (playlist == undefined) return channel.send({ embeds: [client.embeds.NoPlaylist()] })
    if (!playlist.public && author.id != client.settings.dev) return channel.send({ embeds: [client.embeds.NoPlaylist()] })
    
    let embed = new MessageEmbed()
      .setColor(client.info.color)
      .setFooter(client.info.footer)
      .setTimestamp()
      .setThumbnail(playlist.thumbnail)
      .setDescription(playlist.description)
      .setTitle(`Playlist Info`)
      .addField(`**Playlist Details**`, `**Name:** \`${playlist.name}\`\n**ID**: \`${playlist.id}\`\n**Owner:** \`${author.username} - (${author.id})\`\n**Number of Songs:** \`${playlist.songs.length} Songs\`\n**Likes:** \`${playlist.likes}\``);

    playlist.songs.length > 0 ? embed.addField(`**Songs**`, playlist.songs.map((pl, i) => `**${i+1}.)** ${pl.title} By ${pl.artists[0].name}\n\`${pl.url}\``).join(`\n`)) : null

    channel.send({ embeds: [embed] })

  }
}