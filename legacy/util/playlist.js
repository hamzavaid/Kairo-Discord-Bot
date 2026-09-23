const { MessageEmbed, Client, Message, MessageActionRow, MessageButton, MessageSelectMenu } = require(`discord.js`);
const { BetterArr, Util } = require(`./util.js`);
const Libraries = require(`../schemas/library.js`);

async function IdMaker() {
  let libraries = await Libraries.find();
  let ids = libraries.flatMap(lib => lib.playlists.map(pl => pl.id));
  if (ids.length == 0) return `0000001`
  ids.sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
  let id = `${Number.parseInt(ids[ids.length - 1]) + 1}`;
  if (id.length < 7) {
    let missing = 7 - id.length;
    let string = ``;
    for (i = 0; i < missing; i++) { string += `0` }
    id = `${string}${id}`
  }
  return id
}

const info = {
  color: `#3fbf9b`,
  prefix: process.env.PREFIX,
  errColor: `#73110a`,
  footer: `Made By Sun#4798 || Dm if any issues!`,
  footerImg: `https://64.media.tumblr.com/50b0f8b09564ece765e0f1f1dbeb3f0f/44508fffb1ecb43e-92/s800x448/3b361e24656372acc1254910cec552d1c5798b74.gif`,
  emojis: {
    X: `❌`,
    exclamation_question: `⁉️`,
    headphones: `🎧`,
  }
};

