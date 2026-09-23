const { Client, Message, MessageEmbed, MessageActionRow, InteractionCollector, SelectMenuInteraction } = require(`discord.js`);
const { EmbedUtil } = require(`../../util/embed.js`);
const SavedEmbeds = require(`../../schemas/embeds.js`);
const URL = require(`url`).URL;

const stringIsAValidUrl = (s) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};

async function IdMaker() {
  let libraries = await SavedEmbeds.find();
  let ids = libraries.flatMap(lib => lib.embeds.map(pl => pl.id));
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

/**
 * @param {Message} message 
 */
function channelCheck(message) {
  let guild = message.guild;
  let content = message.content;
  let channels = guild.channels.cache.filter(c => c.type == `GUILD_TEXT`);
  let channel = channels.get(content);
  if (channel != undefined) return channel;
  channel = channels.find(c => c.name.toLowerCase() == content.toLowerCase())
  if (channel != undefined) return channel;
  channel = channels.find(c => `#${c.name}` == message.cleanContent);
  if (channel != undefined) return channel
  return undefined
}

function BoolCheck(string) {
  if (string.toLowerCase() == `true`) {
    return true
  } else if (string.toLowerCase() == `false`) {
    return false
  } else return undefined
}

/*
let typeObj = {
  MenuMessage: new Message,
  interaction: new SelectMenuInteraction,
  state: {
    currentDepth: new String,
    previousDepth: new String,
    previousFunc: new String,
    currentCollect: new String,
    currentField: new String,
  },
  util: new EmbedUtil,
  embeds: {
    Main() {},
    Create() {},
    Footer() {},
    Author() {},
    Fields () {},
    add() {},
    edit() {},
  },
  collector: new InteractionCollector
}
*/

module.exports = {
  name: `embed-menu`,
  cooldown: 5,
  desc: `A menu to send a embed`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { channel, guild, author } = message;
    let { info } = client;
    let util = new EmbedUtil(client);
    let embeds = util.embs

    let SavedEmbed = await SavedEmbeds.findOne({ author: author.id })
    if (SavedEmbed == undefined) {
      SavedEmbed = await new SavedEmbeds({
        author: author.id,
        embeds: []
      }).save({});
    }

    message.embed = {
      channel: message.channel,
      embed: {}
    }

    let state = {
      currentDepth: `Main`,
      perviousDepth: undefined,
      previousFunc: undefined,
      currentCollect: undefined,
      currentField: {},
      save: undefined,
    }

    let MenuMessage = await channel.send({ embeds: [embeds.Main(message)], components: [
      new MessageActionRow().addComponents([util.selectMenus.Main]),
      new MessageActionRow().addComponents([util.buttons.exit]),
    ] })
    await message.delete();

    let collector = MenuMessage.createMessageComponentCollector({
      filter: ({user}) => user.id == author.id,
      idle: 1000 * 60 * 1
    })

    collector.on(`collect`, async interaction => {
      util.stageUpdate(state, interaction)
      let obj = {
        MenuMessage,
        interaction,
        state,
        util,
        embeds: util.embs,
        collector,
        SavedEmbed
      }

      await interaction.deferReply();
      await interaction.deleteReply();

      if (state.currentCollect != undefined) state.currentCollect.stop(`H`);

      switch (interaction.customId) {
        case "exit":
          collector.stop(`Member Exited`);
          break;
        case "home":
          MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Main]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] });
          break;
        case "back":
          (async () => {
            let components = util.selectMenus[state.currentDepth] != undefined ? [new MessageActionRow().addComponents([util.selectMenus[state.currentDepth]])] : [];
            components.push(new MessageActionRow().addComponents(util.arrCreation(state)));
            MenuMessage.edit({ embeds: [util.embs[state.currentDepth](message, state.currentField)], components: components })
          })()
          break;
        case "previous":
          (async () => {
            let components = util.selectMenus[state.currentDepth] != undefined ? [new MessageActionRow().addComponents([util.selectMenus[state.currentDepth]])] : [];
            components.push(new MessageActionRow().addComponents(util.arrCreation(state)));
            let func = util.embs[state.currentDepth];
            func == undefined ? state.previousFunc() : MenuMessage.edit({ embeds: [func(message, state.currentField)], components: components })
          })()
          break;
        case "main":
          await main(message, client, obj)
          break;
        case "create":
          await create(message, client, obj)
          break;
        case "footer":
          await footer(message, client, obj)
          break;
        case "author":
          await author2(message, client, obj)
          break;
        case "fields":
          await fields(message, client, obj)
          break;
        case "add":
          await add(message, client, obj)
          break;
        case "edit":
          await edit(message, client, obj)
          break;
        case "saved":
          await saved(message, client, obj)
          break;
      }
    })

    collector.on(`end`, async (collected, reason) => {
      let endEmbed = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setAuthor(`${message.author.username}'s Embed Menu`, message.author.avatarURL({ dynamic: true }))
        .setTitle(`Embed Menu has been Destroyed`)
        .setDescription(`its sad to say goodbye. 👋😢`)
        .addField(`Menu Info`, `Actions Selected: \`${collected.size}\`\nReason For End: \`${reason}\``, true)
        .addField(`Bot Info`, `Created By: \`Sun#4798 - (221403951700901888)\``)

      MenuMessage.edit({ embeds: [endEmbed], components: [], content: `Good Bye!` })

      setTimeout(() => MenuMessage.delete(), 60 * 1000)
    })
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {typeObj} obj 
 */
