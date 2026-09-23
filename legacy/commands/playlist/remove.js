const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message } = require(`discord.js`);
const { Library, IdMaker } = require(`../../util/playlist.js`);
const { BetterArr } = require("../../util/util.js");

module.exports = {
  name: `pl-remove`,
  cooldown: 5,
  desc: `Removes a song to the playlist`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, channel, guild } = message;

    if (!args[0]) return channel.send({ embeds: [client.embeds.NoArgument()] })
    let argu = client.util.splitQuote(args.join(` `));
    if (!argu) return channel.send({ embeds: [client.embeds.InvalidArgument()] })

    let lib = await Libraries.findOne({ author: author.id });
    let Lib = new Library(message, client, lib);

    let playlist = Lib.findPlaylist(argu[0]);
    if (!playlist) return channel.send({ embeds: [client.embeds.NoPlaylist()] })

    let search = argu[1];
    let track = await client.player.queryType(search, message, true);
    if (!track) return;

    let checkSong = Lib.songCheck(search, playlist);
    if (checkSong == undefined) return channel.send({ embeds: [client.embeds.NoSong()] })

    playlist.songs.splice(checkSong, 1);

    await Lib.editPlaylist(playlist);
    channel.send(`**Removed ${track.title} - ${track.url} Playlist "${playlist.name}"**`)

  }
}