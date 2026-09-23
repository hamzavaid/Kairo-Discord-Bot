const { MessageEmbed, Client, Message, MessageActionRow, MessageButton, MessageSelectMenu } = require(`discord.js`);
const { BetterArr, Util } = require(`./util.js`);
const Libraries = require(`../schemas/library.js`);

let Colors = {
  DEFAULT: 0x000000,
  WHITE: 0xffffff,
  AQUA: 0x1abc9c,
  GREEN: 0x57f287,
  BLUE: 0x3498db,
  YELLOW: 0xfee75c,
  PURPLE: 0x9b59b6,
  LUMINOUS_VIVID_PINK: 0xe91e63,
  FUCHSIA: 0xeb459e,
  GOLD: 0xf1c40f,
  ORANGE: 0xe67e22,
  RED: 0xed4245,
  GREY: 0x95a5a6,
  NAVY: 0x34495e,
  DARK_AQUA: 0x11806a,
  DARK_GREEN: 0x1f8b4c,
  DARK_BLUE: 0x206694,
  DARK_PURPLE: 0x71368a,
  DARK_VIVID_PINK: 0xad1457,
  DARK_GOLD: 0xc27c0e,
  DARK_ORANGE: 0xa84300,
  DARK_RED: 0x992d22,
  DARK_GREY: 0x979c9f,
  DARKER_GREY: 0x7f8c8d,
  LIGHT_GREY: 0xbcc0c0,
  DARK_NAVY: 0x2c3e50,
  BLURPLE: 0x5865f2,
  GREYPLE: 0x99aab5,
  DARK_BUT_NOT_BLACK: 0x2c2f33,
  NOT_QUITE_BLACK: 0x23272a,
};

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