async function main(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector, SavedEmbed } = obj

  switch (interaction.values[0]) {
    case "Create":
      (async () => {
        MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, state.currentField)], components: [
          new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      })()
      break;
    case "Channel":
      state.previousFunc = (async () => {
        let ChannelEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Selecting a Channel`)
          .setDescription(`To Select a channel you must input either the id, name, or the just mention the channel`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [ChannelEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();
          let channel = channelCheck(mes);

          if (channel == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Channel could not be found` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({
              embeds: [embeds.Main(message)], components: [
                new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
                new MessageActionRow().addComponents(util.arrCreation(state))
              ]
            })
          }

          message.embed.channel = channel
          console.log(message.embed.channel.name)
  
          await MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Main]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Channel has been changed to ${channel.name}` })

        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
                new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
                new MessageActionRow().addComponents(util.arrCreation(state))
              ]
            })
          }
        })

      })
      state.previousFunc();
      break;
    case "Preview":
      let previewEmbed = new MessageEmbed(message.embed.embed)
      if (previewEmbed.title == null) {
        let tempMes = await message.channel.send({ content: `[ERROR] Embed doesn't have any required values like "Title"` })
        setTimeout(() => tempMes.delete(), 5 * 1000)
        return MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      }
      try {
        MenuMessage.edit({ embeds: [previewEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ], content: `PREVIEW: Real Channel will be <#${message.embed.channel.id}>` })
      } catch (err) {
        message.channel.send(`[ERROR] there was an error sending the embed\n\`\`\`\n${err}\`\`\``)
        console.log(err)
      }
      break;
    case "Saved":
      (async () => {
        MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, state.currentField)], components: [
          new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      })()
      break
    case "Send":
      let Embed = new MessageEmbed(message.embed.embed)
      if (Embed.title == null) {
        let tempMes = await message.channel.send({ content: `[ERROR] Embed doesn't have any required values like "Title"` })
        setTimeout(() => tempMes.delete(), 5 * 1000)
        return MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      }

      let embedstring = JSON.stringify(Embed.toJSON(), null).replace(/(`)/g, '\\`');

      let finale = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setTitle(`Embed has been sent`)
        .setDescription(`\`\`\`JSON\n${embedstring}\`\`\``)
        .addField(`\u200B`, `Channel: ${message.embed.channel.name} <#${message.embed.channel.id}>\nAuthor: ${message.author.username} <@${message.author.id}>`)

      try {
        if (SavedEmbed.embeds.length > 10) {
          let secTemp = await message.channel.send({ embeds: [finale], components: [] });
          setTimeout(() => secTemp.delete(), 60 * 1000)
        } else {
          let secTemp = await message.channel.send({ embeds: [finale], components: [
            new MessageActionRow().addComponents([util.buttons.save])
          ] });
  
          let collect = secTemp.createMessageComponentCollector({
            filter: ({user}) => user.id == message.author.id,
            time: 1000 * 60
          })
  
          collect.on(`collect`, async inter => {
            await inter.deferReply();
            await inter.deleteReply();
            if (inter.customId == `saveBut`) {
              let id = await IdMaker()
              let embedobj = {
                embed: Embed,
                id
              }
              SavedEmbed.embeds.push(embedobj)
  
              await SavedEmbeds.findOneAndUpdate({ author: message.author.id }, { embeds: SavedEmbed.embeds })
  
              collect.stop()
            }
          })
  
          collect.on(`end`, () => {secTemp.delete()}) 
          let channel = message.embed.channel;
          channel.send({ embeds: [Embed] })
        }
      } catch (err) {
        message.channel.send(`[ERROR] there was an error sending the embed\n\`\`\`\n${err}\`\`\``)
        console.log(err)
      }
      break;
    case "JSON":
      state.previousFunc = (async () => {
        let JsonSelection = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input embed JSON!`)
          .setDescription(`Just send the json and it should save the embed\nCheck Embed Preview to see it`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [JsonSelection], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let args = mes.content
          let embedJSON = JSON.parse(args);
          message.embed.embed = embedJSON
          
          return MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Embed has been Loaded` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
                new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
                new MessageActionRow().addComponents(util.arrCreation(state))
              ]
            })
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
 * @param {typeObj} obj 
 */
 async function create(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector } = obj

  switch (interaction.values[0]) {
    case "Color":
      state.previousFunc = (async () => {
        let ColorEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Selecting a Color`)
          .setDescription(`To change the color of your embed, type in a color value or hex. Example:\nHex Color: (#00000)\n32Bit Color: (16777215)\n\nColor of Current Embed: ${client.info.color}`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [ColorEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete()
          let color = util.resolveColor(mes.content);
          if (color == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Color could not be found` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop(``)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          message.embed.embed[`color`] = color;
          console.log(message.embed.embed)
  
          await MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Create]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Color has been changed to ${color}` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })


      })
      state.previousFunc();
      break;
    case "Title":
      state.previousFunc = (async () => {
        let TitleEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`**CHANGING THIS**`)
          .setDescription(`To change the Title of the embed you just need to input a text but there are requirements\n1. Must be under 256 Characters`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [TitleEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect

        collect.on(`collect`, async mes => {
          await mes.delete();
          let title = mes.content;
          if (title.length > 256) {
            let tempMes = await message.channel.send({ content: `[ERROR] Title is to long` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
  
          message.embed.embed[`title`] = title;
          console.log(message.embed.embed)
  
          await MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Create]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Title has been changed to\n__${title}__` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc();
      break;
    case "Desc":
      state.previousFunc = (async () => {
        let DescEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input the Description`)
          .setDescription(`**CHANGING THIS**\nTo change the Description of the embed you just need to type whatever you want`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [DescEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let desc = mes.content;

          message.embed.embed[`description`] = desc;
          console.log(message.embed.embed)
  
          await MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Create]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Description has been updated` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "Fields":
      (async () => {
        return MenuMessage.edit({ embeds: [embeds.Fields(message, state.currentField)], components: [
          new MessageActionRow().addComponents([util.selectMenus.Fields]),
          new MessageActionRow().addComponents([util.arrCreation(state)]),
        ] })
      })()
      break;
    case "Footer":
      (async () => {
        return MenuMessage.edit({ embeds: [embeds.Footer(message, state.currentField)], components: [
          new MessageActionRow().addComponents([util.selectMenus.Footer]),
          new MessageActionRow().addComponents([util.arrCreation(state)]),
        ] })
      })()
      break;
    case "Author":
      (async () => {
        return MenuMessage.edit({ embeds: [embeds.Author(message, state.currentField)], components: [
          new MessageActionRow().addComponents([util.selectMenus.Author]),
          new MessageActionRow().addComponents([util.arrCreation(state)]),
        ] })
      })()
      break;
    case "Thumbnail":
      state.previousFunc = (async () => {
        let ThumbnailEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Inputing the Thumbnail`)
          .setDescription(`To change the Thumbnail of the embed you need to type a link of a picture\nIf the picture is invalid the embed will fail`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [ThumbnailEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let url = mes.content;
          let check = stringIsAValidUrl(url);
          if (check == false) {
            let tempMes = await message.channel.send({ content: `[ERROR] Message is not a valid url` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
  
          message.embed.embed[`thumbnail`] = { "url": url };
          console.log(message.embed.embed)
  
          await MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Create]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Thumbnail has been updated` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "Image":
      state.previousFunc = (async () => {
        let ImageEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Inputing the Image`)
          .setDescription(`To change the Image of the embed you need to type a link of a picture\nIf the picture is invalid the embed will fail`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [ImageEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();
          let url = mes.content;
          let check = stringIsAValidUrl(url);
          if (check == false) {
            let tempMes = await message.channel.send({ content: `[ERROR] Message is not a valid url` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
  
          message.embed.embed[`image`] = { "url": url };
          console.log(message.embed.embed)
  
          await MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Create]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `Image has been updated` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "URL":
      state.previousFunc = (async () => {
        let URLEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Will Change Title Link`)
          .setDescription(`To change the Title URL of the embed you need to type a link of anything`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          
        MenuMessage.edit({ embeds: [URLEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();
          let url = mes.content;
          let check = stringIsAValidUrl(url);
          if (check == false) {
            let tempMes = await message.channel.send({ content: `[ERROR] Message is not a valid url` })
            collect.stop()
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
  
          message.embed.embed[`url`] = url;
          console.log(message.embed.embed)
  
          await MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus.Create]),
            new MessageActionRow().addComponents([util.arrCreation(state)]),
          ], content: `URL has been updated to\n${url}` })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Create(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Create`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
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
 * @param {typeObj} obj 
 */
 async function footer(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector } = obj

  switch (interaction.values[0]) {
    case "text":
      state.previousFunc = (async () => {

        let textEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(`EDITING THIS`)
          .setTimestamp()
          .setTitle(`Inputing text for your Footer`)
          .setDescription(`Whatever you type into the chat after will be inputed as your Footer text.`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        
        MenuMessage.edit({ embeds: [textEmbed], components: [
          new MessageActionRow().addComponents([util.arrCreation(state)])
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          if (mes.deletable) await mes.delete();
          
          let text = mes.content;

          if (message.embed.embed?.footer) {
            let footer = message.embed.embed.footer;
            let newObj = {};
            newObj[`text`] = text;
            footer?.icon_url != undefined ? newObj[`icon_url`] = footer.icon_url : null;
            message.embed.embed.footer = newObj;
          } else message.embed.embed[`footer`] = { text: text }

          console.log(message.embed.embed)

          await MenuMessage.edit({ embeds: [embeds.Footer(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Footer`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Footer(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Footer`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "icon":
      state.previousFunc = (async () => {

        let iconEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(`EDITING THIS`)
          .setTimestamp()
          .setTitle(`Inputing an Icon for your Footer`)
          .setDescription(`Whatever you type into the chat after will be inputed as your Footer Icon.\n\n**Requirements**\n1.) Must be a picture URL`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        
        MenuMessage.edit({ embeds: [iconEmbed], components: [
          new MessageActionRow().addComponents([util.arrCreation(state)])
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          if (mes.deletable) await mes.delete();
          
          let text = mes.content;
          let check = stringIsAValidUrl(text);
          if (!check) {
            let tempMes = await message.channel.send({ content: `[ERROR] Message is not a valid URL` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Footer(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Footer`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          if (message.embed.embed?.footer) {
            let footer = message.embed.embed.footer;
            let newObj = {};
            newObj[`icon_url`] = text;
            footer?.text != undefined ? newObj[`text`] = footer.icon_url : newObj[`text`] = `\u200B`;
            message.embed.embed.footer = newObj;
          } else message.embed.embed[`footer`] = { icon_url: text, text: `\u200B` }

          console.log(message.embed.embed)

          await MenuMessage.edit({ embeds: [embeds.Footer(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Footer`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Footer(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Footer`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
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
 * @param {typeObj} obj 
 */
 async function author2(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector } = obj

  switch (interaction.values[0]) {
    case "au_text":
      state.previousFunc = (async () => {

        let textEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Inputing text for your author`)
          .setAuthor(`EDITING THIS`)
          .setDescription(`Whatever you type into the chat after will be inputed as your author text.\n\n**Requirements**\n1.) Author Text must be under 256 characters`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        
        MenuMessage.edit({ embeds: [textEmbed], components: [
          new MessageActionRow().addComponents([util.arrCreation(state)])
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          if (mes.deletable) await mes.delete();
          
          let text = mes.content;
          if (text.length > 256) {
            let tempMes = await message.channel.send({ content: `[ERROR] Author text is over 256 characters` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          if (message.embed.embed?.author) {
            let author = message.embed.embed.author;
            let newObj = {};
            newObj[`name`] = text;
            author?.url != undefined ? newObj[`url`] = author.url : null;
            author?.icon_url != undefined ? newObj[`icon_url`] = author.icon_url : null;
            message.embed.embed.author = newObj;
          } else message.embed.embed[`author`] = { name: text }

          console.log(message.embed.embed)

          await MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "au_icon":
      state.previousFunc = (async () => {

        let IconEmbed = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setTitle(`Inputing an Icon for your author`)
        .setAuthor(`EDITING THIS`)
        .setDescription(`Whatever you type into the chat after will be inputed as your author icon.\n\n**Requirements**\n1.) Must be a URL`)
        .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
      
      MenuMessage.edit({ embeds: [IconEmbed], components: [
        new MessageActionRow().addComponents([util.arrCreation(state)])
      ] })

      let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
      state.currentCollect = collect;

      collect.on(`collect`, async mes => {
        if (mes.deletable) await mes.delete();
        
        let text = mes.content;
        let check = stringIsAValidUrl(text);
        if (!check) {
          let tempMes = await message.channel.send({ content: `[ERROR] Author Icon is not a valid url` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          collect.stop()
          return MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        }

        if (message.embed.embed?.author) {
          let author = message.embed.embed.author;
          let newObj = {};
          newObj[`icon_url`] = text;
          author?.url != undefined ? newObj[`url`] = author.url : null;
          author?.name != undefined ? newObj[`name`] = author.name : newObj[`name`] = `\u200B`;
          message.embed.embed.author = newObj;
        } else message.embed.embed[`author`] = { name: `\u200B`, icon_url: text }

        console.log(message.embed.embed)
        
        await MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      })

      collect.on(`end`, async (collected, reason) => {
        if (collected.size == 0 && reason != `H`) {
          let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          return MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        }
      })

      })
      state.previousFunc()
      break;
    case "url":
      state.previousFunc = (async () => {

        let URlEmbed = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setTitle(`Inputing an URL for Your Author Text`)
        .setAuthor(`EDITING THIS`)
        .setDescription(`Whatever you type into the chat after will be inputed as your author url.\n\n**Requirements**\n1.) Must be a URL`)
        .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
      
      MenuMessage.edit({ embeds: [URlEmbed], components: [
        new MessageActionRow().addComponents([util.arrCreation(state)])
      ] })

      let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
      state.currentCollect = collect;

      collect.on(`collect`, async mes => {
        if (mes.deletable) await mes.delete();
        
        let text = mes.content;
        let check = stringIsAValidUrl(text);
        if (!check) {
          let tempMes = await message.channel.send({ content: `[ERROR] Author URL is not a valid url` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          collect.stop()
          return MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        }

        if (message.embed.embed?.author) {
          let author = message.embed.embed.author;
          let newObj = {};
          newObj[`url`] = text;
          author?.icon_url != undefined ? newObj[`icon_url`] = author.icon_url : null;
          author?.name != undefined ? newObj[`name`] = author.name : newObj[`name`] = `\u200B`;
          message.embed.embed.author = newObj;
        } else message.embed.embed[`author`] = { name: `\u200B`, url: text }

        console.log(message.embed.embed)

        await MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      })

      collect.on(`end`, async (collected, reason) => {
        if (collected.size == 0 && reason != `H`) {
          let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          return MenuMessage.edit({ embeds: [embeds.Author(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Author`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
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
 * @param {typeObj} obj 
 */
 async function fields(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector } = obj

  switch (interaction.values[0]) {
    case "add":
      (async () => {
        MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, state.currentField)], components: [
          new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      })()
      break;
    case "edit":
      state.previousFunc = (async () => {
        let fields = message.embed?.embed?.fields;
        if (!fields) {
          let tempMes = await message.channel.send({ content: `[ERROR] No Fields Currently` });
          setTimeout(() => tempMes.delete(), 5 * 1000)
          return MenuMessage.edit({ embeds: [embeds.Fields(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ]})
        }

        let str = fields.map((p, i) => `${i + 1}.) ${p.name}`).join(`\n`);
        let temp = util.split(str, 2000, `\n`, `\n`);

        const genEmb = (start) => {
          const current = temp[start];

          let newembed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setTitle(`Select a Field to Change!`)
            .setAuthor(`Showing results ${start + 1} out of ${temp.length}`)
            .setDescription(current)
            .addField(`\u200B`, `**Type in the Index or Name of the field to select it**`)
            .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

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

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        let arr = fields.map((a, i) => i+1);
        collect.on(`collect`, async mes => {
          await mes.delete();

          let index = undefined
          if (fields.some(f => f.name.toLowerCase() == mes.content.toLowerCase())) index = fields.indexOf(fields.find(f => f.name.toLowerCase() == mes.content.toLowerCase()))
          if (arr.includes(Number.parseInt(mes.content))) index = Number.parseInt(mes.content) - 1;
          if (index == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Field could not be found` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          let field = fields[index];
          state.currentField = field;
          state.save = field;
          return MenuMessage.edit({ embeds: [embeds[interaction.values[0]](message, field)], components: [
            new MessageActionRow().addComponents([util.selectMenus[interaction.values[0]]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })

        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "remove":
      state.previousFunc = (async () => {
        let fields = message.embed?.embed?.fields;
        if (!fields) {
          let tempMes = await message.channel.send({ content: `[ERROR] No Fields Currently` });
          setTimeout(() => tempMes.delete(), 5 * 1000)
          return MenuMessage.edit({ embeds: [embeds.Fields(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ]})
        }

        let str = fields.map((p, i) => `${i + 1}.) ${p.name}`).join(`\n`);
        let temp = util.split(str, 2000, `\n`, `\n`);

        const genEmb = (start) => {
          const current = temp[start];

          let newembed = new MessageEmbed()
            .setColor(client.info.color)
            .setFooter(client.info.footer)
            .setTimestamp()
            .setTitle(`Select a Field to Remove!`)
            .setAuthor(`Showing results ${start + 1} out of ${temp.length}`)
            .setDescription(current)
            .addField(`\u200B`, `**Type in the Index or Name of the field to remove it**`)
            .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

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

        let collect = message.channel.createMessageCollector({ filter: (m) => m.author.id == message.author.id, time: 30 * 1000, max: 1 })
        state.currentCollect = collect;

        let arr = fields.map((a, i) => i+1);
        collect.on(`collect`, async mes => {
          await mes.delete();

          let index = undefined
          if (fields.some(f => f.name.toLowerCase() == mes.content.toLowerCase())) index = fields.indexOf(fields.find(f => f.name.toLowerCase() == mes.content.toLowerCase()))
          if (arr.includes(Number.parseInt(mes.content))) index = Number.parseInt(mes.content) - 1;
          if (index == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Field could not be found` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          message.embed.embed.fields.splice(index, 1)

          return MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field has been removed` })

        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "clear":
      let fields = message.embed.embed?.fields;
      if (fields != undefined) delete message.embed.embed.fields;

      MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
        new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
        new MessageActionRow().addComponents(util.arrCreation(state))
      ], content: `All Fields have been cleared` })
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {typeObj} obj 
 */
 async function add(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector } = obj

  switch (interaction.values[0]) {
    case "title":
      state.previousFunc = (async () => {
        let TitleSelect = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input a Title for the Field`)
          .setDescription(`The title of the field is usually the word that describes the value.\nRequirements: \n1.) Must be under 256 characters`)
          .addField(`Title`, `Value`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [TitleSelect], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 30 * 5 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let title = mes.content;
          if (title.length > 256) {
            let tempMes = await message.channel.send({ content: `[ERROR] Field Title is longer then 256 characters` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.add(message, state.currentField)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`add`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          state.currentField = { name: title, value: state.currentField.value == undefined ? `\u200B` : state.currentField.value, inline: state.currentField.inline == undefined ? false : state.currentField.inline }

          MenuMessage.edit({ embeds: [embeds.add(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`add`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field Title has been updated` })

        })
        
        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.add(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`add`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "value":
      state.previousFunc = (async () => {
        let ValueSelect = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input a Value for the Field`)
          .setDescription(`The value usually explains the title of the embed in a longer way or in a bullet point banner\nRequirements:\n1.) Value Length must be under 1024`)
          .addField(`Title`, `Value`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [ValueSelect], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 30 * 5 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let title = mes.content;
          if (title.length > 1024) {
            let tempMes = await message.channel.send({ content: `[ERROR] Field Value is longer then 1024 characters` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.add(message, state.currentField)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`add`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          state.currentField = { name: state.currentField.name == undefined ? `\u200B` : state.currentField.name, value: title, inline: state.currentField.inline == undefined ? false : state.currentField.inline }

          MenuMessage.edit({ embeds: [embeds.add(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`add`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field Value has been updated` })

        })
        
        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.add(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`add`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "inline":
      state.previousFunc = (async () => {
        let InlineSelect = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input True of False for the Inline of the field`)
          .setDescription(`The inline determines if the embed will stay in the same line as another\nRequirements:\n1.) Inline must be True or False`)
          .addField(`Title`, `Value`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [InlineSelect], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 30 * 5 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let inline = mes.content;
          let check = BoolCheck(inline);

          if (check === undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Message is not true or false` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.add(message, state.currentField)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`add`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          state.currentField[`inline`] = check;

          state.currentField = { name: state.currentField.name == undefined ? `\u200B` : state.currentField.name, value: state.currentField.value == undefined ? `\u200B` : state.currentField.value, inline: check }

          MenuMessage.edit({ embeds: [embeds.add(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`add`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field Inline has been updated` })

        })
        
        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.add(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`add`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "save":
      (async () => {
        console.log(`test`)
        if (message.embed.embed?.fields == undefined) {
          message.embed.embed.fields = [state.currentField];
        } else {
          message.embed.embed.fields.push(state.currentField)
        }

        state.currentField = {};

        console.log(message.embed.embed)

        MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ], content: `Field has been saved to the embed` })
      })()
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {typeObj} obj 
 */
 async function edit(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector } = obj

  switch (interaction.values[0]) {
    case "e_title":
      state.previousFunc = (async () => {
        let TitleSelect = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input a Title for the Field`)
          .setDescription(`The title of the field is usually the word that describes the value.\nRequirements: \n1.) Must be under 256 characters`)
          .addField(`Title`, `Value`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [TitleSelect], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 30 * 5 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let title = mes.content;
          if (title.length > 256) {
            let tempMes = await message.channel.send({ content: `[ERROR] Field Title is longer then 256 characters` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.edit(message, state.currentField)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          state.currentField = { name: title, value: state.currentField.value == undefined ? `\u200B` : state.currentField.value, inline: state.currentField.inline == undefined ? false : state.currentField.inline }

          MenuMessage.edit({ embeds: [embeds.edit(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field Title has been updated` })

        })
        
        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "e_value":
      state.previousFunc = (async () => {
        let ValueSelect = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input a Value for the Field`)
          .setDescription(`The value usually explains the title of the embed in a longer way or in a bullet point banner\nRequirements:\n1.) Value Length must be under 1024`)
          .addField(`Title`, `Value`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [ValueSelect], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 30 * 5 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let title = mes.content;
          if (title.length > 1024) {
            let tempMes = await message.channel.send({ content: `[ERROR] Field Value is longer then 1024 characters` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.edit(message, state.currentField)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          state.currentField = { name: state.currentField.name == undefined ? `\u200B` : state.currentField.name, value: title, inline: state.currentField.inline == undefined ? false : state.currentField.inline }

          MenuMessage.edit({ embeds: [embeds.edit(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field Value has been updated` })

        })
        
        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "e_inline":
      state.previousFunc = (async () => {
        let InlineSelect = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Input True of False for the Inline of the field`)
          .setDescription(`The inline determines if the embed will stay in the same line as another\nRequirements:\n1.) Inline must be True or False`)
          .addField(`Title`, `Value`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [InlineSelect], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, time: 30 * 5 * 1000, max: 1 })
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          await mes.delete();

          let inline = mes.content;
          let check = BoolCheck(inline);

          if (check === undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Message is not true or false` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop();
            return MenuMessage.edit({ embeds: [embeds.edit(message, state.currentField)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          state.currentField[`inline`] = check;

          state.currentField = { name: state.currentField.name == undefined ? `\u200B` : state.currentField.name, value: state.currentField.value == undefined ? `\u200B` : state.currentField.value, inline: check }

          MenuMessage.edit({ embeds: [embeds.edit(message, state.currentField)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Field Inline has been updated` })

        })
        
        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.edit(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`edit`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "e_save":
      (async () => {
        if (message.embed.embed?.fields == undefined) {
          message.embed.embed.fields = [state.currentField];
        } else {
          let index = message.embed.embed.fields.indexOf(state.save)
          message.embed.embed.fields[index] = state.currentField;
        }

        state.currentField = {};

        console.log(message.embed.embed)

        MenuMessage.edit({ embeds: [embeds.Fields(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Fields`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ], content: `Field has been edited and added to the embed` })
      })()
      break;
  }
}

/**
 * 
 * @param {Message} message 
 * @param {Client} client 
 * @param {typeObj} obj 
 */
 async function saved(message, client, obj) {
  let { MenuMessage, interaction, state, util, embeds, collector, SavedEmbed } = obj

  switch (interaction.values[0]) {
    case "load":
      state.previousFunc = (async () => {
        let loadEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Select An Embed`)

        let str = `Index.) ID\n`
        let embeds_ = SavedEmbed.embeds;
        if (embeds_.length <= 0) {
          let tempMes = await message.channel.send({ content: `[ERROR] No Saved Embeds` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          collect.stop()
          return MenuMessage.edit({ embeds: [embeds.Saved(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Saved`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        }
        for (let i = 0; i < embeds_.length; i++) {
          let embed = embeds_[i];
          str += `${i+1}.) ${embed.id}\n`
        }
        
        loadEmbed.setDescription(str)
        loadEmbed.addField(`\u200B`, `Select an embed by its id or index, it will automatically load it and you can edit it after`)
        loadEmbed.addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

        MenuMessage.edit({ embeds: [loadEmbed], components: [
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })

        let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 });
        state.currentCollect = collect;

        collect.on(`collect`, async mes => {
          if (mes.deletable) await mes.delete();
          let content = mes.content;

          let arr = embeds_.map((e, i) => i+1);
          let ids = embeds_.map((e) => e.id);

          let index = undefined;
          if (arr.includes(Number.parseInt(content))) index = Number.parseInt(content) - 1;
          if (ids.includes(content)) index = ids.indexOf(content)
          if (index == undefined) {
            let tempMes = await message.channel.send({ content: `[ERROR] Embed could not be found` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            collect.stop()
            return MenuMessage.edit({ embeds: [embeds.Saved(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Saved`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }

          let embed = embeds_[index].embed;
          message.embed.embed = embed;

          MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ], content: `Loaded embed with id ${embeds_[index].id}` })

        })

        collect.on(`end`, async (collected, reason) => {
          if (collected.size == 0 && reason != `H`) {
            let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
            setTimeout(() => tempMes.delete(), 5 * 1000)
            return MenuMessage.edit({ embeds: [embeds.Saved(message)], components: [
              new MessageActionRow().addComponents([util.selectMenus[`Saved`]]),
              new MessageActionRow().addComponents(util.arrCreation(state))
            ] })
          }
        })

      })
      state.previousFunc()
      break;
    case "s_remove":
      state.previousFunc = (async () => {
        let loadEmbed = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setTitle(`Select An Embed`)

      let str = `Index.) ID\n`
      let embeds_ = SavedEmbed.embeds;
      if (embeds_.length <= 0) {
        let tempMes = await message.channel.send({ content: `[ERROR] No Saved Embeds` })
        setTimeout(() => tempMes.delete(), 5 * 1000)
        collect.stop()
        return MenuMessage.edit({ embeds: [embeds.Saved(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Saved`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ] })
      }
      for (let i = 0; i < embeds_.length; i++) {
        let embed = embeds_[i];
        str += `${i+1}.) ${embed.id}\n`
      }
      
      loadEmbed.setDescription(str)
      loadEmbed.addField(`\u200B`, `Select an embed by its id or index, it will automatically load it and you can edit it after`)
      loadEmbed.addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)

      MenuMessage.edit({ embeds: [loadEmbed], components: [
        new MessageActionRow().addComponents(util.arrCreation(state))
      ] })

      let collect = message.channel.createMessageCollector({ filter: m => m.author.id == message.author.id, time: 30 * 1000, max: 1 });
      state.currentCollect = collect;

      collect.on(`collect`, async mes => {
        if (mes.deletable) await mes.delete();
        let content = mes.content;

        let arr = embeds_.map((e, i) => i+1);
        let ids = embeds_.map((e) => e.id);

        let index = undefined;
        if (arr.includes(Number.parseInt(content))) index = Number.parseInt(content) - 1;
        if (ids.includes(content)) index = ids.indexOf(content)
        if (index == undefined) {
          let tempMes = await message.channel.send({ content: `[ERROR] Embed could not be found` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          collect.stop()
          return MenuMessage.edit({ embeds: [embeds.Saved(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Saved`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        }

        let embed = embeds_[index].embed;
        message.embed.embed = embed;

        MenuMessage.edit({ embeds: [embeds.Main(message)], components: [
          new MessageActionRow().addComponents([util.selectMenus[`Main`]]),
          new MessageActionRow().addComponents(util.arrCreation(state))
        ], content: `Loaded embed with id ${embeds_[index].id}` })

      })

      collect.on(`end`, async (collected, reason) => {
        if (collected.size == 0 && reason != `H`) {
          let tempMes = await message.channel.send({ content: `[ERROR] No Message Inputed` })
          setTimeout(() => tempMes.delete(), 5 * 1000)
          return MenuMessage.edit({ embeds: [embeds.Saved(message)], components: [
            new MessageActionRow().addComponents([util.selectMenus[`Saved`]]),
            new MessageActionRow().addComponents(util.arrCreation(state))
          ] })
        }
      })

      })
      state.previousFunc()
      break;
  }
}