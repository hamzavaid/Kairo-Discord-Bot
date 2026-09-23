const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message } = require(`discord.js`);
const { Playlist, Library, IdMaker } = require(`../../util/playlist.js`);

module.exports = {
  name: `pl-create`,
  cooldown: 5,
  desc: `Creates a playlist`,
  /**
   * 
   * @param {Message} message 
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, guild, channel } = message;
    if (!args[0]) return channel.send(client.embeds.NoArgument())
    let name = args.join(` `);
    
    let library = await Libraries.findOne({ author: author.id });
    let id;
    if (library == undefined) {

      id = await IdMaker();
      let playlist = new Playlist({ name, author: author.id, id })

      await Libraries({
        author: author.id,
        playlists: [playlist],
        liked: [],
        songs: []
      }).save();
      console.log(playlist)

    } else {
      let Librar = new Library(message, client, library)
      let playlists = Librar.playlists;
      if (playlists.map(pl => pl.name).includes(name)) return channel.send({ embeds: [client.embeds.NameTaken(name)] })
      if (playlists.length >= 10) return channel.send({ embeds: [client.embeds.MaxPlaylists()] })

      id = await IdMaker();
      let newplay = new Playlist({ name, author: author.id, id })
      playlists.push(newplay)

      await Libraries.findOneAndUpdate({ author: author.id }, { playlists: playlists })
      console.log(newplay)
    }

    return channel.send({ embeds: [client.embeds.PlaylistCreate(message, name, id)] })
  }
}