class LibUtil extends Util {
  /**
   * @param {Client} client 
   */
  constructor(client, library) {
    super(client)

    this.library = library || null;

    this.depth = {
      Library_Menu: {
        Playlist_Menu: {
          Indiv_Playlist: {
            add: `return Indiv_Playlist`,
            remove: `return Indiv_Playlist`,
            save: `return Indiv_Playlist`,
            play: `return Indiv_Playlist`,
            edit_menu: {
              name: `return edit_menu`,
              public: `return edit_menu`,
              thumbnail: `return edit_menu`,
              desc: `return edit_menu`,
              __return: `Indiv_Playlist`
            },
            playlists_info: `return Indiv_Playlist`,
            second_delete: `return Playlist_Menu`,
            __return: `Playlist_Menu`
          },
          create: `return Playlist_Menu`,
          delete: `return Playlist_Menu`,
          playlist_info: `return Playlist_Menu`,
          __return: `Library_Menu`
        },
        Liked_Playlist: {
          Liked_Indiv_Playlist: {
            pl_remove: `return Liked_Indiv_Playlist`,
            pl_play: `return Liked_Indiv_Playlist`,
            pl_info: `return Liked_Indiv_Playlist`,
            __return: `Liked_Playlist`,
          },
          pl_like: `return Liked_Playlist`,
          pl_unlike: `return Liked_Playlist`,
          liked_info: `return Liked_Playlist`,
          __return: `Library_Menu`
        },
        Liked_Songs: {
          so_add: `return Liked_Songs`,
          so_remove: `return Liked_Songs`,
          so_info: `return Liked_Songs`,
          __return: `Library_Menu`
        },
        Lib_Info: `return Library_Menu`
      }
    }

    this.buttons = {
      home: new MessageButton({ customId: `home`, emoji: `🏠`, style: `PRIMARY` }),
      back: new MessageButton({ customId: `back`, emoji: `◀️`, style: `PRIMARY` }),
      previous: new MessageButton({ customId: `previous`, emoji: `🔵`, style: `PRIMARY` }),
      exit: new MessageButton({ customId: `exit`, emoji: `❌`, style: `PRIMARY` }),
      lastpage: new MessageButton({ customId: `left`, emoji: `⬅️`, style: `SUCCESS` }),
      nextpage: new MessageButton({ customId: `right`, emoji: `➡️`, style: `SUCCESS` }),
      confirm: new MessageButton({ customId: `confirm`, emoji: `💠`, style: `SUCCESS` }),
      decline: new MessageButton({ customId: `decline`, emoji: `🔱`, style: `SUCCESS` }),
    }

    this.selectMenus = {
      Library_Menu: new MessageSelectMenu().addOptions([
        { label: `Playlists`, value: `Playlist_Menu`, description: `Playlist Menu for creating or editing playlists`, emoji: `🎹` },
        { label: `Liked Playlists`, value: `Liked_Playlist`, description: `Playlist Menu for editing your Liked Playlists`, emoji: `🎤` },
        { label: `Liked Songs`, value: `Liked_Songs`, description: `Individual Playlist Menu consisting of all Liked Songs`, emoji: `📀` },
        { label: `Info`, value: `Lib_Info`, description: `Shows Information About Your Library`, emoji: `ℹ️` },
      ]).setCustomId(`library`).setPlaceholder(`Actions`).setMaxValues(1), //new MessageSelectMenu().addOptions([{ label: `Create a Playlist`, value: `create`, description: `Creates a playlist and prompts you info`, emoji: `🖊️` }]).setCustomId(`actions_selection`).setPlaceholder(`Actions`).setMaxValues(1)
      Playlist_Menu: new MessageSelectMenu().addOptions([
        { label: `Select`, value: `Indiv_Playlist`, description: `Selects a playlist to edit`, emoji: `🖱️` },
        { label: `Create`, value: `create`, description: `Creates a Playlist`, emoji: `🎻` },
        { label: `Delete`, value: `delete`, description: `Delete a Playlist`, emoji: `💥` },
        { label: `Info`, value: `playlists_info`, description: `Shows info about all your playlists`, emoji: `ℹ️` },
      ]).setCustomId(`playlist`).setPlaceholder(`Actions`).setMaxValues(1),
      Liked_Playlist: new MessageSelectMenu().addOptions([
        { label: `Select`, value: `Liked_Indiv_Playlist`, description: `Selects a playlist to view or change`, emoji: `🖱️` },
        { label: `Like`, value: `pl_like`, description: `Likes a Playlist`, emoji: `👍` },
        { label: `Remove`, value: `pl_unlike`, description: `Removes a Playlist from your liked Playlists`, emoji: `👎` },
        { label: `Info`, value: `liked_info`, description: `Shows info about all your liked playlists`, emoji: `ℹ️` },
      ]).setCustomId(`liked_playlist`).setPlaceholder(`Actions`).setMaxValues(1),
      Liked_Songs: new MessageSelectMenu().addOptions([
        { label: `Add`, value: `so_add`, description: `Addes a song to your liked songs`, emoji: `👍` },
        { label: `Play`, value: `so_play`, description: `Plays all the songs from your liked songs`, emoji: `🎵` },
        { label: `Remove`, value: `so_remove`, description: `Removes a song from your liked songs`, emoji: `👎` },
        { label: `Info`, value: `so_info`, description: `Shows info about all your liked songs`, emoji: `ℹ️` },
      ]).setCustomId(`liked_song`).setPlaceholder(`Actions`).setMaxValues(1),
      Indiv_Playlist: new MessageSelectMenu().addOptions([
        { label: `Add`, value: `add`, description: `Addes a song to this Playlist`, emoji: `👍` },
        { label: `Remove`, value: `remove`, description: `Removes a song from this Playlist`, emoji: `👎` },
        { label: `Save`, value: `save`, description: `Saves a song to your saved songs`, emoji: `❄️` },
        { label: `Edit`, value: `edit_menu`, description: `Edits the playlist info`, emoji: `🖊️` },
        { label: `Play`, value: `play`, description: `Plays all the songs from this playlist`, emoji: `🎵` },
        { label: `Delete`, value: `second_delete`, description: `Deletes a playlist`, emoji: `💥` },
        { label: `Info`, value: `playlist_info`, description: `Shows info about this playlist`, emoji: `ℹ️` },
      ]).setCustomId(`indiv_playlist`).setPlaceholder(`Actions`).setMaxValues(1),
      edit_menu: new MessageSelectMenu().addOptions([
        { label: `Name`, value: `name`, description: `Changes the name of a playlist`, emoji: `📛` },
        { label: `Public`, value: `public`, description: `Changes the publicity of a playlist`, emoji: `🚫` },
        { label: `Thumbnail`, value: `thumbnail`, description: `Changes the thumbnail of a playlist`, emoji: `🖼️` },
        { label: `Description`, value: `desc`, description: `Changes the description of a playlist`, emoji: `📜` },
      ]).setCustomId(`edit_menu`).setPlaceholder(`Actions`).setMaxValues(1),
      Liked_Indiv_Playlist: new MessageSelectMenu().addOptions([
        { label: `Remove`, value: `pl_remove`, description: `Removes Current Liked Playlist`, emoji: `❄️` },
        { label: `Play`, value: `pl_play`, description: `Plays all the songs from this playlist`, emoji: `🎵` },
        { label: `Info`, value: `pl_info`, description: `Shows info about Playlist`, emoji: `ℹ️` },
      ]).setCustomId(`liked_indiv_playlist`).setPlaceholder(`Actions`).setMaxValues(1),
    }

    this.menuEmbeds = {
      Library_Menu(message, library) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Library Menu`)
          .setThumbnail(message.author.avatarURL({ dynamic: true, size: 4096 }))
          .setDescription(`This Message will show everything about your Library.\nYou are able to change and update everything from here.\nThis includes making playlists, editing playlists, liking playlists, and much more.\n\nHave Fun and try not to get \`Lost\`!`)
          .setAuthor(`${message.author.username}'s Library`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Playlists [${library.playlists.length}]`, library.playlists.length > 0 ? `${library.playlists.slice(0, 10).map((p, i) => `${p.name} - ${p.id}`).join(`\n`)}` : `None`, true)
          .addField(`Liked Playlists [${library.liked.length}]`, library.liked.length > 0 ? `${library.liked.slice(0, 10).join(`\n`)}` : `None`, true)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n🎹 : Navigates to all your playlist\n🎤 : Navigates to all your liked playlists\n📀 : Navigates to all your liked songs\nℹ️ : Shows information about your Library`);

        return embed
      },
      Playlist_Menu(message, library) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Playlist Menu`)
          .setDescription(`This Menu is made to change everything about your playlists\nHave Fun!`)
          .setAuthor(`${message.author.username}'s Playlists`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Playlists [${library.playlists.length}]`, library.playlists.length > 0 ? `${library.playlists.slice(0, 10).map((p, i) => `${p.name} - ${p.id}`).join(`\n`)}` : `None`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖱️ : Select a Playlist to edit\n🎻 : Creates a Playlist\n💥 : Deletes a playlist\nℹ️ : Info about all your playlists`);

