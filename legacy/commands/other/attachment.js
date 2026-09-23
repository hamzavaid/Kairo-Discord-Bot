const { Client, Message, MessageEmbed, Collection, MessageAttachment, MessageActionRow, MessageButton } = require(`discord.js`);
const fetch = require(`node-fetch`);
const fs = require(`fs`)

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

/**
 * @param {Collection<String, MessageAttachment>} attachments 
 * @returns {Promise<Collection<String, String>>}
 */
async function attachmentParser(attachments) {
  let values = [...attachments.values()];
  let texts = new Collection();
  for (let i = 0; i < attachments.size; i++) {
    let attachment = values[i];
    let type = attachment.url.split(`.`);
    type = type[type.length - 1]
    let temp = await fetch(attachment.url);
    let text = await temp.text();
    texts.set(type, text)
  }
  return texts
}

const backId = 'back'
const forwardId = 'forward'
const backButton = new MessageButton({
  style: 'SECONDARY',
  label: 'Back',
  emoji: '⬅️',
  customId: backId
})
const forwardButton = new MessageButton({
  style: 'SECONDARY',
  label: 'Forward',
  emoji: '➡️',
  customId: forwardId
})

module.exports = {
  name: `attachment`,
  cooldown: 5,
  desc: `Shows text from an attachment to an embed`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    await message.delete();
    let values = await attachmentParser(message.attachments);

    let keys = [...values.keys()];
    for (let i = 0; i < values.size; i++) {
      let key = keys[i];
      let value = values.get(key);

      let genEmbed = start => {
        const current = value.slice(start, start + 4000);

        let newEmbed = new MessageEmbed()
          .setColor(client.info.color)
          .setTitle(`Attachment Data ${start+1}-${start+current.length} out ${value.length}`)
          .setDescription(`\`\`\`${key}\n${current}\`\`\``)

        return newEmbed
      }

      let canFitOn = value.length <= 4000;
      const embedMes = await message.channel.send({ embeds: [genEmbed(0)], components: 
        canFitOn ? [] : [new MessageActionRow({components: [forwardButton]})]
      })

      if (canFitOn) continue;

      const collector = embedMes.createMessageComponentCollector({ filter: ({user}) => user.id === message.author.id })

      let currentIndex = 0;
      collector.on(`collect`, async interaction => {
        interaction.customId === backId ? (currentIndex -= 4000) : (currentIndex += 4000)

        await interaction.update({ embeds: [genEmbed(currentIndex)], components: [
          new MessageActionRow({
            components: [
              ...(currentIndex ? [backButton] : []),
              ...(currentIndex + 4000 < value.length ? [forwardButton] : [])
            ]
           })
        ]})
      })

      await sleep(500);
    }


  }
}