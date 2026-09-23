let Logs = require(`../../schemas/log.js`);
const { MessageEmbed } = require(`discord.js`);
const { durationString, parseMS } = require(`../../util/util.js`);

function prettyDate2(time){
  var date = new Date(parseInt(time));
  var localeSpecificTime = date.toLocaleTimeString();
  return localeSpecificTime.replace(/:\d+ /, ' ');
}

function dashDate(time) {
  let today = new Date(parseInt(time));
  let dd = today.getDate();
  let mm = today.getMonth() + 1;

  let yyyy = today.getFullYear();
  if (dd < 10) {
    dd = '0' + dd;
  }
  if (mm < 10) {
    mm = '0' + mm;
  }
  return dd + '/' + mm + '/' + yyyy;
}

module.exports = {
  name: `auditlog`,
  cooldown: 5,
  dev: true,
  desc: `Shows all recent commands used`,
  async execute(message, args, client) {
    let Log = await Logs.findOne({ server: message.guild.id });
    let commands = Log.commands;

    const AuditEmbed = new MessageEmbed()
      .setColor(client.info.color)
      .setFooter(client.info.footer)
      .setTimestamp()
      .setTitle(`Command Audit Log For ${message.guild.name}`)
      .setDescription(`Sorted by Newest`)
      .setThumbnail(message.guild.iconURL({ dynamic: true, size: 4096 }))

    for (let i = commands.length; i > commands.length-11; i--) {
      if (commands[i] == undefined) continue;
      let val = commands[i];
      let commandName = val.commandName;
      let executor = message.guild.members.cache.get(val.author);
      AuditEmbed.addField(`**${commandName.toUpperCase()}** Command`, `**Message ID:** ${val.message.id}\n**Command Executor:** <@${val.author}> - (${val.author})\n**Created At:** ${dashDate(val.message.createdTimestamp)} ${prettyDate2(val.message.createdTimestamp)}`)
    }

    message.channel.send({ embeds: [AuditEmbed]});

  }
}