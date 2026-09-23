const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message, MessageActionRow, MessageButton } = require(`discord.js`);
const { Playlist, Library, IdMaker } = require(`../../util/playlist.js`);

function embedMaker(client) {

  let prefix = client.settings.prefix;

  let info = {
    name: { desc: `Changes the name of selected Playlist`, usage: `*\\${prefix}pl-edit name "Playlist Id" "Name"*`, aliases: [] },
    public: { desc: `Changes the state of viewing for a Playlist`, usage: `*\\${prefix}pl-edit public "Playlist Id" "State"*`, aliases: [] },
    thumbnail: { desc: `Changes the picture of the Playlist`, usage: `*\\${prefix}pl-edit thumbnail "Playlist Id" "Thumbnail"*`, aliases: [`Picture`, `Pic`] },
    desc: { desc: `Changes the description of a Playlist`, usage: `*\\${prefix}pl-edit name "Playlist Id" "Description"*`, aliases: [`Description`] },
  }

  let helpEmb = new MessageEmbed()
    .setColor(client.info.color)
    .setFooter(client.info.footer)
    .setTimestamp()
    .setTitle(`__PL-EDIT__ Command`)
    .setDescription(`All Sub-Commands for \`*pl-edit\`\nYou can change almost everything about your own Playlist!`);

  let str = `\n`;
  let keys = Object.keys(info);

  for (let i = 0; i < keys.length; i++) {
    let name = keys[i];
    let val = info[keys[i]];

    str += `**\\${prefix}pl-edit ${name}**\n${val.desc}\n__Usage:__ ${val.usage}\n`
    val.aliases.length > 0 ? str += `__Alisases:__ \`${val.aliases.join(`, `)}\`\n` : null
    str += `\n`
  }

  helpEmb.addField(`\u200B`, str)
  return helpEmb
}

module.exports = {
  name: `pl-edit`,
  cooldown: 5,
  desc: `Edits Playlists`,
  // *pl-edit [ name, public, thumbnail, desc | description ]
  /**
   * @param {Message} message 
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, guild, channel } = message;

    if (!args[0]) return channel.send({ embeds: [embedMaker(client)] })  //sendEmb(channel, `NoArgument`)

    let type = args.shift();

    if (![`name`, `public`, `thumbnail`, `desc`, `description`].some(el => type.toLowerCase() == el)) return channel.send({ embeds: [client.embeds.InvalidArgument()] })

    let authorLib = await Libraries.findOne({ author: author.id })
    let Lib = new Library(message, client, authorLib);
    let argu = client.util.splitQuote(args.join(` `))
    if (!argu) return channel.send({ embeds: [client.embeds.InvalidArgument()] }) //sendEmb(channel, `InvalidArgument`)

    let oldPlaylist = Lib.findPlaylist(argu[0]);
    if (oldPlaylist == undefined) return channel.send({ embeds: [client.embeds.NoPlaylist()] })

    if (!argu[1]) {
      let rest = args.slice(args.indexOf(argu.split(` `)[argu.split(` `).length - 1]), args.length)
      argu[1] = rest
    }

    switch (type.toLowerCase()) {
      case "name":
        oldPlaylist.setName(argu[1]);
        await Lib.editPlaylist(oldPlaylist)
        channel.send(`**Changed name to "${oldPlaylist.name}"**`)
        break;
      case "public":
        oldPlaylist.setPublic(argu[1] ? argu[1] : undefined)
        await Lib.editPlaylist(oldPlaylist)
        channel.send(`**Changed publicity to "${oldPlaylist.public}"**`)
        break;
      case "pic":
      case "picture":
      case "thumbnail":
        oldPlaylist.setThumbnail(argu[1])
        await Lib.editPlaylist(oldPlaylist)
        channel.send(`**Changed thumbnail to "${oldPlaylist.thumbnail}"**`)
        break;
      case "description":
      case "desc":
        oldPlaylist.setDesc(argu[1]);
        await Lib.editPlaylist(oldPlaylist)
        channel.send(`**Changed description to "${oldPlaylist.description}"**`)
        break;
      default:
        channel.send({ embeds: [client.embeds.InvalidArgument()] })
        break;
    }

  }
}

/*
    let helpEmb = new MessageEmbed()
      .setColor(client.info.color)
      .setFooter(client.info.footer)
      .setTimestamp()
      .setTitle(`__PL-EDIT__ Command`)
      .setDescription(`All Sub-Commands for \`*pl-edit\``)
      .addField(`\u200B`, `
**\\${prefix}pl-edit name**
Changes the name of selected Playlist
__Usage:__ *\\${prefix}pl-edit name "Playlist Id" "Name"*

**\\${prefix}pl-edit public**
Changes the state of viewing for a Playlist
__Usage:__ *\\${prefix}pl-edit public "Playlist Id" "State"*

**\\${prefix}pl-edit thumbnail**
Changes the picture of the Playlist
__Usage:__ *\\${prefix}pl-edit thumbnail "Playlist Id" "Thumbnail"*
__Alisases:__ \`Picture, Pic\`

**\\${prefix}pl-edit desc**
Changes the description of a Playlist
__Usage:__ *\\${prefix}pl-edit name "Playlist Id" "Description"*
__Alisases:__ \`Description\`
`)
*/