const Libraries = require(`../../schemas/library.js`);
const { MessageEmbed, Client, Message, MessageActionRow, User } = require(`discord.js`);
const { LibUtil, Playlist, Library, IdMaker } = require(`../../util/playlist.js`);
const { BetterArr } = require("../../util/util");
const URL = require(`url`).URL;

const stringIsAValidUrl = (s) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};

let UserPlaylist = undefined;
let LikedPlaylist = undefined;

module.exports = {
  name: `lib-menu`,
  cooldown: 5,
  desc: `Menu for your library`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { channel, author, guild } = message;
    let util = new LibUtil(client);
    let { Library_Menu } = util.menuEmbeds;
    let buttons = util.buttons;
    let selections = util.selectMenus;
    let UserLibrary = await Libraries.findOne({ author: author.id });
    //let MenuMessage;

    if (!UserLibrary) {
      let id = await IdMaker()
      UserLibrary = await new Libraries({
        author: author.id,
        playlists: [new Playlist({ name: `Template Playlist`, author: author.id, id: id })],
        liked: [],
        songs: []
      }).save();
    }

    let state = {
      currentDepth: `Library_Menu`,
      perviousDepth: undefined,
      previousFunc: undefined,
      currentCollect: undefined,
    }

    let MenuMessage = await channel.send({ embeds: [Library_Menu(message, UserLibrary)], components: [new MessageActionRow().addComponents([selections.Library_Menu]), new MessageActionRow({ components: [buttons.exit] })] });
    await message.delete().catch((err) => console.log(err));

    let collector = MenuMessage.createMessageComponentCollector({
      filter: ({user}) => user.id == author.id,
      idle: 1000 * 60 * 5
    });

    collector.on(`collect`, async interaction => {

      util.stageUpdate(state, interaction)
      let obj = {
        MenuMessage,
        interaction,
        state,
        UserLibrary,
        util,
        embeds: util.menuEmbeds,
        collector
      }

      await interaction.deferReply();
      await interaction.deleteReply();

      if (state.currentCollect != undefined) state.currentCollect.stop(`H`);

      switch (interaction.customId) {
        case "exit":
          collector.stop(`Member Exited`)
          break;
        case "home":
          MenuMessage.edit({ embeds: [Library_Menu(message, UserLibrary)], components: [
            new MessageActionRow().addComponents([selections.Library_Menu]),
            new MessageActionRow().addComponents([util.arrCreation(state)])
          ] });
          break;
        case "back":
          (async () => {
            let components = util.selectMenus[state.currentDepth] != undefined ? [new MessageActionRow().addComponents([util.selectMenus[state.currentDepth]])] : [];
            components.push(new MessageActionRow().addComponents(util.arrCreation(state)));
            MenuMessage.edit({ embeds: [util.menuEmbeds[state.currentDepth](message, UserLibrary, UserPlaylist, LikedPlaylist)], components: components })
          })()
          break;
        case "previous":
          (async () => {
            let components = util.selectMenus[state.currentDepth] != undefined ? [new MessageActionRow().addComponents([util.selectMenus[state.currentDepth]])] : [];
            components.push(new MessageActionRow().addComponents(util.arrCreation(state)));
            let func = util.menuEmbeds[state.currentDepth];
            func != undefined && UserPlaylist != undefined ? MenuMessage.edit({ embeds: [func(message, UserLibrary, UserPlaylist, LikedPlaylist)], components: components }) : state.previousFunc()
          })()
          break;
        case "library":
          await libraryActions(message, client, obj)
          break;
        case "playlist":
          await playlistActions(message, client, obj)
          break;
        case "liked_playlist":
          await likedpActions(message, client, obj)
          break;
        case "liked_songs":
          await likedsActions(message, client, obj)
          break;
        case "indiv_playlist":
          await indivplayActions(message, client, obj)
          break;
        case "edit_menu":
          await editActions(message, client, obj)
          break;
        case "liked_indiv_playlist":
          await liked_indActions(message, client, obj)
          break;
      }

    })

    collector.on(`end`, async (collected, reason) => {
      let endEmbed = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setAuthor(`${message.author.username}'s Embed Menu`, message.author.avatarURL({ dynamic: true }))
        .setTitle(`Library Menu has been Destroyed`)
        .setDescription(`its sad to say goodbye. 👋😢`)
        .addField(`Menu Info`, `Actions Selected: \`${collected.size}\`\nReason For End: \`${reason}\``, true)
        .addField(`Bot Info`, `Created By: \`Sun#4798 - (221403951700901888)\``)

      MenuMessage.edit({ embeds: [endEmbed], components: [], content: `Good Bye!` })

      setTimeout(() => MenuMessage.delete().catch((err) => console.log(err)), 60 * 1000)
    })

  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
async function libraryActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;
  
  switch (interaction.values[0]) {
    case "Playlist_Menu":
      await MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, UserLibrary, UserPlaylist)], components: [
        new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
        new MessageActionRow().addComponents(util.arrCreation(state))
      ] })
      break;
    case "Liked_Playlist":
      await MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, UserLibrary, UserPlaylist)], components: [
        new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
        new MessageActionRow().addComponents(util.arrCreation(state))
      ] })
      break;
    case "Liked_Songs":
      await MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, UserLibrary, UserPlaylist)], components: [
        new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
        new MessageActionRow().addComponents(util.arrCreation(state))
      ] })
      break;
    case "Lib_Info":
      await MenuMessage.edit({ embeds: [embeds.Lib_Info(message, UserLibrary, UserPlaylist)], components: [
        new MessageActionRow().addComponents(util.arrCreation(state)),
      ] })
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
async function playlistActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;

  switch (interaction.values[0]) {
    case "Indiv_Playlist":
      state.previousFunc = (async () => {
        let str = UserLibrary.playlists.map((p, i) => `${i + 1}.) ${p.name} - ${p.id}`).join(`\n`);

        if (str.length > 2000) {
          let temp = util.split(str, 2000, `\n`, `\n`);
          str = temp[0]
  
          const genEmb = (start) => {
            const current = temp[start];
            let newembed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setTitle(`Pick A Playlist!`)
            .setAuthor(`Showing results ${start+1} out of ${temp.length}`)
            .setDescription(current)
            .addField(`\u200B`, `**Type in the ID, name, or Index of the playlist to select it**\nAfter selection you will be able to edit the playlist`)
  
            return newembed
          }
  
          let canFitOnOne = temp.length == 1;
          await MenuMessage.edit({
            embeds: [genEmb(0)],
            components: canFitOnOne ? [new MessageActionRow().addComponents(util.arrCreation(state))] : [
              new MessageActionRow().addComponents(util.arrCreation(state)),
              new MessageActionRow().addComponents([ util.buttons.nextpage ])
            ]
          })
  
          if (!canFitOnOne) {
            const collects = mes.createMessageComponentCollector({
              filter: ({user}) => user.id === author.id
            })
  
            let currentIndex = 0;
            collects.on(`collect`, async inter => {
              if (inter.customId == `left`) { currentIndex -= 1 }
              else if (inter.customId == `right`) { currentIndex += 1 } else collects.stop();
      
              await MenuMessage.edit({
                embeds: [genEmb(currentIndex)],
                components: [
                  new MessageActionRow().addComponents(util.arrCreation(state)),
                  new MessageActionRow({ components: [ ...(currentIndex ? [leftbutton] : []), ...(currentIndex + 1 < temp.length ? [rightbutton] : []) ] })
                ]
              })
            })
          }
  
        } else {
          let selectionEmbed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setTitle(`Pick a Playlist!`)
            .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
            .setDescription(`\`\`\`\n${str}\`\`\``)
            .addField(`\u200B`, `**Type in the ID, name, or Index of the playlist to select it**\nAfter selection you will be able to edit the playlist`)
  
          await MenuMessage.edit({
            embeds: [selectionEmbed], components: [
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]
          })
        }
  
        let mesCol = message.channel.createMessageCollector({ 
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = mesCol

        mesCol.on(`collect`, async mes => {
          if (mes.deletable) await mes.delete().catch((err) => console.log(err));

          let checkArr = [];
          for (let j = 0; j < UserLibrary.playlists.length; j++) { checkArr.push(j+1) }
    
          let result;
          if (checkArr.some(ele => ele == mes.content)) result = Number.parseInt(mes.content) - 1;
          if (UserLibrary.playlists.some(ele => ele.name.toLowerCase() == mes.content.toLowerCase())) result = UserLibrary.playlists.indexOf(UserLibrary.playlists.find(p => p.name.toLowerCase() == mes.content.toLowerCase()))
          if (UserLibrary.playlists.some(ele => ele.id == mes.content)) result = UserLibrary.playlists.indexOf(UserLibrary.playlists.find(p => p.id == mes.content))
          if (result == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300004\nPlaylist Could Not Be Found` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          } else {
            UserPlaylist = UserLibrary.playlists[result];
    
            let tempState = state;
            state = {
              perviousDepth: tempState.currentDepth,
              currentDepth: `Indiv_Playlist`,
            }
      
            await MenuMessage.edit({
              embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)],
              components: [
                new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
                new MessageActionRow().addComponents(util.arrCreation(state))
              ]
            })
          }

        })

        mesCol.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300004\nPlaylist Could Not Be Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })
        
      })
      state.previousFunc()
      break;
    case "create":
      state.previousFunc = (async () => {
        let playlists = UserLibrary.playlists;
        let selembed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
          .setTitle(`Select the Playlist Name`)
          .setDescription(`Type and send a message for the name of the playlist\n\n**Name Requirements**\n> Under 100 Characters\n> No Same names with other owned playlists\n\n__You can not have over 10 playlists__`)

        MenuMessage.edit({ embeds: [selembed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })
  
        let mesCol = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = mesCol

        mesCol.on(`collect`, async mes => {
          if (mes.deletable) await mes.delete().catch((err) => console.log(err));

          if (mes.content.length > 100) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nName is over 100 characters` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
          if (playlists.some(pl => pl.name.toLowerCase() == mes.content.toLowerCase())) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nPlaylist Name already taken in your owned playlists` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
          let name = mes.cleanContent;
  
          let id = await IdMaker();
          UserLibrary.playlists.push(new Playlist({ name, author: message.author.id, id }))
          await Libraries.findOneAndUpdate({ author: message.author.id }, { playlists: UserLibrary.playlists })
  
          MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `A new playlist has been created - ${name}` })
        })

        mesCol.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nNo Name Inputed` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "delete":
      state.previousFunc = (async () => {
        let playlists = UserLibrary.playlists

        let str = playlists.map((p, i) => `${i + 1}.) ${p.name} - ${p.id}`).join(`\n`);

        if (str.length > 2000) {
          let temp = util.split(str, 2000, `\n`, `\n`);
          str = temp[0]

          const genEmb = (start) => {
            const current = temp[start];
            let selembed = new MessageEmbed()
              .setColor(client.info.color)
              .setFooter(client.info.footer)
              .setTimestamp()
              .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+- || Showing results ${start+1} out of ${temp.length}`)
              .setTitle(`Select a Playlist to delete`)
              .setDescription(`Type and send a message for the name of the playlist\n\n__You can not have over 10 playlists__`)
              .addField(`\u200B`, `\`\`\`\n${current}\`\`\``)

            return selembed
          }

          let canFitOnOne = temp.length == 1;
          await MenuMessage.edit({
            embeds: [genEmb(0)],
            components: canFitOnOne ? [new MessageActionRow().addComponents(util.arrCreation(state))] : [
              new MessageActionRow().addComponents(util.arrCreation(state)),
              new MessageActionRow().addComponents([util.buttons.nextpage])
            ]
          })

          if (!canFitOnOne) {
            const collects = mes.createMessageComponentCollector({
              filter: ({ user }) => user.id === author.id
            })

            let currentIndex = 0;
            collects.on(`collect`, async inter => {
              if (inter.customId == `left`) { currentIndex -= 1 }
              else if (inter.customId == `right`) { currentIndex += 1 } else collects.stop();

              await MenuMessage.edit({
                embeds: [genEmb(currentIndex)],
                components: [
                  new MessageActionRow().addComponents(util.arrCreation(state)),
                  new MessageActionRow({ components: [...(currentIndex ? [leftbutton] : []), ...(currentIndex + 1 < temp.length ? [rightbutton] : [])] })
                ]
              })
            })
          }

        } else {
          let selembed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
            .setTitle(`Select a Playlist to delete`)
            .setDescription(`Type and send a message for the name of the playlist\n\n__You can not have over 10 playlists__`)
            .addField(`\u200B`, `\`\`\`\n${str}\`\`\``)

          MenuMessage.edit({
            embeds: [selembed], components: [
              new MessageActionRow().addComponents(util.arrCreation(state)),
            ]
          })
        }

        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let playlist = await util.findGlobalPlaylist(mes.content);
          if (playlist == undefined) {
            let checkArr = [];
            for (let j = 0; j < UserLibrary.playlists.length; j++) { checkArr.push(j+1) }
            if (!(checkArr.some(ele => ele == mes.content))) {
              let tempMes = await message.channel.send({ content: `[ERROR] #300004\nPlaylist could not be found` });
              setTimeout(() => { tempMes.delete().catch((err) => console.log(err)) }, 5 * 1000)
              return MenuMessage.edit({
                embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
                  new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
                  new MessageActionRow().addComponents(util.arrCreation(state))
                ]
              })
            } else {
              playlist = UserLibrary.playlists[Number.parseInt(mes.content)-1]
            }
          }
  
          let index = playlists.indexOf(playlist);
          UserLibrary.playlists.splice(index, 1)
          await util.removePlaylist(playlist);
  
          MenuMessage.edit({
            embeds: [embeds.Playlist_Menu(message, UserLibrary)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ], content: `Playlist ${playlist.name} has been deleted`
          })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nNo Name Inputed` });
            setTimeout(() => { if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err)) }, 5 * 1000)
            return MenuMessage.edit({
              embeds: [embeds.Playlist_Menu(message, UserLibrary, UserPlaylist)], components: [
                new MessageActionRow().addComponents([util.selectMenus[`Playlist_Menu`]]),
                new MessageActionRow().addComponents(util.arrCreation(state))
              ]
            })
          }
        })

      })
      state.previousFunc()
      break;
    case "playlist_info":
      state.previousFunc = (async () => {
        let plembed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          
      })
      state.previousFunc()
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
 async function indivplayActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;

  switch (interaction.values[0]) {
    case "add":
      state.previousFunc = (async () => {
        let addEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Adding a song to ${UserPlaylist.name}`)
          .setAuthor(`${message.author.username}'s Playlist - ${UserPlaylist.name}`)
          .setDescription(`You can add a song by typing the song link, or just type what you want to search for\n\nThe bot will automatically find and import the playlist into your playlist`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        await MenuMessage.edit({ embeds: [addEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let tracks = await util.queryType(mes.cleanContent, message, true);
          let playlists = UserLibrary.playlists
          UserPlaylist.songs = UserPlaylist.songs.concat(tracks)
          UserLibrary.playlists[playlists.indexOf(UserPlaylist)].songs = UserPlaylist.songs;
          await util.editPlaylist(UserPlaylist);
  
          await MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Indiv_Playlist]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `All songs have been added to ${UserPlaylist.name}` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nNo Name Inputed` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "remove":
      state.previousFunc = (async () => {

        let songs = UserPlaylist.songs;
        let str = songs.map((p, i) => `${i + 1}.) ${p.title} - ${p.id}`).join(`\n`);
        let temp = util.split(str, 2000, `\n`, `\n`);

        const genEmb = (start) => {
          const current = temp[start];
          let newembed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setTitle(`Pick A Song!`)
            .setAuthor(`Showing results ${start + 1} out of ${temp.length}`)
            .setDescription(current)
            .addField(`\u200B`, `**Type in the ID, name, or Index of the song to select it**\nAfter selection the song will be removed`)

          return newembed
        }

        let canFitOnOne = temp.length == 1;
        await MenuMessage.edit({
          embeds: [genEmb(0)],
          components: canFitOnOne ? [new MessageActionRow().addComponents(util.arrCreation(state))] : [
            new MessageActionRow().addComponents(util.arrCreation(state)),
            new MessageActionRow().addComponents([ util.buttons.nextpage ])
          ]
        })

        if (!canFitOnOne) {
          const collects = mes.createMessageComponentCollector({
            filter: ({user}) => user.id === author.id
          })

          let currentIndex = 0;
          collects.on(`collect`, async inter => {
            if (inter.customId == `left`) { currentIndex -= 1 }
            else if (inter.customId == `right`) { currentIndex += 1 } else collects.stop();
    
            await MenuMessage.edit({
              embeds: [genEmb(currentIndex)],
              components: [
                new MessageActionRow().addComponents(util.arrCreation(state)),
                new MessageActionRow({ components: [ ...(currentIndex ? [leftbutton] : []), ...(currentIndex + 1 < temp.length ? [rightbutton] : []) ] })
              ]
            })
          })
        }

        let mesCol = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = mesCol

        mesCol.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let index = util.songCheck(mes.content, UserPlaylist);
          if (index == undefined) {
            let checkArr = [];
            for (let j = 0; j < UserPlaylist.songs.length; j++) { checkArr.push(j+1) }
            if (!checkArr.includes(Number.parseInt(mes.content))) {
              let tempMes = await message.channel.send({ content: `[ERROR] #300006\nSong could not be found` });
              setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
              return MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
                new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
                new MessageActionRow().addComponents(util.arrCreation(state))
              ]})
            } else index = Number.parseInt(mes.content) - 1;
          }
  
          let song = UserPlaylist.songs[index];
          UserPlaylist.songs.splice(index, 1);
          UserLibrary.playlists[UserLibrary.playlists.indexOf(UserPlaylist)].songs = UserPlaylist.songs;
          await util.editPlaylist(UserPlaylist);
  
          await MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Indiv_Playlist]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Song ${song.title} has been removed from ${UserPlaylist.name}` })
        })

        mesCol.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nNo Name Inputed` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "save":
      state.previousFunc = (async () => {
        let songs = UserPlaylist.songs;
        let str = songs.map((p, i) => `${i + 1}.) ${p.title} - ${p.id}`).join(`\n`);
        let temp = util.split(str, 2000, `\n`, `\n`);

        const genEmb = (start) => {
          const current = temp[start];
          let newembed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setTitle(`Pick A Song!`)
            .setAuthor(`Showing results ${start + 1} out of ${temp.length}`)
            .setDescription(current)
            .addField(`\u200B`, `**Type in the ID, name, or Index of the song to select it**\nAfter selection the song will be saved`)

          return newembed
        }

        let canFitOnOne = temp.length == 1;
        await MenuMessage.edit({
          embeds: [genEmb(0)],
          components: canFitOnOne ? [new MessageActionRow().addComponents(util.arrCreation(state))] : [
            new MessageActionRow().addComponents(util.arrCreation(state)),
            new MessageActionRow().addComponents([ util.buttons.nextpage ])
          ]
        })

        if (!canFitOnOne) {
          const collects = mes.createMessageComponentCollector({
            filter: ({user}) => user.id === author.id
          })

          let currentIndex = 0;
          collects.on(`collect`, async inter => {
            if (inter.customId == `left`) { currentIndex -= 1 }
            else if (inter.customId == `right`) { currentIndex += 1 } else collects.stop();
    
            await MenuMessage.edit({
              embeds: [genEmb(currentIndex)],
              components: [
                new MessageActionRow().addComponents(util.arrCreation(state)),
                new MessageActionRow({ components: [ ...(currentIndex ? [leftbutton] : []), ...(currentIndex + 1 < temp.length ? [rightbutton] : []) ] })
              ]
            })
          })
        }

        let mesCol = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = mesCol

        mesCol.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let index = util.songCheck(mes.content, UserPlaylist);
          if (index != undefined) null;
          let checkArr = [];
          for (let j = 0; j < UserPlaylist.songs.length; j++) { checkArr.push(j+1) }
          if (checkArr.includes(Number.parseInt(mes.content))) index = Number.parseInt(mes.content) - 1;
          if (index == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300006\nSong could not be found` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
  
          let song = UserPlaylist.songs[index];
          UserLibrary.songs.push(song)
          await Libraries.findOneAndUpdate({ author: message.author.id }, { songs: UserLibrary.songs })
  
          MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ]})
        })

        mesCol.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nNo Name Inputed` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Indiv_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "edit_menu":
      await MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, UserLibrary, UserPlaylist)], components: [
        new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
        new MessageActionRow().addComponents(util.arrCreation(state))
      ] })
      break;
    case "second_delete":
      state.previousFunc = (async () => {
        let confirmEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Are you Sure?`)
          .setDescription(`**THIS SCREEN IS MEANT TO MAKE SURE YOU WANT TO DELETE THIS PLAYLIST**\n\n__CONFIRM THE DELETE BY PRESSING THE BUTTONS__\n\n`)
          .addField(`Controls`, `💠 : Confirm Delete\n🔱 : Decline Delete`)

        await MenuMessage.edit({ embeds: [confirmEmbed], components: [
          new MessageActionRow().addComponents([util.buttons.confirm, util.buttons.decline])
        ] })

        let collection = await MenuMessage.awaitMessageComponent({
          filter: ({user}) => user.id == message.author.id,
          time: 15 * 1000
        })

        if (collection.customId == `confirm`) {

          let index = UserLibrary.playlists.indexOf(UserPlaylist);
          UserLibrary.playlists.splice(index, 1)
          await util.removePlaylist(UserPlaylist);

          await MenuMessage.edit({ embeds: [embeds.Playlist_Menu(message, UserLibrary)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Playlist_Menu]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `The Playlist Was Deleted` })

        } else if (collection.customId == `decline`) {
          await MenuMessage.edit({ embeds: [embeds.Indiv_Playlist(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Indiv_Playlist]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `The Playlist Wasn't Deleted` })
        }

      })
      state.previousFunc()
      break;
    case "play":
      break;
    case "playlist_info":
      await MenuMessage.edit({ embeds: [embeds.playlist_info(message, UserLibrary, UserPlaylist)], components: [
        new MessageActionRow().addComponents(util.arrCreation(state)),
      ] })

      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
 async function editActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;

  switch (interaction.values[0]) {
    case "name":
      state.previousFunc = (async () => {
        let nameEmbed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
        .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
        .setTitle(`Input a Playlist Name`)
        .setDescription(`Your text will be the new name for your playlist\n\n**Name Requirements**\n> Under 100 Characters\n> No Same names with other Owned Playlists`)

        MenuMessage.edit({ embeds: [nameEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })

        let playlists = UserLibrary.playlists

        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))
          let content = mes.content;

          if (content.length > 100) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nName is over 100 characters` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
          if (playlists.some(pl => pl.name.toLowerCase() == mes.content.toLowerCase())) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nPlaylist Name already taken in your owned playlists` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          let name = mes.cleanContent;
          UserPlaylist.name = name;

          UserLibrary.playlists[playlists.indexOf(playlists.find(pl => pl.id == UserPlaylist.id))] = UserPlaylist;
          await Libraries.findOneAndUpdate({ author: message.author.id }, { playlists: UserLibrary.playlists })

          MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Playlist Name Has Been Updated - ${name}` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300007\nNo Name Inputed` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })
      })
      state.previousFunc()
      break;
    case "public":
      state.previousFunc = (async () => {
        let pubEmbed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Input the Viewability`)
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
          .setDescription(`This will determine if your playlist is viewable or saveable\n\n**Requirements:**\n> Must be either \`True\` or \`False\`\n\n**Inputs**:\n> *(True | 1 | Yes)* -- \`True\`\n> *(False | 0 | No)* -- \`False\``)

        MenuMessage.edit({ embeds: [pubEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })

        let cas = {
          true: true,
          1: true,
          yes: true,
          false: false,
          0: false,
          no: false
        }

        let playlists = UserLibrary.playlists
        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let value = cas[mes.content.toLowerCase()]
          if (value == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          UserPlaylist.public = value
          UserLibrary.playlists[playlists.indexOf(playlists.find(p => p.id == UserPlaylist.id))] = UserPlaylist

          await Libraries.findOneAndUpdate({ author: message.author.id }, { playlists: UserLibrary.playlist })

          MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Playlist Viewability Has Been Updated - ${value}` })
        })

        collect.on(`end`, async (c, r) => {
          if (c.size == 0 && r != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100003\nNo Input Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "thumbnail":
      state.previousFunc = (async () => {
        let thumbEmbed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Input the Thumbnail`)
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
          .setDescription(`This will determine the thumbnail of your playlist\n\n**Requirements:**\n> Must be a URL\n> Must be a Picture`)

        MenuMessage.edit({ embeds: [thumbEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })

        let playlists = UserLibrary.playlists
        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let check = stringIsAValidUrl(mes.content);
          if (!check) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Not Valid Url` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          UserPlaylist.thumbnail = mes.content
          UserLibrary.playlists[playlists.indexOf(playlists.find(p => p.id == UserPlaylist.id))] = UserPlaylist

          await Libraries.findOneAndUpdate({ author: message.author.id }, { playlists: UserLibrary.playlist })

          MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Playlist Thumbnail Has Been Updated - ${mes.content}` })
        })

        collect.on(`end`, async (c, r) => {
          if (c.size == 0 && r != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100003\nNo Input Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "desc":
      state.previousFunc = (async () => {
        let thumbEmbed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Input a Description`)
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
          .setDescription(`This will determine the thumbnail of your playlist\n\n**Requirements:**\n> Must be under 1000 characters`)

        MenuMessage.edit({ embeds: [thumbEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })

        let playlists = UserLibrary.playlists
        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          if (mes.content.length > 1000) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Description is to long` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          UserPlaylist.description = mes.content
          UserLibrary.playlists[playlists.indexOf(playlists.find(p => p.id == UserPlaylist.id))] = UserPlaylist

          await Libraries.findOneAndUpdate({ author: message.author.id }, { playlists: UserLibrary.playlist })

          MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Playlist Description Has Been Updated` })
        })

        collect.on(`end`, async (c, r) => {
          if (c.size == 0 && r != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100003\nNo Input Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit_menu(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit_menu`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
async function likedpActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;

  let cachedPlaylists = await util.getAll(UserLibrary.liked)

  switch (interaction.values[0]) {
    case "Liked_Indiv_Playlist":
      state.previousFunc = (async () => {
        let temp = util.split(cachedPlaylists.map((p, i) => `${i + 1}.) ${p.name} - ${p.id}`).join(`\n`), 2000, `\n`, `\n`)
        const genEmb = (start) => {
          const current = temp[start];
          let newembed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Pick A Playlist!`)
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+- | ${start+1} out of ${temp.length}`)
          .setDescription(current)
          .addField(`\u200B`, `**Type in the ID, name, or Index of the playlist to select it**\nAfter selection you will be able to edit the playlist`)

          return newembed
        }

        let canFitOnOne = temp.length == 1;
        await MenuMessage.edit({
          embeds: [genEmb(0)],
          components: canFitOnOne ? [new MessageActionRow().addComponents(util.arrCreation(state))] : [
            new MessageActionRow().addComponents(util.arrCreation(state)),
            new MessageActionRow().addComponents([ util.buttons.nextpage ])
          ]
        })

        if (!canFitOnOne) {
          const collects = mes.createMessageComponentCollector({
            filter: ({user}) => user.id === author.id
          })

          let currentIndex = 0;
          collects.on(`collect`, async inter => {
            if (inter.customId == `left`) { currentIndex -= 1 }
            else if (inter.customId == `right`) { currentIndex += 1 } else collects.stop();
    
            await MenuMessage.edit({
              embeds: [genEmb(currentIndex)],
              components: [
                new MessageActionRow().addComponents(util.arrCreation(state)),
                new MessageActionRow({ components: [ ...(currentIndex ? [leftbutton] : []), ...(currentIndex + 1 < temp.length ? [rightbutton] : []) ] })
              ]
            })
          })
        }

        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let checkArr = [];
          for (let j = 0; j < UserLibrary.playlists.length; j++) { checkArr.push(j+1) }
          
          let result;
          if (checkArr.some(ele => ele == mes.content)) result = Number.parseInt(mes.content) - 1;
          if (cachedPlaylists.some(ele => ele.name.toLowerCase() == mes.content.toLowerCase())) result = cachedPlaylists.indexOf(cachedPlaylists.find(p => p.name.toLowerCase() == mes.content.toLowerCase()))
          if (cachedPlaylists.some(ele => ele.id == mes.content)) result = cachedPlaylists.indexOf(cachedPlaylists.find(p => p.id == mes.content))

          if (result == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] #300004\nPlaylist Could Not Be Found` });
            setTimeout(() => {tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          LikedPlaylist = cachedPlaylists[result]

          let tempState = state;
          state = {
            perviousDepth: tempState.currentDepth,
            currentDepth: `Indiv_Playlist`,
          }

          await MenuMessage.edit({ embeds: [embeds.Liked_Indiv_Playlist(message, UserLibrary, UserPlaylist, LikedPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Liked_Indiv_Playlist]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        })

        collect.on(`end`, async (c, r) => {
          if (c.size == 0 && r != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100003\nNo Input Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "pl_like":
      state.previousFunc = (async () => {
        let likeEmbed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Input a Playlist Id!`)
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
          .setDescription(`Inputting and Id will automatically like a playlist\n\n**Requirements:**\n> Must be the Id of a playlist\n> Can not be one of your playlists`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [likeEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })

        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let playlists = await util.allPlaylists();
          let playlist = playlists.filter(pl => pl.public).find(pl => pl.id == mes.content);
          if (playlist == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Playlist Could not be found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
          if (cachedPlaylists.map(pl => pl.id).includes(mes.content)) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Playlist Is Already Liked` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
          if (UserLibrary.playlists.map(pl => pl.id).includes(mes.content)) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Can Not Your Own Playlist` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          playlist.likes++

          UserLibrary.liked.push(playlist.id)
          let OgLib = await util.findOriginalLib(playlist);
          OgLib.playlists[OgLib.playlists.indexOf(OgLib.playlists.find(pl => pl.id == playlist.id))] = playlist
          await Libraries.findOneAndUpdate({ author: message.author.id }, { liked: UserLibrary.liked })
          await Libraries.findOneAndUpdate({ author: OgLib.author }, { playlists: OgLib.playlists })

          MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Added a Playlist to Liked Playlists` })
        })

        collect.on(`end`, async (c, r) => {
          if (c.size == 0 && r != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100003\nNo Input Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "pl_unlike":
      state.previousFunc = (async () => {
        let likeEmbed = new MessageEmbed().setColor(client.info.color).setFooter(client.info.footer).setTimestamp()
          .setTitle(`Input a Playlist Id!`)
          .setAuthor(`-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-`)
          .setDescription(`Inputting and Id will automatically like a playlist\n\n**Requirements:**\n> Must be the id of a playlist you liked`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [likeEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state)),
        ] })

        let collect = message.channel.createMessageCollector({
          filter: m => m.author.id == message.author.id,
          time: 30 * 1000,
          max: 1
        })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          if (mes.deletable) mes.delete().catch((err) => console.log(err))

          let playlists = await util.allPlaylists();
          let playlist = playlists.find(pl => pl.id == mes.content);
          if (playlist == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Playlist Could not be found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
          if (!cachedPlaylists.map(pl => pl.id).includes(mes.content)) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100005\nInvaild Input - Playlist Is Not Liked` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }

          playlist.likes--

          UserLibrary.liked.splice(UserLibrary.liked.indexOf(playlist.id), 1)
          let OgLib = await util.findOriginalLib(playlist);
          OgLib.playlists[OgLib.playlists.indexOf(OgLib.playlists.find(pl => pl.id == playlist.id))] = playlist
          await Libraries.findOneAndUpdate({ author: message.author.id }, { liked: UserLibrary.liked })
          await Libraries.findOneAndUpdate({ author: OgLib.author }, { playlists: OgLib.playlists })

          MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Removed a Playlist to Liked Playlists` })
        })

        collect.on(`end`, async (c, r) => {
          if (c.size == 0 && r != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] #100003\nNo Input Found` });
            setTimeout(() => {if (tempMes.deletable) tempMes.delete().catch((err) => console.log(err))}, 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ]})
          }
        })

      })
      state.previousFunc()
      break;
    case "liked_info":
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
async function liked_indActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;

  switch (interaction.values[0]) {
    case "pl_remove":
      state.previousFunc = (async () => {
        LikedPlaylist.likes--

        UserLibrary.liked.splice(UserLibrary.liked.indexOf(LikedPlaylist.id), 1)
        let OgLib = await util.findOriginalLib(LikedPlaylist);
        OgLib.playlists[OgLib.playlists.indexOf(OgLib.playlists.find(pl => pl.id == LikedPlaylist.id))] = LikedPlaylist
        await Libraries.findOneAndUpdate({ author: message.author.id }, { liked: UserLibrary.liked })
        await Libraries.findOneAndUpdate({ author: OgLib.author }, { playlists: OgLib.playlists })

        return MenuMessage.edit({ embeds: [embeds.Liked_Playlist(message, UserLibrary, UserPlaylist)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Liked_Playlist`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ], content: `Playlist has been removed from your liked playlists`})

      })
      state.previousFunc()
      break;
    case "pl_info":
      state.previousFunc = (async () => {
        let OgLib = await util.findOriginalLib(LikedPlaylist);
        let owner = message.guild.members.cache.get(OgLib.author);
        let embed = embeds.Indiv_Playlist(message, UserLibrary, LikedPlaylist).setAuthor(`${owner?.displayName ? owner.displayName : `Unknown`}'s Playlist Named ${LikedPlaylist.name}`, owner?.user?.avatarURL({ dynamic: true }))
        embed.fields.splice(embed.fields.length-1, 1)
        MenuMessage.edit({ embeds: [embed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      })
      state.previousFunc()
      break;
    case "pl_play":
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {Object} obj 
 */
async function likedsActions(message, client, obj) {
  let { interaction, MenuMessage, state, UserLibrary, util, embeds, collector } = obj;

  switch (interaction.values[0]) {
    case "so_add":
      break;
    case "so_remove":
      break;
    case "so_info":
      break;
  }
}