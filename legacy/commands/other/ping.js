const { Client, Message } = require(`discord.js`);

module.exports = {
  name: `ping`,
  cooldown: 5,
  desc: `Pong!`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let firstmes = await message.channel.send(`Pong!`)
    let time = firstmes.createdTimestamp - message.createdTimestamp
    firstmes.edit(`Pong! \`${time} ms\``)
  }
}