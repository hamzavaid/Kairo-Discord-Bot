const { Client, Collection } = require(`discord.js`);
const fs = require(`fs`);
const Settings = require(`../schemas/settings.js`);
const Logs = require(`../schemas/log.js`);
const { CompressedMessage } = require(`./util.js`);
require(`dotenv`).config()
const path = require(`path`);

/**
 * 
 * @param {Client} client 
 */
module.exports = (client) => {
  client.commands = new Collection();
  client.aliases = new Collection();
  client.cooldowns = new Collection();
  client.games = new Collection();
  let folders = fs.readdirSync(path.resolve(__dirname, `../commands`));
  folders.filter(file => !file.endsWith(`.js`)).forEach(dir => {
    const commands = fs.readdirSync(path.resolve(__dirname, `../commands/${dir}`)).filter(file => file.endsWith(".js"));
    for (let file of commands) {
      let command = require(`../commands/${dir}/${file}`)
      let name = command?.name
      if (!name) { !command?.name ? name = file : name = command.names[0] }
      client.commands.set(name, command);
      command.aliases ? command.aliases.forEach(al => client.aliases.set(al, name)) : {}
    }
  })
  let coms = folders.filter(file => file.endsWith(`.js`));
  for (let fi of coms) {
    let com = require(`../commands/${fi}`);
    let name = com?.name
    if (!name) { !com?.name ? name = fi : name = com.names[0] }
    client.commands.set(name, com);
    com.aliases ? com.aliases.forEach(al => client.aliases.set(al, name)) : {}
  }

  client.on(`messageCreate`, async (message) => {
    if (message.author.bot) return;
    let settings = await Settings.findOne({GuildID: message.guild.id});
    if (settings == undefined) {
      settings = {
        dev: `221403951700901888`,
        prefix: process.env.PREFIX,
        blacklist: [],
        djrole: [],
        djonly: false,
        defaultvolume: 100
      }
      await new Settings(settings);
    }

    client.settings = settings;
    const { dev, prefix, blacklist, djrole, djonly, defaultvolume } = settings;

    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (blacklist.includes(message.channel.id)) return;

    let color = message.guild.me.displayHexColor;

    if (djonly) {
      if (!djonly.some(role => message.member.roles.cache.has(role))) return;
    }

    const command = client.commands.get(commandName) || client.commands.find(cmd => (cmd.names && cmd.names.includes(commandName)) || (cmd.aliases && cmd.aliases.includes(commandName)))
    if (!command) return;
    if (command.guildOnly && message.channel.type === `dm`) {
      return message.channel.send(`This command is not accessible in dms`)
    }
    if (command.dmOnly && message.channel.type !== `dm`) {
      return message.channel.send(`This command is only accessible in dms`)
    }
  
    if ((command.permissions || command.perms) && message.author.id !== client.settings.dev) {
      const authorPerms = message.channel.permissionsFor(message.author);
      if (!authorPerms || !authorPerms.has(command.permissions || command.perms)) {
        return message.channel.send(`You do not have permissions to run ${commandName}`)
      }
    }
  
    if (command.roles && command.guildOnly && message.author.id !== client.settings.dev) {
      const member = message.member
      const guild = command.roles.filter(arr => arr.guild === message.guild.id || arr.guild === message.guild.name || arr.guild === message.guild.nameAcronym)
      if (!guild[0] && !command.defaultperms) return message.channel.send( `You do not have permissions to run ${commandName}`)
      if (guild[0]) {
        if (!member.roles.cache.some(role => guild[0].roles.includes(role.name) || guild[0].roles.includes(role.id)))
        return message.channel.send(`You do not have permissions to run ${commandName}`)
      } else if (command.defaultperms) {
        if (!member.roles.cache.some(role => command.defaultperms.includes(role.name) || command.defaultperms.includes(role.id)))
        return message.channel.send(`You do not have permissions to run ${commandName}`)
      }
    }

    if (command.dev && message.author.id != dev) return
  
    if (command.args && !args.length) {
      let reply = `You didn't provide any arguments, ${message.author}!`;
      if (command.usage) {
        reply += `\nThe proper usage would be: \`${settings.prefix}${command.name} ${command.usage}\``;
      }
      return message.channel.send(reply);
    }
  
    if (!client.cooldowns.has(command.name)) {
      client.cooldowns.set(command.name, new Collection())
    }
  
    const now = Date.now();
    const timestamps = client.cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || command.time || 3) * 1000;
    if (timestamps.has(message.author.id)) {
      const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return message.channel.send(`please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`);
      }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
    try {
      if (command.execute) {
        command.execute(message, args, client);
      } else if (command.run) {
        command.run(message, args, client)
      }
    } catch (error) {
      console.error(error);
      message.channel.send('there was an error trying to execute that command!');
    }

    if (!command.dev) {
      let logs = await Logs.find();
      if (logs.map(log => log.server).includes(message.guild.id)) {
        let serverLog = logs.find(log => log.server == message.guild.id);
        let compmes = new CompressedMessage(message);
        serverLog.commands.push({ author: message.author.id, message: compmes, commandName });
        await Logs.findOneAndUpdate({ server: message.guild.id }, { commands: serverLog.commands })
      } else {
        let compmes = new CompressedMessage(message);
        await new Logs({
          server: message.guild.id,
          commands: [{ author: message.author.id, message: compmes, commandName }]
        }).save();
      }
    }

  })
}