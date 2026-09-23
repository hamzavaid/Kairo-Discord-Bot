const { MessageEmbed, Collection, MessageButton, MessageActionRow } = require(`discord.js`);
const fs = require(`fs`)
const path = require(`path`);

let rightbutton = new MessageButton()
  .setStyle(`SUCCESS`)
  .setCustomId(`right`)
  .setLabel(`==>`)

let leftbutton = new MessageButton()
  .setStyle(`SUCCESS`)
  .setCustomId(`left`)
  .setLabel(`<==`)

const row = new MessageActionRow()
  .addComponents([rightbutton, leftbutton])

let possibleErrorPrefics = [`*`, '`', `\\`, `_`, `-`, `|`]

module.exports = {
  name: `help`,
  cooldown: 5,
  desc: `Shows all commands and their categories`,
  async execute(message, args, client) {
    const categories = fs.readdirSync(path.resolve(__dirname, `../`)).filter(dir => !dir.endsWith(`.js`))
    const { commands } = message.client
    let prefix = client.settings.prefix
    const info = client.info

    if (!args[0]) {
      const noArgEmbed = new MessageEmbed()
        .setColor(info.color)
        .setFooter(info.footer)
        .setTimestamp()
        .setTitle(`${prefix}help`)
        .setDescription(`Showing All Command Categories`)

      categories.forEach(category => {
        if (category.toLowerCase() != `dev`) {
          noArgEmbed.addField(category.toUpperCase(), `\`${prefix}help ${category}\``, true)
        }
      })

      return message.channel.send({ embeds: [noArgEmbed] })
    }

    const name = args[0].toLowerCase();
    const command1 = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

    if (!categories.includes(args[0]) && !command1) {
      return message.channel.send(`Invalid Category or Command`)
    }

    if (categories.includes(args[0])) {
      let category1 = categories[categories.indexOf(args[0])];
      const CategoryEmbed = new MessageEmbed()
        .setColor(info.color)
        .setFooter(`${info.footer} || Page 1/1`)
        .setTimestamp()
        .setTitle(`${categories[categories.indexOf(args[0])].toUpperCase()} Category Subcommands`)

      let category = fs.readdirSync(path.resolve(__dirname, `../${category1}`))//.forEach(command => {
        //command = require(`../${categories[categories.indexOf(args[0])]}/${command}`)
        //CategoryEmbed.addField(`${prefix}${command.name}`, (command.desc || command.description))
      //})

      let pages = Math.ceil(category.length / 25)

      if (pages == 1) {
        for (i=0;i<category.length;i++) {      
          command = require(`../${category1}/${category[i]}`)
          if (command.beta) continue;
          CategoryEmbed.addField(`${prefix}${command.name}`, (command.desc || command.description))
        }

        return message.channel.send({ embeds: [CategoryEmbed] })
      } else {
        for (i=0;i<25;i++) {
          command = require(`../${category1}/${category[i]}`)
          CategoryEmbed.addField(`${prefix}${command.name}`, (command.desc || command.description))
        }
        let mes = await message.channel.send({ components: [new MessageActionRow().addComponents([rightbutton])], embeds: [CategoryEmbed.setFooter(`${info.footer} || Page 1/${pages}`)] }) //new MessageActionRow().addComponents([rightbutton]) buttons: [rightbutton]
        const collector = mes.createButtonCollector(
          (button) => button.clicker.user.id === message.author.id,
          {time: 30000}
        )

        let currentIndex = 0
        collector.on(`collect`, reaction => {
          collector.resetTimer();
          CategoryEmbed.fields = [];
          reaction.defer();
          reaction.id === `left` ? currentIndex -= 1 : currentIndex += 1
          if (category.length < (25 * currentIndex) + 25) {
            for (j = 25 * currentIndex; j < category.length; j++) {
              command = require(`../${category1}/${category[j]}`)
              CategoryEmbed.addField(`${prefix}${command.name}`, (command.desc || command.description))
            }
          } else {
            for (j = 25 * currentIndex; j < (25 * currentIndex) + 25; j++) {
              command = require(`../${category1}/${category[j]}`)
              CategoryEmbed.addField(`${prefix}${command.name}`, (command.desc || command.description))
            }
          }
          if (currentIndex !== 0 && currentIndex < pages - 1) {
            mes.edit({ components: [row], embed: CategoryEmbed.setFooter(`${info.footer} || Page ${currentIndex + 1}/${pages}`) })
          } else if (currentIndex < pages - 1) {
            mes.edit({ components: new MessageActionRow().addComponents([rightbutton]), embed: CategoryEmbed.setFooter(`${info.footer} || Page ${currentIndex + 1}/${pages}`) })
          } else if (currentIndex !== 0) {
            mes.edit({ buttons: new MessageActionRow().addComponents([leftbutton]), embed: CategoryEmbed.setFooter(`${info.footer} || Page ${currentIndex + 1}/${pages}`) })
          }
        })

        collector.on(`end`, reaction => {
          mes.edit(CategoryEmbed.setFooter(`${info.footer} || Page ${currentIndex+1}/${pages}`))
        })
    
      }
      
    }

    if (command1) {
      if (command1.beta) return message.channel.send(`Invalid Category or Command`)
      mesEmbed = new MessageEmbed()
      .setColor(info.color)
      .setTitle(`${prefix}${command1.name}`)
      .setFooter(`Created by Sun`);
      if (command1.aliases || command1.names) mesEmbed.addField(`**Aliases**`, `${prefix}${command1.aliases.join(`, ${prefix}`) || command1.names.join(`, ${prefix}`)}`)
      if (command1.description || command1.desc) mesEmbed.addField(`**Description**`, `${command1.description || command1.desc}`)
      if (command1.usage) mesEmbed.addField(`**Usage**`, `${prefix}${command1.name} ${command1.usage}`)
      if (command1.cooldown == 1) {mesEmbed.addField(`**Cooldown**`, `1 Second`)} else {mesEmbed.addField(`**Cooldown**`, `${command1.cooldown || 3} seconds`)}
      if (command1.info) { mesEmbed.addField(`**Info**`, command1.info) }

      return message.channel.send({ embeds: [mesEmbed] })
    }
  }
}