const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message } = require(`discord.js`);
const { Playlist, Library, IdMaker } = require(`../../util/playlist.js`);

module.exports = {
  name: `pl-delete`,
  cooldown: 5,
  desc: `Deletes a playlist that you own`,
  /**
   * 
   * @param {Message} message 
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, guild, channel } = message;

    if (!args[0]) return channel.send({ embeds: [client.embeds.NoArgument()] })
    let search = args.join(` `);

    let library = await Libraries.findOne({ author: author.id });
    if (!library) return channel.send({ embeds: [client.embeds.NoLibrary()] })
    let Librar = new Library(message, client, library);

    let playlist = Librar.findPlaylist(search);
    if (playlist == undefined) return channel.send({ embeds: [client.embeds.NoPlaylist()] })

    await Librar.removePlaylist(playlist);
    channel.send({ embeds: [new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp().setTitle(`Playlist Removed`).setDescription(`**Playlist with name "${playlist.name}" has been deleted**`)] })
  }
}