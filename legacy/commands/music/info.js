const { Client, Message, MessageEmbed, MessageButton, MessageActionRow } = require(`discord.js`);
const { BetterArr } = require("../../util/util");

let rightbutton = new MessageButton()
  .setCustomId(`right`)
  .setStyle(`SUCCESS`)
  .setLabel(`==>`)

let leftbutton = new MessageButton()
  .setStyle(`SUCCESS`)
  .setCustomId(`left`)
  .setLabel(`<==`)

let rows = {
  oR: new MessageActionRow().addComponents([rightbutton]),
  oL: new MessageActionRow().addComponents([leftbutton]),
  B: new MessageActionRow().addComponents([rightbutton, leftbutton]),
  E: new MessageActionRow()
}

function time(val) {
  let durationAr = val.format_duration.split(`:`);
  for (let j=0;j<durationAr.length;j++) {
    let val = durationAr[j];
    if (val == 0) {durationAr.splice(j, 1); j--}
  }
  return durationAr.join(`:`)
}

module.exports = {
  name: `info`,
  cooldown: 5,
  desc: `Shows Info About a Song`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let { author, channel, guild } = message;
    let { embeds } = client;
    if (!args[0]) return channel.send({ embeds: [embeds.NoArgument()] })
    let search = args.join(` `);

    let tracks = await client.util.queryType(search, message, true, true);

    if (tracks instanceof BetterArr || Array.isArray(tracks)) {
      const genEmb = (start) => {
        const current = tracks.slice(start, start + 10);
        let newembed = new MessageEmbed()
          .setColor(client.info.color)
          .setFooter(client.info.footer)
          .setTimestamp()
          .setTitle(`Search Results for \`${search}\``)
          .setAuthor(`Showing results ${start+1}-${start + current.length} out of ${tracks.length}`)

        for (let i=0;i<10;i++) {
          let val = current[i];
          if (val == undefined) continue;
          durationAr = time(val)
          newembed.addField(val.title, `__URL:__ \`${val.url}\`\n__Artists:__ ${val.artists.map(a => a.name).join(`, `)}\n__Duration:__ ${durationAr}`)
        }

        return newembed
      }

      let canFitOnOne = tracks <= 10;
      const mes = await channel.send({
        embeds: [genEmb(0)],
        components: canFitOnOne ? [] : [rows.oR]
      })

      if (canFitOnOne) return;

      const collector = mes.createMessageComponentCollector({
        filter: ({user}) => user.id === author.id
      })

      let currentIndex = 0
      collector.on(`collect`, async inter => {
        inter.customId === `left` ? (currentIndex -= 10) : (currentIndex += 10)

        await inter.update({
          embeds: [genEmb(currentIndex)],
          components: [
            new MessageActionRow({ components: [ ...(currentIndex ? [leftbutton] : []), ...(currentIndex + 10 < tracks.length ? [rightbutton] : []) ] })
          ]
        })
      })
      
    } else {
      let val = tracks;
      durationAr = time(val)
      let embed = new MessageEmbed()
        .setColor(client.info.color)
        .setFooter(client.info.footer)
        .setTimestamp()
        .setTitle(`Search Results for \`${search}\``)
        .addField(val.title, `__URL:__ \`${val.url}\`\n__Artists:__ ${val.artists.map(a => a.name).join(`, `)}\n__Duration:__ ${durationAr}`);

      return channel.send({ embeds: [embed] })
    }
  }
}