const { Client, Message } = require(`discord.js`);
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

function randomGen() {
  let string = ``;
  let chars = (`1234567890` + `abcdefghijklmnopqrstuvwxyz` + `abcdefghijklmnopqrstuvwxyz`.toUpperCase()).split(``);
  for (let i = 0; i < 16; i++) {
    let index = randomInt(0, chars.length-1)
    string += chars[index];
  }

  return string
}

module.exports = {
  name: `gift`,
  cooldown: 5,
  desc: `sends unlimited gifts`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let t = true;
    //console.log(`9yDHb44e2G2Nf7d6`.length)

    let collector = message.channel.createMessageCollector({
      filter: m => m.author.id == message.author.id
    })

    collector.on(`collect`, async mes => {
      if (mes.content.toLowerCase() == `end`) {
        t = false;
        message.channel.send(`Ended`)
        collector.stop();
      }
    })

    while (t == true) {
      await sleep(2000)
      let str = randomGen();
      message.channel.send(`https://discord.gift/${str}`);
    }


  }
}