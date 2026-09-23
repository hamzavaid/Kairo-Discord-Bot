const { Client, Message, MessageEmbed, Collection, MessageAttachment, MessageActionRow, MessageButton } = require(`discord.js`);
const fetch = require(`node-fetch`);
const fs = require(`fs`)

class Point {
  constructor(x, y, char) {
    this.x = x;
    this.y = y;
    this.character = char;
    this.old = [];
  }

  change(char) {
    this.old.push(this.character)
    this.character = char;
    return this;
  }

}

class Rectangle {
  constructor(h, w, item) {
    this.height = h;
    this.width = w;
    this.item = item;
    this.points = []

    this.#createPoints(h, w, this.item, true)
  }

  #createPoints(h, w, item, open) {
    let final = [];
    for (let i = 0; i < h; i++) {
      let temp = []
      for (let j = 0; j < w; j++) {
        temp.push(new Point(i, j, item))
      }
      final.push(temp)
    }

    open ? this.points = final : null;
    return final
  }

  #createCube() {
    let string = ``
    for (let i = 0; i < this.points.length; i++) {
      let wArr = this.points[i];
      for (let j = 0; j < wArr.length; j++) {
        string += wArr[j].character
      }
      string += `\n`
    }

    return string
  }

  get show() {
    return this.#createCube()
  }

  replace(item) {
    let old = this.item;
    this.item = item;
    this.points = this.points.map(wArr => {
      return wArr.map(ele => ele.character == old ? ele.change(item) : ele )
    })
    return this.points
  }

  change(x, y, char) {
    return this.points[x][y].change(char)
  }

  revert() {
    this.item = `#`;
    return this.#createPoints(this.height, this.width, '#', true)
  }
}

class Square extends Rectangle {
  constructor(s, item) {
    super(s, s, item);
  }
}

module.exports = {
  name: `test`,
  cooldown: 5,
  desc: `test`,
  /**
   * @param {Message} message
   * @param {Array<String>} args 
   * @param {Client} client 
   */
  async execute(message, args, client) {
    let cube = new Square(5)
    await message.channel.send(cube.show)
  }
}