class EmbedUtil extends Util {
  /**
   * @param {Client} client 
   */
  constructor(client) {
    super(client);
    this.client = client;
    this.info = info;

    this.depth = {
      Main: {
        Create: {
          Color: `return Create`,
          Footer: {
            text: `return Footer`,
            icon: `return Footer`,
            __return: `return Create`
          },
          Author: {
            au_text: `return Author`,
            au_icon: `return Author`,
            url: `return Author`,
            __return: `return Create`
          },
          Fields: {
            add: {
              title: `return add`,
              value: `return add`,
              inline: `return add`,
              save: `return add`,
              __return: `return Fields`,
            },
            edit: {
              e_title: `return edit`,
              e_value: `return edit`,
              e_inline: `return edit`,
              e_save: `return add`,
              __return: `return Fields`,
            },
            remove: `return Fields`,
            clear: `return Fields`,
            __return: `return Create`
          },
          Desc: `return Create`,
          Image: `return Create`,
          Thumbnail: `return Create`,
          Title: `return Create`,
          URL: `return Create`
        },
        Saved: {
          load: `return Main`,
          s_remove: `return Saved`,
        },
        JSON: `return Main`,
        Channel: `return Main`,
        Preview: `return Main`,
        Send: `Full Return`,
      },
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
      save: new MessageButton({ customId: `saveBut`, label: `Save Embed`, style: `SUCCESS` })
    }

    this.selectMenus = {
      Main: new MessageSelectMenu().addOptions([
        { label: `Create`, value: `Create`, description: `Will Create a new Embed`, emoji: `🖊️` },
        { label: `JSON`, value: `JSON`, description: `Uses JSON to set the embed`, emoji: `❄️` },
        { label: `Saved Embeds`, value: `Saved`, description: `Shows all the saved embeds`, emoji: `🔹` },
        { label: `Channel`, value: `Channel`, description: `Changes the channel the embed will be sent`, emoji: `📄` },
        { label: `Preview`, value: `Preview`, description: `Shows you a preview of your created embed`, emoji: `📀` },
        { label: `Send`, value: `Send`, description: `Sends the embed`, emoji: `ℹ️` },
      ]).setCustomId(`main`).setPlaceholder(`Actions`).setMaxValues(1),
      Saved: new MessageSelectMenu().addOptions([
        { label: `Load`, value: `load`, description: `Will Load an embed from your saved`, emoji: `🖊️` },
        { label: `Remove`, value: `s_remove`, description: `Removes a saved embed`, emoji: `📄` },
      ]).setCustomId(`saved`).setPlaceholder(`Actions`).setMaxValues(1),
      Create: new MessageSelectMenu().addOptions([
        { label: `Color`, value: `Color`, description: `Changes the border color of the embed`, emoji: `🖌️` },
        { label: `Title`, value: `Title`, description: `Changes the Title`, emoji: `🖊️` },
        { label: `Description`, value: `Desc`, description: `Changes the description`, emoji: `ℹ️` },
        { label: `Fields`, value: `Fields`, description: `Adds or changes the fields on the embed`, emoji: `📃` },
        { label: `Footer`, value: `Footer`, description: `Changes the little text on the bottom`, emoji: `⌛` },
        { label: `Author`, value: `Author`, description: `Changes the little text on the top`, emoji: `📀` },
        { label: `Thumbnail`, value: `Thumbnail`, description: `Adds or Changes the small picture on the embed`, emoji: `📄` },
        { label: `Image`, value: `Image`, description: `Adds or Changes the big picture on the embed`, emoji: `🗺️` },
        { label: `URL`, value: `URL`, description: `Changes the URL the title`, emoji: `🗞️` },
      ]).setCustomId(`create`).setPlaceholder(`Actions`).setMaxValues(1),
      Footer: new MessageSelectMenu().addOptions([
        { label: `Text`, value: `text`, description: `Changes the text of the footer`, emoji: `🖊️` },
        { label: `Icon`, value: `icon`, description: `Changes the icon of the footer`, emoji: `🖌️` },
      ]).setCustomId(`footer`).setPlaceholder(`Actions`).setMaxValues(1),
      Author: new MessageSelectMenu().addOptions([
        { label: `Text`, value: `au_text`, description: `Changes the text of the author`, emoji: `🖊️` },
        { label: `Icon`, value: `au_icon`, description: `Changes the icon of the author`, emoji: `🖌️` },
        { label: `URL`, value: `url`, description: `Changes the url link of the author`, emoji: `🗻` },
      ]).setCustomId(`author`).setPlaceholder(`Actions`).setMaxValues(1),
      Fields: new MessageSelectMenu().addOptions([
        { label: `Add`, value: `add`, description: `Adds a field to the embed`, emoji: `🖊️` },
        { label: `Edit`, value: `edit`, description: `Edits a field from the embed`, emoji: `🖌️` },
        { label: `Remove`, value: `remove`, description: `Removes an field from embed`, emoji: `❌` },
        { label: `Clear`, value: `clear`, description: `Clears all the fields`, emoji: `🗻` },
      ]).setCustomId(`fields`).setPlaceholder(`Actions`).setMaxValues(1),
      add: new MessageSelectMenu().addOptions([
        { label: `Title`, value: `title`, description: `Changes the title of this field`, emoji: `🖊️` },
        { label: `Value`, value: `value`, description: `Changes the value of this field`, emoji: `🖌️` },
        { label: `Inline`, value: `inline`, description: `Changes if the field will be in the same line`, emoji: `💜` },
        { label: `Save`, value: `save`, description: `Saves the field to the embed`, emoji: `📧` },
      ]).setCustomId(`add`).setPlaceholder(`Actions`).setMaxValues(1),
      edit: new MessageSelectMenu().addOptions([
        { label: `Title`, value: `e_title`, description: `Changes the title of this field`, emoji: `🖊️` },
        { label: `Value`, value: `e_value`, description: `Changes the value of this field`, emoji: `🖌️` },
        { label: `Inline`, value: `e_inline`, description: `Changes if the field will be in the same line`, emoji: `💜` },
        { label: `Save`, value: `e_save`, description: `Saves the field to the embed`, emoji: `📧` },
      ]).setCustomId(`edit`).setPlaceholder(`Actions`).setMaxValues(1),
    }

    this.embs = {
      Main(message) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Embed Creation Home Menu`)
          .setDescription(`This menu will help you create any type of message you want\nYou will be able to change everything and then send it\nGood Luck and don't get lost!`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Info`, `**Announce Channel** - \`${message.embed.channel.name} | (${message.embed.channel.id})\`\n**Embed Creator** - \`${message.author.username} | (${message.author.id})\``)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Creates an embed\n❄️ : Gets an embed from JSON\n📄 : The channel the embed will be send\n📀 : Preview of your embed\nℹ️ : Sends the embed`);

        return embed
      },
      Create(message) {
        let string = `
Use the Selection Menu To input Actions
🖌️ : Changes the border color of the embed
🖊️ : Changes the title of the embed
ℹ️ : Changes the description of the embed
📃 : Adds or changes the fields of the embed
⌛ : Changes the little text on the bottom
📀 : Changes the little text on the top
📄 : Adds or Changes the small picture on the top right of the embed
🗺️ : Adds or Changes the big picture on the embed
🗞️ : Changes the URL of the title`
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Embed Creation Create Menu`)
          .setDescription(`This Menu will help you create a embed from the top to the bottom`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, string);

        return embed
      },
      Saved(message) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Saved Embeds Menu`)
          .setDescription(`This menu shows your everything about your saved embeds.\nEach saved embed is personally`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Loads a saved embed\n📄 : Deletes one of your saved embeds`);

        return embed
      },
      Footer(message) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(`THIS MENU WILL CHANGE THIS`)
          .setTimestamp()
          .setTitle(`Embed Creation Footer Menu`)
          .setDescription(`This menu is made to change the footer of your embed\nThere are 2 actions for this menu\n1. The text of the footer\n2. The small circle image`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Current Footer`, `Text:\n${message.embed.embed?.footer?.text == undefined ? `None` : message.embed.embed?.footer?.text}\nIcon Url: ${message.embed.embed?.footer?.icon_url == undefined ? `None` : message.embed.embed?.footer?.icon_url}`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Changes the text of the Footer\n🖌️ : Changes the icon of the Footer`);

        return embed
      },
      Author(message) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Embed Creation Author Menu`)
          .setDescription(`This menu is made to change the author of your embed\nThere are 3 actions for this menu\n1. The text of the author\n2. The small circle image\n 3. The text link for author`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`Current Author`, `Text: ${message.embed.embed?.author?.name == undefined ? `None` : message.embed.embed?.author?.name}\nIcon Url: ${message.embed.embed?.author?.icon_url == undefined ? `None` : message.embed.embed?.author?.icon_url}\nLink: ${message.embed.embed?.author?.url == undefined ? `None` : message.embed.embed?.author?.url}`)
          .addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
          .addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Changes the text of the Author\n🖌️ : Changes the icon of the Author\n🗻 : Changes the url of the Author`);

        return embed
      },
      Fields(message) {
        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Embed Creation Fields Menu`)
          .setDescription(`This menu will help you create a fields for the embed!`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .addField(`**THIS IS WHAT YOU ARE EDITING**`, `**THIS TOO**`);

        let str = ``;
        if (Array.isArray(message.embed?.embed?.fields)) {
          for (let i = 0; i < 10; i++) {
            let field = message.embed.embed.fields[i];
            if (field == undefined) continue;
            str += `${i+1}.) Title: ${field.name}\nValue: ${field.value}\nInline: ${field.inline}\n`
          }
          embed.addField(`Fields [${message.embed?.embed?.fields.length <= 10 ? message.embed?.embed?.fields.length : 10}] MAX`, str)
        }
        embed.addField(`Fields [0]`, `None`)

        embed.addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        embed.addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Adds a field to your embed\n🖌️ : Edits a field from the embed\n❌ : Removes a field from the embed\n🗻 : Deletes all the fields`);

        return embed
      },
      add(message, field) {
        if (Object.keys(field).length == 0) {
          field = {
            name: `Not Set`,
            value: `Not Set`,
            inline: `Not Set`
          }
        }

        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Embed Creation Field Add Menu`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .setDescription(`This menu will help add fields to your embed\nThere are 3 methods of fields\n1.) Changing the Title of the Field\n2.) Changing the Value of the Field\n3.) Changing if the field is Inline or not`)
          .addField(`Current Field`, `Title: ${field.name.slice(0, 200)}\nValue: ${field.value.slice(0, 200)}\nInline: ${field.inline}`)
          .addField(`**THIS IS WHAT YOU ARE EDITING**`, `**THIS TOO**`);


        embed.addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        embed.addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Adds a title to your field\n🖌️ : Adds a value to the field\n💜 : Determines if the field will be inline or not\n📧 : Saves the field to the embed`);

        return embed
      },
      edit(message, field) {

        let embed = new MessageEmbed()
          .setColor(info.color)
          .setFooter(info.footer)
          .setTimestamp()
          .setTitle(`Embed Creation Field Edit Menu`)
          .setAuthor(`${message.author.username}'s Menu`, message.author.avatarURL({ dynamic: true, size: 4096 }))
          .setDescription(`This menu will help add fields to your embed\nThere are 3 methods of fields\n1.) Changing the Title of the Field\n2.) Changing the Value of the Field\n3.) Changing if the field is Inline or not`)
          .addField(`Current`, `Title: ${field.name}\nValue:\n${field.value}\nInline: ${field.inline}`)
          .addField(`**THIS IS WHAT YOU ARE EDITING**`, `**THIS TOO**`);


        embed.addField(`Controls`, `❌ : Quit Menu\n🏠 : Main Menu\n◀️ : Back\n🔵 : Previous Page`)
        embed.addField(`Selection Menu`, `Use the Selection Menu To input actions\n🖊️ : Edits a title to your field\n🖌️ : Edits a value to the field\n💜 : Determines if the field will be inline or not\n📧 : Saves the field to the embed`);

        return embed
      }
    }
  }

  resolveColor(color) {
    if (typeof color === 'string') {
      if (color === 'RANDOM') return Math.floor(Math.random() * (0xffffff + 1));
      if (color === 'DEFAULT') return 0;
      color = Colors[color] ?? parseInt(color.replace('#', ''), 16);
    } else if (Array.isArray(color)) {
      color = (color[0] << 16) + (color[1] << 8) + color[2];
    }
  
    if (color < 0 || color > 0xffffff) return undefined
    else if (Number.isNaN(color)) return undefined
  
    return color;
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
          stage.currentDepth = `Main`
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
    state.currentDepth != `Main` ? arr.push(this.buttons.home) : null;
    state.perviousDepth != childParent.parent[0] ? arr.push(this.buttons.previous) : null;
    state.perviousDepth != null && childParent.parent[0] != `First` ? arr.push(this.buttons.back) : null;

    return arr;
  }
  
}

module.exports = { EmbedUtil }