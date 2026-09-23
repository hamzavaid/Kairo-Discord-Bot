const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message } = require(`discord.js`);
const { Library, IdMaker } = require(`../../util/playlist.js`);
const { BetterArr } = require("../../util/util.js");

module.exports = {
  name: `pl-add`,
  cooldown: 5,
  desc: `Adds a song to the playlist`,
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

    let songs = new BetterArr(playlist.songs);
    let search = argu[1];
    let track = await client.player.queryType(search, message, true);
    if (!track) return;

    if (songs.length == 100) return channel.send({ embeds: [client.embeds.MaxSongs()] })
    let newsongs = songs;
    newsongs.push(track);
    playlist.songs = newsongs;

    await Lib.editPlaylist(playlist);
    channel.send(`**Added ${track.title} - ${track.url} Playlist "${playlist.name}"**`)

  }
}