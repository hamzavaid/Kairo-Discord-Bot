const { Client, Collection } = require(`discord.js`)
const fs = require(`fs`);
const { Util, BetterArr } = require(`./util.js`);
require(`dotenv`).config();

/**
 * @param {Client} client 
 */
function mod(client) {
  client.current = new Collection();
}

class ModmailUtil extends Util {
  /**
   * @param {Client} client 
   */
  constructor(client) {
    super(client);
    this.current = new Collection();
    this.closed = new Collection();

    this.main = {
      channel: null,
      message: null
    };
    this.log = null;
    this.topics = new BetterArr();
    this.category = null;

    this.depth = {
      Main: {
        Set: {
          log: `return Set`,
          category: `return Set`,
          channel: `return Set`,
          _return: `Main`
        },
        Actions: {
          pause: `return Actions`,
          resume: `return Actions`,
          info: `return Actions`
        }
      }
    }

    this.selectMenus = {

    }

    this.buttons = {

    }

    this.modEmbeds = {

    }

  }

  checkmain() {
    if (this.main.channel != null) return true;
    return false;
  }

  get mainMessage() {
    return this.main.message
  }

  checklog() {
    if (this.log != null) return true;
    return false;
  }

  checkcategory() {
    if (this.category != null) return true;
    return false;
  }

  close(key) {
    let current = this.current.get(key);
    this.current.delete(key);
    this.closed.set(key, current)
  }
  
}

module.exports = { mod }