        return embed
      },
      Liked_Playlist(message, library) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Liked Playlist Menu`)
          .setDescription(`This Menu is made to change everything about your liked playlists\nHave Fun!`)
          .setAuthor(`${message.author.username}'s Liked Playlists`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Liked Playlists [${library.liked.length}]`, library.liked.length > 0 ? `${library.liked.slice(0, 10).join(`\n`)}` : `None`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n👍 : Addes a Playlist to your Liked Playlists\n👎 : Removes a Playlist from your Liked Playlists\nℹ️ : Info about all your liked songs`);

        return embed
      },
      Liked_Songs(message, library) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Liked Songs Menu`)
          .setDescription(`This Menu is made to change everything about your songs\nHave Fun!`)
          .setAuthor(`${message.author.username}'s Liked Songs`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Songs [${library.songs.length}]`, library.songs.length > 0 ? `${library.songs.slice(0, 10).map((p, i) => `${p.title}\n${p.url}\n`).join(`\n`)}` : `None`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n👍 : Likes a Song\n🎵 : Plays all songs from liked songs\n👎 : Removes a song from your liked songs\nℹ️ : Info about all your liked playlists`);

        return embed
      },
      Indiv_Playlist(message, library, playlist) {
        let embed = new MessageEmbed()
        .setColor(info.color)
        .setFooter(info.footer)
        .setTimestamp()
        .setTitle(`Individual Playlist Menu`)
        .setThumbnail(playlist.thumbnail)
        .setDescription(`This Menu is made to change everything about your playlist\nHave Fun!`)
        .setAuthor(`${message.author.username}'s Playlist Named ${playlist.name}`, message.author.avatarURL({ dynamic: true, size: 4096 }))
        .addField(`Songs [${playlist.songs.length}]`, playlist.songs.length > 0 ? `${playlist.songs.slice(0, 10).map((p, i) => `${p.title}\n${p.url}\n`).join(`\n`)}` : `None`)
        .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        .addField(`Selection Menu`, `Use the Selection Menu To input actions\n👍 : Addes a song to this playlist\n👎 : Removes a song from this playlist\n💥 : Deletes this playlist\n❄️ : Saves a song to your saved songs\n🖊️: Edits this playlist's Information\n🎵 : Plays all songs from liked songs\nℹ️ : Info about all your liked playlists`);

      return embed
      },
      edit_menu(message, library, playlist) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Playlist Edit Menu`)
          .setThumbnail(playlist.thumbnail)
          .setAuthor(`${message.author.username}'s Playlist Named ${playlist.name}`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .setDescription(`This Menu will give you the ability to change everything about this playlist`)
          .addField(`Songs [${playlist.songs.length}]`, playlist.songs.length > 0 ? `${playlist.songs.slice(0, 10).map((p, i) => `${p.title}\n${p.url}\n`).join(`\n`)}` : `None`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n📛 : Changes the name of the playlist\n🚫 : Changes the viewablitiy\n🖼️ : Changes the thumbnail of a playlist\n📜: Changes the description of a playlist`);

        return embed;
      },
      Lib_Info(message, library, playlist) {
        let embed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`${message.member.displayName}'s Library`)
          .addField(`**Library Details**`, `**Owner:** \`${message.author.username} - (${message.author.id})\`\n**Number of Playlists:** \`${library.playlists.length} Playlists\`\n**Number of Liked Songs:** \`${library.songs.length} Songs\``);

        library.playlists.length > 0 ? embed.addField(`**Playlists**`, library.playlists.slice(0, 10).map((pl, i) => `**${i+1}.)** ${pl.name} - ${pl.id}`).join(`\n`)) : null
        library.liked.length > 0 ? embed.addField(`**Liked Playlists**`, library.liked.slice(0, 10).map((pl, i) => `**${i+1}.)** ${pl.name} - ${pl.id}`).join(`\n`)) : null
        library.songs.length > 0 ? embed.addField(`**Liked Songs**`, library.songs.slice(0, 10).map((pl, i) => `**${i+1}.)** ${pl.title} - ${pl.url}`).join(`\n`)) : null

        return embed
      },
      playlist_info(message, library, playlist) {
        let embed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setAuthor(`${message.member.displayName}'s Playlist ${playlist.name}'`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .setThumbnail(playlist.thumbnail)
          .setDescription(playlist.description)
          .setTitle(`Playlist Info`)
          .addField(`**Playlist Details**`, `**Name:** \`${playlist.name}\`\n**ID**: \`${playlist.id}\`\n**Owner:** \`${message.author.username} - (${message.author.id})\`\n**Number of Songs:** \`${playlist.songs.length} Songs\`\n**Likes:** \`${playlist.likes}\``);
  
        playlist.songs.length > 0 ? embed.addField(`**Songs**`, playlist.songs.slice(0, 10).map((pl, i) => `**${i+1}.)** ${pl.title} By ${pl.artists[0].name}\n\`${pl.url}\``).join(`\n`)) : null

        return embed
      },
      Liked_Indiv_Playlist(message, __, _, liked) {
        let embed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setAuthor(`${message.member.displayName}'s Liked Playlist - "${liked.name}"`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .setThumbnail(liked.thumbnail)
          .setTitle(`Liked Playlist Menu`)
          .setDescription(`You will be able to remove or get info about this liked playlist\nHave Fun!`)
          .addField(`Songs [${liked.songs.length}]`, liked.songs.length > 0 ? `${liked.songs.slice(0, 10).map((p, i) => `${p.title}\n${p.url}\n`).join(`\n`)}` : `None`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n❄️ : Removes this playlist from your liked playlists\n🎵 : Plays all songs from liked songs\nℹ️ : Info about This Playlist`);

        return embed
      }
    }

  }

  stageUpdate(stage, interaction) {
    let values = Object.values(this.selectMenus).map(v => v.customId);
    if (values.some(v => v == interaction.customId)) {
      stage.perviousDepth = stage.currentDepth;
      stage.currentDepth = interaction.values[0];
    } else {
      switch (interaction.customId) {
        case "home":
          stage.perviousDepth = stage.currentDepth;
          stage.currentDepth = `Library_Menu`
          break;
        case "back":
          stage.perviousDepth = stage.currentDepth;
          let C_P = this.find(this.depth, stage.currentDepth);
          stage.currentDepth = C_P.parent[0]
          break;
        case "previous":
          let temp = stage.perviousDepth;
          stage.perviousDepth = stage.currentDepth;
          stage.currentDepth = temp;
          break;
      }
    }

  }

  arrCreation(state) {
    let arr = [ this.buttons.exit ];
    let childParent = this.find(this.depth, state.currentDepth);
    state.currentDepth != `Library_Menu` ? arr.push(this.buttons.home) : null;
    state.perviousDepth != childParent.parent[0] ? arr.push(this.buttons.previous) : null;
    state.perviousDepth != null && childParent.parent[0] != `First` ? arr.push(this.buttons.back) : null;

    return arr;
  }

  async findGlobalPlaylist(id) {
    if (!id) return
    let libraries = await Libraries.find();
    let playlists = libraries.flatMap(lib => lib.playlists)
    let playlist = playlists.find(pl => pl.name.toLowerCase() == id.toLowerCase())
    if (playlist != undefined) return playlist instanceof Playlist ? playlist : new Playlist(playlist);
    playlist = playlists.find(pl => pl.id == id)
    if (playlist != undefined) return playlist instanceof Playlist ? playlist : new Playlist(playlist);
    return undefined
  }

  async findOriginalLib(playlist) {
    if (!playlist) return
    let libraries = await Libraries.find();
    let library = libraries.find(lib => lib.playlists.find(pl => pl.id == playlist.id));
    if (library != undefined) return library instanceof Library ? library : new Library(this.message, this.client, library);
    library = libraries.find(lib => lib.playlists.map(pl => pl.name.toLowerCase() == playlist.toLowerCase()))
    if (library != undefined) return library instanceof Library ? library : new Library(this.message, this.client, library);
    library = libraries.find(lib => lib.playlists.map(pl => pl.id == playlist))
    if (library != undefined) return library instanceof Library ? library : new Library(this.message, this.client, library);
    return undefined
  }

  async removePlaylist(playlist) {
    let library = await this.findOriginalLib(playlist.name);
    if (library == undefined) return new Error(`No Library`)

    let playlists = new BetterArr(library.playlists);

    let names = playlists.map(pl => pl.name);
    let index = names.indexOf(playlist.name);
    playlists.splice(index, 1)

    await Libraries.findOneAndUpdate({ author: library.author }, { playlists: playlists });

    let libraries = await Libraries.find();
    let librariesLiked = libraries.filter(lib => lib.playlists.includes(playlist));
    for (let i = 0; i < librariesLiked.length; i++) {
      let lib = librariesLiked[i];
      let newpls = new BetterArr(lib.liked);
      newpls.remove(playlist);
      await Libraries.findOneAndUpdate({ author: lib.author }, { liked: newpls })
    }
  }

  async editPlaylist(playlist) {
    let library = await this.findOriginalLib(playlist.id);
    if (library == undefined) return new Error(`No Library`)

    let playlists = new BetterArr(library.playlists);

    playlists[playlists.map(pl => pl.id).indexOf(playlist.id)] = playlist;

    await Libraries.findOneAndUpdate({ author: library.author }, { playlists: playlists })

    let libraries = await Libraries.find();
    let librariesLiked = libraries.filter(lib => lib.playlists.includes(playlist));
    for (let i = 0; i < librariesLiked.length; i++) {
      let lib = librariesLiked[i];
      let newpls = new BetterArr(lib.liked);
      newpls[newpls.map(pl => pl.id).indexOf(playlist.id)] = playlist;
      await Libraries.findOneAndUpdate({ author: lib.author }, { liked: newpls })
    }
  }

  songCheck(song, playlist) {
    let songs = playlist.songs;
    let son = songs.find(s => s.title.toLowerCase() == song.toLowerCase())
    if (son != undefined) return songs.indexOf(songs.find(s => s.title.toLowerCase() == song.toLowerCase()));
    son = songs.find(s => s.url == song);
    if (son != undefined) return songs.indexOf(songs.find(s => s.url == song));
    return undefined;
  }

  async getPlaylist(id) {
    return await this.findGlobalPlaylist(id);
  }

  async getAll(arr) {
    let final = new BetterArr();
    for (let i = 0; i < arr.length; i++) {
      let ele = arr[i];
      let temp = await this.findGlobalPlaylist(ele);
      final.push(temp)
    }

    return final
  }

  async allPlaylists() {
    let librarys = await Libraries.find();
    let playlists = librarys.flatMap(lib => lib.playlists);
    return playlists
  }

}

class Library {
  /**
   * 
   * @param {Message} message 
   * @param {Client} client 
   * @param {Object} obj 
   */
  constructor(message, client, obj) {
    this.message = message;
    this.client = client;
    this.info = client.info;
    this.settings = client.settings;
    this.util = new Util(client)

    this.playlists = obj?.playlists ? new BetterArr(obj?.playlists) : new BetterArr()
    this.author = obj?.author || message.author;
    this.liked = obj?.liked ? new BetterArr(obj?.liked) : new BetterArr()
    this.songs = obj?.songs ? new BetterArr(obj?.songs) : new BetterArr()

  }

  findPlaylist(id) {
    if (!id) return
    let playlist = this.playlists.find(pl => pl.name.toLowerCase() == id.toLowerCase())
    if (playlist != undefined) return playlist instanceof Playlist ? playlist : new Playlist(playlist);
    playlist = this.playlists.find(pl => pl.id == id)
    if (playlist != undefined) return playlist instanceof Playlist ? playlist : new Playlist(playlist);
    return undefined
  }

  async findGlobalPlaylist(id) {
    if (!id) return
    let libraries = await Libraries.find();
    let playlists = libraries.flatMap(lib => lib.playlists)
    let playlist = playlists.find(pl => pl.name.toLowerCase() == id.toLowerCase())
    if (playlist != undefined) return playlist instanceof Playlist ? playlist : new Playlist(playlist);
    playlist = playlists.find(pl => pl.id == id)
    if (playlist != undefined) return playlist instanceof Playlist ? playlist : new Playlist(playlist);
    return undefined
  }

  async findOriginalLib(playlist) {
    if (!playlist) return
    let libraries = await Libraries.find();
    let library = libraries.find(lib => lib.playlists.includes(playlist));
    if (library != undefined) return library instanceof Library ? library : new Library(this.message, this.client, library);
    library = libraries.find(lib => lib.playlists.map(pl => pl.name.toLowerCase() == playlist.toLowerCase()))
    if (library != undefined) return library instanceof Library ? library : new Library(this.message, this.client, library);
    library = libraries.find(lib => lib.playlists.map(pl => pl.id == playlist))
    if (library != undefined) return library instanceof Library ? library : new Library(this.message, this.client, library);
    return undefined
  }

  IdMaker = IdMaker

  async addPlaylist(playlist, owner) {

    let pl;
    if (!(playlist instanceof Playlist)) {
      pl = new Playlist(playlist)
    } else {
      pl = playlist;
    }

    if (owner) {
      let Library = await Libraries.findOne({ author: owner });
      if (Library == undefined) return new Error(`No Library`)

      let newpls = Library.playlists
      newpls.push(pl);

      await Libraries.findOneAndUpdate({ author: owner }, { playlists: newpls })
    } else {

      let newpls = this.playlists;
      newpls.push(pl);

      await Libraries.findOneAndUpdate({ author: this.author.id }, { playlists: newpls });
      this.playlists = newpls
    }
  }

  async removePlaylist(playlist) {
    let library = await this.findOriginalLib(playlist.name);
    if (library == undefined) return new Error(`No Library`)

    let playlists = new BetterArr(library.playlists);

    let names = playlists.map(pl => pl.name);
    let index = names.indexOf(playlist.name);
    playlists.splice(index, 1)

    await Libraries.findOneAndUpdate({ author: library.author }, { playlists: playlists });

    let libraries = await Libraries.find();
    let librariesLiked = libraries.filter(lib => lib.playlists.includes(playlist));
    for (let i = 0; i < librariesLiked.length; i++) {
      let lib = librariesLiked[i];
      let newpls = new BetterArr(lib.liked);
      newpls.remove(playlist);
      await Libraries.findOneAndUpdate({ author: lib.author }, { liked: newpls })
    }
  }

  async editPlaylist(playlist) {
    let library = await this.findOriginalLib(playlist.id);
    if (library == undefined) return new Error(`No Library`)

    let playlists = new BetterArr(library.playlists);

    playlists[playlists.map(pl => pl.id).indexOf(playlist.id)] = playlist;

    await Libraries.findOneAndUpdate({ author: library.author }, { playlists: playlists })

    let libraries = await Libraries.find();
    let librariesLiked = libraries.filter(lib => lib.playlists.includes(playlist));
    for (let i = 0; i < librariesLiked.length; i++) {
      let lib = librariesLiked[i];
      let newpls = new BetterArr(lib.liked);
      newpls[newpls.map(pl => pl.id).indexOf(playlist.id)] = playlist;
      await Libraries.findOneAndUpdate({ author: lib.author }, { liked: newpls })
    }
  }

  songCheck(song, playlist) {
    let songs = playlist.songs;
    let son = songs.find(s => s.title.toLowerCase() == song.toLowerCase())
    if (son != undefined) return songs.indexOf(songs.find(s => s.title.toLowerCase() == song.toLowerCase()));
    son = songs.find(s => s.url == song);
    if (son != undefined) return songs.indexOf(songs.find(s => s.url == song));
    return undefined;
  }
}

class Playlist {
  constructor(obj) {
    this.name = obj.name;
    this.author = obj.author;
    this.id = obj.id;
    this.public = obj?.public || true;
    this.thumbnail = obj?.thumbnail || `https://art.ngfiles.com/images/1512000/1512699_versity_spotify-playlist-cover.jpg?f1605883557`;
    this.songs = obj?.songs || new BetterArr();
    this.description = obj?.description || `No Description`;
    this.likes = obj?.likes || 0;
  }

  setName(name) {
    if (typeof name == `string`) {
      this.name = name;
      return this.name;
    } else return undefined;
  }

  setPublic(state) {
    if (!state) { this.public = this.public ? false : true; return this.public }
    if (typeof state == `boolean`) { this.public = state; return this.public }
    return undefined
  }

  setThumbnail(url) {
    this.thumbnail = url;
    return this.thumbnail
  }

  setDesc(string) {
    if (typeof string == `string`) {
      this.description = string;
    } else return undefined
  }

  addLike() {
    this.likes = this.likes + 1;
    return this.likes
  }

  setLikes(likes) {
    if (typeof likes == `number`) {
      this.likes = likes
    } else return undefined
  }

  edit(obj) {
    obj.name && typeof obj.name == `string` ? this.setName(obj.name) : null
    obj.author && typeof obj.author == `string` ? this.author = obj.author : null
    obj.id && typeof obj.id == `string` ? this.id = obj.id : null
    obj.public && typeof obj.public == `boolean` ? this.setPublic(obj.public) : null
    obj.thumbnail && typeof obj.thumbnail == `string` ? this.setThumbnail(obj.thumbnail) : null
    obj.songs && (obj.songs instanceof BetterArr || Array.isArray(obj.songs)) ? this.songs = obj.songs : null
    obj.description && typeof obj.description == `string` ? this.setDesc(obj.description) : null
    obj.likes && typeof obj.likes == `number` ? this.likes = obj.likes : null
  }

}

module.exports = { Playlist, Library, IdMaker, LibUtil }