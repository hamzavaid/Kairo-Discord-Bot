const { MessageEmbed } = require(`discord.js`);

module.exports = {
  name: `errors`,
  cooldown: 5,
  desc: `Shows all Error Codes`,
  async execute(message, args, client) {
    let errors = new MessageEmbed()
      .setColor(client.info.errColor).setTimestamp().setFooter(client.info.footer, client.users.cache.get(client.settings.dev).avatarURL({ dynamic: true }))
      .setTitle(`${client.user.username}'s Error Codes'`);
    
    let types = [...client.errors.keys()];
    for (i=0;i<types.length;i++) {
      let values = client.errors.get(types[i]);
      let title = `${types[i]} Errors`;
      let keys = Object.keys(values);
      let str = ``;
      for (j=0;j<keys.length;j++)  {
        str += `**Code** \`${keys[j]}\` - ${values[keys[j]]}\n`
      }
      errors.addField(title, str)
    }

    message.channel.send({ embeds: [errors] });
  }
}